import "server-only";
import { isIdShape } from "@/features/datasets/validation";
import type { ColumnSchema } from "@/features/ingest/infer";
import { canEditWhere } from "@/features/sharing/access";
import { prisma } from "@/lib/db";
import type { GridRepo, GridRole } from "./grid-service";

/*
 * Repo Prisma "Lihat data" (T-041; dipisah dari grid-http.ts di T-046 agar worker ekspor tampilan memakai
 * resolver akses yang sama tanpa memuat Route Handler). Peran: pemilik dataset, atau editor salah satu
 * dashboard-nya; viewer/pengguna lain = null.
 */

async function roleOn(
  userId: string,
  datasetId: string,
  ownerId: string,
): Promise<GridRole | null> {
  if (ownerId === userId) return "OWNER";
  const d = await prisma.dashboard.findFirst({
    where: { datasetId, ...canEditWhere(userId) },
    select: { id: true },
  });
  return d ? "EDITOR" : null;
}

/**
 * Peran user SEKARANG pada dataset sheet ini (tanpa cache) + id dataset-nya; null = sheet tidak ada atau
 * tanpa akses pemilik/editor. Dipakai status/unduh ekspor tampilan (T-046).
 */
export async function sheetAccess(
  userId: string,
  sheetId: string,
): Promise<{ role: GridRole; datasetId: string } | null> {
  if (!isIdShape(sheetId)) return null;
  const s = await prisma.sheet.findUnique({
    where: { id: sheetId },
    select: { version: { select: { datasetId: true, dataset: { select: { ownerId: true } } } } },
  });
  if (!s) return null;
  const role = await roleOn(userId, s.version.datasetId, s.version.dataset.ownerId);
  return role ? { role, datasetId: s.version.datasetId } : null;
}

/** Sheet + peran peminta pada dataset-nya: pemilik dataset, atau editor salah satu dashboard-nya. */
export const prismaGridRepo: GridRepo = {
  async sheet(userId, sheetId) {
    if (!isIdShape(sheetId)) return null;
    const s = await prisma.sheet.findUnique({
      where: { id: sheetId },
      select: {
        name: true,
        versionId: true,
        typedKey: true,
        rawKey: true,
        schemaRevision: true,
        schema: true,
        version: {
          select: {
            status: true,
            originalName: true,
            datasetId: true,
            dataset: { select: { ownerId: true, activeVersionId: true, name: true } },
          },
        },
        segments: {
          orderBy: { ordinal: "asc" },
          select: {
            segmentTyped: {
              select: {
                typedKey: true,
                legacyRow: true,
                columns: true,
                dataRows: true,
                segment: {
                  select: {
                    rowBase: true,
                    maxSrcRow: true,
                    rawKey: true,
                    colMap: true,
                    createdByVersion: { select: { originalName: true } },
                  },
                },
              },
            },
          },
        },
      },
    });
    if (!s) return null;
    const ds = s.version.dataset;
    const role = await roleOn(userId, s.version.datasetId, ds.ownerId);
    return {
      versionId: s.versionId,
      versionStatus: s.version.status,
      activeVersionId: ds.activeVersionId,
      role,
      datasetId: s.version.datasetId,
      title: `${ds.name} - ${s.name}`,
      typedKey: s.typedKey,
      rawKey: s.rawKey,
      fileName: s.version.originalName,
      schemaRevision: s.schemaRevision,
      schema: (s.schema as unknown as ColumnSchema[] | null) ?? null,
      segments: s.segments.map(({ segmentTyped: t }) => ({
        typedKey: t.typedKey,
        legacyRow: t.legacyRow,
        columns: t.columns,
        dataRows: t.dataRows,
        rowBase: Number(t.segment.rowBase),
        maxSrcRow: t.segment.maxSrcRow,
        rawKey: t.segment.rawKey,
        colMap: t.segment.colMap,
        fileName: t.segment.createdByVersion?.originalName ?? null,
      })),
    };
  },
};
