/*
 * Proses worker terpisah dari app (flow-kerja B1). Antrean:
 *   - "ingest": file unggahan → raw.parquet per sheet (T-006). Concurrency 1 per proses (D7); lock job
 *     diperpanjang otomatis, job dari worker yang mati diambil ulang (stalled) dan mulai bersih.
 *   - "maintenance": job terjadwal (unggahan > 24 jam → FAILED).
 * Jalankan: npm run worker (tsx dengan kondisi react-server agar modul "server-only" bisa dimuat).
 */
import { mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Queue, Worker, type Job } from "bullmq";
import Redis from "ioredis";
import { runIngest } from "@/features/ingest/ingest";
import { prismaIngestRepo, s3IngestStorage } from "@/features/ingest/repo";
import { expireStaleUploads } from "@/features/uploads/service";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { INGEST_QUEUE, type IngestJobData } from "@/lib/queue/connection";

const MAINTENANCE = "maintenance";
const EXPIRE_UPLOADS = "expire-stale-uploads";
const INGEST_LOCK_MS = 5 * 60 * 1000;

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

/**
 * Versi UPLOADED tanpa job aktif (enqueue gagal saat Redis mati, atau job lama sudah dibuang) →
 * antrekan ulang. jobId = versionId; job selesai/gagal lama dihapus dulu agar add tidak diabaikan.
 */
async function sweepUploaded(queue: Queue<IngestJobData>): Promise<number> {
  const versions = await prisma.datasetVersion.findMany({
    where: { status: "UPLOADED" },
    select: { id: true },
    take: 1000,
  });
  let n = 0;
  for (const v of versions) {
    const job = await queue.getJob(v.id);
    const state = job ? await job.getState() : null;
    if (state && !["completed", "failed", "unknown"].includes(state)) continue;
    if (job) await job.remove().catch(() => {});
    await queue.add("ingest", { versionId: v.id }, { jobId: v.id });
    n++;
  }
  return n;
}

async function main() {
  const connection = () => new Redis(env().REDIS_URL, { maxRetriesPerRequest: null });
  const tmpRoot = env().WORKER_TMP_DIR ?? join(tmpdir(), "dd-worker");
  mkdirSync(tmpRoot, { recursive: true });

  // --- maintenance ---
  const maintenance = new Queue(MAINTENANCE, { connection: connection() });
  await maintenance.upsertJobScheduler(
    EXPIRE_UPLOADS,
    { every: 60 * 60 * 1000 },
    { name: EXPIRE_UPLOADS, opts: { removeOnComplete: 50, removeOnFail: 100 } },
  );
  const maintenanceWorker = new Worker(
    MAINTENANCE,
    async (job) => {
      if (job.name === EXPIRE_UPLOADS) return { expired: await runExpireStaleUploads() };
      logger.warn({ jobName: job.name }, "job maintenance tidak dikenal");
      return null;
    },
    { connection: connection(), concurrency: 1 },
  );
  maintenanceWorker.on("failed", (job, err) =>
    logger.error({ jobId: job?.id, jobName: job?.name, err: err.message }, "job maintenance gagal"),
  );

  // --- ingest ---
  const ingestQueue = new Queue<IngestJobData>(INGEST_QUEUE, { connection: connection() });
  const ingestWorker = new Worker<IngestJobData>(
    INGEST_QUEUE,
    async (job: Job<IngestJobData>) => {
      const { versionId } = job.data;
      logger.info({ jobId: job.id, versionId, attempt: job.attemptsMade + 1 }, "ingest mulai");
      const r = await runIngest(versionId, prismaIngestRepo, s3IngestStorage, { tmpRoot });
      logger.info({ jobId: job.id, versionId, ...r }, "ingest selesai");
      return r;
    },
    {
      connection: connection(),
      concurrency: 1,
      lockDuration: INGEST_LOCK_MS,
      maxStalledCount: 2,
    },
  );
  ingestWorker.on("failed", (job, err) => {
    if (!job) return;
    const attempts = job.opts.attempts ?? 1;
    logger.error(
      { jobId: job.id, versionId: job.data.versionId, attempt: job.attemptsMade, err: err.message },
      "ingest gagal",
    );
    // Percobaan terakhir habis (gangguan sementara yang terus berulang) → FAILED dengan pesan umum.
    if (job.attemptsMade >= attempts) {
      void prismaIngestRepo
        .fail(
          job.data.versionId,
          "Pemrosesan file gagal setelah beberapa percobaan karena gangguan server. Coba unggah ulang; bila berulang, hubungi admin.",
        )
        .catch(() => {});
    }
  });

  const swept = await sweepUploaded(ingestQueue);
  logger.info({ queues: [INGEST_QUEUE, MAINTENANCE], tmpRoot, swept }, "worker berjalan");

  const shutdown = async (signal: string) => {
    logger.info({ signal }, "worker berhenti");
    await ingestWorker.close();
    await maintenanceWorker.close();
    await ingestQueue.close();
    await maintenance.close();
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
