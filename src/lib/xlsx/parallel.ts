/*
 * Sheet xlsx dibaca di worker thread (T-de1b). Thread utama membaca workbook/styles/sharedStrings
 * sekali (openSharedBook); worker thread (sheet-worker.ts) mem-parse XML satu worksheet dan mengirim
 * baris per batch. Batch berikutnya baru dikirim setelah thread utama mengembalikan kredit, jadi
 * antrean per sheet ≤ MAX_INFLIGHT + 1 batch (memori terikat walau penulis lebih lambat dari parser).
 */
import { Worker } from "node:worker_threads";
import { XlsxLimitError, type SharedBook } from "./parser";
import type { RawValue } from "./types";

/**
 * Batch dikirim setelah ≥ BATCH_ROWS baris, ≥ BATCH_CELLS sel (sheet lebar: 2.048 kolom → 32 baris),
 * atau ≥ BATCH_CHARS karakter teks (± 2 MB UTF-16). Antrean per sheet ≤ (MAX_INFLIGHT + 1) batch.
 */
export const BATCH_ROWS = 1_000;
export const BATCH_CELLS = 64 * 1024;
export const BATCH_CHARS = 1024 * 1024;
export const MAX_INFLIGHT = 4;

/** [nomor baris fisik, nilai sel] per baris terisi. */
export type SheetRows = [number, RawValue[]][];

export type FromWorker =
  | { k: "rows"; rows: SheetRows; fraction: number }
  | { k: "end"; truncated: number }
  | { k: "error"; name: string; message: string; code?: string };
export type ToWorker = { k: "ack" };

export interface SheetJob {
  /** Jumlah sel terpotong di sheet; ditolak bila worker gagal atau dihentikan. */
  done: Promise<number>;
  /** Hentikan worker; selesai setelah thread keluar dan onRows yang sedang berjalan selesai. */
  stop(): Promise<void>;
}

const ENTRY = new URL("./sheet-worker.ts", import.meta.url);

/**
 * Batas heap per worker thread. Yang ditahan worker: cache string pendek (≤ 50k × 512 karakter ≈
 * 50 MB), batch yang sedang disusun (≤ 64k sel / 1 juta karakter, satu baris ≤ 4 juta karakter), dan
 * buffer saxes (< 1 MB); halaman spill di luar heap. Perkiraan < 150 MB, jadi 256 MB memberi ruang GC
 * sambil membatasi 4 thread (batas env) ≤ 1 GB di samping DuckDB 1 GB dalam worker 3 GB.
 */
export const WORKER_HEAP_MB = 256;

/**
 * Worker thread gagal dimulai/dimuat (konstruktor melempar, atau 'error'/'exit' sebelum pesan
 * pertama — mis. ERR_WORKER_INIT_FAILED, ERR_MODULE_NOT_FOUND): pemanggil membaca file berurutan.
 * Kehabisan heap (ERR_WORKER_OUT_OF_MEMORY) bukan galat mulai.
 */
export class WorkerStartError extends Error {
  constructor(cause: unknown) {
    super(
      `worker thread pembaca sheet gagal dimulai: ${cause instanceof Error ? cause.message : String(cause)}`,
      { cause },
    );
    this.name = "WorkerStartError";
  }
}

/**
 * Worker thread memuat TypeScript lewat tsx: di bawah tsx (worker produksi, skrip) loader diwarisi
 * lewat execArgv; selain itu (vitest) didaftarkan untuk thread itu.
 */
const execArgv = () =>
  process.execArgv.some((a) => a.includes("tsx"))
    ? undefined
    : [...process.execArgv, "--import", "tsx"];

/** Galat dari worker: XlsxLimitError tetap permanen, galat sistem membawa code (diulang BullMQ). */
function revive(m: { name: string; message: string; code?: string }): Error {
  if (m.name === "XlsxLimitError") return new XlsxLimitError(m.message);
  const e = new Error(m.message);
  e.name = m.name;
  return m.code ? Object.assign(e, { code: m.code }) : e;
}

/**
 * Baca sheet `sheet` dari `book` di worker thread. onRows dipanggil berurutan per batch (ditunggu
 * sebelum kredit dikembalikan); melempar → worker dihentikan dan `done` ditolak dengan galat itu.
 * `entry` hanya diganti uji (worker yang gagal dimuat).
 */
export function readSheetInWorker(
  book: SharedBook,
  sheet: number,
  onRows: (rows: SheetRows, fraction: number) => Promise<void>,
  entry: URL = ENTRY,
): SheetJob {
  let worker: Worker;
  try {
    worker = new Worker(entry, {
      workerData: { book, sheet },
      execArgv: execArgv(),
      resourceLimits: { maxOldGenerationSizeMb: WORKER_HEAP_MB },
    });
  } catch (e) {
    return { done: Promise.reject(new WorkerStartError(e)), stop: async () => {} };
  }
  let started = false;
  let stopped = false;
  let settled = false;
  let chain: Promise<void> = Promise.resolve();
  let settle!: { resolve: (n: number) => void; reject: (e: unknown) => void };
  const done = new Promise<number>((resolve, reject) => (settle = { resolve, reject }));
  const fail = (e: unknown) => {
    if (!settled) {
      settled = true;
      settle.reject(e);
    }
    stopped = true;
    void worker.terminate();
  };
  /** Mati sebelum pesan pertama (dan bukan dihentikan/kehabisan heap) = gagal dimulai. */
  const early = (e: unknown) =>
    !started && !stopped && (e as { code?: unknown } | null)?.code !== "ERR_WORKER_OUT_OF_MEMORY"
      ? new WorkerStartError(e)
      : e;
  worker.on("message", (m: FromWorker) => {
    started = true;
    if (m.k === "error") return fail(revive(m));
    chain = chain
      .then(async () => {
        if (stopped) return;
        if (m.k === "rows") {
          await onRows(m.rows, m.fraction);
          if (!stopped) worker.postMessage({ k: "ack" } satisfies ToWorker);
        } else {
          settled = true;
          settle.resolve(m.truncated);
          stopped = true;
          await worker.terminate();
        }
      })
      .catch(fail);
  });
  worker.on("error", (e) => fail(early(e)));
  worker.on("exit", (code) =>
    fail(early(new Error(`worker thread sheet berhenti sebelum selesai (kode ${code})`))),
  );
  return {
    done,
    stop: async () => {
      stopped = true;
      await worker.terminate();
      await chain;
    },
  };
}
