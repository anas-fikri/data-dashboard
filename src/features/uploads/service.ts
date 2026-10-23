import "server-only";
import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { enqueueIngest } from "@/lib/queue/versions";
import { s3Multipart, type MultipartStorage } from "@/lib/storage/multipart";
import { NON_TERMINAL_STATUSES } from "@/features/datasets/label";
import { isIdShape } from "@/features/datasets/validation";
import { isIsoDate, periodStartOf } from "@/features/ingest/period";
import { periodInitCheck } from "@/features/versions/period-capacity";
import type { UploadEstimate } from "@/features/ingest/period-capacity";
import { formatGiB, quotaDecision, quotaGraceUntil, userUsage } from "./quota";
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
  | "STORAGE_ERROR"
  /** Unggahan periode (T-052): versi aktif berubah sejak halaman dibuka (baseVersionId basi). */
  | "STALE"
  /** Unggahan periode (T-055): pasti melewati batas jumlah periode (mode label), sebelum byte pertama. */
  | "PERIOD_LIMIT";

export type UploadResult<T> =
  ({ ok: true } & T) | { ok: false; code: UploadCode; message: string; missing?: number[] };

export const MAX_ACTIVE_UPLOADS_PER_USER = 2;
export const STALE_UPLOAD_MS = 24 * 60 * 60 * 1000;
export const SIGN_BATCH_MAX = 16;
export const COMPLETE_CLAIM_MS = 5 * 60 * 1000;
const NAME_MAX = 255;

const NON_TERMINAL = NON_TERMINAL_STATUSES;

export interface InitInput {
  datasetId: unknown;
  name: unknown;
  size: unknown;
  lastModified: unknown;
  /** "REPLACE" (bawaan, ganti semua data) atau "PERIOD" (tambah/perbarui periode, T-052). */
  mode?: unknown;
  /** Awal periode (YYYY-MM-DD) untuk sheet bersumber label (mode PERIOD). */
  label?: unknown;
  /** Versi aktif yang dilihat pemilik (wajib untuk mode PERIOD). */
  baseVersionId?: unknown;
  /** Sheet xlsx yang diimpor (T-85tb, mode REPLACE); tidak ada/null = semua sheet. */
  sheets?: unknown;
}

/** Batas pilihan sheet (= batas sheet parser per file). */
export const SELECTED_SHEETS_MAX = 50;
const SHEET_NAME_MAX = 255;

export type UploadMode = "REPLACE" | "PERIOD";

export interface InitOk {
  versionId: string;
  partSize: number;
  partCount: number;
  /** Nomor part yang sudah ada di storage (resume). */
  uploadedParts: number[];
  resumed: boolean;
  /** Mode efektif versi ini (gema init; resume hanya untuk mode + label yang sama, T-052). */
  mode: UploadMode;
  /** Label periode efektif (null = tanpa label / mode REPLACE). */
  label: string | null;
  /**
   * Perkiraan dari ukuran file terhadap batas periode (T-055, hanya peringatan; null = tidak ada yang
   * perlu diperingatkan, unggahan dilanjutkan, atau mode REPLACE).
   */
  estimate: UploadEstimate | null;
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
      mode: UploadMode;
      label: string | null;
      baseVersionId: string | null;
      /** Sheet pilihan (urut masukan, unik); [] = semua sheet. */
      sheets: string[];
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
  const mode = input.mode ?? "REPLACE";
  if (mode !== "REPLACE" && mode !== "PERIOD") {
    return fail("INVALID", "Mode unggahan tidak dikenal. Muat ulang halaman.");
  }
  let label: string | null = null;
  let baseVersionId: string | null = null;
  if (mode === "PERIOD") {
    if (input.label !== undefined && input.label !== null) {
      if (typeof input.label !== "string" || !isIsoDate(input.label)) {
        return fail("INVALID", "Periode file tidak valid. Pilih periodenya lagi.");
      }
      label = input.label;
    }
    if (typeof input.baseVersionId !== "string" || !isIdShape(input.baseVersionId)) {
      return fail("INVALID", "Data unggahan tidak lengkap. Muat ulang halaman lalu unggah lagi.");
    }
    baseVersionId = input.baseVersionId;
  }
  let sheets: string[] = [];
  if (input.sheets !== undefined && input.sheets !== null) {
    const raw = input.sheets;
    if (ext !== "xlsx" || mode !== "REPLACE") {
      return fail("INVALID", "Pilihan sheet hanya untuk file .xlsx yang mengganti semua data.");
    }
    if (
      !Array.isArray(raw) ||
      raw.length < 1 ||
      raw.length > SELECTED_SHEETS_MAX ||
      !raw.every((n) => typeof n === "string" && n.length >= 1 && n.length <= SHEET_NAME_MAX) ||
      new Set(raw).size !== raw.length
    ) {
      return fail("INVALID", "Pilihan sheet tidak valid. Pilih sheetnya lagi.");
    }
    sheets = raw as string[];
  }
  return {
    ok: true,
    datasetId: input.datasetId,
    name,
    size,
    lastModified: lm,
    ext,
    mode,
    label,
    baseVersionId,
    sheets,
  };
}

/** Pilihan sheet sama (urutan tidak penting). */
function sameSheets(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  const set = new Set(a);
  return b.every((n) => set.has(n));
}

/** Penolakan init setelah unggahan lama dihapus di transaksi yang sama → transaksi dibatalkan. */
class RejectRollback extends Error {
  constructor(readonly decision: { code: UploadCode; message: string }) {
    super(decision.message);
  }
}

/** Tanggal ISO naive → nilai kolom @db.Date (UTC tengah malam, tanpa geser). */
const dateOf = (iso: string) => new Date(`${iso}T00:00:00Z`);

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
    // Complete bisa sudah sukses tanpa versi sempat berubah: buang objek agar tidak yatim.
    if (v.sourceKey) await storage.remove(v.sourceKey).catch(() => {});
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

export async function uploadedPartNumbers(
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

  /** Unggahan lama file yang sama dengan mode/label lain: dibuang, multipart-nya di-abort setelah commit. */
  let replaced: { sourceKey: string | null; uploadId: string | null } | null = null;
  /** Label efektif (mode PERIOD dengan sheet bersumber label); null selain itu. */
  let label: string | null = null;
  /** Perkiraan batas periode dari ukuran file (unggahan periode baru, T-055). */
  let estimate: UploadEstimate | null = null;
  const decide = async (tx: Prisma.TransactionClient): Promise<Decision> => {
    {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`uploads:${userId}`}))`;

      // Mode PERIOD (T-052): hanya untuk dataset yang versi aktifnya per periode, terhadap versi aktif
      // yang dilihat pemilik; label wajib bila ada sheet bersumber label (dan harus awal periode).
      let grain: "MONTH" | "QUARTER" | "YEAR" | null = null;
      if (v.mode === "PERIOD") {
        const ds = await tx.dataset.findUnique({
          where: { id: dataset.id },
          select: {
            activeVersionId: true,
            activeVersion: {
              select: { periodGrain: true, sheets: { select: { periodSource: true } } },
            },
          },
        });
        const a = ds?.activeVersion;
        if (!a?.periodGrain) {
          return {
            kind: "reject",
            code: "INVALID",
            message:
              "Dataset ini belum menyimpan data per periode. Atur periode dulu, atau ganti semua data.",
          };
        }
        if (ds?.activeVersionId !== v.baseVersionId) {
          return {
            kind: "reject",
            code: "STALE",
            message:
              "Data aktif berubah sejak halaman dibuka. Muat ulang halaman lalu unggah lagi.",
          };
        }
        grain = a.periodGrain;
        if (a.sheets.some((sh) => sh.periodSource === "LABEL")) {
          if (!v.label) {
            return { kind: "reject", code: "INVALID", message: "Pilih periode untuk file ini." };
          }
          if (periodStartOf(grain, v.label) !== v.label || Number(v.label.slice(0, 4)) < 1000) {
            return {
              kind: "reject",
              code: "INVALID",
              message: "Periode file tidak valid. Pilih periodenya lagi.",
            };
          }
          label = v.label;
        }
      }

      const own = await tx.datasetVersion.findFirst({
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
          mode: true,
          periodLabel: true,
          selectedSheets: true,
        },
      });
      // Resume hanya untuk pilihan yang sama (mode + label + sheet, R20): pilihan lain tidak pernah memakai
      // versi lama diam-diam — versi lama (belum berisi data) dibuang dan unggahan dimulai baru.
      const sameChoice =
        own?.mode === v.mode &&
        (own.periodLabel?.toISOString().slice(0, 10) ?? null) === label &&
        sameSheets(own.selectedSheets ?? [], v.sheets);
      const resumable = own && sameChoice ? own : null;
      if (own && !sameChoice) {
        // Sama dengan cancelUpload: tidak boleh saat complete sedang berjalan (klaim completingAt).
        const del = await tx.datasetVersion.deleteMany({
          where: {
            id: own.id,
            status: "UPLOADING",
            OR: [
              { completingAt: null },
              { completingAt: { lt: new Date(Date.now() - COMPLETE_CLAIM_MS) } },
            ],
          },
        });
        if (del.count !== 1) {
          return {
            kind: "reject",
            code: "BUSY",
            message: "File yang sama sedang diperiksa. Tunggu sebentar, lalu pilih lagi.",
          };
        }
        replaced = { sourceKey: own.sourceKey, uploadId: own.uploadId };
      }
      if (
        resumable?.sourceKey &&
        resumable.uploadId &&
        resumable.sizeBytes !== null &&
        resumable.partSize &&
        resumable.partCount
      ) {
        // Versi aktif yang dilihat pemilik diperbarui (rencana dihitung terhadap data terbaru).
        if (v.mode === "PERIOD") {
          await tx.datasetVersion.update({
            where: { id: resumable.id },
            data: { baseVersionId: v.baseVersionId },
          });
        }
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

      // Antrean banyak file (T-059) memegang giliran dataset sampai selesai/dihentikan.
      if (await tx.uploadQueue.count({ where: { datasetId: dataset.id, status: "OPEN" } })) {
        return {
          kind: "reject",
          code: "DATASET_BUSY",
          message:
            "Antrean unggahan sedang berjalan di dataset ini. Tunggu sampai selesai atau hentikan antrean, lalu unggah lagi.",
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
            : busy.status === "AWAITING_CONFIRM"
              ? "Unggahan sebelumnya menunggu konfirmasi. Terapkan atau batalkan dulu, lalu unggah lagi."
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

      // Kuota dari byte tersimpan (T-039) + proyeksi file ini (sumber + perkiraan parquet), sebelum byte
      // pertama terunggah; masa transisi: yang masih muat menurut hitungan lama hanya diperingatkan.
      const usage = await userUsage(tx, userId);
      const graceUntil = await quotaGraceUntil(tx);
      const inGrace = !!graceUntil && new Date() < graceUntil;
      const q = quotaDecision(usage, v.size, e.USER_STORAGE_QUOTA_BYTES, inGrace);
      if (!q.ok) {
        return {
          kind: "reject",
          code: "QUOTA_EXCEEDED",
          message: `Kuota penyimpanan tidak cukup: terpakai ${formatGiB(q.usedBytes)} dari ${formatGiB(e.USER_STORAGE_QUOTA_BYTES)}, file ini ${formatGiB(v.size)} (±${formatGiB(q.projected)} setelah diproses). Hapus dataset atau versi yang tidak dipakai.`,
        };
      }
      if (q.warn) {
        logger.warn(
          { userId, used: usage.bytes, size: v.size },
          "kuota terlampaui (masa transisi)",
        );
      }

      // Batas periode (T-055) sebelum byte pertama: penolakan pasti (label, jumlah periode) atau
      // perkiraan dari ukuran file (hanya peringatan; baris tepat diperiksa worker + commit).
      if (v.mode === "PERIOD") {
        const chk = await periodInitCheck(tx, dataset.id, { name: v.name, size: v.size, label });
        if (!chk.ok) return { kind: "reject", code: "PERIOD_LIMIT", message: chk.message };
        estimate = chk.estimate;
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
          mode: v.mode,
          selectedSheets: v.sheets,
          ...(v.mode === "PERIOD"
            ? {
                periodGrain: grain,
                baseVersionId: v.baseVersionId,
                periodLabel: label ? dateOf(label) : null,
              }
            : {}),
        },
        select: { id: true },
      });
      const sourceKey = `raw/${dataset.id}/${created.id}/source.${v.ext}`;
      await tx.datasetVersion.update({ where: { id: created.id }, data: { sourceKey } });
      return { kind: "new", id: created.id, sourceKey, partCount };
    }
  };
  let decision: Decision;
  try {
    // Lock per pemilik: cek sibuk/batas/kuota + buat versi atomik terhadap permintaan paralel.
    decision = await prisma.$transaction(async (tx): Promise<Decision> => {
      const r = await decide(tx);
      // Unggahan lama (pilihan lain) hanya dibuang bila unggahan baru benar-benar dibuat: penolakan
      // sesudahnya (sibuk/batas/kuota) membatalkan transaksi sehingga unggahan lama tetap bisa dilanjutkan.
      if (r.kind === "reject" && replaced) throw new RejectRollback(r);
      return r;
    });
  } catch (err) {
    if (err instanceof RejectRollback) {
      replaced = null;
      return fail(err.decision.code, err.decision.message);
    }
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2028") {
      return fail("BUSY", "Sedang memproses permintaan lain. Coba lagi.");
    }
    throw err;
  }

  const old = replaced as { sourceKey: string | null; uploadId: string | null } | null;
  if (old?.sourceKey) {
    // Versi lama sudah dihapus: multipart-nya di-abort (gagal → lifecycle storage membersihkan).
    if (old.uploadId) {
      await storage
        .abort(old.sourceKey, old.uploadId)
        .catch((err: unknown) =>
          logger.warn({ err: String(err) }, "abort multipart unggahan yang diganti gagal"),
        );
    }
    await storage.remove(old.sourceKey).catch(() => {});
  }
  const echo = { mode: v.mode, label };

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
        ...echo,
        estimate: null,
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
    ...echo,
    estimate: estimate as UploadEstimate | null,
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
  return signTarget(
    {
      key: v.sourceKey,
      uploadId: v.uploadId,
      size: Number(v.sizeBytes),
      partSize: v.partSize,
      partCount: v.partCount,
    },
    partNumbers,
    storage,
  );
}

/** Multipart yang sedang berjalan (versi unggahan atau file antrean T-059). */
export interface MultipartPlan {
  key: string;
  uploadId: string;
  size: number;
  partSize: number;
  partCount: number;
}

/** Presigned URL part (nomor divalidasi terhadap rencana; ukuran ditandatangani). */
export async function signTarget(
  t: MultipartPlan,
  partNumbers: unknown,
  storage: MultipartStorage,
): Promise<UploadResult<{ urls: { partNumber: number; url: string; size: number }[] }>> {
  if (
    !Array.isArray(partNumbers) ||
    partNumbers.length === 0 ||
    partNumbers.length > SIGN_BATCH_MAX ||
    new Set(partNumbers).size !== partNumbers.length ||
    !partNumbers.every((n) => Number.isInteger(n) && n >= 1 && n <= t.partCount)
  ) {
    return fail("INVALID", "Nomor bagian file tidak valid.");
  }
  const urls = await Promise.all(
    (partNumbers as number[]).map(async (n) => {
      const len = expectedPartSize(n, t.size, t.partSize, t.partCount);
      return {
        partNumber: n,
        size: len,
        url: await storage.signPart(t.key, t.uploadId, n, len),
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
  enqueue?: (versionId: string, datasetId: string) => Promise<void>;
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
  if (v.status !== "UPLOADING") {
    // Sudah selesai (idempoten). UPLOADED = belum diambil worker: antre ulang bila enqueue dulu
    // gagal (Redis mati). jobId = versionId sehingga tidak menggandakan job.
    if (v.status === "UPLOADED") {
      await enqueue(v.id, v.datasetId).catch((err: unknown) =>
        logger.error({ versionId: v.id, err: String(err) }, "enqueue ulang ingest gagal"),
      );
    }
    return { ok: true, status: "UPLOADED" };
  }
  if (!v.sourceKey || !v.uploadId || !v.partSize || !v.partCount || v.sizeBytes === null)
    return notFound();
  const id = v.id;
  const r = await completeTarget(
    {
      key: v.sourceKey,
      uploadId: v.uploadId,
      size: Number(v.sizeBytes),
      partSize: v.partSize,
      partCount: v.partCount,
      logId: { versionId: id },
      claim: async () => {
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
        return claim.count > 0;
      },
      release: () =>
        prisma.datasetVersion.updateMany({
          where: { id, status: "UPLOADING" },
          data: { completingAt: null },
        }),
      markFailed: (message) => markFailed(id, message),
      // Dataset bisa terhapus selama unggahan: versi ikut hilang → objek dibuang (review T-003).
      markUploaded: async (etag) => {
        const done = await prisma.datasetVersion.updateMany({
          where: { id, status: "UPLOADING" },
          data: { status: "UPLOADED", etag, uploadId: null, completingAt: null },
        });
        return done.count > 0;
      },
    },
    storage,
  );
  if (!r.ok) return r;
  try {
    await enqueue(id, v.datasetId);
  } catch (err) {
    // Versi tetap UPLOADED; complete berikutnya mengantre ulang, worker (T-006) menyapu saat start.
    logger.error({ versionId: id, err: String(err) }, "enqueue ingest gagal");
  }
  logger.info({ versionId: id, size: Number(v.sizeBytes) }, "unggahan selesai");
  return { ok: true, status: "UPLOADED" };
}

/** Target complete multipart: rencana + transisi status pemiliknya (versi atau file antrean). */
export interface CompleteTarget extends MultipartPlan {
  logId: Record<string, string>;
  /** Klaim complete (satu complete per target); false = sedang diklaim complete lain. */
  claim: () => Promise<boolean>;
  release: () => Promise<unknown>;
  markFailed: (message: string) => Promise<void>;
  /** Objek valid → status "terunggah"; false = target sudah hilang (objek dibuang). */
  markUploaded: (etag: string) => Promise<boolean>;
}

/**
 * Selesaikan multipart (flow-kerja B2): ListParts → verifikasi rencana → complete → HeadObject (ukuran,
 * batas) → signature 64 KB → status terunggah. Error storage → klaim dilepas (ulangi nanti); objek tidak
 * valid → dihapus dan target ditandai gagal.
 */
export async function completeTarget(
  t: CompleteTarget,
  storage: MultipartStorage,
): Promise<UploadResult<Record<never, never>>> {
  const { key, uploadId, size, partSize, partCount, logId } = t;
  const ext = key.endsWith(".csv") ? "csv" : "xlsx";
  if (!(await t.claim())) return fail("BUSY", "File sedang diperiksa. Tunggu sebentar.");

  const rejectObject = async (code: UploadCode, message: string) => {
    await storage
      .remove(key)
      .catch((e: unknown) =>
        logger.error({ ...logId, err: String(e) }, "hapus objek yang ditolak gagal"),
      );
    await t.markFailed(message);
    return fail(code, message);
  };

  /** Validasi objek hasil complete lalu status terunggah. Error storage → klaim dilepas. */
  const finalize = async (etagHint: string): Promise<UploadResult<Record<never, never>>> => {
    let etag = etagHint;
    try {
      const head = await storage.head(key);
      if (!head || head.size !== size) {
        return rejectObject(
          "UPLOAD_CORRUPT",
          "Ukuran file di server tidak sesuai. Unggah ulang file.",
        );
      }
      if (head.size > env().MAX_UPLOAD_BYTES) {
        return rejectObject(
          "FILE_TOO_LARGE",
          `Ukuran file melebihi batas ${formatGiB(env().MAX_UPLOAD_BYTES)}.`,
        );
      }
      etag ||= head.etag ?? "";
      const sniffed = sniff(ext, await storage.readHead(key, SNIFF_BYTES));
      if (!sniffed.ok) return rejectObject("INVALID_FORMAT", sniffed.message);
    } catch (err) {
      // Objek sudah utuh di storage; ulangi complete nanti (jalur "multipart sudah selesai").
      logger.error({ ...logId, err: String(err) }, "validasi objek setelah complete gagal");
      await t.release();
      return fail("STORAGE_ERROR", "Penyimpanan file sedang tidak bisa dihubungi. Coba lagi.");
    }
    if (!(await t.markUploaded(etag))) {
      await storage.remove(key).catch(() => {});
      return notFound();
    }
    return { ok: true };
  };

  let parts: Awaited<ReturnType<MultipartStorage["listParts"]>>;
  try {
    parts = await storage.listParts(key, uploadId);
  } catch (err) {
    logger.error({ ...logId, err: String(err) }, "ListParts gagal");
    await t.release();
    return fail("STORAGE_ERROR", "Penyimpanan file sedang tidak bisa dihubungi. Coba lagi.");
  }
  if (!parts) {
    // Multipart sudah tidak ada: bisa karena complete sebelumnya sukses tetapi responsnya hilang
    // atau validasi sesudahnya gagal. Objek utuh → lanjutkan validasi; tidak ada → kedaluwarsa.
    let existing: Awaited<ReturnType<MultipartStorage["head"]>>;
    try {
      existing = await storage.head(key); // null hanya untuk 404; error lain = belum tahu
    } catch (err) {
      logger.error({ ...logId, err: String(err) }, "HeadObject pemulihan gagal");
      await t.release();
      return fail("STORAGE_ERROR", "Penyimpanan file sedang tidak bisa dihubungi. Coba lagi.");
    }
    if (existing) return finalize(existing.etag ?? "");
    await t.markFailed("Unggahan kedaluwarsa. Unggah ulang file.");
    return fail(
      "UPLOAD_FAILED",
      "Unggahan sudah kedaluwarsa. Pilih file lagi untuk mulai dari awal.",
    );
  }
  const verdict = verifyParts(parts, size, partSize, partCount);
  if (verdict.kind === "missing") {
    await t.release();
    return { ...fail("INCOMPLETE", "Sebagian file belum terunggah."), missing: verdict.missing };
  }
  if (verdict.kind === "corrupt") {
    logger.warn(
      { ...logId, reason: verdict.reason },
      "unggahan ditolak: part tidak sesuai rencana",
    );
    await storage.abort(key, uploadId).catch(() => {});
    await t.markFailed("Unggahan rusak: bagian file tidak sesuai. Unggah ulang file.");
    return fail("UPLOAD_CORRUPT", "Unggahan rusak: bagian file tidak sesuai. Unggah ulang file.");
  }

  let etag: string;
  try {
    etag = await storage.complete(key, uploadId, parts);
  } catch (err) {
    logger.error({ ...logId, err: String(err) }, "completeMultipartUpload gagal");
    await t.release();
    return fail("STORAGE_ERROR", "Penyimpanan file sedang tidak bisa dihubungi. Coba lagi.");
  }
  return finalize(etag);
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
  if (v.sourceKey) {
    // Objek hasil complete yang belum sempat divalidasi (lihat jalur pemulihan di completeUpload).
    await storage.remove(v.sourceKey).catch(() => {});
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
  /** Pilihan saat unggahan dimulai (T-053): melanjutkan hanya dengan mode + label yang sama (R20). */
  mode: UploadMode;
  label: string | null;
  /** Sheet pilihan saat unggahan dimulai (T-85tb); [] = semua. Melanjutkan memakai pilihan yang sama. */
  sheets: string[];
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
      mode: true,
      periodLabel: true,
      selectedSheets: true,
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
    mode: v.mode === "PERIOD" ? "PERIOD" : "REPLACE",
    label: v.mode === "PERIOD" && v.periodLabel ? v.periodLabel.toISOString().slice(0, 10) : null,
    sheets: v.selectedSheets ?? [],
  };
}
