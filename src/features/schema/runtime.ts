import "server-only";
import { Prisma } from "@prisma/client";
import { hit, release, RULES } from "@/features/auth/rate-limit";
import type { ColumnSchema } from "@/features/ingest/infer";
import type { IngestProgress } from "@/features/ingest/ingest";
import { parsePreview } from "@/features/ingest/preview";
import type { RecastOutcome } from "@/features/ingest/recast-input";
import { prisma } from "@/lib/db";
import { recastQueue, withQueueTimeout } from "@/lib/queue/connection";
import { enqueueRecast } from "@/lib/queue/versions";
import { redisReady } from "@/lib/redis";
import type { EditKind, RecastJobView, SchemaDeps, SchemaRepo } from "./service";

/* Perakitan produksi T-008: Prisma, antrean recast BullMQ, rate limit Redis. */

const schemaOf = (v: unknown) => (v as ColumnSchema[] | null) ?? null;

export const prismaSchemaRepo: SchemaRepo = {
  async latestVersion(userId, datasetId) {
    const ds = await prisma.dataset.findFirst({
      where: { id: datasetId, ownerId: userId },
      select: {
        versions: {
          // Unggahan yang belum selesai dikirim tidak punya status ingest.
          where: { status: { not: "UPLOADING" } },
          orderBy: { createdAt: "desc" },
          take: 1,
          select: {
            id: true,
            status: true,
            originalName: true,
            progress: true,
            errorMessage: true,
            sheets: {
              orderBy: { index: "asc" },
              select: { index: true, name: true, rawRows: true, typedKey: true },
            },
          },
        },
      },
    });
    if (!ds) return null;
    const v = ds.versions[0];
    if (!v) return "none";
    return {
      versionId: v.id,
      status: v.status,
      fileName: v.originalName,
      progress: (v.progress as unknown as IngestProgress | null) ?? null,
      sheets: v.sheets.map((s) => ({
        index: s.index,
        name: s.name,
        rawRows: s.rawRows,
        typed: s.typedKey !== null,
      })),
      errorMessage: v.errorMessage,
    };
  },

  async schemaView(userId, datasetId, sheetIndex) {
    // Tab cukup id/indeks/nama; skema dan pratinjau hanya untuk sheet yang dibuka (review T-008 M1:
    // 50 sheet × 2.048 kolom bisa ratusan MB bila semuanya dimuat tiap render).
    const ds = await prisma.dataset.findFirst({
      where: { id: datasetId, ownerId: userId },
      select: {
        id: true,
        name: true,
        activeVersion: {
          select: {
            id: true,
            originalName: true,
            sheets: { orderBy: { index: "asc" }, select: { id: true, index: true, name: true } },
          },
        },
      },
    });
    if (!ds) return null;
    const v = ds.activeVersion;
    const tabs = v?.sheets ?? [];
    const chosen = tabs.find((t) => t.index === sheetIndex) ?? tabs[0];
    const s = chosen
      ? await prisma.sheet.findFirst({
          where: { id: chosen.id, versionId: v!.id },
          select: {
            id: true,
            index: true,
            name: true,
            rawRows: true,
            colCount: true,
            headerRow: true,
            truncatedCells: true,
            schemaRevision: true,
            schema: true,
            preview: true,
          },
        })
      : null;
    return {
      datasetId: ds.id,
      datasetName: ds.name,
      version: v ? { id: v.id, fileName: v.originalName } : null,
      tabs,
      sheet: s ? { ...s, schema: schemaOf(s.schema), preview: parsePreview(s.preview) } : null,
    };
  },

  async ownedActiveSheet(userId, sheetId) {
    const s = await prisma.sheet.findFirst({
      // Hanya sheet di versi yang sedang aktif untuk dataset milik user.
      where: { id: sheetId, version: { activeFor: { is: { ownerId: userId } } } },
      select: {
        colCount: true,
        schemaRevision: true,
        headerRow: true,
        schema: true,
        version: { select: { status: true } },
      },
    });
    if (!s) return null;
    return {
      colCount: s.colCount,
      schemaRevision: s.schemaRevision,
      headerRow: s.headerRow,
      schema: schemaOf(s.schema),
      versionStatus: s.version.status,
    };
  },

  async ownsActiveSheet(userId, sheetId) {
    const n = await prisma.sheet.count({
      where: { id: sheetId, version: { activeFor: { is: { ownerId: userId } } } },
    });
    return n > 0;
  },

  async applyMetadata(sheetId, baseRevision, schema) {
    // Optimistik: hanya bila revisi belum berubah dan versi masih READY (recast yang sedang berjalan
    // untuk revisi yang sama akan basi saat menukar typed).
    const r = await prisma.sheet.updateMany({
      where: { id: sheetId, schemaRevision: baseRevision, version: { status: "READY" } },
      data: {
        schema: schema as unknown as Prisma.InputJsonValue,
        schemaRevision: baseRevision + 1,
      },
    });
    return r.count === 1 ? baseRevision + 1 : null;
  },
};

async function recastJob(jobId: string): Promise<RecastJobView | null> {
  const job = await withQueueTimeout(recastQueue().getJob(jobId), "status recast");
  if (!job) return null;
  const state = await withQueueTimeout(job.getState(), "status recast");
  const mapped: RecastJobView["state"] =
    state === "waiting" || state === "prioritized" || state === "waiting-children"
      ? "waiting"
      : state === "delayed" || state === "active" || state === "completed" || state === "failed"
        ? state
        : "unknown";
  return {
    sheetId: job.data.sheetId,
    state: mapped,
    result: (job.returnvalue as RecastOutcome | null | undefined) ?? null,
  };
}

/** Job recast belum selesai (antrean kecil: dibatasi per user dan per sheet). */
async function inFlight(userId: string, sheetId: string) {
  const jobs = await withQueueTimeout(
    recastQueue().getJobs(["waiting", "prioritized", "active", "delayed"], 0, 999),
    "cek antrean recast",
  );
  let user = 0;
  let sheet = false;
  for (const j of jobs) {
    if (!j) continue;
    if (j.data.userId === userId) user += 1;
    if (j.data.sheetId === sheetId) sheet = true;
  }
  return { user, sheet };
}

const ruleOf = (kind: EditKind) => (kind === "recast" ? RULES.recast : RULES.schemaEdit);

export const schemaDeps: SchemaDeps = {
  repo: prismaSchemaRepo,
  rateLimit: async (userId, kind) => hit(await redisReady(), ruleOf(kind), userId),
  releaseRateLimit: async (userId, kind) => release(await redisReady(), ruleOf(kind), userId),
  inFlight,
  enqueue: (sheetId, userId, input) => enqueueRecast(sheetId, input, userId),
  job: recastJob,
};
