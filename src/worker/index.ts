/*
 * Proses worker terpisah dari app (flow-kerja B1). Antrean:
 *   - "ingest": file unggahan → raw.parquet per sheet (T-006). Concurrency 1 per proses (D7); lock job
 *     diperpanjang otomatis, job dari worker yang mati diambil ulang (stalled) dan mulai bersih.
 *   - "recast": typed-<rev+1>.parquet per sheet (T-007; koreksi skema T-008), satu per sheet (lock).
 *   - "maintenance": job terjadwal (unggahan > 24 jam → FAILED, ingest macet, pembersihan storage,
 *     file asli > 7 hari) dan hapus typed lama.
 * Jalankan: npm run worker (tsx dengan kondisi react-server agar modul "server-only" bisa dimuat).
 */
import { mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DelayedError, Queue, Worker, type Job } from "bullmq";
import Redis from "ioredis";
import { DatasetGoneError, runIngest } from "@/features/ingest/ingest";
import { recastSheet } from "@/features/ingest/recast";
import {
  finalizeFailed,
  recoverStuckIngests,
  removeStaleWorkDirs,
  STALE_FAILURE_MESSAGE,
} from "@/features/ingest/recovery";
import { prismaIngestRepo, prismaRecastRepo, s3IngestStorage } from "@/features/ingest/repo";
import { expireStaleUploads } from "@/features/uploads/service";
import { runRawRetention, runStorageCleanup } from "@/features/versions/cleanup";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { redisLockStore } from "@/lib/lock";
import {
  INGEST_JOB_OPTIONS,
  INGEST_QUEUE,
  RECAST_QUEUE,
  type IngestJobData,
  type RecastJobData,
} from "@/lib/queue/connection";
import { deleteObject } from "@/lib/storage/objects";

const MAINTENANCE = "maintenance";
const EXPIRE_UPLOADS = "expire-stale-uploads";
const RECOVER_INGESTS = "recover-stuck-ingests";
const DELETE_OBJECT = "delete-object";
/** Proses StorageCleanup (T-013): prefix versi yang dibuang retensi/pemilik + hapus yang gagal. */
const STORAGE_CLEANUP = "storage-cleanup";
/** Hapus file asli 7 hari setelah ingest selesai (T-013, B1). */
const RAW_RETENTION = "raw-retention";
const SCHEDULED_OPTS = { removeOnComplete: 50, removeOnFail: 100 };
/** Jeda tunda recast "busy" dan batas total tunggunya (> deadline recast 20 menit). */
const RECAST_BUSY_DELAY_MS = 30 * 1000;
const RECAST_BUSY_MAX_MS = 30 * 60 * 1000;
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
    // INGESTING tahap "raw" tanpa job hidup: versi era T-006 (sebelum tahap typed) atau worker mati
    // tepat setelah raw → diantrekan ulang (ingest idempoten) alih-alih digagalkan penyapu.
    where: { OR: [{ status: "UPLOADED" }, { status: "INGESTING", ingestStage: "raw" }] },
    select: { id: true, datasetId: true },
    take: 1000,
  });
  let n = 0;
  for (const v of versions) {
    const job = await queue.getJob(v.id);
    const state = job ? await job.getState() : null;
    if (state && !["completed", "failed", "unknown"].includes(state)) continue;
    if (job) await job.remove().catch(() => {});
    await queue.add(
      "ingest",
      { versionId: v.id, datasetId: v.datasetId },
      { ...INGEST_JOB_OPTIONS, jobId: v.id },
    );
    n++;
  }
  return n;
}

async function main() {
  const connection = () => new Redis(env().REDIS_URL, { maxRetriesPerRequest: null });
  const tmpRoot = env().WORKER_TMP_DIR ?? join(tmpdir(), "dd-worker");
  mkdirSync(tmpRoot, { recursive: true });
  // Sisa job yang terhenti paksa (OOM/SIGKILL) bisa berukuran GB; WORKER_TMP_DIR wajib per replika.
  const stale = removeStaleWorkDirs(tmpRoot);

  const ingestQueue = new Queue<IngestJobData>(INGEST_QUEUE, {
    connection: connection(),
    defaultJobOptions: INGEST_JOB_OPTIONS,
  });

  // --- maintenance ---
  const maintenance = new Queue(MAINTENANCE, { connection: connection() });
  const schedules: [string, number][] = [
    [EXPIRE_UPLOADS, 60 * 60 * 1000],
    [RECOVER_INGESTS, 15 * 60 * 1000],
    [STORAGE_CLEANUP, 15 * 60 * 1000],
    [RAW_RETENTION, 60 * 60 * 1000],
  ];
  for (const [name, every] of schedules) {
    await maintenance.upsertJobScheduler(name, { every }, { name, opts: SCHEDULED_OPTS });
  }
  const maintenanceWorker = new Worker(
    MAINTENANCE,
    async (job) => {
      if (job.name === EXPIRE_UPLOADS) return { expired: await runExpireStaleUploads() };
      if (job.name === RECOVER_INGESTS)
        return { recovered: await recoverStuckIngests(ingestQueue) };
      if (job.name === STORAGE_CLEANUP) return await runStorageCleanup();
      if (job.name === RAW_RETENTION) return await runRawRetention();
      if (job.name === DELETE_OBJECT) {
        await deleteObject(String((job.data as { key: string }).key));
        return null;
      }
      logger.warn({ jobName: job.name }, "job maintenance tidak dikenal");
      return null;
    },
    { connection: connection(), concurrency: 1 },
  );
  maintenanceWorker.on("failed", (job, err) =>
    logger.error({ jobId: job?.id, jobName: job?.name, err: err.message }, "job maintenance gagal"),
  );

  // --- ingest ---
  const ingestWorker = new Worker<IngestJobData>(
    INGEST_QUEUE,
    async (job: Job<IngestJobData>) => {
      const { versionId } = job.data;
      logger.info({ jobId: job.id, versionId, attempt: job.attemptsMade + 1 }, "ingest mulai");
      const r = await runIngest(versionId, prismaIngestRepo, s3IngestStorage, {
        tmpRoot,
        datasetIdHint: job.data.datasetId,
      });
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
    logger.error(
      { jobId: job.id, versionId: job.data.versionId, attempt: job.attemptsMade, err: err.message },
      "ingest gagal",
    );
    // Final bila tidak akan diulang lagi: percobaan habis ATAU dibuang sebagai stalled
    // (UnrecoverableError, attemptsMade bisa masih 1). Status job adalah sumber kebenaran.
    void (async () => {
      const state = await job.getState().catch(() => "unknown");
      const final = err.name === "UnrecoverableError" || state === "failed";
      if (!final) return;
      const message = err.name === "StaleSnapshotError" ? STALE_FAILURE_MESSAGE : undefined;
      if (!(await finalizeFailed(job.data.versionId, job.data.datasetId, message))) {
        logger.error(
          { versionId: job.data.versionId },
          "finalisasi ingest gagal; penyapu akan mengulang",
        );
      }
    })();
  });

  // --- recast ---
  const lockRedis = connection();
  const recastWorker = new Worker<RecastJobData>(
    RECAST_QUEUE,
    async (job: Job<RecastJobData>, token?: string) => {
      const { sheetId, input } = job.data;
      const r = await recastSheet(sheetId, input, {
        repo: prismaRecastRepo,
        storage: s3IngestStorage,
        lock: redisLockStore(lockRedis),
        scheduleDelete: async (key, delay) => {
          await maintenance.add(
            DELETE_OBJECT,
            { key },
            {
              delay,
              removeOnComplete: 100,
              removeOnFail: 1000,
              attempts: 5,
              backoff: { type: "exponential", delay: 60_000 },
            },
          );
        },
        tmpRoot,
        watch: async () => {
          if ((await prisma.sheet.count({ where: { id: sheetId } })) === 0) {
            throw new DatasetGoneError();
          }
        },
      });
      logger.info({ jobId: job.id, sheetId, ...r, schema: undefined }, "recast selesai");
      // Recast lain sedang memegang lock sheet ini (bisa sampai deadline 20 menit) → tunda tanpa
      // memakai jatah percobaan, sampai batas tunggu > deadline; perubahan user tidak dibuang.
      if (r.outcome === "busy") {
        const waited = Date.now() - job.timestamp;
        if (waited > RECAST_BUSY_MAX_MS) throw new Error("recast lain berjalan terlalu lama");
        await job.moveToDelayed(Date.now() + RECAST_BUSY_DELAY_MS, token);
        throw new DelayedError();
      }
      return r.outcome === "done" ? { outcome: r.outcome, revision: r.revision } : r;
    },
    { connection: connection(), concurrency: 1, lockDuration: INGEST_LOCK_MS },
  );
  recastWorker.on("failed", (job, err) =>
    logger.error({ jobId: job?.id, sheetId: job?.data.sheetId, err: err.message }, "recast gagal"),
  );

  const swept = await sweepUploaded(ingestQueue);
  // Sisa pembersihan saat worker mati (mis. deploy) tidak menunggu 15 menit jadwal berikutnya.
  await maintenance.add(STORAGE_CLEANUP, {}, SCHEDULED_OPTS);
  const recovered = await recoverStuckIngests(ingestQueue);
  logger.info(
    {
      queues: [INGEST_QUEUE, RECAST_QUEUE, MAINTENANCE],
      tmpRoot,
      swept,
      recovered,
      staleDirs: stale,
    },
    "worker berjalan",
  );

  const shutdown = async (signal: string) => {
    logger.info({ signal }, "worker berhenti");
    await ingestWorker.close();
    await recastWorker.close();
    await maintenanceWorker.close();
    lockRedis.disconnect();
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
