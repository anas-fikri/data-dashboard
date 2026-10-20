import "server-only";
import { Prisma } from "@prisma/client";
import { recordAudit } from "@/features/audit/service";
import { activateVersionInTx } from "@/features/versions/activation";
import { prismaManifest } from "@/features/versions/integrity";
import { prisma } from "@/lib/db";
import type { ColumnSchema, SourceKind } from "./infer";
import { naiveToDate, PERIOD_SETUP_STAGE, type PeriodSetupRepo } from "./period-setup";
import { prismaIngestRepo } from "./repo";
import { sameSnapshot } from "./refresh";

/*
 * Implementasi Prisma job "Atur periode" (T-051). Semua tulisan dijaga status INGESTING agar
 * percobaan ulang / job basi tidak menimpa versi yang sudah selesai; aktivasi di bawah lock baris
 * Dataset (urutan kunci sama dengan finish/hapus dataset).
 */

const FINISH_TX_TIMEOUT_MS = 30_000;

const day = (iso: string) => new Date(`${iso}T00:00:00Z`);

export const prismaPeriodSetupRepo: PeriodSetupRepo = {
  async load(versionId, baseVersionId) {
    const v = await prisma.datasetVersion.findUnique({
      where: { id: versionId },
      select: { datasetId: true, status: true, mode: true },
    });
    if (!v) return null;
    const base = await prisma.datasetVersion.findFirst({
      where: { id: baseVersionId, datasetId: v.datasetId, status: "READY" },
      select: {
        id: true,
        sourceKey: true,
        sheets: {
          orderBy: { index: "asc" },
          select: {
            id: true,
            index: true,
            name: true,
            aliasName: true,
            lineageId: true,
            rawKey: true,
            headerRow: true,
            colCount: true,
            columns: true,
            truncatedCells: true,
            preview: true,
            rawRows: true,
            schemaRevision: true,
            schema: true,
            typedKey: true,
            segments: {
              orderBy: { ordinal: "asc" },
              select: {
                segmentTyped: {
                  select: {
                    typedKey: true,
                    legacyRow: true,
                    headerRow: true,
                    dataRows: true,
                    segment: {
                      select: {
                        id: true,
                        rawKey: true,
                        headerRow: true,
                        colCount: true,
                        colMap: true,
                        sourceKind: true,
                        sha256: true,
                        originalName: true,
                        uploadedById: true,
                        createdByVersion: { select: { uploadedById: true } },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });
    const fallback: SourceKind = base?.sourceKey?.endsWith(".csv") ? "csv" : "xlsx";
    return {
      datasetId: v.datasetId,
      status: v.status,
      mode: v.mode,
      base: base
        ? {
            id: base.id,
            sheets: base.sheets.map(({ segments, schema, ...s }) => ({
              ...s,
              schema: (schema as ColumnSchema[] | null) ?? null,
              segments: segments.map(({ segmentTyped: t }) => ({
                segmentId: t.segment.id,
                rawKey: t.segment.rawKey,
                typedKey: t.typedKey,
                legacyRow: t.legacyRow,
                headerRow: t.headerRow ?? t.segment.headerRow,
                colCount: t.segment.colCount,
                colMap: t.segment.colMap,
                sourceKind:
                  t.segment.sourceKind === "csv" || t.segment.sourceKind === "xlsx"
                    ? t.segment.sourceKind
                    : fallback,
                sha256: t.segment.sha256,
                originalName: t.segment.originalName,
                uploadedById:
                  t.segment.uploadedById ?? t.segment.createdByVersion?.uploadedById ?? null,
                dataRows: t.dataRows,
              })),
            })),
          }
        : null,
    };
  },

  async begin(versionId) {
    const r = await prisma.datasetVersion.updateMany({
      where: {
        id: versionId,
        status: "INGESTING",
        mode: "PERIOD_SETUP",
        ingestStage: PERIOD_SETUP_STAGE,
      },
      data: { ingestStartedAt: new Date(), progress: Prisma.DbNull, errorMessage: null },
    });
    return r.count > 0;
  },

  async alive(versionId) {
    return (
      (await prisma.datasetVersion.count({ where: { id: versionId, status: "INGESTING" } })) > 0
    );
  },

  progress: (versionId, p) => prismaIngestRepo.progress(versionId, p),
  deleteAttempt: (versionId) => prismaIngestRepo.deleteSheets(versionId),
  allocateRows: (lineageId, span) => prismaIngestRepo.allocateRows(lineageId, span),
  manifest: (versionId) => prismaManifest(versionId),
  recordCleanup: (prefix, reason) => prismaIngestRepo.recordCleanup(prefix, reason),

  async createSegment(versionId, d) {
    const v = await prisma.datasetVersion.findUnique({
      where: { id: versionId },
      select: { datasetId: true },
    });
    if (!v) throw new Error("versi atur periode hilang");
    await prisma.segment.create({
      data: {
        id: d.id,
        datasetId: v.datasetId,
        lineageId: d.lineageId,
        rowBase: d.rowBase,
        maxSrcRow: d.maxSrcRow,
        rawKey: d.rawKey,
        rawBytes: BigInt(d.rawBytes),
        rawRows: d.rawRows,
        headerRow: d.headerRow,
        colCount: d.colCount,
        ...(d.colMap.length ? { colMap: d.colMap } : {}),
        periodKey: d.periodKey,
        periodStart: day(d.periodStart),
        minDate: naiveToDate(d.minDate),
        maxDate: naiveToDate(d.maxDate),
        sha256: d.sha256,
        originalName: d.originalName,
        uploadedById: d.uploadedById ?? null,
        sourceKind: d.sourceKind,
        // Kelompok segmen periode (atur ulang dari beberapa segmen sumber, T-qqyx).
        groupId: d.groupId ?? null,
        groupPart: d.groupPart ?? null,
        groupSize: d.groupSize ?? null,
        createdByVersionId: versionId,
      },
    });
  },

  async writeSheets(versionId, sheets) {
    return prisma.$transaction(
      async (tx) => {
        const map: Record<string, string> = {};
        for (const s of sheets) {
          const f = s.from;
          const first = s.segments[0];
          const schema = f.schema ?? [];
          const row = await tx.sheet.create({
            data: {
              versionId,
              lineageId: f.lineageId,
              index: f.index,
              name: f.name,
              aliasName: f.aliasName,
              // Sheet tanpa data typed: raw dasar dibawa (rujukan, bukan salinan).
              rawKey: first ? first.rawKey : f.rawKey,
              rawRows: s.rawRows,
              colCount: f.colCount,
              headerRow: f.headerRow,
              columns: f.columns as Prisma.InputJsonValue,
              truncatedCells: f.truncatedCells,
              preview: f.preview ? (f.preview as Prisma.InputJsonValue) : Prisma.DbNull,
              typedKey: first ? first.typedKey : null,
              schemaRevision: f.schemaRevision,
              schema: f.schema ? (f.schema as unknown as Prisma.InputJsonValue) : Prisma.DbNull,
              periodSource: first ? s.periodSource : null,
              periodColumn: first ? s.periodColumn : null,
            },
            select: { id: true },
          });
          map[f.id] = row.id;
          for (const [ordinal, g] of s.segments.entries()) {
            const t = await tx.segmentTyped.create({
              data: {
                segmentId: g.segmentId,
                schemaRevision: f.schemaRevision,
                typedKey: g.typedKey,
                columns: [...new Set(schema.map((c) => c.pos))].sort((a, b) => a - b),
                dataRows: g.dataRows,
                typedBytes: BigInt(g.typedBytes),
                profile: g.profile as unknown as Prisma.InputJsonValue,
                headerRow: g.headerRow,
              },
              select: { id: true },
            });
            await tx.sheetSegment.create({
              data: { sheetId: row.id, segmentTypedId: t.id, ordinal },
            });
          }
        }
        return map;
      },
      { timeout: FINISH_TX_TIMEOUT_MS },
    );
  },

  async finish(versionId, d) {
    return prisma.$transaction(
      async (tx) => {
        const v = await tx.datasetVersion.findUnique({
          where: { id: versionId },
          select: { datasetId: true },
        });
        if (!v) return "gone" as const;
        const [ds] = await tx.$queryRaw<{ activeVersionId: string | null }[]>`
          SELECT "activeVersionId" FROM "Dataset" WHERE id = ${v.datasetId} FOR UPDATE`;
        if (!ds) return "gone" as const;
        const sheets = ds.activeVersionId
          ? await tx.sheet.findMany({
              where: { versionId: ds.activeVersionId },
              select: { id: true, schemaRevision: true },
            })
          : [];
        if (!sameSnapshot(d.base, { activeVersionId: ds.activeVersionId, sheets })) {
          return "stale" as const;
        }
        const r = await tx.datasetVersion.updateMany({
          where: { id: versionId, status: "INGESTING" },
          data: {
            status: "READY",
            errorMessage: null,
            ingestStage: "typed",
            ingestFinishedAt: new Date(),
          },
        });
        if (r.count === 0) return "gone" as const;
        // Worker: tidak ada cache Parquet lokal yang perlu dilupakan (deletedTypedKeys diabaikan).
        await activateVersionInTx(tx, v.datasetId, versionId, { sheetMap: d.sheetMap });
        await recordAudit(tx, {
          actorId: d.actorId,
          action: "dataset.period.activate",
          targetType: "dataset",
          targetId: v.datasetId,
          meta: { from: ds.activeVersionId, ...d.meta } as Prisma.InputJsonValue,
          ip: d.ip,
        });
        return "activated" as const;
      },
      { timeout: FINISH_TX_TIMEOUT_MS },
    );
  },

  async fail(versionId, message) {
    const r = await prisma.datasetVersion.updateMany({
      where: { id: versionId, status: "INGESTING" },
      data: { status: "FAILED", errorMessage: message, ingestFinishedAt: new Date() },
    });
    return r.count > 0;
  },
};
