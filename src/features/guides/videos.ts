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
  guidePosterKey,
  guideVideoKey,
  presignGuideGet,
  putGuidePoster,
} from "@/lib/storage/guides";
import { s3Multipart, type MultipartStorage } from "@/lib/storage/multipart";
import {
  POSTER_MAX_BYTES,
  VIDEO_DURATION_MAX,
  VIDEO_MAX_BYTES,
  VIDEO_SNIFF_BYTES,
  VIDEO_TITLE_MAX,
  isPng,
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

export const VIDEOS_PER_ARTICLE = 5;
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
  const article = await prisma.guideArticle.findUnique({
    where: { id: body.articleId },
    select: { id: true, _count: { select: { videos: true } } },
  });
  if (!article) return { ...notFound, message: "Artikel tidak ditemukan." };
  await expireStale(storage);
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

/** Buang video yang gagal (objek + multipart + baris). */
async function discard(
  v: { id: string; objectKey: string; uploadId: string | null },
  storage: MultipartStorage,
) {
  if (v.uploadId) await storage.abort(v.objectKey, v.uploadId).catch(() => {});
  await storage.remove(v.objectKey).catch(() => {});
  await prisma.guideVideo.deleteMany({ where: { id: v.id } });
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
  await prisma.$transaction(async (tx) => {
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
  });
  return { ok: true, videoId: v.id };
}

/** Poster PNG dari browser (≤ 2 MB, signature 8 byte); Content-Type ditetapkan server. */
export async function setVideoPoster(
  user: SessionUser,
  id: unknown,
  bytes: Uint8Array,
): R<{ posterKey: string }> {
  const v = await ownVideo(user, id);
  if (!v || v.status !== "READY") return notFound;
  if (bytes.byteLength > POSTER_MAX_BYTES)
    return { ok: false, code: "FILE_TOO_LARGE", message: "Poster melebihi 2 MB." };
  if (!isPng(bytes)) return { ok: false, code: "INVALID_FORMAT", message: "Poster harus PNG." };
  const key = guidePosterKey(v.id);
  await putGuidePoster(key, bytes);
  await prisma.guideVideo.update({ where: { id: v.id }, data: { posterKey: key } });
  return { ok: true, posterKey: key };
}

export async function deleteVideo(
  user: SessionUser,
  id: unknown,
  ip: string,
  storage: MultipartStorage = s3Multipart,
): R<{ videoId: string }> {
  const v = await ownVideo(user, id);
  if (!v) return notFound;
  await removeVideoObjects([v], storage);
  await prisma.$transaction(async (tx) => {
    await tx.guideVideo.deleteMany({ where: { id: v.id } });
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
  return { ok: true, videoId: v.id };
}

/** Hapus objek video/poster (dipakai juga saat artikel dihapus). Gagal → dicatat, tidak dilempar. */
export async function removeVideoObjects(
  videos: { id: string; objectKey: string; uploadId: string | null; posterKey: string | null }[],
  storage: MultipartStorage = s3Multipart,
): Promise<void> {
  for (const v of videos) {
    try {
      if (v.uploadId) await storage.abort(v.objectKey, v.uploadId);
      await deleteGuideObject(v.objectKey);
      if (v.posterKey) await deleteGuideObject(v.posterKey);
    } catch (e) {
      logger.error({ videoId: v.id, err: String(e) }, "objek video panduan gagal dihapus");
    }
  }
}

export interface GuideVideoView {
  id: string;
  articleId: string;
  title: string;
  durationSec: number | null;
  sizeBytes: number;
  src: string;
  poster: string | null;
}

/** Video siap per artikel, dengan presigned URL 1 jam (src + poster). */
export async function videosFor(articleIds: string[]): Promise<GuideVideoView[]> {
  if (!articleIds.length) return [];
  const rows = await prisma.guideVideo.findMany({
    where: { articleId: { in: articleIds }, status: "READY" },
    orderBy: { createdAt: "asc" },
  });
  return Promise.all(
    rows.map(async (v) => ({
      id: v.id,
      articleId: v.articleId,
      title: v.title,
      durationSec: v.durationSec,
      sizeBytes: Number(v.sizeBytes),
      src: await presignGuideGet(v.objectKey, VIDEO_CONTENT_TYPE[v.ext as VideoExt]),
      poster: v.posterKey ? await presignGuideGet(v.posterKey, "image/png") : null,
    })),
  );
}
