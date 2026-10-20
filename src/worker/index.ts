/*
 * Proses worker terpisah dari app (flow-kerja B1). Antrean:
 *   - "ingest": file unggahan → raw.parquet per sheet (T-006). Concurrency 1 per proses (D7); lock job
 *     diperpanjang otomatis, job dari worker yang mati diambil ulang (stalled) dan mulai bersih.
 *   - "recast": typed-<rev+1>.parquet per sheet (T-007; koreksi skema T-008), satu per sheet (lock),
 *     dan job "map-version": pemetaan kolom versi AWAITING_MAPPING lalu aktivasi (T-014).
 *   - "export": ekspor widget CSV/XLSX (T-017), job ringan terpisah dari ingest; status di tabel Export.
 *   - "pdf": PDF dashboard (T-018): token render → renderer (POST /render) → cek PDF → unggah; terpisah
 *     dari "export" agar PDF tidak menunggu XLSX besar. Concurrency 1 per proses.
 *   - "maintenance": job terjadwal (unggahan > 24 jam → FAILED, ingest macet, pembersihan storage,
 *     file asli > 7 hari, pembersihan ekspor tiap 5 menit) dan hapus typed lama / objek ekspor
 *     kedaluwarsa (delete-export, tertunda 60 menit).
 * Jalankan: npm run worker (tsx dengan kondisi react-server agar modul "server-only" bisa dimuat).
 */
import { mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DelayedError, Queue, Worker, type Job } from "bullmq";
import Redis from "ioredis";
import { expireExport, runExportCleanup } from "@/features/exports/cleanup";
import { removeStaleExportDirs, runExportJob } from "@/features/exports/job";
import { prismaGridRepo } from "@/features/query/grid-repo";
import { RendererBusyError, runPdfJob } from "@/features/exports/pdf-job";
import { mintRenderToken, redisRenderStore } from "@/features/exports/render-token";
import { rendererClient } from "@/features/exports/renderer-client";
import {
  prismaExportCleanupRepo,
  prismaExportJobRepo,
  prismaPdfJobRepo,
  s3ExportStorage,
} from "@/features/exports/repo";
import { FAILED_MESSAGE, RENDERER_UNAVAILABLE_MESSAGE } from "@/features/exports/service";
import { DatasetGoneError, runIngest } from "@/features/ingest/ingest";
import { applyMapping } from "@/features/ingest/mapping";
import { recastSheet, yieldsToIngest } from "@/features/ingest/recast";
import {
  finalizeFailed,
  recoverStuckIngests,
  removeStaleWorkDirs,
  STALE_FAILURE_MESSAGE,
} from "@/features/ingest/recovery";
import {
  prismaIngestRepo,
  prismaMappingRepo,
  prismaRecastRepo,
  s3IngestStorage,
} from "@/features/ingest/repo";
import { prismaQueryRepo } from "@/features/query/runtime";
import { announceVersionActivated, watchRedis } from "@/features/query/warm";
import { expireStaleUploads } from "@/features/uploads/service";
import { keyReferenced, runRawRetention, runStorageCleanup } from "@/features/versions/cleanup";
import { runSegmentGc } from "@/features/versions/gc";
import { runStorageAudit } from "@/features/versions/integrity";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { redisLockStore } from "@/lib/lock";
import { redisReady } from "@/lib/redis";
import {
  EXPORT_QUEUE,
  INGEST_JOB_OPTIONS,
  INGEST_QUEUE,
  MAP_VERSION_JOB,
  PDF_QUEUE,
  RECAST_QUEUE,
  type ExportJobData,
  type IngestJobData,
  type MappingJobData,
  type RecastJobData,
} from "@/lib/queue/connection";
import { keepRecastIndexed, recordMappingLast, type MappingLastRecord } from "@/lib/queue/versions";
import { deleteObject } from "@/lib/storage/objects";

const MAINTENANCE = "maintenance";
const EXPIRE_UPLOADS = "expire-stale-uploads";
const RECOVER_INGESTS = "recover-stuck-ingests";
/**
 * Hapus satu typed revisi lama (dijadwalkan recast/pemetaan sebelum T-038). Tidak dijadwalkan lagi —
 * GC segmen yang memutuskan — tetapi job yang masih antre saat deploy tetap diproses dengan penjaga.
 */
const DELETE_OBJECT = "delete-object";
/** GC segmen mark-and-sweep (T-038): tandai/sapu segmen dan revisi typed tak terujuk. */
const SEGMENT_GC = "segment-gc";
/** Pemeriksaan malam (T-038): HEAD kunci terujuk (alert) + sapuan objek yatim. */
const SEGMENT_AUDIT = "segment-audit";
/** Proses StorageCleanup (T-013): prefix versi yang dibuang retensi/pemilik + hapus yang gagal. */
const STORAGE_CLEANUP = "storage-cleanup";
/** Hapus file asli 7 hari setelah ingest selesai (T-013, B1). */
const RAW_RETENTION = "raw-retention";
/** Sapuan ekspor (T-017): kedaluwarsa, job basi, objek yatim di exports/. */
const EXPORT_CLEANUP = "export-cleanup";
/** Hapus objek satu ekspor saat kedaluwarsa (tertunda EXPORT_TTL_MS). */
const DELETE_EXPORT = "delete-export";
const EXPORT_LOCK_MS = 5 * 60 * 1000;
/** Lock job PDF (diperpanjang otomatis selama proses hidup); > RENDER_TIMEOUT_MS bawaan 60 detik. */
const PDF_LOCK_MS = 2 * 60 * 1000;
const SCHEDULED_OPTS = { removeOnComplete: 50, removeOnFail: 100 };
/** Jeda tunda recast "busy" dan batas tunggunya sejak mulai menunggu (> deadline segmen 20 menit). */
const RECAST_BUSY_DELAY_MS = 30 * 1000;
const RECAST_BUSY_MAX_MS = 30 * 60 * 1000;
/** Recast memberi jalan ingest/pemetaan (T-040): jeda tunda, dan paling lama per segmen. */
const RECAST_YIELD_DELAY_MS = 10 * 1000;
const RECAST_YIELD_MAX_MS = 15 * 60 * 1000;
/** Batas tunggu pemetaan "busy" (> deadline pemetaan 60 menit). */
const MAPPING_BUSY_MAX_MS = 70 * 60 * 1000;
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
  const stale = removeStaleWorkDirs(tmpRoot) + removeStaleExportDirs(tmpRoot);

  const ingestQueue = new Queue<IngestJobData>(INGEST_QUEUE, {
    connection: connection(),
    defaultJobOptions: INGEST_JOB_OPTIONS,
  });
  /** Hanya membaca jumlah job pemetaan yang antre (job recast berprioritas tidak terhitung "waiting"). */
  const recastQueue = new Queue(RECAST_QUEUE, { connection: connection() });

  // --- maintenance ---
  const maintenance = new Queue(MAINTENANCE, { connection: connection() });
  const schedules: [string, number][] = [
    [EXPIRE_UPLOADS, 60 * 60 * 1000],
    [RECOVER_INGESTS, 15 * 60 * 1000],
    [STORAGE_CLEANUP, 15 * 60 * 1000],
    [RAW_RETENTION, 60 * 60 * 1000],
    [EXPORT_CLEANUP, 5 * 60 * 1000],
  ];
  schedules.push([SEGMENT_GC, 60 * 60 * 1000]);
  for (const [name, every] of schedules) {
    await maintenance.upsertJobScheduler(name, { every }, { name, opts: SCHEDULED_OPTS });
  }
  await maintenance.upsertJobScheduler(
    SEGMENT_AUDIT,
    { pattern: "0 3 * * *", tz: "Asia/Jakarta" },
    { name: SEGMENT_AUDIT, opts: SCHEDULED_OPTS },
  );
  const exportCleanupDeps = {
    repo: prismaExportCleanupRepo,
    storage: s3ExportStorage,
    log: (msg: string, meta: Record<string, unknown>) => logger.warn(meta, msg),
  };
  const maintenanceWorker = new Worker(
    MAINTENANCE,
    async (job) => {
      if (job.name === EXPIRE_UPLOADS) return { expired: await runExpireStaleUploads() };
      if (job.name === RECOVER_INGESTS)
        return { recovered: await recoverStuckIngests(ingestQueue) };
      if (job.name === STORAGE_CLEANUP) return await runStorageCleanup();
      if (job.name === RAW_RETENTION) return await runRawRetention();
      if (job.name === EXPORT_CLEANUP) return await runExportCleanup(exportCleanupDeps);
      if (job.name === DELETE_EXPORT) {
        const { exportId, key } = job.data as { exportId: string; key: string };
        return { result: await expireExport(String(exportId), String(key), exportCleanupDeps) };
      }
      if (job.name === SEGMENT_GC) return await runSegmentGc();
      if (job.name === SEGMENT_AUDIT) return await runStorageAudit();
      if (job.name === DELETE_OBJECT) {
        const key = String((job.data as { key: string }).key);
        // Masih tercatat (revisi typed menunggu GC, atau sudah dipakai lagi) → GC yang menghapusnya.
        if (await keyReferenced(key)) return { skipped: key };
        await deleteObject(key);
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

  // Versi baru aktif (ingest/pemetaan) diumumkan ke app agar cache parquet-nya dipanaskan (T-pvq8);
  // tidak ditunggu: Redis lambat/mati tidak menahan job, gagal hanya dicatat.
  const announceRedis = connection();
  watchRedis(announceRedis, logger, "redis pengumuman versi aktif");

  // --- ingest ---
  const ingestWorker = new Worker<IngestJobData>(
    INGEST_QUEUE,
    async (job: Job<IngestJobData>) => {
      const { versionId } = job.data;
      logger.info({ jobId: job.id, versionId, attempt: job.attemptsMade + 1 }, "ingest mulai");
      const r = await runIngest(versionId, prismaIngestRepo, s3IngestStorage, {
        tmpRoot,
        datasetIdHint: job.data.datasetId,
        duckThreads: env().INGEST_DUCKDB_THREADS,
        sheetThreads: env().INGEST_XLSX_SHEET_THREADS,
      });
      logger.info({ jobId: job.id, versionId, ...r }, "ingest selesai");
      if (r.outcome === "done") void announceVersionActivated(announceRedis, versionId, logger);
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

  // --- recast (+ pemetaan versi) ---
  const lockRedis = connection();
  /** Job lain sedang memegang lock → tunda tanpa memakai jatah percobaan sampai batas tunggu. */
  const delayBusy = async (job: Job, maxMs: number, token?: string): Promise<never> => {
    if (Date.now() - job.timestamp > maxMs) throw new Error("job lain berjalan terlalu lama");
    await job.moveToDelayed(Date.now() + RECAST_BUSY_DELAY_MS, token);
    throw new DelayedError();
  };
  /** Hasil terakhir pemetaan versi (T-014, 24 jam); gagal mencatat tidak menggagalkan job. */
  const recordLast = async (versionId: string, record: MappingLastRecord | null) => {
    await recordMappingLast(lockRedis, versionId, record).catch((e: unknown) =>
      logger.warn(
        { versionId, err: e instanceof Error ? e.message : String(e) },
        "hasil pemetaan tidak tercatat",
      ),
    );
  };
  const mapVersion = async (job: Job<MappingJobData>, token?: string) => {
    const { versionId, input, actorId, ip } = job.data;
    const r = await applyMapping(
      { versionId, input, actorId, ip, jobId: job.id },
      {
        repo: prismaMappingRepo,
        storage: s3IngestStorage,
        lock: redisLockStore(lockRedis),
        tmpRoot,
      },
    );
    logger.info(
      {
        jobId: job.id,
        versionId,
        ...r,
        issues: r.outcome === "review" ? r.issues.length : undefined,
      },
      "pemetaan selesai",
    );
    if (r.outcome === "busy") return delayBusy(job, MAPPING_BUSY_MAX_MS, token);
    await recordLast(versionId, r.outcome === "done" ? null : { jobId: job.id ?? "", result: r });
    if (r.outcome === "done") void announceVersionActivated(announceRedis, versionId, logger);
    return r;
  };
  /**
   * Tunda job recast tanpa memakai jatah percobaan (T-040). busySince: lock sheet dipegang job lain —
   * batas tunggu dihitung sejak mulai menunggu, bukan sejak job dibuat (recast banyak segmen bisa jauh
   * lebih lama). yieldSince: memberi jalan ingest/pemetaan — batasnya di shouldYield. Keduanya dihapus
   * begitu segmen berikutnya benar-benar mulai.
   */
  const waitRecast = async (
    job: Job,
    token: string | undefined,
    field: "busySince" | "yieldSince",
    delayMs: number,
    maxMs = Infinity,
  ): Promise<never> => {
    const d = job.data as RecastJobData;
    const since = d[field] ?? Date.now();
    if (Date.now() - since > maxMs) throw new Error("job lain berjalan terlalu lama");
    await job.updateData({ ...d, [field]: since });
    await job.moveToDelayed(Date.now() + delayMs, token);
    throw new DelayedError();
  };
  const recastWorker = new Worker<RecastJobData | MappingJobData>(
    RECAST_QUEUE,
    async (job: Job<RecastJobData | MappingJobData>, token?: string) => {
      if (job.name === MAP_VERSION_JOB) return mapVersion(job as Job<MappingJobData>, token);
      const { sheetId, input } = job.data as RecastJobData;
      const jobId = job.id ?? "";
      const r = await recastSheet(sheetId, input, {
        repo: prismaRecastRepo,
        storage: s3IngestStorage,
        lock: redisLockStore(lockRedis),
        tmpRoot,
        watch: async () => {
          if ((await prisma.sheet.count({ where: { id: sheetId } })) === 0) {
            throw new DatasetGoneError();
          }
        },
        // T-040: kunci file per job (percobaan ulang melanjutkan segmen yang selesai), progres per
        // segmen untuk UI, dan memberi jalan ingest/pemetaan (prioritas di bawah ingest).
        jobId,
        progress: async (p) => {
          await job.updateProgress({ ...p });
          const d = job.data as RecastJobData;
          if (d.busySince !== undefined || d.yieldSince !== undefined) {
            await job.updateData({ sheetId: d.sheetId, input: d.input, userId: d.userId });
          }
          // Satu koreksi per sheet tetap terjaga selama job berjalan lama (indeks app ber-TTL).
          await keepRecastIndexed(lockRedis, sheetId, jobId);
        },
        shouldYield: async (datasetId) => {
          const since = (job.data as RecastJobData).yieldSince;
          if (since !== undefined && Date.now() - since > RECAST_YIELD_MAX_MS) return false;
          if ((await recastQueue.getWaitingCount()) > 0) return true;
          const active = await ingestQueue.getActive();
          return yieldsToIngest(
            active.map((j) => j.data),
            datasetId,
          );
        },
      });
      logger.info({ jobId: job.id, sheetId, ...r, schema: undefined }, "recast selesai");
      // Recast lain sedang memegang lock sheet ini → tunda tanpa memakai jatah percobaan, sampai batas
      // tunggu > deadline segmen; perubahan user tidak dibuang.
      if (r.outcome === "busy") {
        return waitRecast(job, token, "busySince", RECAST_BUSY_DELAY_MS, RECAST_BUSY_MAX_MS);
      }
      if (r.outcome === "yield") return waitRecast(job, token, "yieldSince", RECAST_YIELD_DELAY_MS);
      return r.outcome === "done" ? { outcome: r.outcome, revision: r.revision } : r;
    },
    // Worker mati dua kali di tengah recast panjang tetap dilanjutkan (titik lanjut per segmen).
    { connection: connection(), concurrency: 1, lockDuration: INGEST_LOCK_MS, maxStalledCount: 2 },
  );
  recastWorker.on("failed", (job, err) => {
    logger.error({ jobId: job?.id, jobName: job?.name, err: err.message }, "recast gagal");
    if (job?.name !== MAP_VERSION_JOB) return;
    // Pemetaan gagal final (percobaan habis): dicatat sebagai hasil terakhir versi.
    void (async () => {
      const state = await job.getState().catch(() => "unknown");
      if (state !== "failed") return;
      const { versionId } = job.data as MappingJobData;
      await recordLast(versionId, { jobId: job.id ?? "", result: { outcome: "failed" } });
    })();
  });

  // --- export (T-017) ---
  const scheduleExportDelete = async (exportId: string, key: string, delay: number) => {
    await maintenance.add(
      DELETE_EXPORT,
      { exportId, key },
      {
        delay,
        removeOnComplete: 100,
        removeOnFail: 1000,
        attempts: 5,
        backoff: { type: "exponential", delay: 60_000 },
      },
    );
  };
  const exportWorker = new Worker<ExportJobData>(
    EXPORT_QUEUE,
    async (job: Job<ExportJobData>) => {
      const e = env();
      const r = await runExportJob(job.data.exportId, {
        repo: prismaExportJobRepo,
        query: { repo: prismaQueryRepo },
        grid: prismaGridRepo,
        storage: s3ExportStorage,
        scheduleDelete: scheduleExportDelete,
        tmpRoot,
        maxRows: e.EXPORT_MAX_ROWS,
        ttlMs: e.EXPORT_TTL_MS,
        deadlineMs: e.EXPORT_DEADLINE_MS,
        duckMemory: e.EXPORT_DUCKDB_MEMORY,
      });
      logger.info({ jobId: job.id, exportId: job.data.exportId, ...r }, "ekspor selesai");
      return r;
    },
    { connection: connection(), concurrency: 1, lockDuration: EXPORT_LOCK_MS },
  );
  exportWorker.on("failed", (job, err) => {
    if (!job) return;
    logger.error(
      { jobId: job.id, exportId: job.data.exportId, attempt: job.attemptsMade, err: err.message },
      "ekspor gagal",
    );
    // Gagal final (percobaan habis/stalled): baris Export → FAILED dengan pesan umum (detail di log).
    void (async () => {
      const state = await job.getState().catch(() => "unknown");
      if (err.name !== "UnrecoverableError" && state !== "failed") return;
      await prismaExportJobRepo
        .fail(job.data.exportId, "EXPORT_FAILED", FAILED_MESSAGE)
        .catch((e: unknown) =>
          logger.error(
            { exportId: job.data.exportId, err: e instanceof Error ? e.message : String(e) },
            "status ekspor gagal tidak tercatat; sapuan export-cleanup akan menutupnya",
          ),
        );
    })();
  });

  // --- pdf (T-018) ---
  const pdfWorker = new Worker<ExportJobData>(
    PDF_QUEUE,
    async (job: Job<ExportJobData>) => {
      const e = env();
      const r = await runPdfJob(job.data.exportId, {
        repo: prismaPdfJobRepo,
        renderer: rendererClient({ url: e.RENDERER_URL, secret: e.RENDERER_SECRET }),
        mintToken: async (claims) => mintRenderToken(redisRenderStore(await redisReady()), claims),
        storage: s3ExportStorage,
        scheduleDelete: scheduleExportDelete,
        ttlMs: e.EXPORT_TTL_MS,
        timeoutMs: e.RENDER_TIMEOUT_MS,
        maxBytes: e.PDF_MAX_BYTES,
      });
      logger.info({ jobId: job.id, exportId: job.data.exportId, ...r }, "ekspor PDF selesai");
      return r;
    },
    { connection: connection(), concurrency: 1, lockDuration: PDF_LOCK_MS },
  );
  pdfWorker.on("failed", (job, err) => {
    if (!job) return;
    logger.error(
      { jobId: job.id, exportId: job.data.exportId, attempt: job.attemptsMade, err: err.message },
      "ekspor PDF gagal",
    );
    // Gagal final: renderer penuh di semua percobaan → RENDERER_UNAVAILABLE; selain itu pesan umum.
    void (async () => {
      const state = await job.getState().catch(() => "unknown");
      if (err.name !== "UnrecoverableError" && state !== "failed") return;
      const busy = err.name === RendererBusyError.name;
      await prismaPdfJobRepo
        .fail(
          job.data.exportId,
          busy ? "RENDERER_UNAVAILABLE" : "EXPORT_FAILED",
          busy ? RENDERER_UNAVAILABLE_MESSAGE : FAILED_MESSAGE,
        )
        .catch((e: unknown) =>
          logger.error(
            { exportId: job.data.exportId, err: e instanceof Error ? e.message : String(e) },
            "status ekspor PDF gagal tidak tercatat; sapuan export-cleanup akan menutupnya",
          ),
        );
    })();
  });

  const swept = await sweepUploaded(ingestQueue);
  // Sisa pembersihan saat worker mati (mis. deploy) tidak menunggu 15 menit jadwal berikutnya.
  await maintenance.add(STORAGE_CLEANUP, {}, SCHEDULED_OPTS);
  const recovered = await recoverStuckIngests(ingestQueue);
  logger.info(
    {
      queues: [INGEST_QUEUE, RECAST_QUEUE, EXPORT_QUEUE, PDF_QUEUE, MAINTENANCE],
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
    await exportWorker.close();
    await pdfWorker.close();
    await maintenanceWorker.close();
    lockRedis.disconnect();
    announceRedis.disconnect();
    await ingestQueue.close();
    await recastQueue.close();
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
