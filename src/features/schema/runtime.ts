import "server-only";
import { randomBytes } from "node:crypto";
import { Prisma } from "@prisma/client";
import { hit, release, RULES } from "@/features/auth/rate-limit";
import type { ColumnSchema } from "@/features/ingest/infer";
import type { IngestProgress } from "@/features/ingest/ingest";
import { parsePreview } from "@/features/ingest/preview";
import type { RecastInput, RecastOutcome } from "@/features/ingest/recast-input";
import { prisma } from "@/lib/db";
import { acquireLock, redisLockStore, releaseLock } from "@/lib/lock";
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

/*
 * Indeks job recast yang belum selesai (review T-008 M2): set id job per user dan id job per sheet di
 * Redis, divalidasi malas dengan state BullMQ (getJobState tidak memuat payload job). Entri yang sudah
 * selesai/hilang dibuang saat dibaca; TTL 2 jam sebagai pengaman (recast ≤ 20 menit + tunda busy
 * ≤ 30 menit).
 */
const INDEX_TTL_MS = 2 * 60 * 60 * 1000;
const userKey = (userId: string) => `recast:inflight:u:${userId}`;
const sheetKey = (sheetId: string) => `recast:inflight:s:${sheetId}`;
const LIVE = new Set(["waiting", "prioritized", "waiting-children", "active", "delayed"]);

async function alive(jobId: string): Promise<boolean> {
  const state = await withQueueTimeout(recastQueue().getJobState(jobId), "cek antrean recast");
  return LIVE.has(state);
}

async function inFlight(userId: string, sheetId: string) {
  const r = await redisReady();
  const [ids, sheetJob] = await Promise.all([
    r.smembers(userKey(userId)),
    r.get(sheetKey(sheetId)),
  ]);
  // Paralel: waktu di bawah lock tetap pendek walau antrean lambat.
  const [states, sheet] = await Promise.all([
    Promise.all(ids.map(alive)),
    sheetJob ? alive(sheetJob) : Promise.resolve(false),
  ]);
  let user = 0;
  for (const [i, live] of states.entries()) {
    if (live) user += 1;
    else await r.srem(userKey(userId), ids[i]!);
  }
  if (sheetJob && !sheet) await releaseLock(redisLockStore(r), sheetKey(sheetId), sheetJob);
  return { user, sheet };
}

/**
 * Id job dibuat lebih dulu dan dicatat di indeks SEBELUM masuk antrean (review T-008 R1): add yang
 * selesai setelah batas waktu tetap terhitung; add yang tidak pernah sampai terbaca "unknown" dan
 * dibuang dari indeks pada pengecekan berikutnya.
 */
async function enqueue(sheetId: string, userId: string, input: RecastInput): Promise<string> {
  const jobId = `rc_${randomBytes(12).toString("hex")}`;
  const r = await redisReady();
  await r
    .multi()
    .sadd(userKey(userId), jobId)
    .pexpire(userKey(userId), INDEX_TTL_MS)
    .set(sheetKey(sheetId), jobId, "PX", INDEX_TTL_MS)
    .exec();
  return enqueueRecast(sheetId, input, userId, jobId);
}

/** Lock singkat per user di sekitar cek batas + enqueue (menunggu ≤ 3 s). */
async function serialize<T>(userId: string, fn: () => Promise<T>): Promise<T | null> {
  const store = redisLockStore(await redisReady());
  const key = `recast:enqueue-lock:${userId}`;
  const until = Date.now() + 3_000;
  let token: string | null = null;
  // TTL > cek (paralel, ≤ 5 s) + enqueue (≤ 5 s) + jeda Redis; lock tak pernah lepas di tengah jalan.
  while (!(token = await acquireLock(store, key, 30_000))) {
    if (Date.now() > until) return null;
    await new Promise((res) => setTimeout(res, 50));
  }
  try {
    return await fn();
  } finally {
    await releaseLock(store, key, token).catch(() => false);
  }
}

const ruleOf = (kind: EditKind) => (kind === "recast" ? RULES.recast : RULES.schemaEdit);

export const schemaDeps: SchemaDeps = {
  repo: prismaSchemaRepo,
  rateLimit: async (userId, kind) => hit(await redisReady(), ruleOf(kind), userId),
  releaseRateLimit: async (userId, kind) => release(await redisReady(), ruleOf(kind), userId),
  inFlight,
  serialize,
  enqueue,
  job: recastJob,
};
