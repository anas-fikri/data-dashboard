import "server-only";
import { Queue } from "bullmq";
import Redis from "ioredis";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import type { MappingInput } from "@/features/ingest/mapping-input";
import type { RecastInput } from "@/features/ingest/recast";

export const INGEST_QUEUE = "ingest";
/** Recast typed.parquet per sheet (T-007; dipicu koreksi skema T-008) dan pemetaan versi (T-014). */
export const RECAST_QUEUE = "recast";
/** Nama job pemetaan kolom di antrean recast (worker membedakan lewat job.name). */
export const MAP_VERSION_JOB = "map-version";
/**
 * Ekspor widget CSV/XLSX (T-017): job ringan, antrean terpisah dari ingest. Status/kepemilikan/kedaluwarsa
 * ada di tabel Export; antrean hanya menjalankan (jobId = Export.id).
 */
export const EXPORT_QUEUE = "export";
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
  /** Peminta (batas job berjalan per user, review T-008 M2); kosong untuk job lama. */
  userId?: string;
}

/** Job pemetaan kolom versi AWAITING_MAPPING (T-014); pelaku + ip untuk AuditLog commit. */
export interface MappingJobData {
  versionId: string;
  datasetId: string;
  input: MappingInput;
  actorId: string;
  ip: string;
}

/**
 * Opsi job recast. "busy" (recast lain sedang memegang lock sheet) dilempar sebagai error agar
 * diulang, sehingga perubahan user tidak hilang.
 */
export const RECAST_JOB_OPTIONS = {
  attempts: 6,
  backoff: { type: "exponential" as const, delay: 10_000 },
  // Hasil dibaca UI hanya selama polling; setelah itu skema di DB yang jadi sumber kebenaran.
  removeOnComplete: { age: 60 * 60, count: 200 },
  removeOnFail: { age: 24 * 60 * 60, count: 500 },
};

export interface ExportJobData {
  exportId: string;
}

/**
 * Opsi job ekspor: satu ulangan untuk galat tak terduga (galat yang dikenal — terlalu besar, akses
 * dicabut, batas waktu — langsung FAILED di tabel Export tanpa ulang). Hasil dibaca dari tabel Export,
 * jadi job selesai cukup disimpan sebentar.
 */
export const EXPORT_JOB_OPTIONS = {
  attempts: 2,
  backoff: { type: "fixed" as const, delay: 10_000 },
  removeOnComplete: { age: 2 * 60 * 60 },
  removeOnFail: { age: 24 * 60 * 60 },
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

/** Antrean recast yang sama, bertipe data job pemetaan (job "map-version"). */
export function mappingQueue(): Queue<MappingJobData> {
  return producerQueue<MappingJobData>(RECAST_QUEUE, RECAST_JOB_OPTIONS);
}

/** Antrean ekspor (T-017): jobId = Export.id → enqueue idempoten. */
export function exportQueue(): Queue<ExportJobData> {
  return producerQueue<ExportJobData>(EXPORT_QUEUE, EXPORT_JOB_OPTIONS);
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
