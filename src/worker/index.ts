/*
 * Proses worker terpisah dari app (flow-kerja B1). Saat ini: antrean "maintenance" dengan job
 * terjadwal. T-006 menambah processor antrean "ingest" (concurrency 1 per proses, D7).
 * Jalankan: npm run worker (tsx dengan kondisi react-server agar modul "server-only" bisa dimuat).
 */
import { Queue, Worker } from "bullmq";
import Redis from "ioredis";
import { expireStaleUploads } from "@/features/uploads/service";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";

const MAINTENANCE = "maintenance";
const EXPIRE_UPLOADS = "expire-stale-uploads";

/** Tandai semua unggahan > 24 jam sebagai FAILED (per batch 100 sampai habis). */
export async function runExpireStaleUploads(): Promise<number> {
  let total = 0;
  for (;;) {
    const n = await expireStaleUploads();
    total += n;
    if (n === 0) break;
  }
  return total;
}

async function main() {
  const connection = () => new Redis(env().REDIS_URL, { maxRetriesPerRequest: null });
  const queue = new Queue(MAINTENANCE, { connection: connection() });
  await queue.upsertJobScheduler(
    EXPIRE_UPLOADS,
    { every: 60 * 60 * 1000 },
    { name: EXPIRE_UPLOADS, opts: { removeOnComplete: 50, removeOnFail: 100 } },
  );

  const worker = new Worker(
    MAINTENANCE,
    async (job) => {
      if (job.name === EXPIRE_UPLOADS) return { expired: await runExpireStaleUploads() };
      logger.warn({ jobName: job.name }, "job maintenance tidak dikenal");
      return null;
    },
    { connection: connection(), concurrency: 1 },
  );
  worker.on("completed", (job, result) =>
    logger.info({ jobId: job.id, jobName: job.name, result }, "job maintenance selesai"),
  );
  worker.on("failed", (job, err) =>
    logger.error({ jobId: job?.id, jobName: job?.name, err: err.message }, "job maintenance gagal"),
  );
  logger.info({ queues: [MAINTENANCE] }, "worker berjalan");

  const shutdown = async (signal: string) => {
    logger.info({ signal }, "worker berhenti");
    await worker.close();
    await queue.close();
    await prisma.$disconnect();
    process.exit(0);
  };
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
}

main().catch((e: unknown) => {
  logger.error({ err: e instanceof Error ? e.message : String(e) }, "worker gagal start");
  process.exit(1);
});
