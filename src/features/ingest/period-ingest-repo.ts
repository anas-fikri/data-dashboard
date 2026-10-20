import "server-only";
import { Prisma } from "@prisma/client";
import {
  activeOf,
  commitPeriodInTx,
  periodSheetSelect,
  schemaOf,
  sheetKeys,
} from "@/features/versions/period-commit";
import { prisma } from "@/lib/db";
import { DatasetGoneError } from "./ingest";
import { isoDay } from "./period";
import type { PeriodLimits } from "./period-plan";
import { naiveToDate } from "./period-setup";
import { parseGroupFiles } from "./period-group";
import { parsePeriodMeta } from "./period-upload-plan";
import type {
  PeriodActiveSheet,
  PeriodCommitResult,
  PeriodIngestRepo,
  PeriodMappingRepo,
} from "./period-ingest";
import type { ColumnMeta } from "./header";
import { parsePreview } from "./preview";
import { prismaIngestRepo } from "./repo";

/*
 * Implementasi Prisma ingest unggahan periode (T-052). Tulisan status dijaga status INGESTING (job basi /
 * percobaan ulang tidak menimpa versi yang sudah selesai); commit = versions/period-commit.ts di bawah
 * lock Dataset dengan batas waktu transaksi yang sama dengan finish ingest.
 */

const FINISH_TX_TIMEOUT_MS = 30_000;
const day = (iso: string) => new Date(`${iso}T00:00:00Z`);

const gone = (e: unknown) =>
  e instanceof Prisma.PrismaClientKnownRequestError && (e.code === "P2003" || e.code === "P2025");

/** Mode versi untuk memilih jalur ingest di worker (null = versi tidak ada). */
export async function versionMode(versionId: string): Promise<string | null> {
  const v = await prisma.datasetVersion.findUnique({
    where: { id: versionId },
    select: { mode: true },
  });
  return v?.mode ?? null;
}

export function prismaPeriodIngestRepo(limits: () => PeriodLimits): PeriodIngestRepo {
  return {
    async load(versionId) {
      const v = await prisma.datasetVersion.findUnique({
        where: { id: versionId },
        select: {
          datasetId: true,
          sourceKey: true,
          originalName: true,
          periodGrain: true,
          periodLabel: true,
          baseVersionId: true,
          groupFiles: true,
          dataset: {
            select: {
              keepPeriods: true,
              onLimit: true,
              activeVersion: {
                select: {
                  id: true,
                  periodGrain: true,
                  sheets: { orderBy: { index: "asc" }, select: periodSheetSelect },
                },
              },
            },
          },
        },
      });
      if (!v?.sourceKey) return null;
      const a = v.dataset.activeVersion;
      const group = parseGroupFiles(v.groupFiles);
      return {
        datasetId: v.datasetId,
        sourceKey: v.sourceKey,
        originalName: v.originalName,
        // Kelompok file (T-060); kolom berisi tapi tidak terbaca → [] (worker menggagalkan versi,
        // tidak pernah memproses sebagian file kelompok).
        ...(v.groupFiles !== null
          ? { sources: (group ?? []).map((f) => ({ key: f.key, name: f.name })) }
          : {}),
        grain: v.periodGrain,
        label: isoDay(v.periodLabel),
        baseVersionId: v.baseVersionId,
        settings: { keepPeriods: v.dataset.keepPeriods, onLimit: v.dataset.onLimit },
        active:
          a && a.id !== versionId
            ? {
                versionId: a.id,
                grain: a.periodGrain,
                sheets: a.sheets.map((s): PeriodActiveSheet => {
                  const { files: _files, ...meta } = activeOf(s);
                  return {
                    ...meta,
                    id: s.id,
                    name: s.name,
                    aliasName: s.aliasName,
                    index: s.index,
                    headerRow: s.headerRow,
                    schemaRevision: s.schemaRevision,
                    schema: schemaOf(s.schema),
                    lineageId: s.lineageId,
                    colCount: s.colCount,
                    periodSource: s.periodSource,
                    periodColumn: s.periodColumn,
                    keys: sheetKeys([s]),
                  };
                }),
              }
            : null,
      };
    },

    async begin(versionId) {
      const r = await prisma.datasetVersion.updateMany({
        where: { id: versionId, mode: "PERIOD", status: { in: ["UPLOADED", "INGESTING"] } },
        data: {
          status: "INGESTING",
          ingestStartedAt: new Date(),
          ingestStage: null,
          progress: Prisma.DbNull,
          errorMessage: null,
          plan: Prisma.DbNull,
          periodMeta: Prisma.DbNull,
        },
      });
      return r.count > 0;
    },

    exists: (versionId) => prismaIngestRepo.exists(versionId),
    progress: (versionId, p) => prismaIngestRepo.progress(versionId, p),
    deleteSheets: (versionId) => prismaIngestRepo.deleteSheets(versionId),
    allocateRows: (lineageId, span) => prismaIngestRepo.allocateRows(lineageId, span),
    recordCleanup: (prefix, reason) => prismaIngestRepo.recordCleanup(prefix, reason),

    async createSegment(versionId, d) {
      const v = await prisma.datasetVersion.findUnique({
        where: { id: versionId },
        select: { datasetId: true, originalName: true, uploadedById: true },
      });
      if (!v) throw new DatasetGoneError();
      try {
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
            ...(d.period
              ? {
                  periodKey: d.period.key,
                  periodStart: day(d.period.start),
                  minDate: naiveToDate(d.period.minDate),
                  maxDate: naiveToDate(d.period.maxDate),
                }
              : {}),
            sha256: d.sha256,
            sourceKind: d.sourceKind,
            originalName: d.originalName ?? v.originalName,
            ...(d.group
              ? { groupId: d.group.id, groupPart: d.group.part, groupSize: d.group.size }
              : {}),
            uploadedById: v.uploadedById,
            createdByVersionId: versionId,
          },
        });
      } catch (e) {
        if (gone(e)) throw new DatasetGoneError();
        throw e;
      }
    },

    async addTyped(segmentId, t) {
      try {
        const r = await prisma.segmentTyped.create({
          data: {
            segmentId,
            typedKey: t.typedKey,
            schemaRevision: t.schemaRevision,
            columns: t.columns,
            dataRows: t.dataRows,
            typedBytes: BigInt(t.typedBytes),
            profile: t.profile as unknown as Prisma.InputJsonValue,
            headerRow: t.headerRow,
          },
          select: { id: true },
        });
        return r.id;
      } catch (e) {
        if (gone(e)) throw new DatasetGoneError();
        throw e;
      }
    },

    async createRawSheet(versionId, s, lineageId, _segmentId, rawKey) {
      const id = await prismaIngestRepo.createSheet(versionId, s, lineageId);
      await prismaIngestRepo.setSheetKey(id, rawKey);
    },

    async awaitMapping(versionId, d) {
      const r = await prisma.datasetVersion.updateMany({
        where: { id: versionId, status: "INGESTING" },
        data: {
          status: "AWAITING_MAPPING",
          errorMessage: d.reason,
          sha256: d.sha256,
          // Sheet file yang tidak disimpan: rencana setelah pemetaan (T-057) tetap mencatatnya.
          periodMeta: { ignoredSheets: d.ignoredSheets, changes: [] },
          ingestStage: "typed",
          ingestFinishedAt: new Date(),
        },
      });
      return r.count > 0;
    },

    async commit(versionId, d) {
      const present = new Set(d.present);
      const r = await prisma.$transaction(
        (tx) =>
          commitPeriodInTx(tx, {
            versionId,
            from: "INGESTING",
            snapshot: d.snapshot,
            facts: d.facts,
            sha256: d.sha256,
            meta: { ignoredSheets: d.facts.ignoredSheets, changes: d.changes },
            include: [],
            mode: { kind: "auto", allowAuto: d.allowAuto },
            present,
            limits: limits(),
          }),
        { timeout: FINISH_TX_TIMEOUT_MS },
      );
      switch (r.outcome) {
        case "activated":
          return { outcome: "activated", plan: r.plan };
        case "awaiting":
          return { outcome: "awaiting", plan: r.plan };
        case "rejected":
          return { outcome: "rejected", message: r.message };
        case "stale":
        case "plan_stale":
        case "blocked":
        case "preview":
        case "retry":
          return { outcome: "stale" };
        case "gone":
          return { outcome: "gone" };
      }
    },

    async fail(versionId, message) {
      return prismaIngestRepo.fail(versionId, message);
    },
  };
}

/** Hasil transaksi commit → hasil untuk worker (galat sementara/basi = "stale"). */
function resultOf(r: Awaited<ReturnType<typeof commitPeriodInTx>>): PeriodCommitResult {
  switch (r.outcome) {
    case "activated":
      return { outcome: "activated", plan: r.plan };
    case "awaiting":
      return { outcome: "awaiting", plan: r.plan };
    case "rejected":
      return { outcome: "rejected", message: r.message };
    case "gone":
      return { outcome: "gone" };
    default:
      return { outcome: "stale" };
  }
}

/**
 * Pemetaan unggahan periode (T-057). Tulisan segmen sama dengan ingest periode; penghapusan segmen
 * percobaan hanya selama versi masih AWAITING_MAPPING (commit belum masuk), di bawah lock baris versi.
 */
export function prismaPeriodMappingRepo(limits: () => PeriodLimits): PeriodMappingRepo {
  const ingest = prismaPeriodIngestRepo(limits);
  return {
    load: (versionId) => ingest.load(versionId),
    allocateRows: (lineageId, span) => ingest.allocateRows(lineageId, span),
    createSegment: (versionId, d) => ingest.createSegment(versionId, d),
    addTyped: (segmentId, t) => ingest.addTyped(segmentId, t),
    recordCleanup: (prefix, reason) => ingest.recordCleanup(prefix, reason),

    async rawSheets(versionId) {
      const v = await prisma.datasetVersion.findUnique({
        where: { id: versionId },
        select: {
          sha256: true,
          periodMeta: true,
          sheets: {
            orderBy: { index: "asc" },
            select: {
              id: true,
              index: true,
              name: true,
              aliasName: true,
              lineageId: true,
              rawKey: true,
              rawRows: true,
              colCount: true,
              headerRow: true,
              columns: true,
              truncatedCells: true,
              preview: true,
            },
          },
        },
      });
      if (!v) return null;
      return {
        sha256: v.sha256 ?? "",
        ignoredSheets: parsePeriodMeta(v.periodMeta)?.ignoredSheets ?? [],
        sheets: v.sheets.map((s) => ({
          ...s,
          columns: (s.columns as unknown as ColumnMeta[] | null) ?? [],
          preview: parsePreview(s.preview) ?? { rows: [], colCount: 0 },
        })),
      };
    },

    async deletePeriodSegments(versionId) {
      return prisma.$transaction(async (tx) => {
        const [v] = await tx.$queryRaw<{ status: string }[]>`
          SELECT status::text AS status FROM "DatasetVersion" WHERE id = ${versionId} FOR UPDATE`;
        if (v?.status !== "AWAITING_MAPPING") return [];
        const rows = await tx.segment.findMany({
          where: { createdByVersionId: versionId, periodKey: { not: null } },
          select: { id: true },
        });
        if (rows.length) {
          await tx.segment.deleteMany({ where: { id: { in: rows.map((r) => r.id) } } });
        }
        return rows.map((r) => r.id);
      });
    },

    async commit(versionId, d) {
      const present = new Set(d.present);
      const r = await prisma.$transaction(
        (tx) =>
          commitPeriodInTx(tx, {
            versionId,
            from: "AWAITING_MAPPING",
            snapshot: d.snapshot,
            facts: d.facts,
            meta: { ignoredSheets: d.facts.ignoredSheets, changes: d.changes },
            include: [],
            mode: { kind: "auto", allowAuto: d.allowAuto },
            present,
            limits: limits(),
            mapAudit: d.audit,
          }),
        { timeout: FINISH_TX_TIMEOUT_MS },
      );
      return resultOf(r);
    },

    async dropRawSegments(versionId) {
      // Raw saja dari ingest (tanpa periode, tanpa file typed) yang tidak dirujuk sheet versi mana pun.
      const rows = await prisma.segment.findMany({
        where: { createdByVersionId: versionId, periodKey: null, typed: { none: {} } },
        select: { id: true, rawKey: true },
      });
      const out: string[] = [];
      for (const g of rows) {
        const used = await prisma.sheet.count({ where: { rawKey: g.rawKey } });
        if (used) continue;
        await prisma.segment.deleteMany({ where: { id: g.id } });
        out.push(g.id);
      }
      return out;
    },
  };
}
