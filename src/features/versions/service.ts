import "server-only";
import { Prisma } from "@prisma/client";
import { isIdShape } from "@/features/datasets/validation";
import { forgetLocalParquet } from "@/features/query/local-parquet";
import { announceVersionActivated } from "@/features/query/warm";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { redisReady } from "@/lib/redis";
import { activateVersionInTx } from "./activation";
import { versionPrefixes } from "./retention";
import type { VersionCode, VersionResult, VersionRow, VersionStatus } from "./types";

/*
 * Riwayat versi dataset untuk pemilik (T-013): daftar, aktifkan versi siap lain (rollback), buang
 * versi yang menunggu pemetaan. Bukan pemilik atau tidak ada → NOT_FOUND (D2). Perubahan mengunci
 * baris Dataset lebih dulu (FOR UPDATE), urutan yang sama dengan ingest finish dan hapus dataset.
 * Cache hasil query tidak perlu dibuang: kuncinya memuat versionId (B4).
 */

/** Sama dengan uploads/service.ts: satu versi belum terminal per dataset (D4). */
const NON_TERMINAL = ["UPLOADING", "UPLOADED", "INGESTING", "AWAITING_MAPPING"] as const;
/** Baris riwayat yang ditampilkan (retensi menjaga daftar tetap pendek; ini batas aman). */
const LIST_MAX = 50;
/** Aktivasi memetakan ulang semua widget dataset: lebih lama dari batas transaksi bawaan 5 detik. */
const TX_OPTIONS = { maxWait: 5_000, timeout: 30_000 };

const fail = <T>(code: VersionCode, message: string): VersionResult<T> => ({
  ok: false,
  code,
  message,
});
const notFound = <T>() => fail<T>("NOT_FOUND", "Versi data tidak ditemukan.");
const busy = <T>() =>
  fail<T>(
    "DATASET_BUSY",
    "Tunggu file baru selesai diproses, atau versi yang menunggu pemetaan dipetakan atau dibuang, sebelum mengganti versi aktif.",
  );

const rowSelect = {
  id: true,
  originalName: true,
  status: true,
  sizeBytes: true,
  createdAt: true,
  ingestFinishedAt: true,
  errorMessage: true,
  sourceDeletedAt: true,
  uploadedBy: { select: { name: true, email: true } },
} satisfies Prisma.DatasetVersionSelect;

export type VersionRecord = Prisma.DatasetVersionGetPayload<{ select: typeof rowSelect }>;

/** Baris DB → baris riwayat (murni). */
export function toVersionRow(v: VersionRecord, activeVersionId: string | null): VersionRow {
  const status = v.status as VersionStatus;
  const active = v.id === activeVersionId;
  return {
    id: v.id,
    fileName: v.originalName,
    status,
    sizeBytes: v.sizeBytes === null ? null : Number(v.sizeBytes),
    createdAt: v.createdAt.toISOString(),
    finishedAt: v.ingestFinishedAt?.toISOString() ?? null,
    active,
    canActivate: status === "READY" && !active,
    canDiscard: status === "AWAITING_MAPPING",
    message: status === "FAILED" || status === "AWAITING_MAPPING" ? v.errorMessage : null,
    uploadedBy: v.uploadedBy ? (v.uploadedBy.name ?? v.uploadedBy.email) : null,
    sourceDeleted: v.sourceDeletedAt !== null,
  };
}

/** Riwayat versi (terbaru dulu, tanpa unggahan yang belum selesai); bukan pemilik → []. */
export async function listVersions(userId: string, datasetId: string): Promise<VersionRow[]> {
  if (!isIdShape(datasetId)) return [];
  const ds = await prisma.dataset.findFirst({
    where: { id: datasetId, ownerId: userId },
    select: {
      activeVersionId: true,
      versions: {
        where: { status: { not: "UPLOADING" } },
        orderBy: { createdAt: "desc" },
        take: LIST_MAX,
        select: rowSelect,
      },
    },
  });
  return ds ? ds.versions.map((v) => toVersionRow(v, ds.activeVersionId)) : [];
}

type Tx = Prisma.TransactionClient;

/** Baris Dataset milik user, dikunci sampai transaksi selesai; null = bukan pemilik/tidak ada. */
async function lockOwned(tx: Tx, userId: string, datasetId: string) {
  const rows = await tx.$queryRaw<{ activeVersionId: string | null }[]>`
    SELECT "activeVersionId" FROM "Dataset" WHERE id = ${datasetId} AND "ownerId" = ${userId} FOR UPDATE`;
  return rows[0] ?? null;
}

/** Transaksi versi; antrean lock melewati batas waktu → DATASET_BUSY, bukan error. */
async function inTx<T>(fn: (tx: Tx) => Promise<VersionResult<T>>): Promise<VersionResult<T>> {
  try {
    return await prisma.$transaction(fn, TX_OPTIONS);
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2028") return busy();
    throw e;
  }
}

/**
 * Aktifkan versi READY lain (rollback). Ditolak selama ada versi yang belum terminal: ingest yang
 * sedang berjalan akan mengaktifkan dirinya sendiri, dan pemetaan T-014 berlaku pada versi aktif.
 */
export async function activateVersion(
  userId: string,
  datasetId: unknown,
  versionId: unknown,
  ip = "unknown",
): Promise<VersionResult<{ fileName: string }>> {
  if (!isIdShape(datasetId) || !isIdShape(versionId)) return notFound();
  let typedKeys: string[] = [];
  const r = await inTx<{ fileName: string }>(async (tx) => {
    const ds = await lockOwned(tx, userId, datasetId);
    if (!ds) return notFound();
    const v = await tx.datasetVersion.findFirst({
      where: { id: versionId, datasetId },
      select: { status: true, originalName: true },
    });
    if (!v) return notFound();
    const pending = await tx.datasetVersion.count({
      where: { datasetId, status: { in: [...NON_TERMINAL] } },
    });
    if (pending) return busy();
    if (v.status !== "READY" || ds.activeVersionId === versionId) {
      return fail("INVALID", "Versi ini tidak bisa diaktifkan: hanya versi siap yang belum aktif.");
    }
    const done = await activateVersionInTx(tx, datasetId, versionId, {
      actorId: userId,
      ip,
      audit: true,
    });
    typedKeys = done.deletedTypedKeys;
    return { ok: true, data: { fileName: v.originalName ?? "" } };
  });
  // Setelah commit: salinan lokal Parquet versi yang dibuang retensi (objeknya dihapus ≥ 1 jam lagi);
  // versi target dipanaskan di cache app (T-pvq8) tanpa menunggu Redis.
  if (r.ok) {
    forgetLocalParquet(typedKeys);
    void announceVersionActivated(redisReady(), versionId, logger);
    logger.info({ datasetId, versionId, dropped: typedKeys.length }, "versi dataset diaktifkan");
  }
  return r;
}

/**
 * Buang versi yang menunggu pemetaan (D4: hanya satu versi belum terminal per dataset, jadi unggahan
 * berikutnya terbuka lagi). Data aktif tidak berubah; objeknya dihapus job pembersihan.
 */
export async function discardVersion(
  userId: string,
  datasetId: unknown,
  versionId: unknown,
): Promise<VersionResult<{ fileName: string }>> {
  if (!isIdShape(datasetId) || !isIdShape(versionId)) return notFound();
  const r = await inTx<{ fileName: string }>(async (tx) => {
    if (!(await lockOwned(tx, userId, datasetId))) return notFound();
    const v = await tx.datasetVersion.findFirst({
      where: { id: versionId, datasetId },
      select: { status: true, originalName: true },
    });
    if (!v) return notFound();
    if (v.status !== "AWAITING_MAPPING") {
      return fail("INVALID", "Hanya versi yang menunggu pemetaan yang bisa dibuang.");
    }
    const del = await tx.datasetVersion.deleteMany({
      where: { id: versionId, datasetId, status: "AWAITING_MAPPING", activeFor: { is: null } },
    });
    if (del.count !== 1) return notFound();
    await tx.storageCleanup.createMany({
      data: versionPrefixes(datasetId, versionId).map((prefix) => ({
        prefix,
        reason: "versi dibuang pemilik",
      })),
    });
    return { ok: true, data: { fileName: v.originalName ?? "" } };
  });
  if (r.ok) logger.info({ datasetId, versionId }, "versi dataset dibuang");
  return r;
}
