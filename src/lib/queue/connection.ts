import "server-only";
import { Queue } from "bullmq";
import Redis from "ioredis";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";

export const INGEST_QUEUE = "ingest";

export interface IngestJobData {
  versionId: string;
}

const globalForQueue = globalThis as unknown as { ingestQueue?: Queue<IngestJobData> };

/**
 * Antrean ingest (produsen). Koneksi Redis terpisah dari cache/rate limit (BullMQ memakai perintah
 * blocking di sisi worker; produsen cukup koneksi biasa yang gagal cepat).
 * jobId = versionId → enqueue idempoten; worker (T-006) memproses 1 job per proses.
 */
export function ingestQueue(): Queue<IngestJobData> {
  if (!globalForQueue.ingestQueue) {
    const connection = new Redis(env().REDIS_URL, {
      maxRetriesPerRequest: 2,
      // Produsen gagal cepat saat Redis mati (BullMQ tetap menunggu koneksi awal siap).
      enableOfflineQueue: false,
      retryStrategy: (times) => (times > 20 ? null : Math.min(200 * times, 5000)),
    });
    connection.on("error", (e: Error) => logger.warn({ err: e.message }, "redis antrean error"));
    globalForQueue.ingestQueue = new Queue<IngestJobData>(INGEST_QUEUE, {
      connection,
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: "exponential", delay: 30_000 },
        removeOnComplete: { count: 1000 },
        removeOnFail: { count: 5000 },
      },
    });
  }
  return globalForQueue.ingestQueue;
}
