import "server-only";
import { isIdShape } from "@/features/datasets/validation";
import type { ColumnSchema } from "@/features/ingest/infer";
import { isoDay } from "@/features/ingest/period";
import { canEditWhere } from "@/features/sharing/access";
import { prisma } from "@/lib/db";
import { byPeriod, type GridRepo, type GridRole, type GridSegment } from "./grid-service";

/** Waktu naive DB (UTC = naive) → ISO tanpa zona; null tetap null. */
const isoTime = (d: Date | null): string | null => (d ? d.toISOString().slice(0, 19) : null);

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
        periodSource: true,
        periodColumn: true,
        version: {
          select: {
            status: true,
            periodGrain: true,
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
                    periodKey: true,
                    periodStart: true,
                    minDate: true,
                    maxDate: true,
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
    const grain = s.version.periodGrain;
    const period =
      grain && s.periodSource
        ? { grain, column: s.periodSource === "COLUMN" ? (s.periodColumn ?? null) : null }
        : null;
    const segments: GridSegment[] = s.segments.map(({ segmentTyped: t }) => {
      const g = t.segment;
      const start = isoDay(g.periodStart);
      return {
        typedKey: t.typedKey,
        legacyRow: t.legacyRow,
        columns: t.columns,
        dataRows: t.dataRows,
        rowBase: Number(g.rowBase),
        maxSrcRow: g.maxSrcRow,
        rawKey: g.rawKey,
        colMap: g.colMap,
        fileName: g.createdByVersion?.originalName ?? null,
        // min/max hanya sah untuk kolom periode sumber KOLOM (berlabel: kolom acuan, T-054).
        ...(period && g.periodKey && start
          ? {
              period: {
                key: g.periodKey,
                start,
                min: period.column !== null ? isoTime(g.minDate) : null,
                max: period.column !== null ? isoTime(g.maxDate) : null,
              },
            }
          : {}),
      };
    });
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
      segments: period ? byPeriod(segments) : segments,
      period,
    };
  },
};
