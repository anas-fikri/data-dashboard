import "server-only";
import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { enqueueIngest } from "@/lib/queue/versions";
import { s3Multipart, type MultipartStorage } from "@/lib/storage/multipart";
import { isIdShape } from "@/features/datasets/validation";
import { PART_SIZE, expectedPartSize, partCountOf, verifyParts } from "./parts";
import { SNIFF_BYTES, kindOf, sniff } from "./sniff";

/*
 * Upload multipart langsung browser → storage (flow-kerja B2). Hanya pemilik dataset yang bisa
 * mengunggah; setiap kueri di-scope {uploadedById, dataset.ownerId} sehingga id milik orang lain
 * selalu NOT_FOUND (D2). Lapisan validasi ukuran: signed Content-Length → ListParts → HeadObject.
 */

export type UploadCode =
  | "NOT_FOUND"
  | "INVALID"
  | "FILE_TOO_LARGE"
  | "INVALID_FORMAT"
  | "DATASET_BUSY"
  | "LIMIT_REACHED"
  | "QUOTA_EXCEEDED"
  | "BUSY"
  | "INCOMPLETE"
  | "UPLOAD_CORRUPT"
  | "UPLOAD_FAILED"
  | "STORAGE_ERROR";

export type UploadResult<T> =
  ({ ok: true } & T) | { ok: false; code: UploadCode; message: string; missing?: number[] };

export const MAX_ACTIVE_UPLOADS_PER_USER = 2;
export const STALE_UPLOAD_MS = 24 * 60 * 60 * 1000;
export const SIGN_BATCH_MAX = 16;
const COMPLETE_CLAIM_MS = 5 * 60 * 1000;
const NAME_MAX = 255;

const NON_TERMINAL = ["UPLOADING", "UPLOADED", "INGESTING", "AWAITING_MAPPING"] as const;

export interface InitInput {
  datasetId: unknown;
  name: unknown;
  size: unknown;
  lastModified: unknown;
}

export interface InitOk {
  versionId: string;
  partSize: number;
  partCount: number;
  /** Nomor part yang sudah ada di storage (resume). */
  uploadedParts: number[];
  resumed: boolean;
}

const fail = (
  code: UploadCode,
  message: string,
): { ok: false; code: UploadCode; message: string } => ({
  ok: false,
  code,
  message,
});

const notFound = () => fail("NOT_FOUND", "Dataset atau unggahan tidak ditemukan.");

function formatGiB(bytes: number): string {
  const gib = bytes / 1024 ** 3;
  return `${gib.toLocaleString("id-ID", { maximumFractionDigits: gib < 10 ? 1 : 0 })} GB`;
}

/** Nama file tampilan: tanpa path, tanpa karakter kontrol/format, ≤ 255 karakter. */
export function cleanFileName(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const base = raw.split(/[\\/]/).pop() ?? "";
  const cleaned = base.replace(/[\p{Cc}\p{Cf}]/gu, "").trim();
  if (!cleaned || cleaned.length > NAME_MAX) return null;
  return cleaned;
}

export function fingerprintOf(name: string, size: number, lastModified: number): string {
  return createHash("sha256").update(`${name}\n${size}\n${lastModified}`).digest("hex");
}

/** Validasi input initUpload tanpa menyentuh DB/storage (dipisah agar urutan penolakan teruji). */
export function validateInit(
  input: InitInput,
  maxBytes: number,
):
  | {
      ok: true;
      datasetId: string;
      name: string;
      size: number;
      lastModified: number;
      ext: "xlsx" | "csv";
    }
  | { ok: false; code: UploadCode; message: string } {
  if (typeof input.datasetId !== "string" || !isIdShape(input.datasetId)) return notFound();
  const name = cleanFileName(input.name);
  if (!name) return fail("INVALID", "Nama file tidak valid.");
  const ext = kindOf(name);
  if (!ext) {
    return fail("INVALID_FORMAT", "Hanya file .xlsx atau .csv yang bisa diunggah.");
  }
  const size = input.size;
  if (typeof size !== "number" || !Number.isSafeInteger(size) || size < 0) {
    return fail("INVALID", "Ukuran file tidak valid.");
  }
  if (size === 0) return fail("INVALID_FORMAT", "File kosong. Pilih file yang berisi data.");
  if (size > maxBytes) {
    return fail(
      "FILE_TOO_LARGE",
      `Ukuran file melebihi batas ${formatGiB(maxBytes)}. Pecah data menjadi beberapa file atau hapus kolom yang tidak dipakai.`,
    );
  }
  const lm = input.lastModified;
  if (typeof lm !== "number" || !Number.isSafeInteger(lm) || lm < 0) {
    return fail("INVALID", "Data file tidak lengkap. Pilih ulang file.");
  }
  return { ok: true, datasetId: input.datasetId, name, size, lastModified: lm, ext };
}

/** Tandai unggahan UPLOADING yang melewati 24 jam sebagai FAILED dan abort multipart-nya. */
export async function expireStaleUploads(
  where: Prisma.DatasetVersionWhereInput = {},
  storage: MultipartStorage = s3Multipart,
  now = Date.now(),
): Promise<number> {
  const stale = await prisma.datasetVersion.findMany({
    where: { ...where, status: "UPLOADING", createdAt: { lt: new Date(now - STALE_UPLOAD_MS) } },
    select: { id: true, sourceKey: true, uploadId: true },
    take: 100,
  });
  let n = 0;
  for (const v of stale) {
    if (v.sourceKey && v.uploadId) {
      await storage
        .abort(v.sourceKey, v.uploadId)
        .catch((e: unknown) =>
          logger.warn({ versionId: v.id, err: String(e) }, "abort multipart kedaluwarsa gagal"),
        );
    }
    const r = await prisma.datasetVersion.updateMany({
      where: { id: v.id, status: "UPLOADING" },
      data: {
        status: "FAILED",
        uploadId: null,
        completingAt: null,
        errorMessage: "Unggahan tidak selesai dalam 24 jam. Unggah ulang file.",
      },
    });
    n += r.count;
  }
  if (n) logger.info({ count: n }, "unggahan kedaluwarsa ditandai gagal");
  return n;
}

async function uploadedPartNumbers(
  storage: MultipartStorage,
  v: {
    sourceKey: string;
    uploadId: string;
    sizeBytes: bigint;
    partSize: number;
    partCount: number;
  },
): Promise<number[] | null> {
  const parts = await storage.listParts(v.sourceKey, v.uploadId);
  if (!parts) return null;
  const size = Number(v.sizeBytes);
  return parts
    .filter(
      (p) =>
        p.partNumber >= 1 &&
        p.partNumber <= v.partCount &&
        p.size === expectedPartSize(p.partNumber, size, v.partSize, v.partCount),
    )
    .map((p) => p.partNumber)
    .sort((a, b) => a - b);
}

export async function initUpload(
  userId: string,
  input: InitInput,
  storage: MultipartStorage = s3Multipart,
): Promise<UploadResult<InitOk>> {
  const e = env();
  const v = validateInit(input, e.MAX_UPLOAD_BYTES);
  if (!v.ok) return v;

  const dataset = await prisma.dataset.findFirst({
    where: { id: v.datasetId, ownerId: userId },
    select: { id: true },
  });
  if (!dataset) return notFound();

  // Unggahan basi di dataset ini dan milik user di dataset lain tidak boleh menahan sibuk/batas.
  await expireStaleUploads({ OR: [{ datasetId: dataset.id }, { uploadedById: userId }] }, storage);
  const fingerprint = fingerprintOf(v.name, v.size, v.lastModified);

  type Decision =
    | {
        kind: "resume";
        id: string;
        sourceKey: string;
        uploadId: string;
        sizeBytes: bigint;
        partSize: number;
        partCount: number;
      }
    | { kind: "new"; id: string; sourceKey: string; partCount: number }
    | { kind: "reject"; code: UploadCode; message: string };

  let decision: Decision;
  try {
    // Lock per pemilik: cek sibuk/batas/kuota + buat versi atomik terhadap permintaan paralel.
    decision = await prisma.$transaction(async (tx): Promise<Decision> => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`uploads:${userId}`}))`;

      const resumable = await tx.datasetVersion.findFirst({
        where: {
          datasetId: dataset.id,
          uploadedById: userId,
          fingerprint,
          status: "UPLOADING",
          uploadId: { not: null },
        },
        select: {
          id: true,
          sourceKey: true,
          uploadId: true,
          sizeBytes: true,
          partSize: true,
          partCount: true,
        },
      });
      if (
        resumable?.sourceKey &&
        resumable.uploadId &&
        resumable.sizeBytes !== null &&
        resumable.partSize &&
        resumable.partCount
      ) {
        return {
          kind: "resume",
          id: resumable.id,
          sourceKey: resumable.sourceKey,
          uploadId: resumable.uploadId,
          sizeBytes: resumable.sizeBytes,
          partSize: resumable.partSize,
          partCount: resumable.partCount,
        };
      }

      const busy = await tx.datasetVersion.findFirst({
        where: { datasetId: dataset.id, status: { in: [...NON_TERMINAL] } },
        select: { status: true, uploadedById: true },
      });
      if (busy) {
        const own = busy.status === "UPLOADING" && busy.uploadedById === userId;
        return {
          kind: "reject",
          code: "DATASET_BUSY",
          message: own
            ? "Masih ada unggahan yang belum selesai di dataset ini. Pilih file yang sama untuk melanjutkan, atau batalkan unggahan itu dulu."
            : "Dataset sedang memproses file lain. Tunggu sampai selesai, lalu unggah lagi.",
        };
      }

      const active = await tx.datasetVersion.count({
        where: { uploadedById: userId, status: "UPLOADING" },
      });
      if (active >= MAX_ACTIVE_UPLOADS_PER_USER) {
        return {
          kind: "reject",
          code: "LIMIT_REACHED",
          message: `Maksimal ${MAX_ACTIVE_UPLOADS_PER_USER} unggahan berjalan bersamaan. Selesaikan atau batalkan salah satunya dulu.`,
        };
      }

      // Kuota: semua versi non-FAILED di dataset milik user, termasuk ukuran terdeklarasi UPLOADING.
      const used = await tx.datasetVersion.aggregate({
        where: { dataset: { ownerId: userId }, status: { not: "FAILED" } },
        _sum: { sizeBytes: true },
      });
      const usedBytes = Number(used._sum.sizeBytes ?? 0n);
      if (usedBytes + v.size > e.USER_STORAGE_QUOTA_BYTES) {
        return {
          kind: "reject",
          code: "QUOTA_EXCEEDED",
          message: `Kuota penyimpanan tidak cukup: terpakai ${formatGiB(usedBytes)} dari ${formatGiB(e.USER_STORAGE_QUOTA_BYTES)}, file ini ${formatGiB(v.size)}. Hapus dataset atau versi yang tidak dipakai.`,
        };
      }

      const partCount = partCountOf(v.size);
      const created = await tx.datasetVersion.create({
        data: {
          datasetId: dataset.id,
          uploadedById: userId,
          status: "UPLOADING",
          originalName: v.name,
          sizeBytes: BigInt(v.size),
          fingerprint,
          partSize: PART_SIZE,
          partCount,
        },
        select: { id: true },
      });
      const sourceKey = `raw/${dataset.id}/${created.id}/source.${v.ext}`;
      await tx.datasetVersion.update({ where: { id: created.id }, data: { sourceKey } });
      return { kind: "new", id: created.id, sourceKey, partCount };
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2028") {
      return fail("BUSY", "Sedang memproses permintaan lain. Coba lagi.");
    }
    throw err;
  }

  if (decision.kind === "reject") return fail(decision.code, decision.message);

  if (decision.kind === "resume") {
    const uploaded = await uploadedPartNumbers(storage, {
      sourceKey: decision.sourceKey,
      uploadId: decision.uploadId,
      sizeBytes: decision.sizeBytes,
      partSize: decision.partSize,
      partCount: decision.partCount,
    });
    if (uploaded) {
      logger.info({ versionId: decision.id, parts: uploaded.length }, "unggahan dilanjutkan");
      return {
        ok: true,
        versionId: decision.id,
        partSize: decision.partSize,
        partCount: decision.partCount,
        uploadedParts: uploaded,
        resumed: true,
      };
    }
    // Multipart sudah hilang (lifecycle/abort): versi ini tidak bisa dilanjutkan.
    await prisma.datasetVersion.updateMany({
      where: { id: decision.id, status: "UPLOADING" },
      data: {
        status: "FAILED",
        uploadId: null,
        errorMessage: "Unggahan kedaluwarsa. Unggah ulang file.",
      },
    });
    return fail(
      "UPLOAD_FAILED",
      "Unggahan sebelumnya sudah kedaluwarsa. Pilih file lagi untuk mulai dari awal.",
    );
  }

  try {
    const uploadId = await storage.create(decision.sourceKey);
    await prisma.datasetVersion.update({ where: { id: decision.id }, data: { uploadId } });
  } catch (err) {
    logger.error({ versionId: decision.id, err: String(err) }, "createMultipartUpload gagal");
    await prisma.datasetVersion.deleteMany({ where: { id: decision.id, status: "UPLOADING" } });
    return fail(
      "STORAGE_ERROR",
      "Penyimpanan file sedang tidak bisa dihubungi. Coba lagi beberapa saat lagi.",
    );
  }
  logger.info({ versionId: decision.id, datasetId: dataset.id, size: v.size }, "unggahan dimulai");
  return {
    ok: true,
    versionId: decision.id,
    partSize: PART_SIZE,
    partCount: decision.partCount,
    uploadedParts: [],
    resumed: false,
  };
}

/** Versi UPLOADING milik user ini (scope pemilik dataset juga), dengan data multipart lengkap. */
async function ownUploading(userId: string, versionId: unknown) {
  if (typeof versionId !== "string" || !isIdShape(versionId)) return null;
  const v = await prisma.datasetVersion.findFirst({
    where: { id: versionId, uploadedById: userId, dataset: { ownerId: userId } },
    select: {
      id: true,
      datasetId: true,
      status: true,
      errorMessage: true,
      sourceKey: true,
      uploadId: true,
      sizeBytes: true,
      partSize: true,
      partCount: true,
    },
  });
  return v;
}

export async function signParts(
  userId: string,
  versionId: unknown,
  partNumbers: unknown,
  storage: MultipartStorage = s3Multipart,
): Promise<UploadResult<{ urls: { partNumber: number; url: string; size: number }[] }>> {
  const v = await ownUploading(userId, versionId);
  if (
    !v ||
    v.status !== "UPLOADING" ||
    !v.sourceKey ||
    !v.uploadId ||
    !v.partSize ||
    !v.partCount ||
    v.sizeBytes === null
  ) {
    return notFound();
  }
  if (
    !Array.isArray(partNumbers) ||
    partNumbers.length === 0 ||
    partNumbers.length > SIGN_BATCH_MAX ||
    new Set(partNumbers).size !== partNumbers.length ||
    !partNumbers.every((n) => Number.isInteger(n) && n >= 1 && n <= (v.partCount ?? 0))
  ) {
    return fail("INVALID", "Nomor bagian file tidak valid.");
  }
  const size = Number(v.sizeBytes);
  const urls = await Promise.all(
    (partNumbers as number[]).map(async (n) => {
      const len = expectedPartSize(n, size, v.partSize!, v.partCount!);
      return {
        partNumber: n,
        size: len,
        url: await storage.signPart(v.sourceKey!, v.uploadId!, n, len),
      };
    }),
  );
  return { ok: true, urls };
}

async function markFailed(id: string, message: string) {
  await prisma.datasetVersion.updateMany({
    where: { id, status: "UPLOADING" },
    data: {
      status: "FAILED",
      uploadId: null,
      completingAt: null,
      errorMessage: message,
      ingestFinishedAt: new Date(),
    },
  });
}

export interface CompleteDeps {
  storage?: MultipartStorage;
  enqueue?: (versionId: string) => Promise<void>;
}

export async function completeUpload(
  userId: string,
  versionId: unknown,
  deps: CompleteDeps = {},
): Promise<UploadResult<{ status: "UPLOADED" }>> {
  const storage = deps.storage ?? s3Multipart;
  const enqueue = deps.enqueue ?? enqueueIngest;
  const v = await ownUploading(userId, versionId);
  if (!v) return notFound();
  if (v.status === "FAILED") {
    return fail("UPLOAD_FAILED", v.errorMessage ?? "Unggahan gagal. Unggah ulang file.");
  }
  if (v.status !== "UPLOADING") return { ok: true, status: "UPLOADED" }; // sudah selesai (idempoten)
  if (!v.sourceKey || !v.uploadId || !v.partSize || !v.partCount || v.sizeBytes === null)
    return notFound();
  const { id, sourceKey: key, uploadId, partSize, partCount } = v;
  const size = Number(v.sizeBytes);
  const ext = key.endsWith(".csv") ? "csv" : "xlsx";

  // Klaim: hanya satu complete yang berjalan per versi.
  const claim = await prisma.datasetVersion.updateMany({
    where: {
      id,
      status: "UPLOADING",
      OR: [
        { completingAt: null },
        { completingAt: { lt: new Date(Date.now() - COMPLETE_CLAIM_MS) } },
      ],
    },
    data: { completingAt: new Date() },
  });
  if (claim.count === 0) return fail("BUSY", "File sedang diperiksa. Tunggu sebentar.");
  const release = () =>
    prisma.datasetVersion.updateMany({
      where: { id, status: "UPLOADING" },
      data: { completingAt: null },
    });

  const parts = await storage.listParts(key, uploadId);
  if (!parts) {
    await markFailed(id, "Unggahan kedaluwarsa. Unggah ulang file.");
    return fail(
      "UPLOAD_FAILED",
      "Unggahan sudah kedaluwarsa. Pilih file lagi untuk mulai dari awal.",
    );
  }
  const verdict = verifyParts(parts, size, partSize, partCount);
  if (verdict.kind === "missing") {
    await release();
    return { ...fail("INCOMPLETE", "Sebagian file belum terunggah."), missing: verdict.missing };
  }
  if (verdict.kind === "corrupt") {
    logger.warn(
      { versionId: id, reason: verdict.reason },
      "unggahan ditolak: part tidak sesuai rencana",
    );
    await storage.abort(key, uploadId).catch(() => {});
    await markFailed(id, "Unggahan rusak: bagian file tidak sesuai. Unggah ulang file.");
    return fail("UPLOAD_CORRUPT", "Unggahan rusak: bagian file tidak sesuai. Unggah ulang file.");
  }

  let etag: string;
  try {
    etag = await storage.complete(key, uploadId, parts);
  } catch (err) {
    logger.error({ versionId: id, err: String(err) }, "completeMultipartUpload gagal");
    await release();
    return fail("STORAGE_ERROR", "Penyimpanan file sedang tidak bisa dihubungi. Coba lagi.");
  }

  const rejectObject = async (code: UploadCode, message: string) => {
    await storage
      .remove(key)
      .catch((e: unknown) =>
        logger.error({ versionId: id, err: String(e) }, "hapus objek yang ditolak gagal"),
      );
    await markFailed(id, message);
    return fail(code, message);
  };

  const head = await storage.head(key);
  if (!head || head.size !== size) {
    return rejectObject("UPLOAD_CORRUPT", "Ukuran file di server tidak sesuai. Unggah ulang file.");
  }
  if (head.size > env().MAX_UPLOAD_BYTES) {
    return rejectObject(
      "FILE_TOO_LARGE",
      `Ukuran file melebihi batas ${formatGiB(env().MAX_UPLOAD_BYTES)}.`,
    );
  }
  const sniffed = sniff(ext, await storage.readHead(key, SNIFF_BYTES));
  if (!sniffed.ok) return rejectObject("INVALID_FORMAT", sniffed.message);

  // Dataset bisa terhapus selama unggahan: versi ikut hilang → objek dibuang (review T-003).
  const done = await prisma.datasetVersion.updateMany({
    where: { id, status: "UPLOADING" },
    data: { status: "UPLOADED", etag, uploadId: null, completingAt: null },
  });
  if (done.count === 0) {
    await storage.remove(key).catch(() => {});
    return notFound();
  }
  try {
    await enqueue(id);
  } catch (err) {
    // Versi tetap UPLOADED; worker (T-006) menyapu versi UPLOADED tanpa job saat start.
    logger.error({ versionId: id, err: String(err) }, "enqueue ingest gagal");
  }
  logger.info({ versionId: id, size, etag }, "unggahan selesai");
  return { ok: true, status: "UPLOADED" };
}

/** Batalkan unggahan milik sendiri: abort multipart dan hapus versinya (belum pernah berisi data). */
export async function cancelUpload(
  userId: string,
  versionId: unknown,
  storage: MultipartStorage = s3Multipart,
): Promise<UploadResult<{ cancelled: true }>> {
  const v = await ownUploading(userId, versionId);
  if (!v || v.status !== "UPLOADING") return notFound();
  // Hapus versi dulu (tidak boleh saat complete sedang berjalan), baru abort multipart.
  const del = await prisma.datasetVersion.deleteMany({
    where: {
      id: v.id,
      status: "UPLOADING",
      OR: [
        { completingAt: null },
        { completingAt: { lt: new Date(Date.now() - COMPLETE_CLAIM_MS) } },
      ],
    },
  });
  if (del.count === 0) return fail("BUSY", "File sedang diperiksa dan tidak bisa dibatalkan lagi.");
  if (v.sourceKey && v.uploadId) {
    await storage
      .abort(v.sourceKey, v.uploadId)
      .catch((e: unknown) =>
        logger.warn(
          { versionId: v.id, err: String(e) },
          "abort multipart gagal (lifecycle membersihkan)",
        ),
      );
  }
  logger.info({ versionId: v.id }, "unggahan dibatalkan");
  return { ok: true, cancelled: true };
}

export interface PendingUpload {
  versionId: string;
  originalName: string;
  sizeBytes: number;
  /** Jumlah byte part yang sudah ada di storage (sama dengan hitungan progres klien). */
  uploadedBytes: number;
}

/** Unggahan milik user yang belum selesai di dataset ini (untuk ajakan melanjutkan). */
export async function getPendingUpload(
  userId: string,
  datasetId: string,
  storage: MultipartStorage = s3Multipart,
): Promise<PendingUpload | null> {
  const v = await prisma.datasetVersion.findFirst({
    where: {
      datasetId,
      uploadedById: userId,
      status: "UPLOADING",
      uploadId: { not: null },
      createdAt: { gte: new Date(Date.now() - STALE_UPLOAD_MS) },
      dataset: { ownerId: userId },
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      originalName: true,
      sizeBytes: true,
      sourceKey: true,
      uploadId: true,
      partSize: true,
      partCount: true,
    },
  });
  if (!v?.sourceKey || !v.uploadId || v.sizeBytes === null || !v.partSize || !v.partCount)
    return null;
  const size = Number(v.sizeBytes);
  let uploadedBytes = 0;
  try {
    const numbers = await uploadedPartNumbers(storage, {
      sourceKey: v.sourceKey,
      uploadId: v.uploadId,
      sizeBytes: v.sizeBytes,
      partSize: v.partSize,
      partCount: v.partCount,
    });
    for (const n of numbers ?? [])
      uploadedBytes += expectedPartSize(n, size, v.partSize, v.partCount);
  } catch (err) {
    logger.warn({ versionId: v.id, err: String(err) }, "ListParts untuk ringkasan gagal");
  }
  return {
    versionId: v.id,
    originalName: v.originalName ?? "file",
    sizeBytes: size,
    uploadedBytes,
  };
}
