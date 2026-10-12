import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { deletePrefix } from "@/lib/storage/objects";
import { downloadToFile, uploadFile } from "@/lib/storage/files";
import type { IngestRepo, IngestStorage } from "./ingest";

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
  },

  async setSheetKey(sheetId, rawKey) {
    await prisma.sheet.update({ where: { id: sheetId }, data: { rawKey } });
  },

  async finishRaw(versionId, d) {
    const r = await prisma.datasetVersion.updateMany({
      where: { id: versionId, status: "INGESTING" },
      data: { ingestStage: "raw", sha256: d.sha256 },
    });
    return r.count > 0;
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
