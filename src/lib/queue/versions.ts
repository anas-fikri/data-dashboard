import "server-only";
import { randomBytes } from "node:crypto";
import type { MappingOutcome } from "@/features/ingest/mapping-input";
import type { RecastInput } from "@/features/ingest/recast";
import { redisLockStore, releaseLock } from "@/lib/lock";
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
 * BullMQ seperti indeks recast (schema/runtime.ts). TTL > deadline job 60 menit + tunda "busy".
 */
const MAPPING_INDEX_TTL_MS = 3 * 60 * 60 * 1000;
const mappingKey = (versionId: string) => `mapping:${versionId}`;
const LIVE = new Set(["waiting", "prioritized", "waiting-children", "active", "delayed"]);

/** Id job pemetaan versi yang masih antre/berjalan, atau null (entri basi dibuang). */
export async function mappingInFlight(versionId: string): Promise<string | null> {
  const r = await redisReady();
  const jobId = await r.get(mappingKey(versionId));
  if (!jobId) return null;
  const state = await withQueueTimeout(mappingQueue().getJobState(jobId), "cek antrean pemetaan");
  if (LIVE.has(state)) return jobId;
  await releaseLock(redisLockStore(r), mappingKey(versionId), jobId).catch(() => false);
  return null;
}

/**
 * Masukkan pemetaan versi ke antrean recast (job "map-version"). null = pemetaan lain untuk versi ini
 * masih berjalan (BUSY). Id job dicatat di indeks (SET NX) SEBELUM masuk antrean: dua kiriman bersamaan
 * tidak sama-sama lolos; add yang tidak pernah sampai terbaca "unknown" dan dibuang dari indeks.
 */
export async function enqueueMapping(data: MappingJobData): Promise<string | null> {
  if (await mappingInFlight(data.versionId)) return null;
  const jobId = `mp_${randomBytes(12).toString("hex")}`;
  const r = await redisReady();
  const set = await r.set(mappingKey(data.versionId), jobId, "PX", MAPPING_INDEX_TTL_MS, "NX");
  if (set !== "OK") return null;
  await withQueueTimeout(mappingQueue().add(MAP_VERSION_JOB, data, { jobId }), "enqueue pemetaan");
  logger.info({ versionId: data.versionId, jobId }, "job pemetaan masuk antrean");
  return jobId;
}

/** Job pemetaan (polling status); null = tidak ada atau bukan job pemetaan. */
export async function mappingJob(jobId: string): Promise<{
  versionId: string;
  /** State BullMQ mentah (waiting/delayed/active/completed/failed/…). */
  state: string;
  result: MappingOutcome | null;
} | null> {
  const job = await withQueueTimeout(mappingQueue().getJob(jobId), "status pemetaan");
  if (!job || job.name !== MAP_VERSION_JOB) return null;
  const state = await withQueueTimeout(job.getState(), "status pemetaan");
  return {
    versionId: job.data.versionId,
    state,
    result: (job.returnvalue as MappingOutcome | null | undefined) ?? null,
  };
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
