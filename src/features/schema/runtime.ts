import "server-only";
import { randomBytes } from "node:crypto";
import { Prisma } from "@prisma/client";
import { hit, release, RULES } from "@/features/auth/rate-limit";
import type { ColumnSchema } from "@/features/ingest/infer";
import type { IngestProgress } from "@/features/ingest/ingest";
import { sheetPeriod } from "@/features/ingest/period";
import { parsePreview } from "@/features/ingest/preview";
import {
  recastProgressOf,
  type RecastInput,
  type RecastOutcome,
} from "@/features/ingest/recast-input";
import { lockActiveSheet } from "@/features/ingest/active-lock";
import { prisma } from "@/lib/db";
import { acquireLock, redisLockStore, releaseLock } from "@/lib/lock";
import { recastQueue, withQueueTimeout } from "@/lib/queue/connection";
import {
  enqueueRecast,
  RECAST_SHEET_INDEX_TTL_MS,
  recastSheetKey,
  USER_INFLIGHT_TTL_MS,
} from "@/lib/queue/versions";
import { redisReady } from "@/lib/redis";
import type { EditKind, RecastJobView, SchemaDeps, SchemaRepo } from "./service";

/* Perakitan produksi T-008: Prisma, antrean recast BullMQ, rate limit Redis. */

const schemaOf = (v: unknown) => (v as ColumnSchema[] | null) ?? null;

/** Progres tersimpan; versi yang diproses sebelum T-013 belum punya `refresh`. */
const progressOf = (v: unknown): IngestProgress | null => {
  const p = v as IngestProgress | null;
  return p ? { ...p, refresh: p.refresh === true } : null;
};

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
            mode: true,
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
      progress: progressOf(v.progress),
      period: v.mode === "PERIOD",
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
        periodSource: true,
        periodColumn: true,
        version: { select: { status: true, periodGrain: true } },
      },
    });
    if (!s) return null;
    return {
      colCount: s.colCount,
      schemaRevision: s.schemaRevision,
      headerRow: s.headerRow,
      schema: schemaOf(s.schema),
      versionStatus: s.version.status,
      period: sheetPeriod(s.version.periodGrain, s.periodSource, s.periodColumn),
    };
  },

  async ownsActiveSheet(userId, sheetId) {
    const n = await prisma.sheet.count({
      where: { id: sheetId, version: { activeFor: { is: { ownerId: userId } } } },
    });
    return n > 0;
  },

  async applyMetadata(sheetId, baseRevision, schema) {
    // Optimistik: hanya bila revisi belum berubah dan versi sheet masih versi aktif READY (recast yang
    // sedang berjalan untuk revisi yang sama akan basi saat menukar typed; ingest refresh yang memakai
    // revisi lama akan basi saat finish, T-013).
    return prisma.$transaction(async (tx) => {
      if (!(await lockActiveSheet(tx, sheetId))) return null;
      const r = await tx.sheet.updateMany({
        where: { id: sheetId, schemaRevision: baseRevision, version: { status: "READY" } },
        data: {
          schema: schema as unknown as Prisma.InputJsonValue,
          schemaRevision: baseRevision + 1,
        },
      });
      return r.count === 1 ? baseRevision + 1 : null;
    });
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
    progress: recastProgressOf(job.progress),
  };
}

/*
 * Indeks job recast yang belum selesai (review T-008 M2): set id job per user dan id job per sheet di
 * Redis, divalidasi malas dengan state BullMQ (getJobState tidak memuat payload job). Entri yang sudah
 * selesai/hilang dibuang saat dibaca; TTL 2 jam sebagai pengaman, diperpanjang worker setiap segmen (T-040) (tunda busy
 * ≤ 30 menit). Set per user dipakai bersama job pemetaan (T-014): TTL-nya USER_INFLIGHT_TTL_MS.
 */
const INDEX_TTL_MS = RECAST_SHEET_INDEX_TTL_MS;
const userKey = (userId: string) => `recast:inflight:u:${userId}`;
const sheetKey = recastSheetKey;
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
 * Ada job recast/koreksi skema yang antre/berjalan untuk salah satu sheet ini (T-056 review L2): hapus/
 * pulihkan periode di tengah recast membuat recast basi dan perubahan tipe pemilik hilang diam-diam.
 * Entri basi dibuang seperti inFlight; galat Redis/antrean dilempar (pemanggil: fail-closed).
 */
export async function recastInFlightAny(sheetIds: string[]): Promise<boolean> {
  if (!sheetIds.length) return false;
  const r = await redisReady();
  const jobs = await Promise.all(sheetIds.map((id) => r.get(sheetKey(id))));
  const live = await Promise.all(jobs.map((j) => (j ? alive(j) : Promise.resolve(false))));
  for (const [i, j] of jobs.entries()) {
    if (j && !live[i]) await releaseLock(redisLockStore(r), sheetKey(sheetIds[i]!), j);
  }
  return live.some(Boolean);
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
    .pexpire(userKey(userId), USER_INFLIGHT_TTL_MS)
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
