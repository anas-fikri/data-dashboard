import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { deletePrefix } from "@/lib/storage/objects";
import { downloadToFile, uploadFile } from "@/lib/storage/files";
import { DatasetGoneError, type IngestRepo, type IngestStorage } from "./ingest";

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
      const v = await tx.datasetVersion.findUniqueOrThrow({
        where: { id: versionId },
        select: { datasetId: true },
      });
      await tx.dataset.update({ where: { id: v.datasetId }, data: { activeVersionId: versionId } });
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
