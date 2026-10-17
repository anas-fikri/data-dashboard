/*
 * Sheet xlsx paralel saat ingest (T-de1b; T-024: sheet dibaca berurutan, satu thread). Workbook,
 * styles, dan sharedStrings dibaca sekali di thread utama; XML tiap sheet di-parse di worker thread
 * (≤ `threads` sekaligus, mulai urut indeks sheet). Penulisan DuckDB tetap di thread utama lewat satu
 * koneksi yang diserialkan (kunci `db`): RawSheetWriter dan COPY sama dengan jalur berurutan, jadi
 * raw.parquet identik byte-per-byte dan memory_limit DuckDB tidak berubah.
 * Progres = sheet terkecil yang belum selesai (indeks sheet dan barisnya tidak pernah mundur). Galat
 * pertama (sheet mana pun, dataset dihapus, deadline) menghentikan semua worker lalu dilempar dengan
 * lokasi sheet yang gagal. Worker thread gagal dimulai sebelum ada baris → tabel/file percobaan
 * dibuang lalu WorkerStartError dilempar agar pemanggil membaca berurutan.
 */
import { rmSync } from "node:fs";
import { join } from "node:path";
import { ident, type Duck } from "@/lib/duckdb";
import { readSheetInWorker, WorkerStartError, type SheetJob } from "@/lib/xlsx/parallel";
import { openSharedBook, type SaxLimits } from "@/lib/xlsx/parser";
import { columnNames, guessHeaderRow } from "./header";
import type { IngestOptions, IngestProgress, SheetRecord } from "./ingest";
import { previewOf } from "./preview";
import { RawSheetWriter } from "./raw-writer";

/** XML sheet ≥ ambang ini (tak terkompresi, ± 15 ribu baris × 30 kolom) dihitung besar. */
export const PARALLEL_MIN_SHEET_BYTES = 16 * 1024 * 1024;

/** Metadata sheet dari writer yang sudah finish (jalur berurutan dan paralel). */
export function sheetRecord(
  index: number,
  name: string,
  w: RawSheetWriter,
  truncatedCells: number,
): SheetRecord {
  const headerRow = guessHeaderRow(w.sample);
  const cols = Math.max(w.colCount, 1);
  return {
    index,
    name,
    rawRows: w.rows,
    colCount: cols,
    headerRow,
    columns: columnNames(w.sample.find((r) => r.row === headerRow)?.vals ?? [], cols),
    truncatedCells,
    preview: previewOf(w.sample, cols),
  };
}

/** Langkah sheet lain setelah ada galat: dihentikan diam-diam (galat pertama yang dilaporkan). */
const ABORTED = new Error("dihentikan karena sheet lain gagal");

export async function xlsxSheetsParallel(
  duck: Duck,
  src: string,
  work: string,
  limits: SaxLimits,
  threads: number,
  setProgress: (p: Partial<IngestProgress>) => void,
  ensureAlive: () => Promise<void>,
  opts: Pick<IngestOptions, "batchRows" | "afterBatch">,
  at: { row: number },
): Promise<{ rec: SheetRecord; path: string }[]> {
  const shared = await openSharedBook(src, work, limits);
  const { sheets } = shared.book;
  const st = sheets.map(() => ({ rows: 0, fraction: 0, row: 0, done: false }));
  const out: { rec: SheetRecord; path: string }[] = [];
  const writers = new Set<RawSheetWriter>();
  const tables: number[] = [];
  let rowsSeen = false;
  const jobs = new Set<SheetJob>();
  // Diubah di dalam closure: tanpa `as`, TS menyempitkannya ke null selamanya.
  let failure = null as { error: unknown; sheet: number } | null;
  const check = () => {
    if (failure) throw ABORTED;
  };
  // Satu koneksi DuckDB untuk semua sheet: setiap langkah yang menyentuhnya diserialkan (FIFO).
  let tail: Promise<unknown> = Promise.resolve();
  const db = <T>(fn: () => Promise<T>): Promise<T> => {
    const r = tail.then(fn);
    tail = r.catch(() => {});
    return r;
  };
  const show = (i = st.findIndex((s) => !s.done)) => {
    const s = st[i];
    if (!s) return;
    setProgress({ sheet: i, sheetName: sheets[i]!.name, rows: s.rows, fraction: s.fraction });
    at.row = s.row;
  };

  const one = async (i: number) => {
    const s = st[i]!;
    const w = await db(() =>
      RawSheetWriter.create(
        duck,
        `s${i}`,
        async (rows) => {
          s.rows = rows;
          show();
          await ensureAlive();
          await opts.afterBatch?.(i, rows);
        },
        { batchLimit: opts.batchRows, watch: ensureAlive },
      ),
    );
    writers.add(w);
    tables.push(i);
    check();
    const job = readSheetInWorker(shared.book, i, (rows, fraction) =>
      db(async () => {
        check();
        rowsSeen = true;
        for (const [row, vals] of rows) {
          s.row = row;
          await w.add(row, vals);
        }
        s.rows = w.rows;
        s.fraction = fraction;
        show();
      }),
    );
    jobs.add(job);
    let truncated: number;
    try {
      truncated = await job.done;
    } catch (e) {
      await job.stop();
      throw e;
    } finally {
      jobs.delete(job);
    }
    const path = join(work, `sheet-${i}.parquet`);
    await db(async () => {
      check();
      s.rows = w.rows;
      s.fraction = 1;
      show();
      await w.finish(path);
    });
    writers.delete(w);
    out[i] = { path, rec: sheetRecord(i, sheets[i]!.name, w, truncated) };
    s.done = true;
    show();
    await ensureAlive();
  };

  let next = 0;
  const lane = async () => {
    while (!failure && next < sheets.length) {
      const i = next++;
      try {
        await one(i);
      } catch (e) {
        if (failure) continue;
        failure = { error: e, sheet: i };
        await Promise.all([...jobs].map((j) => j.stop()));
      }
    }
  };
  try {
    await Promise.all(Array.from({ length: Math.min(threads, sheets.length) }, lane));
    await tail; // langkah DuckDB yang masih antre selesai sebelum koneksi dipakai tahap berikutnya
    if (failure?.error instanceof WorkerStartError && !rowsSeen) {
      // Belum ada baris dari worker mana pun: buang sisa percobaan agar jalur berurutan mulai bersih.
      for (const w of writers) w.close();
      writers.clear();
      for (const i of tables) await duck.conn.run(`DROP TABLE IF EXISTS ${ident(`s${i}`)}`);
      for (const s of out) if (s) rmSync(s.path, { force: true });
      throw failure.error;
    }
    if (failure) {
      show(failure.sheet); // lokasi pesan gagal = sheet yang gagal
      // Gagal mulai setelah ada baris tertulis: galat sementara biasa (BullMQ mengulang dari bersih),
      // bukan alih ke jalur berurutan di atas sisa percobaan ini.
      const e = failure.error;
      throw e instanceof WorkerStartError ? new Error(e.message, { cause: e.cause }) : e;
    }
    return out;
  } finally {
    for (const w of writers) w.close();
    shared.close();
  }
}
