/*
 * Penulis raw.parquet satu sheet (flow-kerja B3, D3): kolom posisional c1..cN VARCHAR + _row (nomor
 * baris fisik). Baris ditampung di tabel DuckDB (file DB di disk temp, bisa spill), di-flush per batch
 * (50k baris ATAU ± 64 MB teks), lalu di-COPY ke Parquet secara deterministik (1 thread, urut _row)
 * sehingga ingest yang diulang menghasilkan file identik.
 */
import type { DuckDBAppender } from "@duckdb/node-api";
import type { Duck } from "@/lib/duckdb";
import { ident, lit } from "@/lib/duckdb";
import type { RawValue } from "@/lib/xlsx/types";
import type { SampleRow } from "./header";

export const BATCH_ROWS = 50_000;
export const BATCH_CHARS = 32 * 1024 * 1024; // ± 64 MB UTF-16
export const SAMPLE_ROWS = 30;
const SAMPLE_CELL_CHARS = 256;

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

export class RawSheetWriter {
  private appender: DuckDBAppender | null = null;
  private width = 0;
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
    await duck.conn.run(`CREATE TABLE ${ident(table)} (_row INTEGER)`);
    w.appender = await duck.conn.createAppender(table);
    return w;
  }

  get colCount() {
    return this.width;
  }

  /** Tambah kolom saat baris lebih lebar dari sebelumnya (appender ditutup lalu dibuka ulang). */
  private async widen(to: number) {
    this.appender!.flushSync();
    this.appender!.closeSync();
    for (let c = this.width + 1; c <= to; c++) {
      await this.duck.conn.run(
        `ALTER TABLE ${ident(this.table)} ADD COLUMN ${ident(`c${c}`)} VARCHAR`,
      );
    }
    this.width = to;
    this.appender = await this.duck.conn.createAppender(this.table);
  }

  async add(row: number, vals: RawValue[]) {
    if (vals.length > this.width) await this.widen(vals.length);
    const a = this.appender!;
    a.appendInteger(row);
    let chars = 0;
    for (let c = 0; c < this.width; c++) {
      const t = rawText(vals[c]);
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

  /** Tutup appender lalu tulis Parquet (deterministik) ke `path`; tabel dihapus setelahnya. */
  async finish(path: string): Promise<void> {
    this.appender!.flushSync();
    this.appender!.closeSync();
    this.appender = null;
    if (this.width === 0)
      await this.duck.conn.run(`ALTER TABLE ${ident(this.table)} ADD COLUMN c1 VARCHAR`);
    this.width = Math.max(this.width, 1);
    await copyParquet(this.duck, `SELECT * FROM ${ident(this.table)} ORDER BY _row`, path);
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

/** COPY hasil query ke Parquet secara deterministik (1 thread, row group tetap, zstd). */
export async function copyParquet(duck: Duck, select: string, path: string) {
  // RESET mengembalikan ke default sistem (semua core), bukan batas D7 — simpan dan pulihkan.
  const prev = (
    await duck.conn.runAndReadAll("SELECT current_setting('threads') AS t")
  ).getRowObjects()[0]!.t;
  await duck.conn.run("SET threads = 1");
  try {
    await duck.conn.run(
      `COPY (${select}) TO ${lit(path)} (FORMAT parquet, COMPRESSION zstd, ROW_GROUP_SIZE 122880)`,
    );
  } finally {
    await duck.conn.run(`SET threads = ${Number(prev)}`);
  }
}
