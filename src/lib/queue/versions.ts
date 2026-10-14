import "server-only";
import { randomBytes } from "node:crypto";
import type Redis from "ioredis";
import type { RecastInput } from "@/features/ingest/recast";
import { acquireLock, redisLockStore, releaseLock } from "@/lib/lock";
import { logger } from "@/lib/logger";
import { redisReady } from "@/lib/redis";
import {
  ingestQueue,
  MAP_VERSION_JOB,
  mappingQueue,
  recastQueue,
  withQueueTimeout,
  type MappingJobData,
} from "./connection";

/** Masukkan versi ke antrean ingest. jobId = versionId sehingga enqueue ulang tidak menggandakan job. */
export async function enqueueIngest(versionId: string, datasetId?: string): Promise<void> {
  await withQueueTimeout(
    ingestQueue().add("ingest", { versionId, datasetId }, { jobId: versionId }),
    "enqueue ingest",
  );
  logger.info({ versionId }, "job ingest masuk antrean");
}

/**
 * Masukkan recast sheet ke antrean (T-008: simpan koreksi skema). Recast berurutan per sheet lewat
 * lock di worker; job yang mendapat "busy" diulang dengan backoff.
 */
export async function enqueueRecast(
  sheetId: string,
  input: RecastInput,
  userId?: string,
  /** Id job yang sudah dicatat pemanggil (indeks job berjalan T-008); kosong = id otomatis. */
  jobId?: string,
): Promise<string> {
  const job = await withQueueTimeout(
    recastQueue().add("recast", { sheetId, input, userId }, jobId ? { jobId } : undefined),
    "enqueue recast",
  );
  logger.info({ sheetId, jobId: job.id }, "job recast masuk antrean");
  return String(job.id);
}

/*
 * Indeks job pemetaan per versi (T-014): mapping:<versionId> → id job, divalidasi malas dengan state
 * BullMQ seperti indeks recast (schema/runtime.ts). TTL hanya pengaman: entri job yang selesai/hilang
 * dibuang saat dibaca, jadi job yang antre lama (worker mati/antrean panjang) tetap terhitung dan
 * kiriman kedua tetap ditolak.
 */
const MAPPING_INDEX_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const mappingKey = (versionId: string) => `mapping:${versionId}`;
const LIVE = new Set(["waiting", "prioritized", "waiting-children", "active", "delayed"]);
/*
 * Batas job berjalan per user di antrean recast (concurrency 1) bersama koreksi skema: kunci dan
 * aturan SAMA dengan schema/runtime.ts (set recast:inflight:u:<userId> + lock enqueue per user),
 * sehingga recast juga menghitung job pemetaan dan sebaliknya.
 */
const USER_TTL_MS = 3 * 60 * 60 * 1000;
const userKey = (userId: string) => `recast:inflight:u:${userId}`;
const enqueueLockKey = (userId: string) => `recast:enqueue-lock:${userId}`;

const live = async (jobId: string) =>
  LIVE.has(await withQueueTimeout(mappingQueue().getJobState(jobId), "cek antrean pemetaan"));

/** Id job pemetaan versi yang masih antre/berjalan, atau null (entri basi dibuang). */
export async function mappingInFlight(versionId: string): Promise<string | null> {
  const r = await redisReady();
  const jobId = await r.get(mappingKey(versionId));
  if (!jobId) return null;
  if (await live(jobId)) return jobId;
  await releaseLock(redisLockStore(r), mappingKey(versionId), jobId).catch(() => false);
  return null;
}

/** Job recast/pemetaan user yang masih antre/berjalan (entri basi dibuang). */
async function userInFlight(r: Redis, userId: string): Promise<number> {
  const ids = await r.smembers(userKey(userId));
  const states = await Promise.all(ids.map(live));
  let n = 0;
  for (const [i, ok] of states.entries()) {
    if (ok) n += 1;
    else await r.srem(userKey(userId), ids[i]!);
  }
  return n;
}

export type MappingEnqueue =
  | { ok: true; jobId: string }
  /** version: pemetaan lain versi ini masih berjalan; user: batas job per user; lock: kiriman lain. */
  | { ok: false; reason: "version" | "user" | "lock"; count?: number };

/**
 * Masukkan pemetaan versi ke antrean recast (job "map-version") di bawah lock enqueue per user (sama
 * dengan recast): versi ini belum punya job, lalu job berjalan user < `userCap`. Id job dicatat di
 * indeks versi (SET NX) dan set per user SEBELUM masuk antrean: dua kiriman bersamaan tidak sama-sama
 * lolos; add yang tidak pernah sampai terbaca "unknown" dan dibuang dari indeks. Hasil terakhir versi
 * (mapping-last) dihapus.
 */
export async function enqueueMapping(
  data: MappingJobData,
  userCap: number,
): Promise<MappingEnqueue> {
  const r = await redisReady();
  const store = redisLockStore(r);
  const until = Date.now() + 3_000;
  let token: string | null = null;
  while (!(token = await acquireLock(store, enqueueLockKey(data.actorId), 30_000))) {
    if (Date.now() > until) return { ok: false, reason: "lock" };
    await new Promise((res) => setTimeout(res, 50));
  }
  try {
    if (await mappingInFlight(data.versionId)) return { ok: false, reason: "version" };
    const count = await userInFlight(r, data.actorId);
    if (count >= userCap) return { ok: false, reason: "user", count };
    const jobId = `mp_${randomBytes(12).toString("hex")}`;
    const set = await r.set(mappingKey(data.versionId), jobId, "PX", MAPPING_INDEX_TTL_MS, "NX");
    if (set !== "OK") return { ok: false, reason: "version" };
    await r
      .multi()
      .sadd(userKey(data.actorId), jobId)
      .pexpire(userKey(data.actorId), USER_TTL_MS)
      .del(lastKey(data.versionId))
      .exec();
    await withQueueTimeout(
      mappingQueue().add(MAP_VERSION_JOB, data, { jobId }),
      "enqueue pemetaan",
    );
    logger.info({ versionId: data.versionId, jobId }, "job pemetaan masuk antrean");
    return { ok: true, jobId };
  } finally {
    await releaseLock(store, enqueueLockKey(data.actorId), token).catch(() => false);
  }
}

/*
 * Hasil terakhir job pemetaan versi yang bukan "done" (T-014): mapping-last:<versionId> → { jobId,
 * result } selama 24 jam, agar halaman (dan halaman dataset) tetap bisa menampilkan "review"/gagal/
 * basi setelah hasil job dibersihkan antrean. Dihapus saat kirim ulang dan saat done.
 */
const LAST_TTL_MS = 24 * 60 * 60 * 1000;
const lastKey = (versionId: string) => `mapping-last:${versionId}`;

export interface MappingLastRecord {
  jobId: string;
  /** job.returnvalue (MappingOutcome), atau { outcome: "failed" } untuk job yang gagal final. */
  result: unknown;
}

/** Worker: catat hasil akhir job (null = done → hapus). */
export async function recordMappingLast(
  r: Redis,
  versionId: string,
  record: MappingLastRecord | null,
): Promise<void> {
  if (record) await r.set(lastKey(versionId), JSON.stringify(record), "PX", LAST_TTL_MS);
  else await r.del(lastKey(versionId));
}

/** Hasil terakhir versi, atau null (tidak ada / rusak). */
export async function mappingLast(versionId: string): Promise<MappingLastRecord | null> {
  const raw = await (await redisReady()).get(lastKey(versionId));
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as Partial<MappingLastRecord>;
    return typeof v.jobId === "string" ? { jobId: v.jobId, result: v.result } : null;
  } catch {
    return null;
  }
}

/**
 * Batalkan job ingest untuk versi yang belum terminal. Job yang sedang dikerjakan (terkunci worker)
 * tidak bisa dihapus dari sini; worker memeriksa keberadaan versi/dataset di setiap batch (T-006)
 * sebagai pengaman kedua, sehingga kegagalan di sini hanya dicatat.
 */
export async function cancelVersionJobs(versionIds: string[]): Promise<void> {
  if (versionIds.length === 0) return;
  const q = ingestQueue();
  await Promise.all(
    versionIds.map(async (id) => {
      try {
        const job = await withQueueTimeout(q.getJob(id), "cari job");
        if (job) await withQueueTimeout(job.remove(), "hapus job");
      } catch (e) {
        logger.warn(
          { versionId: id, err: e instanceof Error ? e.message : String(e) },
          "job ingest tidak bisa dibatalkan (mungkin sedang berjalan atau Redis mati)",
        );
      }
    }),
  );
}
