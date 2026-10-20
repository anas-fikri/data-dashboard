import "server-only";
import { Prisma } from "@prisma/client";
import { NON_TERMINAL_STATUSES } from "@/features/datasets/label";
import { isIdShape } from "@/features/datasets/validation";
import { parseFrozenPeriodPlan } from "@/features/ingest/period-plan";
import { setupHistoryNote } from "@/features/ingest/period-setup-plan";
import { periodPlanSummary } from "@/features/ingest/period-upload-plan";
import { manageOf, periodSegmentsSelect } from "./period-manage";
import {
  parsePeriodChange,
  periodChangeNote,
  periodChangeTitle,
  rollbackWarning,
} from "./period-manage-plan";
import { forgetLocalParquet } from "@/features/query/local-parquet";
import { announceVersionActivated } from "@/features/query/warm";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { redisReady } from "@/lib/redis";
import { activateVersionInTx } from "./activation";
import { prismaIntegrityDeps } from "./integrity";
import { integrityMessage, verifyVersionIntegrity } from "./integrity-check";
import { versionPrefixes } from "./retention";
import type { VersionCode, VersionResult, VersionRow, VersionStatus } from "./types";

/*
 * Riwayat versi dataset untuk pemilik (T-013): daftar, aktifkan versi siap lain (rollback), buang
 * versi yang menunggu pemetaan. Bukan pemilik atau tidak ada → NOT_FOUND (D2). Perubahan mengunci
 * baris Dataset lebih dulu (FOR UPDATE), urutan yang sama dengan ingest finish dan hapus dataset.
 * Cache hasil query tidak perlu dibuang: kuncinya memuat versionId (B4).
 */

/** Sama dengan uploads/service.ts: satu versi belum terminal per dataset (D4). */
const NON_TERMINAL = NON_TERMINAL_STATUSES;
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
    "Tunggu file baru selesai diproses, atau versi yang menunggu pemetaan/konfirmasi diselesaikan atau dibuang, sebelum mengganti versi aktif.",
  );
/** Versi tertunda yang boleh dibuang pemilik (data aktif tidak berubah). */
const DISCARDABLE = ["AWAITING_MAPPING", "AWAITING_CONFIRM"] as const;
const isDiscardable = (s: string): s is (typeof DISCARDABLE)[number] =>
  (DISCARDABLE as readonly string[]).includes(s);

const rowSelect = {
  id: true,
  originalName: true,
  status: true,
  sizeBytes: true,
  createdAt: true,
  ingestFinishedAt: true,
  errorMessage: true,
  sourceDeletedAt: true,
  mode: true,
  plan: true,
  periodGrain: true,
  uploadedBy: { select: { name: true, email: true } },
} satisfies Prisma.DatasetVersionSelect;

export type VersionRecord = Prisma.DatasetVersionGetPayload<{ select: typeof rowSelect }>;

/** Ringkasan operasi periode untuk riwayat (T-051 atur periode, T-052 unggahan periode). */
function noteOf(v: VersionRecord): string | null {
  if (v.mode === "PERIOD_SETUP") return setupHistoryNote(parseFrozenPeriodPlan(v.plan));
  if (v.mode === "PERIOD_REMOVE" || v.mode === "PERIOD_RESTORE") {
    const change = parsePeriodChange(v.plan);
    return change ? periodChangeNote(change) : null;
  }
  if (v.mode !== "PERIOD") return null;
  const plan = parseFrozenPeriodPlan(v.plan);
  if (!plan) return null;
  const text = periodPlanSummary(plan);
  return v.status === "AWAITING_CONFIRM" ? `Menunggu konfirmasi: ${text}` : text;
}

/** Judul versi tanpa file unggahan (hapus/pulihkan periode, T-056). */
function titleOf(v: VersionRecord): string | null {
  if (v.originalName) return v.originalName;
  if (v.mode !== "PERIOD_REMOVE" && v.mode !== "PERIOD_RESTORE") return null;
  const change = parsePeriodChange(v.plan);
  return change ? periodChangeTitle(change) : null;
}

/** Baris DB → baris riwayat (murni). */
export function toVersionRow(
  v: VersionRecord,
  activeVersionId: string | null,
  warning: string | null = null,
): VersionRow {
  const status = v.status as VersionStatus;
  const active = v.id === activeVersionId;
  return {
    id: v.id,
    fileName: titleOf(v),
    status,
    sizeBytes: v.sizeBytes === null ? null : Number(v.sizeBytes),
    createdAt: v.createdAt.toISOString(),
    finishedAt: v.ingestFinishedAt?.toISOString() ?? null,
    active,
    canActivate: status === "READY" && !active,
    canDiscard: isDiscardable(status),
    message: status === "FAILED" || isDiscardable(status) ? v.errorMessage : null,
    uploadedBy: v.uploadedBy ? (v.uploadedBy.name ?? v.uploadedBy.email) : null,
    sourceDeleted: v.sourceDeletedAt !== null,
    note: noteOf(v),
    rollbackWarning: status === "READY" && !active ? warning : null,
  };
}

/**
 * Peringatan rollback per versi siap yang tidak aktif (T-056, §4.8): dibandingkan dengan manifest
 * versi aktif (hanya bila versi aktif per periode).
 */
async function rollbackWarnings(
  activeVersionId: string | null,
  versions: VersionRecord[],
): Promise<Map<string, string | null>> {
  const out = new Map<string, string | null>();
  const active = versions.find((v) => v.id === activeVersionId);
  if (!active?.periodGrain) return out;
  const ids = versions.filter((v) => v.status === "READY").map((v) => v.id);
  if (ids.length < 2) return out;
  const rows = await prisma.datasetVersion.findMany({
    where: { id: { in: ids } },
    select: {
      id: true,
      periodGrain: true,
      sheets: { orderBy: { index: "asc" }, select: periodSegmentsSelect },
    },
  });
  const by = new Map(rows.map((r) => [r.id, manageOf(r.id, r.periodGrain, r.sheets)]));
  const a = by.get(active.id) ?? null;
  for (const [id, m] of by) if (id !== active.id) out.set(id, rollbackWarning(a, m));
  return out;
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
  if (!ds) return [];
  const warnings = await rollbackWarnings(ds.activeVersionId, ds.versions);
  return ds.versions.map((v) => toVersionRow(v, ds.activeVersionId, warnings.get(v.id) ?? null));
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
  // Gerbang integritas (T-038, fail-closed) sebelum transaksi: HEAD storage tidak menahan lock. Versi
  // READY tidak pernah disapu GC (versi hidup), jadi hasilnya tetap berlaku saat aktivasi di bawah.
  const target = await prisma.datasetVersion.findFirst({
    where: { id: versionId, datasetId, status: "READY", dataset: { ownerId: userId } },
    select: { id: true },
  });
  if (target) {
    let problems: string[];
    try {
      problems = await verifyVersionIntegrity(versionId, prismaIntegrityDeps);
    } catch (e) {
      // Storage tidak menjawab: belum terbukti rusak — jangan tandai gagal, minta coba lagi.
      logger.warn(
        { datasetId, versionId, err: e instanceof Error ? e.message : String(e) },
        "pemeriksaan integritas versi gagal dijalankan",
      );
      return fail(
        "DATASET_BUSY",
        "Penyimpanan data belum bisa diperiksa. Coba aktifkan lagi beberapa saat lagi.",
      );
    }
    if (problems.length) {
      const message = `${integrityMessage(problems)} Versi ini tidak bisa diaktifkan dan ditandai gagal; data aktif tidak berubah.`;
      await prisma.datasetVersion.updateMany({
        where: { id: versionId, status: "READY", activeFor: { is: null } },
        data: { status: "FAILED", errorMessage: message },
      });
      logger.error(
        { datasetId, versionId, problems },
        "versi gagal pemeriksaan integritas saat diaktifkan",
      );
      return fail("INVALID", message);
    }
  }
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
 * Buang versi yang menunggu pemetaan atau konfirmasi (T-049: "Batalkan upload") — D4: hanya satu versi
 * belum terminal per dataset, jadi unggahan berikutnya terbuka lagi. Data aktif tidak berubah; objek
 * prefix versi dihapus job pembersihan, segmen yang ditulisnya disapu GC segmen setelah masa tenggang.
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
    if (!isDiscardable(v.status)) {
      return fail(
        "INVALID",
        "Hanya versi yang menunggu pemetaan atau konfirmasi yang bisa dibuang.",
      );
    }
    const del = await tx.datasetVersion.deleteMany({
      where: { id: versionId, datasetId, status: v.status, activeFor: { is: null } },
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

/**
 * Unggahan periode yang menunggu konfirmasi lebih dari PERIOD_CONFIRM_TTL_HOURS (T-052, §4.5/R9) dibuang
 * otomatis seperti "Batalkan upload": dataset tidak tertahan selamanya, data aktif tidak berubah.
 * Dipanggil job pemeliharaan worker; mengembalikan jumlah versi yang dibuang.
 */
export async function expireAwaitingConfirm(ttlHours: number, now = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - ttlHours * 60 * 60 * 1000);
  const stale = await prisma.datasetVersion.findMany({
    where: {
      status: "AWAITING_CONFIRM",
      OR: [
        { ingestFinishedAt: { lt: cutoff } },
        { ingestFinishedAt: null, updatedAt: { lt: cutoff } },
      ],
    },
    select: { id: true, datasetId: true },
    take: 100,
  });
  let n = 0;
  for (const v of stale) {
    const done = await prisma
      .$transaction(async (tx) => {
        // Lock Dataset lebih dulu (urutan sama dengan aktivasi/buang/"Terapkan").
        const rows = await tx.$queryRaw<{ id: string }[]>`
          SELECT id FROM "Dataset" WHERE id = ${v.datasetId} FOR UPDATE`;
        if (!rows.length) return false;
        const del = await tx.datasetVersion.deleteMany({
          where: {
            id: v.id,
            status: "AWAITING_CONFIRM",
            activeFor: { is: null },
            OR: [
              { ingestFinishedAt: { lt: cutoff } },
              { ingestFinishedAt: null, updatedAt: { lt: cutoff } },
            ],
          },
        });
        if (del.count !== 1) return false;
        await tx.storageCleanup.createMany({
          data: versionPrefixes(v.datasetId, v.id).map((prefix) => ({
            prefix,
            reason: "unggahan periode kedaluwarsa tanpa konfirmasi",
          })),
        });
        return true;
      }, TX_OPTIONS)
      .catch((e: unknown) => {
        logger.warn(
          { versionId: v.id, err: e instanceof Error ? e.message : String(e) },
          "buang unggahan periode kedaluwarsa gagal; dicoba lagi nanti",
        );
        return false;
      });
    if (done) {
      n++;
      logger.info(
        { datasetId: v.datasetId, versionId: v.id },
        "unggahan periode kedaluwarsa dibuang",
      );
    }
  }
  return n;
}
