import "server-only";
import { Queue } from "bullmq";
import Redis from "ioredis";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import type { RecastInput } from "@/features/ingest/recast";

export const INGEST_QUEUE = "ingest";
/** Recast typed.parquet per sheet (T-007; dipicu koreksi skema T-008). */
export const RECAST_QUEUE = "recast";
/** Batas waktu satu operasi antrean dari app (enqueue/batal) agar permintaan user tidak menggantung. */
export const QUEUE_OP_TIMEOUT_MS = 5_000;

export interface IngestJobData {
  versionId: string;
  /** Untuk membersihkan prefix Parquet walau versi sudah terhapus saat job diproses. */
  datasetId?: string;
}

/** Opsi job ingest — dipakai app (enqueue) dan worker (sapuan) agar sama. */
export const INGEST_JOB_OPTIONS = {
  attempts: 3,
  backoff: { type: "exponential" as const, delay: 30_000 },
  removeOnComplete: { count: 1000 },
  removeOnFail: { count: 5000 },
};

export interface RecastJobData {
  sheetId: string;
  input: RecastInput;
}

/**
 * Opsi job recast. "busy" (recast lain sedang memegang lock sheet) dilempar sebagai error agar
 * diulang, sehingga perubahan user tidak hilang.
 */
export const RECAST_JOB_OPTIONS = {
  attempts: 6,
  backoff: { type: "exponential" as const, delay: 10_000 },
  removeOnComplete: { count: 1000 },
  removeOnFail: { count: 5000 },
};

type Holder = { queue: Queue; connection: Redis };
const globalForQueue = globalThis as unknown as { queueHolders?: Map<string, Holder> };

/**
 * Antrean produsen (app). Koneksi Redis terpisah dari cache/rate limit. Reconnect tanpa batas
 * (jeda ≤ 5 s) sehingga antrean pulih sendiri setelah Redis mati berapa lama pun (review T-004 #1);
 * bila koneksi tetap berakhir ("end"), antrean dibangun ulang pada pemakaian berikutnya.
 */
function producerQueue<T>(name: string, defaultJobOptions: object): Queue<T> {
  const holders = (globalForQueue.queueHolders ??= new Map());
  const cached = holders.get(name);
  if (cached && cached.connection.status !== "end") return cached.queue as unknown as Queue<T>;
  if (cached) void cached.queue.close().catch(() => {});

  const connection = new Redis(env().REDIS_URL, {
    maxRetriesPerRequest: 2,
    // Produsen gagal cepat saat Redis mati (perintah tidak diantrekan offline).
    enableOfflineQueue: false,
    retryStrategy: (times) => Math.min(200 * times, 5000),
  });
  connection.on("error", (e: Error) => logger.warn({ err: e.message }, "redis antrean error"));
  const queue = new Queue(name, { connection, defaultJobOptions });
  holders.set(name, { queue, connection });
  return queue as unknown as Queue<T>;
}

/** Antrean ingest: jobId = versionId → enqueue idempoten; worker memproses 1 job per proses. */
export function ingestQueue(): Queue<IngestJobData> {
  return producerQueue<IngestJobData>(INGEST_QUEUE, INGEST_JOB_OPTIONS);
}

export function recastQueue(): Queue<RecastJobData> {
  return producerQueue<RecastJobData>(RECAST_QUEUE, RECAST_JOB_OPTIONS);
}

/** Jalankan operasi antrean dengan batas waktu; melempar bila lewat. */
export async function withQueueTimeout<T>(op: Promise<T>, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`${label}: antrean tidak merespons ${QUEUE_OP_TIMEOUT_MS} ms`)),
      QUEUE_OP_TIMEOUT_MS,
    );
  });
  try {
    return await Promise.race([op, timeout]);
  } finally {
    clearTimeout(timer);
  }
}
