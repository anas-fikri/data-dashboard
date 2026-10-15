import "server-only";
import { Prisma } from "@prisma/client";
import { recordAudit } from "@/features/audit/service";
import { isTxConflict } from "@/features/dashboards/tx-conflict";
import { forgetLocalParquet } from "@/features/query/local-parquet";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { cancelVersionJobs } from "@/lib/queue/versions";
import { deleteDatasetObjects } from "@/lib/storage/objects";
import { deriveLabel, type DatasetLabel, type VersionStatus } from "./label";
import {
  DATASETS_PER_USER,
  isIdShape,
  nameKeyOf,
  validateDatasetInput,
  type DatasetField,
} from "./validation";

/*
 * Profil dataset. Setiap operasi dibatasi pada pemilik (where {id, ownerId}); bukan pemilik atau
 * tidak ada → NOT_FOUND (D2). Berbagi (T-016) per dashboard, bukan per dataset: halaman dataset tetap
 * pemilik saja.
 */

export type DatasetCode =
  "NOT_FOUND" | "NAME_TAKEN" | "LIMIT_REACHED" | "INVALID" | "CONFIRM_MISMATCH" | "BUSY";

export type DatasetResult<T> =
  { ok: true; data: T } | { ok: false; code: DatasetCode; message: string; field?: DatasetField };

export interface DatasetSummary {
  id: string;
  name: string;
  description: string | null;
  updatedAt: Date;
  label: DatasetLabel;
  dashboardCount: number;
  /** Versi aktif (data yang dipakai dashboard), bila ada. */
  active: { originalName: string | null; finishedAt: Date | null } | null;
  /** Nama file versi terbaru (untuk menjelaskan unggahan yang gagal). */
  latestFileName: string | null;
}

const notFound = <T>(): DatasetResult<T> => ({
  ok: false,
  code: "NOT_FOUND",
  message: "Dataset tidak ditemukan.",
});

const summarySelect = {
  id: true,
  name: true,
  description: true,
  updatedAt: true,
  activeVersionId: true,
  activeVersion: { select: { originalName: true, ingestFinishedAt: true } },
  _count: { select: { dashboards: true } },
  versions: {
    orderBy: { createdAt: "desc" as const },
    take: 1,
    select: { id: true, status: true, errorMessage: true, originalName: true },
  },
} satisfies Prisma.DatasetSelect;

type SummaryRow = Prisma.DatasetGetPayload<{ select: typeof summarySelect }>;

function toSummary(row: SummaryRow): DatasetSummary {
  const latest = row.versions[0];
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    updatedAt: row.updatedAt,
    dashboardCount: row._count.dashboards,
    active: row.activeVersion
      ? {
          originalName: row.activeVersion.originalName,
          finishedAt: row.activeVersion.ingestFinishedAt,
        }
      : null,
    latestFileName: latest?.originalName ?? null,
    label: deriveLabel(
      row.activeVersionId,
      latest
        ? {
            id: latest.id,
            status: latest.status as VersionStatus,
            errorMessage: latest.errorMessage,
          }
        : null,
    ),
  };
}

export async function listDatasets(ownerId: string): Promise<DatasetSummary[]> {
  const rows = await prisma.dataset.findMany({
    where: { ownerId },
    orderBy: { updatedAt: "desc" },
    select: summarySelect,
  });
  return rows.map(toSummary);
}

export async function getDataset(ownerId: string, id: unknown): Promise<DatasetSummary | null> {
  if (!isIdShape(id)) return null;
  const row = await prisma.dataset.findFirst({ where: { id, ownerId }, select: summarySelect });
  return row ? toSummary(row) : null;
}

function isUniqueViolation(e: unknown): boolean {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";
}

const nameTaken = <T>(): DatasetResult<T> => ({
  ok: false,
  code: "NAME_TAKEN",
  field: "name",
  message: "Anda sudah punya dataset dengan nama ini.",
});

export async function createDataset(
  ownerId: string,
  nameRaw: unknown,
  descriptionRaw: unknown,
): Promise<DatasetResult<{ id: string }>> {
  const v = validateDatasetInput(nameRaw, descriptionRaw);
  if (!v.ok) return { ok: false, code: "INVALID", field: v.field, message: v.message };
  try {
    // Hitung + buat di bawah advisory lock per pemilik: request paralel tidak bisa menembus batas
    // (review T-003 #1). Lock dilepas otomatis di akhir transaksi.
    const row = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`datasets:${ownerId}`}))`;
      const count = await tx.dataset.count({ where: { ownerId } });
      if (count >= DATASETS_PER_USER) return null;
      return tx.dataset.create({
        data: { ownerId, name: v.name, nameKey: v.nameKey, description: v.description },
        select: { id: true },
      });
    });
    if (!row) {
      return {
        ok: false,
        code: "LIMIT_REACHED",
        message: `Batas ${DATASETS_PER_USER} dataset per pengguna tercapai. Hapus dataset yang tidak dipakai.`,
      };
    }
    logger.info({ datasetId: row.id }, "dataset dibuat");
    return { ok: true, data: row };
  } catch (e) {
    if (isUniqueViolation(e)) return nameTaken();
    // Antrean lock per pemilik melewati batas waktu transaksi (banyak permintaan sekaligus).
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2028") {
      return { ok: false, code: "BUSY", message: "Sedang memproses permintaan lain. Coba lagi." };
    }
    throw e;
  }
}

export async function updateDataset(
  ownerId: string,
  id: unknown,
  nameRaw: unknown,
  descriptionRaw: unknown,
): Promise<DatasetResult<{ id: string }>> {
  if (!isIdShape(id)) return notFound();
  const v = validateDatasetInput(nameRaw, descriptionRaw);
  if (!v.ok) return { ok: false, code: "INVALID", field: v.field, message: v.message };
  try {
    const r = await prisma.dataset.updateMany({
      where: { id, ownerId },
      data: { name: v.name, nameKey: v.nameKey, description: v.description },
    });
    if (r.count !== 1) return notFound();
    return { ok: true, data: { id } };
  } catch (e) {
    if (isUniqueViolation(e)) return nameTaken();
    throw e;
  }
}

export interface DeleteDeps {
  cancelJobs: (versionIds: string[]) => Promise<void>;
  deleteObjects: (datasetId: string) => Promise<number>;
  /** Buang salinan lokal typed.parquet di cache mesin query (T-009, review F12). */
  forgetParquet?: (keys: string[]) => Promise<void>;
}

const defaultDeps: DeleteDeps = {
  cancelJobs: cancelVersionJobs,
  deleteObjects: deleteDatasetObjects,
  // Registri tanpa DuckDB: menghapus dataset tidak memuat modul native mesin query (review T-009 N3).
  forgetParquet: async (keys) => forgetLocalParquet(keys),
};

export interface ShareImpact {
  /** Dashboard dataset ini yang dibagikan (ke orang atau organisasi). */
  sharedDashboards: number;
  /** Orang berbeda yang punya share di dashboard dataset ini. */
  people: number;
  /** Ada dashboard yang dibagikan ke seluruh organisasi. */
  orgShared: boolean;
}

/** Siapa yang kehilangan akses bila dataset dihapus (dialog hapus, T-016). Pemilik saja. */
export async function datasetShareImpact(ownerId: string, id: string): Promise<ShareImpact> {
  const rows = await prisma.dashboard.findMany({
    where: { datasetId: id, dataset: { ownerId } },
    select: { orgShared: true, shares: { select: { userId: true } } },
  });
  return {
    sharedDashboards: rows.filter((r) => r.orgShared || r.shares.length > 0).length,
    people: new Set(rows.flatMap((r) => r.shares.map((s) => s.userId))).size,
    orgShared: rows.some((r) => r.orgShared),
  };
}

/**
 * Hapus profil (langkah kedua: konfirmasi nama dicek server). Urutan: batalkan job versi yang
 * belum terminal → hapus baris (kaskade versi + dashboard + share) bersama AuditLog
 * "dataset.delete" dalam SATU transaksi → hapus objek storage. Kegagalan storage tidak membatalkan
 * penghapusan (dicatat; objek yatim dibersihkan job pemeliharaan).
 */
export async function deleteDataset(
  ownerId: string,
  id: unknown,
  confirmRaw: unknown,
  ip: string,
  deps: DeleteDeps = defaultDeps,
): Promise<DatasetResult<{ id: string }>> {
  if (!isIdShape(id)) return notFound();
  const row = await prisma.dataset.findFirst({
    where: { id, ownerId },
    select: {
      id: true,
      name: true,
      versions: {
        where: { status: { notIn: ["READY", "FAILED"] } },
        select: { id: true },
      },
    },
  });
  if (!row) return notFound();
  // Dibandingkan dengan nama (bukan nameKey tersimpan): kunci lama dibuat sebelum nameKeyOf memakai
  // NFC, jadi dataset bernama bentuk terurai tetap bisa dikonfirmasi (review T-010 R3-1).
  if (typeof confirmRaw !== "string" || nameKeyOf(confirmRaw) !== nameKeyOf(row.name)) {
    return {
      ok: false,
      code: "CONFIRM_MISMATCH",
      field: "confirm",
      message: "Ketik nama dataset persis untuk mengonfirmasi.",
    };
  }
  await deps.cancelJobs(row.versions.map((v) => v.id));
  const typed = await prisma.sheet.findMany({
    where: { version: { datasetId: id }, typedKey: { not: null } },
    select: { typedKey: true },
  });
  let deleted: boolean;
  try {
    // Batas waktu sama dengan transaksi lain yang mengunci baris Dataset (aktivasi, pemetaan, akhir
    // ingest: 30 dtk): hapus yang menunggu lock mereka tidak kedaluwarsa di batas bawaan 5 dtk.
    deleted = await prisma.$transaction(
      async (tx) => {
        // Hitungan untuk jejak audit: dashboard dan share yang ikut terhapus lewat kaskade.
        const dashboards = await tx.dashboard.findMany({
          where: { datasetId: id, dataset: { ownerId } },
          select: { _count: { select: { shares: true } } },
        });
        const r = await tx.dataset.deleteMany({ where: { id, ownerId } });
        if (r.count !== 1) return false;
        await recordAudit(tx, {
          actorId: ownerId,
          action: "dataset.delete",
          targetType: "dataset",
          targetId: id,
          meta: {
            name: row.name,
            dashboards: dashboards.length,
            shares: dashboards.reduce((n, d) => n + d._count.shares, 0),
          },
          ip,
        });
        return true;
      },
      { maxWait: 5_000, timeout: 30_000 },
    );
  } catch (e) {
    // Lock tetap dipegang transaksi lain melewati batas waktu, atau korban deadlock dengan simpan widget
    // editor (review T-016 R2 DI-1) → dibatalkan utuh, coba lagi (review T-016).
    if (
      (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2028") ||
      isTxConflict(e)
    ) {
      return { ok: false, code: "BUSY", message: "Sedang memproses permintaan lain. Coba lagi." };
    }
    throw e;
  }
  if (!deleted) return notFound();
  await deps
    .forgetParquet?.(typed.flatMap((s) => (s.typedKey ? [s.typedKey] : [])))
    .catch(() => {});
  try {
    await deps.deleteObjects(id);
  } catch (e) {
    logger.error(
      { datasetId: id, err: e instanceof Error ? e.message : String(e) },
      "gagal menghapus objek storage dataset (akan dibersihkan job pemeliharaan)",
    );
  }
  logger.info({ datasetId: id }, "dataset dihapus");
  return { ok: true, data: { id } };
}
