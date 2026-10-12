import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { deletePrefix } from "@/lib/storage/objects";
import { downloadToFile, uploadFile } from "@/lib/storage/files";
import type { ColumnMeta } from "./header";
import type { ColumnSchema } from "./infer";
import { DatasetGoneError, type IngestRepo, type IngestStorage } from "./ingest";
import type { RecastRepo } from "./recast";

/** Implementasi Prisma untuk ingest (worker). Semua update dijaga status agar idempoten. */
export const prismaIngestRepo: IngestRepo = {
  async load(versionId) {
    const v = await prisma.datasetVersion.findUnique({
      where: { id: versionId },
      select: { datasetId: true, sourceKey: true },
    });
    return v?.sourceKey ? { datasetId: v.datasetId, sourceKey: v.sourceKey } : null;
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
    await prisma.sheet.deleteMany({ where: { versionId } });
  },

  async createSheet(versionId, s) {
    try {
      const row = await prisma.sheet.create({
        data: {
          versionId,
          index: s.index,
          name: s.name,
          rawKey: "",
          rawRows: s.rawRows,
          colCount: s.colCount,
          headerRow: s.headerRow,
          columns: s.columns as unknown as Prisma.InputJsonValue,
          truncatedCells: s.truncatedCells,
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
    const r = await prisma.sheet.updateMany({
      where: { id: sheetId },
      data: {
        typedKey: d.typedKey,
        schema: d.schema as unknown as Prisma.InputJsonValue,
        schemaRevision: d.schemaRevision,
      },
    });
    if (r.count === 0) throw new DatasetGoneError();
  },

  async finish(versionId, d) {
    return prisma.$transaction(async (tx) => {
      // Kunci baris Dataset lebih dulu, urutan yang sama dengan hapus dataset (Dataset → versi lewat
      // cascade); urutan terbalik bisa deadlock bila keduanya berjalan bersamaan.
      const owner = await tx.datasetVersion.findUnique({
        where: { id: versionId },
        select: { datasetId: true },
      });
      if (!owner) return false;
      await tx.$queryRaw`SELECT id FROM "Dataset" WHERE id = ${owner.datasetId} FOR UPDATE`;
      const r = await tx.datasetVersion.updateMany({
        where: { id: versionId, status: "INGESTING" },
        data: {
          status: "READY",
          ingestStage: "typed",
          sha256: d.sha256,
          ingestFinishedAt: new Date(),
          errorMessage: null,
        },
      });
      if (r.count === 0) return false;
      await tx.dataset.update({
        where: { id: owner.datasetId },
        data: { activeVersionId: versionId },
      });
      return true;
    });
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

export const s3IngestStorage: IngestStorage = {
  download: downloadToFile,
  upload: uploadFile,
  deletePrefix,
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
      },
    });
    if (!s?.rawKey) return null;
    return {
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
    const r = await prisma.sheet.updateMany({
      where: { id: sheetId, schemaRevision: expectedRevision },
      data: {
        typedKey: next.typedKey,
        schema: next.schema as unknown as Prisma.InputJsonValue,
        schemaRevision: next.schemaRevision,
        headerRow: next.headerRow,
        columns: next.columns as unknown as Prisma.InputJsonValue,
      },
    });
    return r.count > 0;
  },
};
