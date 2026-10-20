import "server-only";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { enqueueIngest } from "@/lib/queue/versions";
import { s3Multipart, type MultipartStorage } from "@/lib/storage/multipart";
import { NON_TERMINAL_STATUSES } from "@/features/datasets/label";
import { isIdShape } from "@/features/datasets/validation";
import { periodStartOf, type PeriodGrain } from "@/features/ingest/period";
import { parseFrozenPeriodPlan } from "@/features/ingest/period-plan";
import { periodPlanSummary } from "@/features/ingest/period-upload-plan";
import { periodInitCheck } from "@/features/versions/period-capacity";
import { PART_SIZE, partCountOf } from "./parts";
import { formatGiB, quotaDecision, quotaGraceUntil, userUsage } from "./quota";
import {
  QUEUE_MAX_FILES,
  UNSTARTED_ITEM_STATES,
  decideAdvance,
  orderQueueFiles,
  queueFilesProblem,
  queueView,
  type AdvanceVersion,
  type QueueItemRow,
  type QueueView,
} from "./queue-plan";
import {
  COMPLETE_CLAIM_MS,
  completeTarget,
  expireStaleUploads,
  fingerprintOf,
  signTarget,
  uploadedPartNumbers,
  validateInit,
  type UploadCode,
  type UploadResult,
} from "./service";
import { kindOf } from "./sniff";

/*
 * Antrean unggah banyak file periode (T-059, rencana G-6 §4.5 langkah 6). Pemilik memilih banyak file;
 * server membuat antrean berurutan (queue-plan.ts) dan memesan id versi tiap file. Browser mengunggah
 * file satu per satu langsung ke storage (multipart, bisa dilanjutkan) ke raw/<ds>/<versionId>/; file
 * yang utuh menunggu giliran (QUEUED). Giliran dijalankan server (`advanceUploadQueue`): bila dataset
 * tidak punya versi non-terminal (D4), file berikutnya dibuatkan versi PERIOD (UPLOADED, versi dasar =
 * versi aktif saat itu) lalu diantrekan ke worker. Dipanggil setelah file selesai diunggah, setelah job
 * ingest/pemetaan worker selesai, setelah tinjauan diputuskan, dan tiap menit oleh job pemeliharaan —
 * jadi antrean tetap berjalan walau tab ditutup, selama file-nya sudah terunggah.
 *
 * Semua akses di-scope pemilik dataset (lainnya NOT_FOUND, D2). Giliran memegang lock unggah pemilik
 * (sama dengan init unggah) lalu baris Dataset (sama dengan aktivasi/kelola periode), sehingga tidak
 * pernah ada dua versi non-terminal; transisi file memakai updateMany bersyarat status (idempoten,
 * tidak ada file yang diproses dua kali).
 */

export type QueueResult<T> = UploadResult<T>;

const fail = (code: UploadCode, message: string) => ({ ok: false as const, code, message });
const notFound = () => fail("NOT_FOUND", "Antrean atau file tidak ditemukan.");

/** File antrean yang belum selesai diunggah lebih dari ini dianggap ditinggalkan. */
export const QUEUE_ITEM_STALE_MS = 24 * 60 * 60 * 1000;
/** Ringkasan antrean selesai tetap tampil sampai ditutup, paling lama selama ini. */
const SUMMARY_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const TX_OPTIONS = { maxWait: 5_000, timeout: 30_000 };

const dateOf = (iso: string) => new Date(`${iso}T00:00:00Z`);
const isoOf = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

/** Kunci file sumber file antrean = kunci sumber versinya nanti (prefix versi berlaku apa adanya). */
export function itemSourceKey(datasetId: string, versionId: string, name: string): string {
  return `raw/${datasetId}/${versionId}/source.${kindOf(name) ?? "csv"}`;
}

const fileSchema = z.object({
  name: z.unknown(),
  size: z.unknown(),
  lastModified: z.unknown(),
  label: z.unknown().optional(),
});
const createSchema = z.object({
  datasetId: z.unknown(),
  baseVersionId: z.unknown(),
  files: z.array(fileSchema).min(1).max(QUEUE_MAX_FILES),
});

const busyMessage = (status: string, own: boolean) =>
  own
    ? "Masih ada unggahan yang belum selesai di dataset ini. Selesaikan atau batalkan unggahan itu dulu, lalu buat antrean."
    : status === "AWAITING_CONFIRM"
      ? "Unggahan sebelumnya menunggu konfirmasi. Terapkan atau batalkan dulu, lalu buat antrean."
      : "Dataset sedang memproses file lain. Tunggu sampai selesai, lalu buat antrean.";

export const QUEUE_OPEN_MESSAGE =
  "Antrean unggahan sedang berjalan di dataset ini. Tunggu sampai selesai atau hentikan antrean, lalu unggah lagi.";

/**
 * Buat antrean dari daftar file (metadata saja; byte diunggah kemudian per file). Urutan ditetapkan
 * server (deterministik). Kuota dipesan untuk semua file sekaligus, sehingga antrean tidak berhenti di
 * tengah karena kuota.
 */
export async function createUploadQueue(
  userId: string,
  input: unknown,
  storage: MultipartStorage = s3Multipart,
): Promise<QueueResult<{ queue: QueueView }>> {
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) {
    const tooMany = parsed.error.issues.some((i) => i.code === "too_big");
    return fail(
      "INVALID",
      tooMany
        ? `Maksimal ${QUEUE_MAX_FILES} file per antrean. Unggah sisanya setelah antrean ini selesai.`
        : "Daftar file tidak valid. Muat ulang halaman lalu pilih lagi.",
    );
  }
  const { datasetId, baseVersionId } = parsed.data;
  if (typeof datasetId !== "string" || !isIdShape(datasetId)) return notFound();
  const maxBytes = env().MAX_UPLOAD_BYTES;
  const files: { name: string; size: number; lastModified: number; label: string | null }[] = [];
  for (const f of parsed.data.files) {
    const v = validateInit(
      {
        datasetId,
        name: f.name,
        size: f.size,
        lastModified: f.lastModified,
        mode: "PERIOD",
        label: f.label ?? null,
        baseVersionId,
      },
      maxBytes,
    );
    if (!v.ok) {
      const name = typeof f.name === "string" ? f.name : "file";
      return fail(v.code, `“${name}”: ${v.message}`);
    }
    files.push({ name: v.name, size: v.size, lastModified: v.lastModified, label: v.label });
  }

  const owned = await prisma.dataset.findFirst({
    where: { id: datasetId, ownerId: userId },
    select: { id: true },
  });
  if (!owned) return notFound();
  await expireStaleUploads({ OR: [{ datasetId }, { uploadedById: userId }] }, storage);

  type Created =
    { kind: "ok"; queueId: string } | { kind: "reject"; code: UploadCode; message: string };
  let created: Created;
  try {
    created = await prisma.$transaction(async (tx): Promise<Created> => {
      // Lock unggah pemilik (sama dengan init unggah) lalu baris Dataset (sama dengan giliran antrean).
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`uploads:${userId}`}))`;
      const [ds] = await tx.$queryRaw<{ activeVersionId: string | null }[]>`
        SELECT "activeVersionId" FROM "Dataset" WHERE id = ${datasetId} AND "ownerId" = ${userId} FOR UPDATE`;
      if (!ds) return { kind: "reject", ...notFound() };
      const active = ds.activeVersionId
        ? await tx.datasetVersion.findUnique({
            where: { id: ds.activeVersionId },
            select: { periodGrain: true, sheets: { select: { periodSource: true } } },
          })
        : null;
      if (!active?.periodGrain) {
        return {
          kind: "reject",
          code: "INVALID",
          message:
            "Dataset ini belum menyimpan data per periode. Atur periode dulu, atau unggah satu file untuk mengganti semua data.",
        };
      }
      if (ds.activeVersionId !== baseVersionId) {
        return {
          kind: "reject",
          code: "STALE",
          message: "Data aktif berubah sejak halaman dibuka. Muat ulang halaman lalu pilih lagi.",
        };
      }
      const open = await tx.uploadQueue.count({ where: { datasetId, status: "OPEN" } });
      if (open) return { kind: "reject", code: "DATASET_BUSY", message: QUEUE_OPEN_MESSAGE };
      const busy = await tx.datasetVersion.findFirst({
        where: { datasetId, status: { in: [...NON_TERMINAL_STATUSES] } },
        select: { status: true, uploadedById: true },
      });
      if (busy) {
        return {
          kind: "reject",
          code: "DATASET_BUSY",
          message: busyMessage(
            busy.status,
            busy.status === "UPLOADING" && busy.uploadedById === userId,
          ),
        };
      }
      const grain = active.periodGrain;
      const needsLabel = active.sheets.some((s) => s.periodSource === "LABEL");
      for (const f of files) {
        if (!needsLabel) f.label = null;
        else if (
          f.label &&
          (periodStartOf(grain, f.label) !== f.label || Number(f.label.slice(0, 4)) < 1000)
        ) {
          return {
            kind: "reject",
            code: "INVALID",
            message: `Periode “${f.name}” tidak valid. Pilih periodenya lagi.`,
          };
        }
      }
      const problem = queueFilesProblem(files, { grain, needsLabel });
      if (problem) return { kind: "reject", code: "INVALID", message: problem };

      const total = files.reduce((n, f) => n + f.size, 0);
      const usage = await userUsage(tx, userId);
      const graceUntil = await quotaGraceUntil(tx);
      const inGrace = !!graceUntil && new Date() < graceUntil;
      const quota = env().USER_STORAGE_QUOTA_BYTES;
      const q = quotaDecision(usage, total, quota, inGrace);
      if (!q.ok) {
        return {
          kind: "reject",
          code: "QUOTA_EXCEEDED",
          message: `Kuota penyimpanan tidak cukup untuk ${files.length} file: terpakai ${formatGiB(q.usedBytes)} dari ${formatGiB(quota)}, file-file ini ${formatGiB(total)} (±${formatGiB(q.projected)} setelah diproses). Kurangi jumlah file, atau hapus dataset/versi yang tidak dipakai.`,
        };
      }
      if (q.warn)
        logger.warn({ userId, used: usage.bytes, size: total }, "kuota terlampaui (masa transisi)");

      const ordered = orderQueueFiles(files, grain);
      const queue = await tx.uploadQueue.create({
        data: {
          datasetId,
          items: {
            create: ordered.map((f, i) => ({
              seq: i + 1,
              originalName: f.name,
              sizeBytes: BigInt(f.size),
              lastModified: BigInt(f.lastModified),
              periodLabel: f.label ? dateOf(f.label) : null,
              partSize: PART_SIZE,
              partCount: partCountOf(f.size),
            })),
          },
        },
        select: { id: true },
      });
      return { kind: "ok", queueId: queue.id };
    }, TX_OPTIONS);
  } catch (e) {
    if (
      e instanceof Prisma.PrismaClientKnownRequestError &&
      (e.code === "P2028" || e.code === "P2002")
    ) {
      return fail("BUSY", "Sedang memproses permintaan lain. Coba lagi.");
    }
    throw e;
  }
  if (created.kind === "reject") return fail(created.code, created.message);
  logger.info(
    { datasetId, queueId: created.queueId, files: files.length },
    "antrean unggah dibuat",
  );
  const view = await getUploadQueue(userId, datasetId);
  if (!view) return notFound();
  return { ok: true, queue: view };
}

/** File antrean milik pemilik dataset (antrean apa pun statusnya). */
async function ownItem(userId: string, itemId: unknown) {
  if (typeof itemId !== "string" || !isIdShape(itemId)) return null;
  return prisma.uploadQueueItem.findFirst({
    where: { id: itemId, queue: { dataset: { ownerId: userId } } },
    select: {
      id: true,
      versionId: true,
      originalName: true,
      sizeBytes: true,
      state: true,
      message: true,
      uploadId: true,
      partSize: true,
      partCount: true,
      queue: { select: { id: true, datasetId: true, status: true, stoppedAt: true } },
    },
  });
}

/**
 * Aktivitas unggah antrean (init/tanda tangan part/selesai): kedaluwarsa 24 jam diukur dari aktivitas
 * terakhir antrean, bukan dari waktu file dibuat — file terakhir di antrean besar pada koneksi lambat
 * baru mulai diunggah berjam-jam setelah antrean dibuat (review M1).
 */
async function touchQueue(queueId: string) {
  await prisma.uploadQueue.updateMany({
    where: { id: queueId, status: "OPEN" },
    data: { updatedAt: new Date() },
  });
}

const closedMessage = (it: { state: string; message: string | null }) =>
  it.state === "FAILED"
    ? (it.message ?? "File ini gagal diunggah.")
    : "File ini sudah tidak ada di antrean (dibatalkan atau antrean dihentikan).";

export interface QueueItemInit {
  /** Id unggahan untuk progres klien (= id file antrean). */
  versionId: string;
  partSize: number;
  partCount: number;
  uploadedParts: number[];
  resumed: boolean;
}

/**
 * Mulai/lanjutkan multipart satu file antrean. File yang sudah utuh (QUEUED atau sesudahnya) → semua
 * part dianggap ada, sehingga klien langsung memanggil complete (idempoten) tanpa mengunggah ulang.
 */
export async function initQueueItem(
  userId: string,
  itemId: unknown,
  storage: MultipartStorage = s3Multipart,
): Promise<QueueResult<QueueItemInit>> {
  const it = await ownItem(userId, itemId);
  if (!it) return notFound();
  const plan = { versionId: it.id, partSize: it.partSize, partCount: it.partCount };
  if (it.state === "FAILED" || it.state === "CANCELLED")
    return fail("UPLOAD_FAILED", closedMessage(it));
  if (it.state !== "WAITING" && it.state !== "UPLOADING") {
    const all = Array.from({ length: it.partCount }, (_, i) => i + 1);
    return { ok: true, ...plan, uploadedParts: all, resumed: true };
  }
  await touchQueue(it.queue.id);
  const key = itemSourceKey(it.queue.datasetId, it.versionId, it.originalName);
  if (it.state === "UPLOADING" && it.uploadId) {
    const uploaded = await uploadedPartNumbers(storage, {
      sourceKey: key,
      uploadId: it.uploadId,
      sizeBytes: it.sizeBytes,
      partSize: it.partSize,
      partCount: it.partCount,
    });
    if (uploaded) {
      // Sentuh: kedaluwarsa 24 jam dihitung dari aktivitas terakhir.
      // (nilai sama; klaim complete yang sedang berjalan tidak diganggu).
      await prisma.uploadQueueItem.updateMany({
        where: { id: it.id, state: "UPLOADING", uploadId: it.uploadId },
        data: { uploadId: it.uploadId },
      });
      return { ok: true, ...plan, uploadedParts: uploaded, resumed: true };
    }
  }
  // Belum mulai, atau multipart lama sudah hilang (lifecycle): mulai multipart baru.
  let uploadId: string;
  try {
    uploadId = await storage.create(key);
  } catch (err) {
    logger.error({ itemId: it.id, err: String(err) }, "createMultipartUpload antrean gagal");
    return fail(
      "STORAGE_ERROR",
      "Penyimpanan file sedang tidak bisa dihubungi. Coba lagi beberapa saat lagi.",
    );
  }
  const r = await prisma.uploadQueueItem.updateMany({
    where: { id: it.id, state: it.state, uploadId: it.uploadId },
    data: { state: "UPLOADING", uploadId, completingAt: null },
  });
  if (r.count !== 1) {
    await storage.abort(key, uploadId).catch(() => {});
    return fail("BUSY", "File ini sedang diunggah dari tab lain. Tunggu sebentar, lalu coba lagi.");
  }
  if (it.uploadId) await storage.abort(key, it.uploadId).catch(() => {});
  return { ok: true, ...plan, uploadedParts: [], resumed: false };
}

/** Presigned URL part file antrean yang sedang diunggah. */
export async function signQueueParts(
  userId: string,
  itemId: unknown,
  partNumbers: unknown,
  storage: MultipartStorage = s3Multipart,
): Promise<QueueResult<{ urls: { partNumber: number; url: string; size: number }[] }>> {
  const it = await ownItem(userId, itemId);
  if (!it || it.state !== "UPLOADING" || !it.uploadId) return notFound();
  await touchQueue(it.queue.id);
  return signTarget(
    {
      key: itemSourceKey(it.queue.datasetId, it.versionId, it.originalName),
      uploadId: it.uploadId,
      size: Number(it.sizeBytes),
      partSize: it.partSize,
      partCount: it.partCount,
    },
    partNumbers,
    storage,
  );
}

export interface QueueDeps {
  storage?: MultipartStorage;
  enqueue?: (versionId: string, datasetId: string) => Promise<void>;
}

/** Selesaikan unggahan satu file antrean → QUEUED, lalu jalankan giliran antrean. */
export async function completeQueueItem(
  userId: string,
  itemId: unknown,
  deps: QueueDeps = {},
): Promise<QueueResult<{ state: string }>> {
  const storage = deps.storage ?? s3Multipart;
  const it = await ownItem(userId, itemId);
  if (!it) return notFound();
  if (it.state === "FAILED" || it.state === "CANCELLED")
    return fail("UPLOAD_FAILED", closedMessage(it));
  if (it.state !== "UPLOADING") {
    // Sudah utuh (idempoten); giliran dicoba lagi (mis. advance sebelumnya gagal).
    if (it.state !== "WAITING") await advanceUploadQueue(it.queue.datasetId, deps);
    return it.state === "WAITING" ? notFound() : { ok: true, state: it.state };
  }
  if (!it.uploadId) return notFound();
  await touchQueue(it.queue.id);
  const id = it.id;
  const uploadId = it.uploadId;
  const r = await completeTarget(
    {
      key: itemSourceKey(it.queue.datasetId, it.versionId, it.originalName),
      uploadId,
      size: Number(it.sizeBytes),
      partSize: it.partSize,
      partCount: it.partCount,
      logId: { queueItemId: id },
      claim: async () => {
        const c = await prisma.uploadQueueItem.updateMany({
          where: {
            id,
            state: "UPLOADING",
            uploadId,
            OR: [
              { completingAt: null },
              { completingAt: { lt: new Date(Date.now() - COMPLETE_CLAIM_MS) } },
            ],
          },
          data: { completingAt: new Date() },
        });
        return c.count > 0;
      },
      release: () =>
        prisma.uploadQueueItem.updateMany({
          where: { id, state: "UPLOADING" },
          data: { completingAt: null },
        }),
      markFailed: async (message) => {
        await prisma.uploadQueueItem.updateMany({
          where: { id, state: "UPLOADING" },
          data: {
            state: "FAILED",
            message,
            uploadId: null,
            completingAt: null,
            finishedAt: new Date(),
          },
        });
      },
      markUploaded: async (etag) => {
        const done = await prisma.uploadQueueItem.updateMany({
          where: { id, state: "UPLOADING" },
          data: { state: "QUEUED", etag, uploadId: null, completingAt: null },
        });
        return done.count > 0;
      },
    },
    storage,
  );
  // Gagal permanen (format/rusak) juga menggerakkan antrean: file berikutnya tidak tertahan.
  await advanceUploadQueue(it.queue.datasetId, deps);
  if (!r.ok) return r;
  logger.info({ queueItemId: id, size: Number(it.sizeBytes) }, "file antrean terunggah");
  return { ok: true, state: "QUEUED" };
}

/** Alasan klien melewati file (pra-cek lokal gagal) → pesan tetap dari server. */
const SKIP_REASONS: Record<string, string> = {
  INVALID_FORMAT: "Format file tidak valid (bukan .xlsx/.csv yang bisa dibaca). File dilewati.",
  FILE_TOO_LARGE: "Ukuran file melebihi batas unggah. File dilewati.",
};

/**
 * Lewati satu file yang belum menjadi versi ("Lewati file" — mis. file tidak tersedia lagi setelah
 * muat ulang) atau tandai gagal dari pra-cek lokal; antrean lanjut ke file berikutnya.
 */
export async function skipQueueItem(
  userId: string,
  itemId: unknown,
  reason: unknown,
  deps: QueueDeps = {},
): Promise<QueueResult<{ state: string }>> {
  const storage = deps.storage ?? s3Multipart;
  const it = await ownItem(userId, itemId);
  if (!it) return notFound();
  const failed = typeof reason === "string" ? SKIP_REASONS[reason] : undefined;
  if (!(UNSTARTED_ITEM_STATES as readonly string[]).includes(it.state)) {
    return fail("INVALID", "File ini sudah diproses atau sudah selesai, jadi tidak bisa dilewati.");
  }
  const r = await prisma.uploadQueueItem.updateMany({
    where: {
      id: it.id,
      state: { in: [...UNSTARTED_ITEM_STATES] },
      OR: [
        { completingAt: null },
        { completingAt: { lt: new Date(Date.now() - COMPLETE_CLAIM_MS) } },
      ],
    },
    data: failed
      ? { state: "FAILED", message: failed, uploadId: null, finishedAt: new Date() }
      : {
          state: "CANCELLED",
          message: "Dilewati pemilik.",
          uploadId: null,
          finishedAt: new Date(),
        },
  });
  if (r.count !== 1)
    return fail("BUSY", "File ini sedang diperiksa. Tunggu sebentar, lalu coba lagi.");
  await removeItemObject(storage, it.queue.datasetId, it);
  await advanceUploadQueue(it.queue.datasetId, deps);
  return { ok: true, state: failed ? "FAILED" : "CANCELLED" };
}

async function removeItemObject(
  storage: MultipartStorage,
  datasetId: string,
  it: { id: string; versionId: string; originalName: string; uploadId: string | null },
) {
  const key = itemSourceKey(datasetId, it.versionId, it.originalName);
  if (it.uploadId) {
    await storage
      .abort(key, it.uploadId)
      .catch((e: unknown) =>
        logger.warn(
          { queueItemId: it.id, err: String(e) },
          "abort multipart antrean gagal (lifecycle membersihkan)",
        ),
      );
  }
  await storage.remove(key).catch(() => {});
}

/** Pemilik dataset dari antrean (owner-scope); null = tidak ada/bukan miliknya. */
async function ownQueue(userId: string, queueId: unknown) {
  if (typeof queueId !== "string" || !isIdShape(queueId)) return null;
  return prisma.uploadQueue.findFirst({
    where: { id: queueId, dataset: { ownerId: userId } },
    select: { id: true, datasetId: true, status: true },
  });
}

/**
 * "Hentikan antrean": file yang belum menjadi versi dibatalkan; file yang sedang diproses/ditinjau
 * tetap berjalan (tinjau/batalkan seperti biasa), lalu antrean berstatus dihentikan.
 */
export async function stopUploadQueue(
  userId: string,
  queueId: unknown,
  deps: QueueDeps = {},
): Promise<QueueResult<{ queue: QueueView | null }>> {
  const q = await ownQueue(userId, queueId);
  if (!q) return notFound();
  if (q.status === "OPEN") {
    await prisma.uploadQueue.updateMany({
      where: { id: q.id, status: "OPEN", stoppedAt: null },
      data: { stoppedAt: new Date() },
    });
    await advanceUploadQueue(q.datasetId, deps);
    logger.info({ queueId: q.id, datasetId: q.datasetId }, "antrean unggah dihentikan");
  }
  return { ok: true, queue: await getUploadQueue(userId, q.datasetId) };
}

/** Tutup ringkasan antrean yang sudah selesai/dihentikan. */
export async function dismissUploadQueue(
  userId: string,
  queueId: unknown,
): Promise<QueueResult<{ dismissed: true }>> {
  const q = await ownQueue(userId, queueId);
  if (!q) return notFound();
  if (q.status === "OPEN") return fail("INVALID", "Antrean masih berjalan.");
  await prisma.uploadQueue.updateMany({
    where: { id: q.id, dismissedAt: null },
    data: { dismissedAt: new Date() },
  });
  return { ok: true, dismissed: true };
}

/**
 * Antrean untuk panel unggah: yang masih berjalan, atau ringkasan antrean terakhir yang belum ditutup
 * (≤ 7 hari). Hanya pemilik; selain itu null.
 */
export async function getUploadQueue(userId: string, datasetId: string): Promise<QueueView | null> {
  if (!isIdShape(datasetId)) return null;
  const q = await prisma.uploadQueue.findFirst({
    where: {
      datasetId,
      dataset: { ownerId: userId },
      OR: [
        { status: "OPEN" },
        { dismissedAt: null, finishedAt: { gte: new Date(Date.now() - SUMMARY_TTL_MS) } },
      ],
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      status: true,
      stoppedAt: true,
      dataset: { select: { activeVersion: { select: { periodGrain: true } } } },
      items: {
        select: {
          id: true,
          seq: true,
          versionId: true,
          originalName: true,
          sizeBytes: true,
          lastModified: true,
          periodLabel: true,
          state: true,
          message: true,
        },
      },
    },
  });
  if (!q) return null;
  const started = q.items.filter((i) => i.state === "STARTED").map((i) => i.versionId);
  const versions = started.length
    ? await prisma.datasetVersion.findMany({
        where: { id: { in: started }, datasetId },
        select: { id: true, status: true },
      })
    : [];
  const statusOf = new Map(versions.map((v) => [v.id, v.status as string]));
  const rows: QueueItemRow[] = q.items.map((i) => ({
    id: i.id,
    seq: i.seq,
    name: i.originalName,
    size: Number(i.sizeBytes),
    lastModified: Number(i.lastModified),
    label: isoOf(i.periodLabel),
    state: i.state,
    message: i.message,
    versionId: i.versionId,
    versionStatus: statusOf.get(i.versionId) ?? null,
  }));
  return queueView(
    {
      id: q.id,
      status: q.status,
      grain: (q.dataset.activeVersion?.periodGrain ?? null) as PeriodGrain | null,
      stopped: q.stoppedAt !== null,
    },
    rows,
  );
}

type StepResult =
  | { kind: "none" }
  | { kind: "again"; cleanup: CleanupItem[] }
  | { kind: "enqueue"; versionId: string; cleanup: CleanupItem[] }
  | { kind: "stay"; cleanup: CleanupItem[] };
type CleanupItem = { id: string; versionId: string; originalName: string; uploadId: string | null };

/**
 * Jalankan giliran antrean dataset (idempoten; aman dipanggil dari mana saja, berkali-kali): catat hasil
 * versi file yang sudah selesai, buat versi untuk file berikutnya bila dataset bebas, atau tutup antrean
 * bila semua file selesai. Gagal di sini tidak pernah dilempar ke pemanggil (dicatat; dicoba lagi job
 * pemeliharaan tiap menit).
 */
export async function advanceUploadQueue(datasetId: string, deps: QueueDeps = {}): Promise<void> {
  const storage = deps.storage ?? s3Multipart;
  const enqueue = deps.enqueue ?? enqueueIngest;
  try {
    // Setiap putaran memproses paling banyak satu promosi; file yang gagal diperiksa saat giliran
    // (label/batas) membuat putaran berikutnya langsung mencoba file sesudahnya.
    for (let round = 0; round <= QUEUE_MAX_FILES + 1; round++) {
      const step = await prisma.$transaction((tx) => advanceStep(tx, datasetId), TX_OPTIONS);
      if (step.kind === "none") return;
      for (const c of step.cleanup) await removeItemObject(storage, datasetId, c);
      if (step.kind === "enqueue") {
        await enqueue(step.versionId, datasetId).catch((err: unknown) =>
          // Versi tetap UPLOADED: giliran berikutnya (atau sapuan worker saat start) mengantre ulang.
          logger.error(
            { versionId: step.versionId, err: String(err) },
            "enqueue ingest antrean gagal",
          ),
        );
        return;
      }
      if (step.kind === "stay") return;
    }
  } catch (e) {
    logger.error(
      { datasetId, err: e instanceof Error ? e.message : String(e) },
      "giliran antrean unggah gagal; dicoba lagi job pemeliharaan",
    );
  }
}

async function advanceStep(tx: Prisma.TransactionClient, datasetId: string): Promise<StepResult> {
  const owner = await tx.dataset.findUnique({
    where: { id: datasetId },
    select: { ownerId: true },
  });
  if (!owner) return { kind: "none" };
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`uploads:${owner.ownerId}`}))`;
  const [ds] = await tx.$queryRaw<{ activeVersionId: string | null }[]>`
    SELECT "activeVersionId" FROM "Dataset" WHERE id = ${datasetId} FOR UPDATE`;
  if (!ds) return { kind: "none" };
  const q = await tx.uploadQueue.findFirst({
    where: { datasetId, status: "OPEN" },
    select: {
      id: true,
      stoppedAt: true,
      items: {
        select: {
          id: true,
          seq: true,
          state: true,
          versionId: true,
          originalName: true,
          sizeBytes: true,
          lastModified: true,
          periodLabel: true,
          partSize: true,
          partCount: true,
          uploadId: true,
          etag: true,
        },
      },
    },
  });
  if (!q) return { kind: "none" };
  const startedIds = q.items.filter((i) => i.state === "STARTED").map((i) => i.versionId);
  const rows = startedIds.length
    ? await tx.datasetVersion.findMany({
        where: { id: { in: startedIds }, datasetId },
        select: { id: true, status: true, errorMessage: true, plan: true },
      })
    : [];
  const versions = new Map<string, AdvanceVersion | null>(
    rows.map((v) => {
      const plan = v.status === "READY" ? parseFrozenPeriodPlan(v.plan) : null;
      return [
        v.id,
        {
          status: v.status,
          errorMessage: v.errorMessage,
          summary: plan ? periodPlanSummary(plan) : null,
        },
      ];
    }),
  );
  const busy =
    (await tx.datasetVersion.count({
      where: {
        datasetId,
        status: { in: [...NON_TERMINAL_STATUSES] },
        id: { notIn: startedIds },
      },
    })) > 0;
  const d = decideAdvance(q.items, versions, busy, q.stoppedAt !== null);

  const now = new Date();
  const cleanup: CleanupItem[] = [];
  for (const s of d.settle) {
    const it = q.items.find((i) => i.id === s.id)!;
    const r = await tx.uploadQueueItem.updateMany({
      where: { id: s.id, state: it.state },
      data: {
        state: s.state,
        message: s.message,
        uploadId: null,
        completingAt: null,
        finishedAt: now,
      },
    });
    // File yang belum menjadi versi (antrean dihentikan): objek/multipart-nya dibuang setelah commit.
    if (r.count === 1 && it.state !== "STARTED") cleanup.push(it);
  }

  const next = d.next;
  if (next.kind === "finished") {
    await tx.uploadQueue.update({
      where: { id: q.id },
      data: { status: q.stoppedAt ? "CANCELLED" : "DONE", finishedAt: now },
    });
    logger.info({ datasetId, queueId: q.id }, "antrean unggah selesai");
    return { kind: "stay", cleanup };
  }
  if (next.kind === "reenqueue") return { kind: "enqueue", versionId: next.versionId, cleanup };
  if (next.kind === "wait") return { kind: "stay", cleanup };

  // Promosi: file berikutnya menjadi versi PERIOD terhadap versi aktif saat ini.
  const it = q.items.find((i) => i.id === next.id)!;
  const failItem = async (message: string) => {
    await tx.uploadQueueItem.updateMany({
      where: { id: it.id, state: "QUEUED" },
      data: { state: "FAILED", message, finishedAt: now },
    });
    // Objek file sumber dibuang (tidak pernah menjadi versi).
    cleanup.push({ ...it, uploadId: null });
    return { kind: "again" as const, cleanup };
  };
  const active = ds.activeVersionId
    ? await tx.datasetVersion.findUnique({
        where: { id: ds.activeVersionId },
        select: { periodGrain: true, sheets: { select: { periodSource: true } } },
      })
    : null;
  if (!ds.activeVersionId || !active?.periodGrain) {
    return failItem(
      "Dataset tidak lagi menyimpan data per periode saat giliran file ini, jadi file tidak diproses.",
    );
  }
  const grain = active.periodGrain;
  const needsLabel = active.sheets.some((s) => s.periodSource === "LABEL");
  const label = needsLabel ? isoOf(it.periodLabel) : null;
  if (needsLabel && (!label || periodStartOf(grain, label) !== label)) {
    return failItem(
      "Periode file ini tidak sesuai pengaturan periode dataset saat gilirannya (pengaturan berubah). Unggah ulang file ini dengan periode yang benar.",
    );
  }
  const size = Number(it.sizeBytes);
  const chk = await periodInitCheck(tx, datasetId, { name: it.originalName, size, label });
  if (!chk.ok) return failItem(chk.message);

  await tx.datasetVersion.create({
    data: {
      id: it.versionId,
      datasetId,
      uploadedById: owner.ownerId,
      status: "UPLOADED",
      originalName: it.originalName,
      sizeBytes: it.sizeBytes,
      fingerprint: fingerprintOf(it.originalName, size, Number(it.lastModified)),
      partSize: it.partSize,
      partCount: it.partCount,
      sourceKey: itemSourceKey(datasetId, it.versionId, it.originalName),
      etag: it.etag ?? "",
      mode: "PERIOD",
      periodGrain: grain,
      baseVersionId: ds.activeVersionId,
      periodLabel: label ? dateOf(label) : null,
    },
  });
  const moved = await tx.uploadQueueItem.updateMany({
    where: { id: it.id, state: "QUEUED" },
    data: { state: "STARTED", startedAt: now },
  });
  if (moved.count !== 1) throw new Error("file antrean berubah saat giliran");
  logger.info(
    { datasetId, queueId: q.id, versionId: it.versionId, seq: it.seq },
    "giliran file antrean",
  );
  return { kind: "enqueue", versionId: it.versionId, cleanup };
}

/**
 * Pemeliharaan (tiap menit, worker): file yang tidak selesai diunggah dalam 24 jam sejak aktivitas
 * unggah terakhir antrean ditandai gagal (antrean
 * lanjut), lalu giliran setiap antrean terbuka dijalankan — antrean tetap berjalan tanpa tab terbuka.
 */
export async function runUploadQueues(
  deps: QueueDeps = {},
  now = Date.now(),
): Promise<{ expired: number; queues: number }> {
  const storage = deps.storage ?? s3Multipart;
  const stale = await prisma.uploadQueueItem.findMany({
    where: {
      state: { in: ["WAITING", "UPLOADING"] },
      updatedAt: { lt: new Date(now - QUEUE_ITEM_STALE_MS) },
      // Antrean masih diunggah (aktivitas < 24 jam) → file berikutnya belum ditinggalkan.
      queue: { status: "OPEN", updatedAt: { lt: new Date(now - QUEUE_ITEM_STALE_MS) } },
    },
    select: {
      id: true,
      versionId: true,
      originalName: true,
      uploadId: true,
      state: true,
      queue: { select: { datasetId: true } },
    },
    take: 200,
  });
  let expired = 0;
  for (const it of stale) {
    const r = await prisma.uploadQueueItem.updateMany({
      where: {
        id: it.id,
        state: it.state,
        OR: [{ completingAt: null }, { completingAt: { lt: new Date(now - COMPLETE_CLAIM_MS) } }],
      },
      data: {
        state: "FAILED",
        message: "File tidak selesai diunggah dalam 24 jam. Unggah ulang file ini.",
        uploadId: null,
        finishedAt: new Date(now),
      },
    });
    if (r.count === 1) {
      expired++;
      await removeItemObject(storage, it.queue.datasetId, it);
    }
  }
  const open = await prisma.uploadQueue.findMany({
    where: { status: "OPEN" },
    select: { datasetId: true },
    take: 500,
  });
  for (const q of open) await advanceUploadQueue(q.datasetId, deps);
  if (expired) logger.info({ expired }, "file antrean kedaluwarsa ditandai gagal");
  return { expired, queues: open.length };
}
