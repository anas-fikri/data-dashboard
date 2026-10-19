import "server-only";
import { Prisma } from "@prisma/client";
import { recordAudit } from "@/features/audit/service";
import { activateVersionInTx } from "@/features/versions/activation";
import { prisma } from "@/lib/db";
import { prismaManifest } from "@/features/versions/integrity";
import { deleteObject, deletePrefix, objectExists } from "@/lib/storage/objects";
import { downloadToFile, uploadFile } from "@/lib/storage/files";
import { lockActiveSheet } from "./active-lock";
import { parsePreview } from "./preview";
import type { ColumnMeta } from "./header";
import type { ColumnSchema } from "./infer";
import { DatasetGoneError, type FinishOutcome, type IngestRepo, type TypedStorage } from "./ingest";
import type { MappingRepo } from "./mapping";
import type { RecastRepo } from "./recast";
import { sameSnapshot, type ActiveSnapshot } from "./refresh";

/**
 * Aktivasi (persist spec widget semua dashboard + retensi) berjalan di dalam transaksi finish; batas
 * bawaan Prisma 5 detik terlalu ketat untuk dataset dengan banyak dashboard.
 */
const FINISH_TX_TIMEOUT_MS = 30_000;

/** Versi aktif dataset beserta skema sheet-nya (acuan cast versi refresh dan pemetaan). */
const activeSelect = {
  select: {
    activeVersion: {
      select: {
        id: true,
        sheets: {
          orderBy: { index: "asc" as const },
          select: {
            id: true,
            name: true,
            aliasName: true,
            index: true,
            headerRow: true,
            schemaRevision: true,
            schema: true,
            lineageId: true,
          },
        },
      },
    },
  },
};

type ActiveRow = {
  id: string;
  sheets: {
    id: string;
    name: string;
    aliasName: string | null;
    index: number;
    headerRow: number;
    schemaRevision: number;
    schema: unknown;
    lineageId: string;
  }[];
} | null;

/** Manifest REPLACE (ADR-0008): satu segmen per sheet di ordinal 0. */
const MANIFEST_ORDINAL = 0;

/**
 * File typed baru sheet (ingest, recast, pemetaan) → SegmentTyped baru untuk segmen sheet itu, dan
 * manifest ordinal 0 diarahkan ke sana, di transaksi yang sama dengan pointer typedKey. Sheet tanpa
 * segmen (migrasi T-036 tidak jalan) → galat, tidak diam-diam tanpa manifest.
 */
async function linkTyped(
  tx: Prisma.TransactionClient,
  sheetId: string,
  typed: {
    typedKey: string;
    schemaRevision: number;
    schema: Pick<ColumnSchema, "pos">[];
    headerRow?: number;
    /** Baris data file (dihitung dari raw saat ditulis, T-038). */
    dataRows?: number;
  },
  segmentId?: string,
): Promise<void> {
  const where = { sheetId_ordinal: { sheetId, ordinal: MANIFEST_ORDINAL } };
  const seg =
    segmentId ??
    (
      await tx.sheetSegment.findUnique({
        where,
        select: { segmentTyped: { select: { segmentId: true } } },
      })
    )?.segmentTyped.segmentId;
  if (!seg) throw new Error(`sheet ${sheetId} tanpa segmen (migrasi T-036?)`);
  // Baris header dipilih ulang (recast/pemetaan): metadata segmen ikut, seperti Sheet.headerRow.
  if (typed.headerRow !== undefined) {
    await tx.segment.update({ where: { id: seg }, data: { headerRow: typed.headerRow } });
  }
  const t = await tx.segmentTyped.create({
    data: {
      segmentId: seg,
      typedKey: typed.typedKey,
      schemaRevision: typed.schemaRevision,
      // Posisi c<pos> di file (T-037): typed memuat semua kolom skema, termasuk kolom kosong.
      columns: [...new Set(typed.schema.map((c) => c.pos))].sort((a, b) => a - b),
      ...(typed.dataRows !== undefined ? { dataRows: typed.dataRows } : {}),
    },
    select: { id: true },
  });
  await tx.sheetSegment.upsert({
    where,
    create: { sheetId, segmentTypedId: t.id, ordinal: MANIFEST_ORDINAL },
    update: { segmentTypedId: t.id },
  });
}

/** Segmen manifest sheet (ordinal 0): id + awal `_row`; null = sheet tanpa segmen. */
const manifestSelect = {
  where: { ordinal: MANIFEST_ORDINAL },
  select: { segmentTyped: { select: { segment: { select: { id: true, rowBase: true } } } } },
} as const;

const gone = (e: unknown) =>
  e instanceof Prisma.PrismaClientKnownRequestError && (e.code === "P2003" || e.code === "P2025");

/** Snapshot versi aktif selain `versionId` (versi itu sendiri bukan acuan). */
const snapshotOf = (a: ActiveRow, versionId: string): ActiveSnapshot | null =>
  a && a.id !== versionId
    ? {
        versionId: a.id,
        sheets: a.sheets.map((s) => ({
          ...s,
          schema: (s.schema as ColumnSchema[] | null) ?? [],
        })),
      }
    : null;

/** Implementasi Prisma untuk ingest (worker). Semua update dijaga status agar idempoten. */
export const prismaIngestRepo: IngestRepo = {
  async load(versionId) {
    const v = await prisma.datasetVersion.findUnique({
      where: { id: versionId },
      select: { datasetId: true, sourceKey: true, dataset: activeSelect },
    });
    if (!v?.sourceKey) return null;
    return {
      datasetId: v.datasetId,
      sourceKey: v.sourceKey,
      active: snapshotOf(v.dataset.activeVersion, versionId),
    };
  },

  async begin(versionId) {
    const r = await prisma.datasetVersion.updateMany({
      where: { id: versionId, status: { in: ["UPLOADED", "INGESTING"] } },
      data: {
        status: "INGESTING",
        ingestStartedAt: new Date(),
        ingestStage: null,
        progress: Prisma.DbNull,
        errorMessage: null,
      },
    });
    return r.count > 0;
  },

  async exists(versionId) {
    return (await prisma.datasetVersion.count({ where: { id: versionId } })) > 0;
  },

  async progress(versionId, p) {
    await prisma.datasetVersion.updateMany({
      where: { id: versionId, status: "INGESTING" },
      data: { progress: { ...p, at: new Date().toISOString() } },
    });
  },

  async deleteSheets(versionId) {
    const segments = await prisma.segment.findMany({
      where: { createdByVersionId: versionId },
      select: { id: true },
    });
    // Sheet dulu (manifest ikut terhapus), lalu segmen percobaan ini (file typed-nya ikut cascade).
    await prisma.sheet.deleteMany({ where: { versionId } });
    await prisma.segment.deleteMany({ where: { id: { in: segments.map((s) => s.id) } } });
    return segments.map((s) => s.id);
  },

  async createLineage(versionId) {
    const v = await prisma.datasetVersion.findUnique({
      where: { id: versionId },
      select: { datasetId: true },
    });
    if (!v) throw new DatasetGoneError();
    try {
      const l = await prisma.sheetLineage.create({
        data: { datasetId: v.datasetId },
        select: { id: true },
      });
      return l.id;
    } catch (e) {
      if (gone(e)) throw new DatasetGoneError();
      throw e;
    }
  },

  async allocateRows(lineageId, span) {
    const n = BigInt(Math.max(0, Math.trunc(span)));
    try {
      // UPDATE … SET rowHighWater = rowHighWater + n RETURNING: atomik terhadap ingest lain.
      const l = await prisma.sheetLineage.update({
        where: { id: lineageId },
        data: { rowHighWater: { increment: n } },
        select: { rowHighWater: true },
      });
      return l.rowHighWater - n;
    } catch (e) {
      if (gone(e)) throw new DatasetGoneError();
      throw e;
    }
  },

  async createSegment(versionId, d) {
    const v = await prisma.datasetVersion.findUnique({
      where: { id: versionId },
      select: { datasetId: true },
    });
    if (!v) throw new DatasetGoneError();
    try {
      const g = await prisma.segment.create({
        data: {
          id: d.id,
          datasetId: v.datasetId,
          lineageId: d.lineageId,
          rowBase: d.rowBase,
          maxSrcRow: d.maxSrcRow,
          rawKey: d.rawKey,
          rawRows: d.rawRows,
          headerRow: d.headerRow,
          colCount: d.colCount,
          createdByVersionId: versionId,
        },
        select: { id: true },
      });
      return g.id;
    } catch (e) {
      if (gone(e)) throw new DatasetGoneError();
      throw e;
    }
  },

  async createSheet(versionId, s, lineageId) {
    try {
      const row = await prisma.sheet.create({
        data: {
          versionId,
          lineageId,
          index: s.index,
          name: s.name,
          rawKey: "",
          rawRows: s.rawRows,
          colCount: s.colCount,
          headerRow: s.headerRow,
          columns: s.columns as unknown as Prisma.InputJsonValue,
          truncatedCells: s.truncatedCells,
          preview: s.preview as unknown as Prisma.InputJsonValue,
          aliasName: s.aliasName ?? null,
        },
        select: { id: true },
      });
      return row.id;
    } catch (e) {
      // Versi sudah terhapus (dataset dihapus) → foreign key gagal.
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2003") {
        throw new DatasetGoneError();
      }
      throw e;
    }
  },

  async setSheetKey(sheetId, rawKey) {
    const r = await prisma.sheet.updateMany({ where: { id: sheetId }, data: { rawKey } });
    if (r.count === 0) throw new DatasetGoneError();
  },

  async setTyped(sheetId, d) {
    try {
      await prisma.$transaction(async (tx) => {
        const r = await tx.sheet.updateMany({
          where: { id: sheetId },
          data: {
            typedKey: d.typedKey,
            schema: d.schema as unknown as Prisma.InputJsonValue,
            schemaRevision: d.schemaRevision,
          },
        });
        if (r.count === 0) throw new DatasetGoneError();
        await linkTyped(tx, sheetId, d, d.segmentId);
      });
    } catch (e) {
      if (gone(e)) throw new DatasetGoneError();
      throw e;
    }
  },

  manifest: (versionId) => prismaManifest(versionId),

  async finish(versionId, d) {
    return prisma.$transaction(
      async (tx): Promise<FinishOutcome> => {
        // Kunci baris Dataset lebih dulu, urutan yang sama dengan hapus dataset (Dataset → versi lewat
        // cascade); urutan terbalik bisa deadlock bila keduanya berjalan bersamaan.
        const owner = await tx.datasetVersion.findUnique({
          where: { id: versionId },
          select: { datasetId: true },
        });
        if (!owner) return "gone";
        const [ds] = await tx.$queryRaw<{ activeVersionId: string | null }[]>`
          SELECT "activeVersionId" FROM "Dataset" WHERE id = ${owner.datasetId} FOR UPDATE`;
        if (!ds) return "gone";
        // Koreksi skema yang commit sebelum lock ini (recast/metadata memegang FOR SHARE baris yang
        // sama) atau versi aktif lain → cast diulang dengan acuan baru, tidak ada yang hilang.
        const sheets = ds.activeVersionId
          ? await tx.sheet.findMany({
              where: { versionId: ds.activeVersionId },
              select: { id: true, schemaRevision: true },
            })
          : [];
        if (!sameSnapshot(d.snapshot, { activeVersionId: ds.activeVersionId, sheets })) {
          return "stale";
        }
        const done = { ingestStage: "typed", sha256: d.sha256, ingestFinishedAt: new Date() };
        const r = await tx.datasetVersion.updateMany({
          where: { id: versionId, status: "INGESTING" },
          data: d.verdict.ok
            ? { ...done, status: "READY", errorMessage: null }
            : { ...done, status: "AWAITING_MAPPING", errorMessage: d.verdict.reason },
        });
        if (r.count === 0) return "gone";
        if (!d.verdict.ok) return "awaiting";
        // Worker: tidak ada cache Parquet lokal yang perlu dilupakan (deletedTypedKeys diabaikan).
        await activateVersionInTx(tx, owner.datasetId, versionId, { sheetMap: d.sheetMap });
        return "activated";
      },
      { timeout: FINISH_TX_TIMEOUT_MS },
    );
  },

  async recordCleanup(prefix, reason) {
    await prisma.storageCleanup.create({ data: { prefix, reason: reason.slice(0, 500) } });
  },

  async fail(versionId, message) {
    await prisma.datasetVersion.updateMany({
      where: { id: versionId, status: { in: ["UPLOADED", "INGESTING"] } },
      data: { status: "FAILED", errorMessage: message, ingestFinishedAt: new Date() },
    });
  },
};

export const s3IngestStorage: TypedStorage = {
  download: downloadToFile,
  upload: uploadFile,
  deletePrefix,
  deleteObject,
  exists: (key) => objectExists(key),
};

export const prismaRecastRepo: RecastRepo = {
  async loadSheet(sheetId) {
    const s = await prisma.sheet.findUnique({
      where: { id: sheetId },
      select: {
        versionId: true,
        rawKey: true,
        typedKey: true,
        schemaRevision: true,
        headerRow: true,
        colCount: true,
        columns: true,
        schema: true,
        version: { select: { sourceKey: true, status: true } },
        segments: manifestSelect,
      },
    });
    if (!s?.rawKey) return null;
    return {
      rowBase: s.segments[0]?.segmentTyped.segment.rowBase ?? 0n,
      versionId: s.versionId,
      versionStatus: s.version.status,
      rawKey: s.rawKey,
      typedKey: s.typedKey,
      schemaRevision: s.schemaRevision,
      headerRow: s.headerRow,
      colCount: s.colCount,
      columns: s.columns as unknown as ColumnMeta[],
      schema: (s.schema as unknown as ColumnSchema[] | null) ?? null,
      source: s.version.sourceKey?.endsWith(".csv") ? "csv" : "xlsx",
    };
  },

  async swapTyped(sheetId, expectedRevision, next) {
    return prisma.$transaction(async (tx) => {
      if (!(await lockActiveSheet(tx, sheetId))) return false;
      const r = await tx.sheet.updateMany({
        where: { id: sheetId, schemaRevision: expectedRevision },
        data: {
          typedKey: next.typedKey,
          schema: next.schema as unknown as Prisma.InputJsonValue,
          schemaRevision: next.schemaRevision,
          headerRow: next.headerRow,
          columns: next.columns as unknown as Prisma.InputJsonValue,
        },
      });
      if (r.count === 0) return false;
      await linkTyped(tx, sheetId, next);
      return true;
    });
  },
};

/** Id job pemetaan yang meng-commit versi ini (meta AuditLog dataset.version.map), atau null. */
async function mappedBy(datasetId: string, versionId: string): Promise<string | null> {
  const log = await prisma.auditLog.findFirst({
    where: {
      action: "dataset.version.map",
      targetType: "dataset",
      targetId: datasetId,
      meta: { path: ["versionId"], equals: versionId },
    },
    orderBy: { at: "desc" },
    select: { meta: true },
  });
  const jobId = (log?.meta as { jobId?: unknown } | null)?.jobId;
  return typeof jobId === "string" ? jobId : null;
}

/** Commit pemetaan dibatalkan di tengah transaksi (sheet berubah/hilang): semua tulisan di-rollback. */
class MappingAbort extends Error {
  constructor() {
    super("sheet versi berubah saat commit pemetaan");
    this.name = "MappingAbort";
  }
}

export const prismaMappingRepo: MappingRepo = {
  allocateRows: (lineageId, span) => prismaIngestRepo.allocateRows(lineageId, span),

  async fail(versionId, message) {
    await prisma.datasetVersion.updateMany({
      where: { id: versionId, status: "AWAITING_MAPPING" },
      data: { status: "FAILED", errorMessage: message },
    });
  },

  async load(versionId) {
    const v = await prisma.datasetVersion.findUnique({
      where: { id: versionId },
      select: {
        datasetId: true,
        status: true,
        sourceKey: true,
        sheets: {
          orderBy: { index: "asc" },
          select: {
            id: true,
            name: true,
            index: true,
            colCount: true,
            headerRow: true,
            columns: true,
            preview: true,
            rawKey: true,
            typedKey: true,
            schemaRevision: true,
            lineageId: true,
            segments: manifestSelect,
          },
        },
        dataset: activeSelect,
      },
    });
    if (!v) return null;
    return {
      datasetId: v.datasetId,
      status: v.status,
      source: v.sourceKey?.endsWith(".csv") ? "csv" : "xlsx",
      sheets: v.sheets.map(({ segments, ...s }) => ({
        ...s,
        columns: s.columns as unknown as ColumnMeta[],
        preview: parsePreview(s.preview),
        segment: segments[0]?.segmentTyped.segment ?? null,
      })),
      active: snapshotOf(v.dataset.activeVersion, versionId),
      mappedBy: v.status === "READY" ? await mappedBy(v.datasetId, versionId) : null,
    };
  },

  async alive(versionId) {
    const n = await prisma.datasetVersion.count({
      where: { id: versionId, status: "AWAITING_MAPPING" },
    });
    return n > 0;
  },

  async commit(versionId, d) {
    try {
      return await prisma.$transaction(
        async (tx) => {
          const v = await tx.datasetVersion.findUnique({
            where: { id: versionId },
            select: { datasetId: true, originalName: true },
          });
          if (!v) return "gone" as const;
          // Urutan kunci sama dengan finish/hapus dataset: Dataset lebih dulu.
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
            where: { id: versionId, status: "AWAITING_MAPPING" },
            data: { status: "READY", errorMessage: null },
          });
          if (r.count === 0) return "gone" as const;
          for (const s of d.sheets) {
            const u = await tx.sheet.updateMany({
              where: { id: s.id, versionId, schemaRevision: s.expectedRevision },
              data: {
                typedKey: s.typedKey,
                schema: s.schema as unknown as Prisma.InputJsonValue,
                schemaRevision: s.schemaRevision,
                headerRow: s.headerRow,
                columns: s.columns as unknown as Prisma.InputJsonValue,
                // Sheet ganti nama yang dipasangkan user: widget/rollback/refresh tetap menemukannya.
                ...(s.aliasName !== undefined ? { aliasName: s.aliasName } : {}),
                // Sheet logis aktif yang dipasangkan (ADR-0008): lineage-nya dibawa.
                ...(s.lineage ? { lineageId: s.lineage.lineageId } : {}),
              },
            });
            if (u.count === 0) throw new MappingAbort();
            if (s.lineage) {
              await tx.segment.update({
                where: { id: s.lineage.segmentId },
                data: {
                  lineageId: s.lineage.lineageId,
                  rowBase: s.lineage.rowBase,
                  maxSrcRow: s.lineage.maxSrcRow,
                },
              });
            }
            await linkTyped(tx, s.id, s);
          }
          // Worker: tidak ada cache Parquet lokal yang perlu dilupakan (deletedTypedKeys diabaikan).
          await activateVersionInTx(tx, v.datasetId, versionId, { sheetMap: d.sheetMap });
          await recordAudit(tx, {
            actorId: d.actorId,
            action: "dataset.version.map",
            targetType: "dataset",
            targetId: v.datasetId,
            meta: {
              from: ds.activeVersionId,
              versionId,
              fileName: v.originalName,
              ...d.meta,
            },
            ip: d.ip,
          });
          return "done" as const;
        },
        { timeout: FINISH_TX_TIMEOUT_MS },
      );
    } catch (e) {
      if (e instanceof MappingAbort) return "stale";
      throw e;
    }
  },
};
