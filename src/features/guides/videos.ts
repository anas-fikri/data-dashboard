import "server-only";
import { randomBytes } from "node:crypto";
import { recordAudit } from "@/features/audit/service";
import type { SessionUser } from "@/features/auth/session";
import { PART_SIZE, expectedPartSize, partCountOf, verifyParts } from "@/features/uploads/parts";
import type { UploadResult } from "@/features/uploads/service";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import {
  VIDEO_CONTENT_TYPE,
  deleteGuideObject,
  guideCaptionKey,
  guidePosterKey,
  guideVideoKey,
  presignGuideGet,
  putGuideCaption,
  putGuidePoster,
} from "@/lib/storage/guides";
import { s3Multipart, type MultipartStorage } from "@/lib/storage/multipart";
import {
  CAPTION_MAX_BYTES,
  POSTER_MAX_BYTES,
  VIDEO_DURATION_MAX,
  VIDEO_MAX_BYTES,
  VIDEO_SNIFF_BYTES,
  VIDEO_TITLE_MAX,
  VIDEOS_PER_ARTICLE,
  isPng,
  isVtt,
  sniffVideo,
  videoExtOf,
  type VideoExt,
} from "./media";
import { cuidSchema } from "./validation";

/*
 * Video panduan (T-021, D12): admin mengunggah mp4/webm ≤ 500 MB multipart langsung ke storage
 * (Content-Type ditetapkan server saat createMultipartUpload); setelah complete server membaca 64 byte
 * awal (signature) — bukan video → objek dan baris dihapus (INVALID_FORMAT). Durasi dan poster PNG
 * diambil di browser. Selain admin aktif: NOT_FOUND tanpa menyentuh data.
 */

export { VIDEOS_PER_ARTICLE };
export const SIGN_BATCH_MAX = 16;
const STALE_MS = 24 * 60 * 60 * 1000;

type R<T> = Promise<UploadResult<T>>;
const notFound = { ok: false, code: "NOT_FOUND", message: "Video tidak ditemukan." } as const;
const invalid = { ok: false, code: "INVALID", message: "Permintaan tidak valid." } as const;

const isId = (v: unknown): v is string => cuidSchema.safeParse(v).success;

async function ownVideo(user: SessionUser, id: unknown) {
  if (!user.isAdmin || !isId(id)) return null;
  return prisma.guideVideo.findUnique({ where: { id } });
}

/** Buang baris+multipart UPLOADING > 24 jam (unggahan yang ditinggal). */
async function expireStale(storage: MultipartStorage): Promise<void> {
  const stale = await prisma.guideVideo.findMany({
    where: { status: "UPLOADING", createdAt: { lt: new Date(Date.now() - STALE_MS) } },
    select: { id: true, objectKey: true, uploadId: true },
    take: 20,
  });
  for (const v of stale) {
    try {
      if (v.uploadId) await storage.abort(v.objectKey, v.uploadId);
      await storage.remove(v.objectKey); // sudah complete tapi belum READY (proses mati)
      await prisma.guideVideo.delete({ where: { id: v.id } });
    } catch (e) {
      logger.warn({ videoId: v.id, err: String(e) }, "video panduan basi gagal dibersihkan");
    }
  }
}

export async function initVideo(
  user: SessionUser,
  body: Record<string, unknown>,
  storage: MultipartStorage = s3Multipart,
): R<{ videoId: string; partSize: number; partCount: number }> {
  if (!user.isAdmin || !isId(body.articleId)) return notFound;
  const title = typeof body.title === "string" ? body.title.trim() : "";
  const name = typeof body.name === "string" ? body.name : "";
  const size = body.size;
  if (!title || title.length > VIDEO_TITLE_MAX || !name || name.length > 255)
    return { ...invalid, message: `Judul video wajib diisi (≤ ${VIDEO_TITLE_MAX} karakter).` };
  if (typeof size !== "number" || !Number.isSafeInteger(size) || size < 1) return invalid;
  const ext = videoExtOf(name);
  if (!ext) return { ok: false, code: "INVALID_FORMAT", message: "Hanya video .mp4 atau .webm." };
  if (size > VIDEO_MAX_BYTES)
    return { ok: false, code: "FILE_TOO_LARGE", message: "Ukuran video melebihi batas 500 MB." };
  await expireStale(storage);
  const article = await prisma.guideArticle.findUnique({
    where: { id: body.articleId },
    select: {
      id: true,
      // Hanya video siap: unggahan yang ditinggal tidak memblokir; batas pasti dicek saat complete.
      _count: { select: { videos: { where: { status: "READY" } } } },
    },
  });
  if (!article) return { ...notFound, message: "Artikel tidak ditemukan." };
  if (article._count.videos >= VIDEOS_PER_ARTICLE)
    return {
      ok: false,
      code: "LIMIT_REACHED",
      message: `Satu artikel paling banyak ${VIDEOS_PER_ARTICLE} video. Hapus video lama dulu.`,
    };
  const id = `v${randomBytes(12).toString("hex")}`;
  const objectKey = guideVideoKey(id, ext);
  const uploadId = await storage.create(objectKey, VIDEO_CONTENT_TYPE[ext]);
  await prisma.guideVideo.create({
    data: { id, articleId: article.id, title, ext, sizeBytes: size, objectKey, uploadId },
  });
  logger.info({ videoId: id, articleId: article.id, size }, "unggah video panduan dimulai");
  return { ok: true, videoId: id, partSize: PART_SIZE, partCount: partCountOf(size) };
}

export async function signVideoParts(
  user: SessionUser,
  id: unknown,
  partNumbers: unknown,
  storage: MultipartStorage = s3Multipart,
): R<{ urls: { partNumber: number; url: string; size: number }[] }> {
  const v = await ownVideo(user, id);
  if (!v || v.status !== "UPLOADING" || !v.uploadId) return notFound;
  const size = Number(v.sizeBytes);
  const count = partCountOf(size);
  if (
    !Array.isArray(partNumbers) ||
    !partNumbers.length ||
    partNumbers.length > SIGN_BATCH_MAX ||
    !partNumbers.every((n) => Number.isInteger(n) && n >= 1 && n <= count)
  )
    return invalid;
  const urls = await Promise.all(
    (partNumbers as number[]).map(async (n) => {
      const partSize = expectedPartSize(n, size, PART_SIZE, count);
      return {
        partNumber: n,
        size: partSize,
        url: await storage.signPart(v.objectKey, v.uploadId!, n, partSize),
      };
    }),
  );
  return { ok: true, urls };
}

/** Buang video yang gagal (objek + multipart + baris); objek yang gagal dihapus diulang job. */
async function discard(
  v: { id: string; objectKey: string; uploadId: string | null },
  storage: MultipartStorage,
) {
  await prisma.guideVideo.deleteMany({ where: { id: v.id } });
  try {
    if (v.uploadId) await storage.abort(v.objectKey, v.uploadId);
    await storage.remove(v.objectKey);
  } catch (e) {
    logger.warn({ videoId: v.id, err: String(e) }, "objek video gagal dibuang; diulang job");
    await retryLater([v.objectKey], "guide-video");
  }
}

export async function completeVideo(
  user: SessionUser,
  id: unknown,
  body: Record<string, unknown>,
  ip: string,
  storage: MultipartStorage = s3Multipart,
): R<{ videoId: string }> {
  const v = await ownVideo(user, id);
  if (!v || !v.uploadId) return v?.status === "READY" ? { ok: true, videoId: v.id } : notFound;
  const size = Number(v.sizeBytes);
  const parts = await storage.listParts(v.objectKey, v.uploadId);
  if (!parts) {
    await discard(v, storage);
    return {
      ok: false,
      code: "UPLOAD_FAILED",
      message: "Unggahan kedaluwarsa. Pilih file lagi.",
    };
  }
  const verdict = verifyParts(parts, size);
  if (verdict.kind === "missing")
    return {
      ok: false,
      code: "INCOMPLETE",
      message: "Sebagian file belum terunggah.",
      missing: verdict.missing,
    };
  if (verdict.kind === "corrupt") {
    logger.warn({ videoId: v.id, reason: verdict.reason }, "video panduan rusak");
    await discard(v, storage);
    return { ok: false, code: "UPLOAD_CORRUPT", message: "File rusak saat diunggah. Coba lagi." };
  }
  await storage.complete(v.objectKey, v.uploadId, parts);
  const head = await storage.head(v.objectKey);
  const bytes = await storage.readHead(v.objectKey, VIDEO_SNIFF_BYTES);
  if (!head || head.size !== size || !sniffVideo(v.ext as VideoExt, bytes)) {
    logger.warn({ videoId: v.id }, "video panduan ditolak: signature/ukuran tidak cocok");
    await discard({ ...v, uploadId: null }, storage);
    return {
      ok: false,
      code: "INVALID_FORMAT",
      message: `Isi file bukan video ${v.ext.toUpperCase()} (mis. .mkv yang diganti ekstensinya).`,
    };
  }
  const d = body.durationSec;
  const durationSec =
    typeof d === "number" && Number.isFinite(d) && d > 0 && d <= VIDEO_DURATION_MAX
      ? Math.max(1, Math.round(d))
      : null;
  const full = await prisma.$transaction(async (tx) => {
    // Kunci baris artikel: complete paralel untuk artikel yang sama berurutan, batas tetap pasti.
    await tx.$queryRaw`SELECT id FROM "GuideArticle" WHERE id = ${v.articleId} FOR UPDATE`;
    const ready = await tx.guideVideo.count({ where: { articleId: v.articleId, status: "READY" } });
    if (ready >= VIDEOS_PER_ARTICLE) return true;
    await tx.guideVideo.update({
      where: { id: v.id },
      data: { status: "READY", uploadId: null, durationSec },
    });
    await recordAudit(tx, {
      actorId: user.id,
      action: "guide.video.add",
      targetType: "guide",
      targetId: v.articleId,
      meta: { videoId: v.id, size, ext: v.ext },
      ip,
    });
    return false;
  });
  if (full) {
    await discard({ ...v, uploadId: null }, storage);
    return {
      ok: false,
      code: "LIMIT_REACHED",
      message: `Satu artikel paling banyak ${VIDEOS_PER_ARTICLE} video. Hapus video lama dulu.`,
    };
  }
  return { ok: true, videoId: v.id };
}

/** Poster PNG dari browser (≤ 2 MB, signature 8 byte); Content-Type ditetapkan server. */
export async function setVideoPoster(
  user: SessionUser,
  id: unknown,
  bytes: Uint8Array,
  ip: string,
): R<{ posterKey: string }> {
  const v = await ownVideo(user, id);
  if (!v || v.status !== "READY") return notFound;
  if (bytes.byteLength > POSTER_MAX_BYTES)
    return { ok: false, code: "FILE_TOO_LARGE", message: "Poster melebihi 2 MB." };
  if (!isPng(bytes)) return { ok: false, code: "INVALID_FORMAT", message: "Poster harus PNG." };
  const key = guidePosterKey(v.id);
  await putGuidePoster(key, bytes);
  // Video dihapus selagi poster diunggah: barisnya hilang → poster yang baru tersimpan ikut dibuang.
  const saved = await prisma.$transaction(async (tx) => {
    const r = await tx.guideVideo.updateMany({
      where: { id: v.id, status: "READY" },
      data: { posterKey: key },
    });
    if (r.count)
      await recordAudit(tx, {
        actorId: user.id,
        action: "guide.video.poster",
        targetType: "guide",
        targetId: v.articleId,
        meta: { videoId: v.id },
        ip,
      });
    return r;
  });
  if (saved.count === 0) {
    await deleteGuideObject(key).catch(() => retryLater([key], "guide-poster"));
    return notFound;
  }
  return { ok: true, posterKey: key };
}

/** Takarir WebVTT dari browser (≤ 200 KB, signature + UTF-8); unggah ulang menggantinya (T-j9j6). */
export async function setVideoCaption(
  user: SessionUser,
  id: unknown,
  bytes: Uint8Array,
  ip: string,
): R<{ captionKey: string }> {
  const v = await ownVideo(user, id);
  if (!v || v.status !== "READY") return notFound;
  if (bytes.byteLength > CAPTION_MAX_BYTES)
    return { ok: false, code: "FILE_TOO_LARGE", message: "Takarir melebihi batas 200 KB." };
  if (!isVtt(bytes))
    return {
      ok: false,
      code: "INVALID_FORMAT",
      message: "Takarir harus file WebVTT (diawali WEBVTT, teks UTF-8).",
    };
  // Kunci baru per unggahan (T-qqbc): takarir lama tidak ditimpa — baru terlihat saat captionKey
  // di-commit — dan hapus/ganti yang bersamaan tidak pernah menghapus file unggahan ini.
  const key = guideCaptionKey(v.id);
  // Dijadwalkan sebelum ditulis: proses mati sebelum commit tidak meninggalkan file berkunci acak yang
  // tidak tercatat di mana pun (job menghapusnya; bila sudah di-commit, captionKey menunjuknya → dibiarkan).
  await scheduleKeys(prisma, [key], "guide-caption-upload");
  await putGuideCaption(key, bytes);
  const saved = await prisma.$transaction(async (tx) => {
    const cur = await lockVideo(tx, v.id);
    if (!cur || cur.status !== "READY") return null;
    await tx.guideVideo.update({ where: { id: v.id }, data: { captionKey: key } });
    if (cur.captionKey) await scheduleKeys(tx, [cur.captionKey], "guide-caption");
    await recordAudit(tx, {
      actorId: user.id,
      action: "guide.video.caption",
      targetType: "guide",
      targetId: v.articleId,
      meta: { videoId: v.id, replaced: cur.captionKey !== null },
      ip,
    });
    return { old: cur.captionKey };
  });
  // Video dihapus selagi takarir diunggah → objek yang baru tersimpan dibuang.
  if (!saved) {
    await deleteGuideObject(key).catch(() => retryLater([key], "guide-caption"));
    return notFound;
  }
  await prisma.storageCleanup.deleteMany({ where: { prefix: key } }).catch(() => {});
  if (saved.old) await removeScheduled(saved.old, v.id);
  return { ok: true, captionKey: key };
}

/**
 * Baca status + captionKey sambil mengunci baris video sampai transaksi selesai (SELECT … FOR UPDATE):
 * unggah/hapus takarir dan hapus video untuk video yang sama berjalan bergiliran.
 */
async function lockVideo(
  tx: Pick<typeof prisma, "$queryRaw">,
  id: string,
): Promise<{ status: string; captionKey: string | null } | null> {
  const rows = await tx.$queryRaw<{ status: string; captionKey: string | null }[]>`
    SELECT "status"::text AS "status", "captionKey" FROM "GuideVideo" WHERE "id" = ${id} FOR UPDATE`;
  return rows[0] ?? null;
}

async function scheduleKeys(
  tx: Pick<typeof prisma, "storageCleanup">,
  keys: string[],
  reason: string,
): Promise<void> {
  await tx.storageCleanup.createMany({
    data: keys.map((prefix) => ({ prefix, reason, notBefore: graceEnd() })),
  });
}

/** Hapus objek yang sudah dijadwalkan; berhasil → jadwal dibuang, gagal → diulang job. */
async function removeScheduled(key: string, videoId: string): Promise<void> {
  try {
    await deleteGuideObject(key);
    await prisma.storageCleanup.deleteMany({ where: { prefix: key } });
  } catch (e) {
    logger.error({ videoId, err: String(e) }, "takarir lama gagal dihapus; diulang job");
  }
}

/**
 * Hapus takarir (T-qqbc): baris dikunci, captionKey dikosongkan + kunci lama dijadwalkan + audit dalam
 * satu transaksi, lalu objek lama dihapus. Unggahan bersamaan memakai kunci lain, jadi tidak terhapus.
 */
export async function removeVideoCaption(
  user: SessionUser,
  id: unknown,
  ip: string,
): R<{ videoId: string }> {
  const v = await ownVideo(user, id);
  if (!v || v.status !== "READY") return notFound;
  const removed = await prisma.$transaction(async (tx) => {
    const cur = await lockVideo(tx, v.id);
    if (!cur || cur.status !== "READY") return undefined;
    if (!cur.captionKey) return null; // sudah tanpa takarir
    await tx.guideVideo.update({ where: { id: v.id }, data: { captionKey: null } });
    await scheduleKeys(tx, [cur.captionKey], "guide-caption");
    await recordAudit(tx, {
      actorId: user.id,
      action: "guide.video.caption.delete",
      targetType: "guide",
      targetId: v.articleId,
      meta: { videoId: v.id },
      ip,
    });
    return cur.captionKey;
  });
  if (removed === undefined) return notFound;
  if (removed) await removeScheduled(removed, v.id);
  return { ok: true, videoId: v.id };
}

export async function deleteVideo(
  user: SessionUser,
  id: unknown,
  ip: string,
  storage: MultipartStorage = s3Multipart,
): R<{ videoId: string }> {
  const v = await ownVideo(user, id);
  if (!v) return notFound;
  // Baris dulu, objek sesudahnya (seperti deleteGuide); pembersihan ulang dijadwalkan di transaksi yang
  // sama, jadi proses yang mati di antaranya pun tidak meninggalkan objek yatim.
  await prisma.$transaction(async (tx) => {
    // Dikunci dulu: takarir yang sedang disimpan bersamaan ikut terjadwal (bukan kunci basi dari ownVideo).
    const cur = await lockVideo(tx, v.id);
    v.captionKey = cur?.captionKey ?? null;
    await tx.guideVideo.deleteMany({ where: { id: v.id } });
    await scheduleVideoCleanup(tx, [v]);
    if (v.status === "READY")
      await recordAudit(tx, {
        actorId: user.id,
        action: "guide.video.delete",
        targetType: "guide",
        targetId: v.articleId,
        meta: { videoId: v.id },
        ip,
      });
  });
  await removeVideoObjects([v], storage);
  return { ok: true, videoId: v.id };
}

/**
 * Kunci objek yang gagal dihapus → StorageCleanup (job storage-cleanup mengulang, T-z5nq): tidak ada
 * objek yatim permanen. Gagal mencatat pun hanya dilog (penghapusan sudah dilakukan sebisanya).
 */
async function retryLater(keys: string[], reason: string): Promise<void> {
  await prisma.storageCleanup
    .createMany({ data: keys.map((prefix) => ({ prefix, reason })) })
    .catch((e: unknown) =>
      logger.error({ keys, err: String(e) }, "pembersihan ulang gagal dicatat"),
    );
}

/** Jeda sebelum job storage-cleanup memproses jadwal yang dibuat bersama penghapusan baris. */
const CLEANUP_GRACE_MS = 10 * 60 * 1000;
const graceEnd = () => new Date(Date.now() + CLEANUP_GRACE_MS);
type VideoObjects = { id: string; objectKey: string; captionKey?: string | null };
const videoKeys = (v: VideoObjects) => [
  v.objectKey,
  guidePosterKey(v.id),
  ...(v.captionKey ? [v.captionKey] : []),
];

/**
 * Jadwalkan pembersihan objek video + poster + takarir di transaksi yang menghapus barisnya (T-z5nq). Wajib
 * sebelum removeVideoObjects: sukses → jadwal dibuang; gagal / proses mati → job mengulang setelah jeda.
 */
export async function scheduleVideoCleanup(
  tx: Pick<typeof prisma, "storageCleanup">,
  videos: VideoObjects[],
): Promise<void> {
  if (!videos.length) return;
  const notBefore = graceEnd();
  await tx.storageCleanup.createMany({
    data: videos.flatMap((v) =>
      videoKeys(v).map((prefix) => ({ prefix, reason: "guide-video", notBefore })),
    ),
  });
}

/**
 * Hapus objek video + poster + takarir yang sudah dijadwalkan (scheduleVideoCleanup). Poster dihapus
 * walau posterKey kosong (kuncinya pasti per video dan bisa sedang diunggah bersamaan); takarir lewat
 * captionKey yang tersimpan (kunci per unggahan, T-qqbc).
 */
export async function removeVideoObjects(
  videos: (VideoObjects & { uploadId: string | null; posterKey: string | null })[],
  storage: MultipartStorage = s3Multipart,
): Promise<void> {
  for (const v of videos) {
    const keys = videoKeys(v);
    try {
      if (v.uploadId) await storage.abort(v.objectKey, v.uploadId);
      for (const key of keys) await deleteGuideObject(key);
    } catch (e) {
      logger.error(
        { videoId: v.id, err: String(e) },
        "objek video panduan gagal dihapus; diulang job",
      );
      continue;
    }
    // Sisa jadwal hanya membuat job memeriksa ulang objek yang sudah hilang.
    await prisma.storageCleanup.deleteMany({ where: { prefix: { in: keys } } }).catch(() => {});
  }
}

export interface GuideVideoView {
  id: string;
  /** Waktu src/poster ditandatangani (epoch ms): pemutar memperbaruinya sebelum kedaluwarsa. */
  issuedAt: number;
  articleId: string;
  title: string;
  durationSec: number | null;
  sizeBytes: number;
  src: string;
  poster: string | null;
  /**
   * Versi takarir (updatedAt ms) di /api/guides/videos/<id>/takarir (same-origin, T-j9j6); null = tanpa
   * takarir. Dipakai di URL <track>: takarir yang diganti langsung tampil tanpa muat ulang halaman.
   */
  captionVersion: number | null;
}

/** Video siap per artikel, dengan presigned URL 1 jam (src + poster). */
export async function videosFor(articleIds: string[]): Promise<GuideVideoView[]> {
  if (!articleIds.length) return [];
  const rows = await prisma.guideVideo.findMany({
    where: { articleId: { in: articleIds }, status: "READY" },
    orderBy: { createdAt: "asc" },
  });
  const issuedAt = Date.now();
  return Promise.all(
    rows.map(async (v) => ({
      id: v.id,
      issuedAt,
      articleId: v.articleId,
      title: v.title,
      durationSec: v.durationSec,
      sizeBytes: Number(v.sizeBytes),
      src: await presignGuideGet(v.objectKey, VIDEO_CONTENT_TYPE[v.ext as VideoExt]),
      poster: v.posterKey ? await presignGuideGet(v.posterKey, "image/png") : null,
      captionVersion: v.captionKey ? v.updatedAt.getTime() : null,
    })),
  );
}
