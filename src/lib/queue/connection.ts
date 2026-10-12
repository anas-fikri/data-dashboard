import "server-only";
import { Queue } from "bullmq";
import Redis from "ioredis";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";

export const INGEST_QUEUE = "ingest";
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

const globalForQueue = globalThis as unknown as {
  ingestQueueHolder?: { queue: Queue<IngestJobData>; connection: Redis };
};

/**
 * Antrean ingest (produsen). Koneksi Redis terpisah dari cache/rate limit. Reconnect tanpa batas
 * (jeda ≤ 5 s) sehingga antrean pulih sendiri setelah Redis mati berapa lama pun (review T-004 #1);
 * bila koneksi tetap berakhir ("end"), antrean dibangun ulang pada pemakaian berikutnya.
 * jobId = versionId → enqueue idempoten; worker (T-006) memproses 1 job per proses.
 */
export function ingestQueue(): Queue<IngestJobData> {
  const cached = globalForQueue.ingestQueueHolder;
  if (cached && cached.connection.status !== "end") return cached.queue;
  if (cached) void cached.queue.close().catch(() => {});

  const connection = new Redis(env().REDIS_URL, {
    maxRetriesPerRequest: 2,
    // Produsen gagal cepat saat Redis mati (perintah tidak diantrekan offline).
    enableOfflineQueue: false,
    retryStrategy: (times) => Math.min(200 * times, 5000),
  });
  connection.on("error", (e: Error) => logger.warn({ err: e.message }, "redis antrean error"));
  const queue = new Queue<IngestJobData>(INGEST_QUEUE, {
    connection,
    defaultJobOptions: INGEST_JOB_OPTIONS,
  });
  globalForQueue.ingestQueueHolder = { queue, connection };
  return queue;
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
