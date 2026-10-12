/*
 * Penulis raw.parquet satu sheet (flow-kerja B3, D3): kolom posisional c1..cN VARCHAR + _row (nomor
 * baris fisik). Baris ditampung di tabel DuckDB (file DB di disk temp, bisa spill), di-flush per batch
 * (50k baris ATAU ± 64 MB teks), lalu di-COPY ke Parquet secara deterministik (1 thread, urut _row,
 * ukuran row group tetap untuk lebar tertentu) sehingga ingest yang diulang menghasilkan file identik.
 *
 * Tabel lebar: kapasitas kolom tumbuh geometris (×2) dengan membuat ulang tabel sekali, bukan ratusan
 * ALTER TABLE (yang membuat COPY kehabisan memori pada ± 1.000 kolom). Row group mengikuti lebar
 * (± 4 juta sel per grup) agar memori penulis Parquet terikat.
 */
import type { DuckDBAppender } from "@duckdb/node-api";
import type { Duck } from "@/lib/duckdb";
import { ident, lit } from "@/lib/duckdb";
import type { RawValue } from "@/lib/xlsx/types";
import type { SampleRow } from "./header";

export const BATCH_ROWS = 50_000;
export const BATCH_CHARS = 32 * 1024 * 1024; // ± 64 MB UTF-16
export const SAMPLE_ROWS = 30;
/**
 * Lebar maksimum raw.parquet yang teruji dalam memory_limit 1 GB (D7). Excel mengizinkan 16.384,
 * tetapi lembar selebar itu tidak bisa ditulis aman; sheet/CSV lebih lebar ditolak dengan pesan.
 */
export const MAX_RAW_COLS = 2_048;
const SAMPLE_CELL_CHARS = 256;
const CELLS_PER_ROW_GROUP = 4_000_000;

export class TooWideError extends Error {
  constructor(readonly cols: number) {
    super(
      `File memiliki ${cols.toLocaleString("id-ID")} kolom; maksimal ${MAX_RAW_COLS.toLocaleString("id-ID")} kolom per sheet. Hapus kolom yang tidak dipakai lalu unggah lagi.`,
    );
    this.name = "TooWideError";
  }
}

/** Ukuran row group untuk lebar tertentu (deterministik). 30 kolom → 122.880 (default DuckDB). */
export function rowGroupSize(cols: number): number {
  return Math.max(2_048, Math.min(122_880, Math.floor(CELLS_PER_ROW_GROUP / Math.max(1, cols))));
}

const pad = (n: number, w = 2) => String(n).padStart(w, "0");

/** Nilai sel → teks raw. Tanggal naive ISO (D8): tanpa jam bila 00:00:00. */
export function rawText(v: RawValue): string | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "string") return v === "" ? null : v;
  if (typeof v === "boolean") return v ? "TRUE" : "FALSE";
  if (typeof v === "number") return Number.isFinite(v) ? String(v) : null;
  const d = `${pad(v.getUTCFullYear(), 4)}-${pad(v.getUTCMonth() + 1)}-${pad(v.getUTCDate())}`;
  const h = v.getUTCHours();
  const m = v.getUTCMinutes();
  const s = v.getUTCSeconds();
  return h || m || s ? `${d}T${pad(h)}:${pad(m)}:${pad(s)}` : d;
}

const colDefs = (from: number, to: number) =>
  Array.from({ length: to - from + 1 }, (_, i) => `${ident(`c${from + i}`)} VARCHAR`).join(", ");
const colList = (n: number) => Array.from({ length: n }, (_, i) => ident(`c${i + 1}`)).join(", ");

export class RawSheetWriter {
  private appender: DuckDBAppender | null = null;
  /** Kolom yang benar-benar terpakai (lebar baris terlebar). */
  private width = 0;
  /** Kolom yang ada di tabel (≥ width). */
  private capacity = 0;
  private batchRows = 0;
  private batchChars = 0;
  rows = 0;
  readonly sample: SampleRow[] = [];

  private constructor(
    private readonly duck: Duck,
    private readonly table: string,
    private readonly onBatch: (rows: number) => Promise<void>,
    private readonly batchLimit: number,
  ) {}

  static async create(
    duck: Duck,
    table: string,
    onBatch: (rows: number) => Promise<void>,
    batchLimit = BATCH_ROWS,
  ) {
    const w = new RawSheetWriter(duck, table, onBatch, batchLimit);
    await duck.conn.run(`DROP TABLE IF EXISTS ${ident(table)}`);
    w.capacity = 32;
    await duck.conn.run(`CREATE TABLE ${ident(table)} (_row INTEGER, ${colDefs(1, w.capacity)})`);
    w.appender = await duck.conn.createAppender(table);
    return w;
  }

  get colCount() {
    return this.width;
  }

  /** Perbesar kapasitas (×2, minimal sampai `need`) dengan membuat ulang tabel sekali. */
  private async grow(need: number) {
    if (need > MAX_RAW_COLS) throw new TooWideError(need);
    const next = Math.min(MAX_RAW_COLS, Math.max(need, this.capacity * 2));
    this.appender!.flushSync();
    this.appender!.closeSync();
    const t = ident(this.table);
    const tmp = ident(`${this.table}_grow`);
    await this.duck.conn.run(`DROP TABLE IF EXISTS ${tmp}`);
    await this.duck.conn.run(`CREATE TABLE ${tmp} (_row INTEGER, ${colDefs(1, next)})`);
    await this.duck.conn.run(
      `INSERT INTO ${tmp} (_row, ${colList(this.capacity)}) SELECT _row, ${colList(this.capacity)} FROM ${t}`,
    );
    await this.duck.conn.run(`DROP TABLE ${t}`);
    await this.duck.conn.run(`ALTER TABLE ${tmp} RENAME TO ${t}`);
    this.capacity = next;
    this.appender = await this.duck.conn.createAppender(this.table);
  }

  async add(row: number, vals: RawValue[]) {
    if (vals.length > this.capacity) await this.grow(vals.length);
    if (vals.length > this.width) this.width = vals.length;
    const a = this.appender!;
    a.appendInteger(row);
    let chars = 0;
    for (let c = 0; c < this.capacity; c++) {
      const t = c < vals.length ? rawText(vals[c]) : null;
      if (t === null) a.appendNull();
      else {
        a.appendVarchar(t);
        chars += t.length;
      }
    }
    a.endRow();
    this.rows++;
    if (this.sample.length < SAMPLE_ROWS) {
      this.sample.push({
        row,
        vals: vals.map((v) => (typeof v === "string" ? v.slice(0, SAMPLE_CELL_CHARS) : v)),
      });
    }
    this.batchRows++;
    this.batchChars += chars;
    if (this.batchRows >= this.batchLimit || this.batchChars >= BATCH_CHARS) await this.flush();
  }

  async flush() {
    this.appender!.flushSync();
    this.batchRows = 0;
    this.batchChars = 0;
    await this.onBatch(this.rows);
  }

  /** Tutup appender lalu tulis Parquet (kolom c1..c<lebar terpakai>); tabel dihapus setelahnya. */
  async finish(path: string): Promise<void> {
    this.appender!.flushSync();
    this.appender!.closeSync();
    this.appender = null;
    const cols = Math.max(this.width, 1);
    this.width = cols;
    await copyParquet(
      this.duck,
      `SELECT _row, ${colList(cols)} FROM ${ident(this.table)} ORDER BY _row`,
      path,
      cols,
    );
    await this.duck.conn.run(`DROP TABLE ${ident(this.table)}`);
  }

  close() {
    try {
      this.appender?.closeSync();
    } catch {
      /* sudah ditutup */
    }
    this.appender = null;
  }
}

/** COPY hasil query ke Parquet secara deterministik (1 thread, row group sesuai lebar, zstd). */
export async function copyParquet(duck: Duck, select: string, path: string, cols: number) {
  // RESET mengembalikan ke default sistem (semua core), bukan batas D7 — simpan dan pulihkan.
  const prev = (
    await duck.conn.runAndReadAll("SELECT current_setting('threads') AS t")
  ).getRowObjects()[0]!.t;
  await duck.conn.run("SET threads = 1");
  try {
    await duck.conn.run(
      `COPY (${select}) TO ${lit(path)} (FORMAT parquet, COMPRESSION zstd, ROW_GROUP_SIZE ${rowGroupSize(cols)})`,
    );
  } finally {
    await duck.conn.run(`SET threads = ${Number(prev)}`);
  }
}
