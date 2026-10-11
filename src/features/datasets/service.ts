import "server-only";
import { Prisma } from "@prisma/client";
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
 * tidak ada → NOT_FOUND (D2). Berbagi ke user lain datang di T-016.
 */

export type DatasetCode =
  "NOT_FOUND" | "NAME_TAKEN" | "LIMIT_REACHED" | "INVALID" | "CONFIRM_MISMATCH";

export type DatasetResult<T> =
  { ok: true; data: T } | { ok: false; code: DatasetCode; message: string; field?: DatasetField };

export interface DatasetSummary {
  id: string;
  name: string;
  description: string | null;
  updatedAt: Date;
  label: DatasetLabel;
  dashboardCount: number;
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
  _count: { select: { dashboards: true } },
  versions: {
    orderBy: { createdAt: "desc" as const },
    take: 1,
    select: { id: true, status: true, errorMessage: true },
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
}

const defaultDeps: DeleteDeps = {
  cancelJobs: cancelVersionJobs,
  deleteObjects: deleteDatasetObjects,
};

/**
 * Hapus profil (langkah kedua: konfirmasi nama dicek server). Urutan: batalkan job versi yang
 * belum terminal → hapus baris (kaskade versi + dashboard) → hapus objek storage. Kegagalan
 * storage tidak membatalkan penghapusan (dicatat; objek yatim dibersihkan job pemeliharaan).
 */
export async function deleteDataset(
  ownerId: string,
  id: unknown,
  confirmRaw: unknown,
  deps: DeleteDeps = defaultDeps,
): Promise<DatasetResult<{ id: string }>> {
  if (!isIdShape(id)) return notFound();
  const row = await prisma.dataset.findFirst({
    where: { id, ownerId },
    select: {
      id: true,
      nameKey: true,
      versions: {
        where: { status: { notIn: ["READY", "FAILED"] } },
        select: { id: true },
      },
    },
  });
  if (!row) return notFound();
  if (typeof confirmRaw !== "string" || nameKeyOf(confirmRaw) !== row.nameKey) {
    return {
      ok: false,
      code: "CONFIRM_MISMATCH",
      field: "confirm",
      message: "Ketik nama dataset persis untuk mengonfirmasi.",
    };
  }
  await deps.cancelJobs(row.versions.map((v) => v.id));
  const r = await prisma.dataset.deleteMany({ where: { id, ownerId } });
  if (r.count !== 1) return notFound();
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
