/*
 * CSV → raw.parquet lewat DuckDB read_csv (ADR-0005):
 *   1. delimiter dari 64 KB pertama; UTF-16 ditolak;
 *   2. pindai seluruh file (byte): kolom maksimum, record, baris kosong, akhir baris, validitas UTF-8;
 *   3. encoding dari pindaian seluruh file (bukan hanya 64 KB): UTF-8 valid → apa adanya (BOM dibuang),
 *      selain itu Windows-1252 → transcode ke UTF-8;
 *   4. DuckDB membaca semua sebagai VARCHAR dengan kolom eksplisit, satu thread pembaca
 *      (parallel = false: pemindai paralel tidak mendukung baris baru di dalam kutip + null_padding);
 *   5. _row = nomor fisik (termasuk baris kosong, seperti Excel) lewat ASOF JOIN offset kumulatif.
 */
import { createReadStream, createWriteStream } from "node:fs";
import { open } from "node:fs/promises";
import { join } from "node:path";
import { Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { ident, lit, type Duck } from "@/lib/duckdb";
import { CsvFormatError, rejectUtf16, scanCsv, sniffDelimiter } from "./csv-sniff";
import { columnNames, guessHeaderRow, type SampleRow } from "./header";
import type { SheetRecord } from "./ingest";
import { MAX_RAW_COLS, SAMPLE_ROWS, TooWideError, copyParquet } from "./raw-writer";

export const CSV_MAX_CELL = 32_767;
const MAX_LINE = 8 * 1024 * 1024;
// Buffer baca eksplisit (default DuckDB = 16 × max_line_size) agar muat di memory_limit kecil.
const BUFFER = 32 * 1024 * 1024;

async function readHead(path: string, bytes = 64 * 1024): Promise<Uint8Array> {
  const fh = await open(path, "r");
  try {
    const buf = Buffer.alloc(bytes);
    const { bytesRead } = await fh.read(buf, 0, bytes, 0);
    return buf.subarray(0, bytesRead);
  } finally {
    await fh.close();
  }
}

/** Ubah ke UTF-8 tanpa BOM (Windows-1252 → UTF-8 lewat TextDecoder streaming). */
async function toUtf8(src: string, dest: string, encoding: "utf-8" | "windows-1252", bom: boolean) {
  const dec = new TextDecoder(encoding);
  let first = true;
  await pipeline(
    createReadStream(src, { highWaterMark: 1 << 20 }),
    new Transform({
      transform(chunk: Buffer, _enc, cb) {
        let b: Uint8Array = chunk;
        if (first && bom) b = b.subarray(3);
        first = false;
        cb(null, Buffer.from(dec.decode(b, { stream: true }), "utf8"));
      },
      flush(cb) {
        cb(null, Buffer.from(dec.decode(), "utf8"));
      },
    }),
    createWriteStream(dest),
  );
}

export interface CsvResult {
  rec: SheetRecord;
  path: string;
}

export interface CsvOptions {
  /** Uji: buffer baca DuckDB lebih kecil agar file kecil melintasi beberapa buffer. */
  bufferSize?: number;
}

/**
 * @param watch dipanggil berkala (≤ 5 s) selama query panjang; melempar → query diinterupsi.
 */
export async function csvToParquet(
  duck: Duck,
  src: string,
  work: string,
  watch: () => Promise<void>,
  onEstimate: (records: number) => void,
  opts: CsvOptions = {},
): Promise<CsvResult> {
  const head = await readHead(src);
  rejectUtf16(head);
  const delimiter = sniffDelimiter(head);
  const scan = await scanCsv(src, delimiter, MAX_RAW_COLS + 1);
  if (scan.maxFields > MAX_RAW_COLS) throw new TooWideError(scan.maxFields);
  if (scan.records === 0) throw new CsvFormatError("File CSV tidak berisi data.");
  onEstimate(scan.records);

  let path = src;
  if (!scan.utf8 || scan.bom) {
    path = join(work, "source-utf8.csv");
    await toUtf8(src, path, scan.utf8 ? "utf-8" : "windows-1252", scan.bom);
  }

  const n = scan.maxFields;
  const cols = Array.from({ length: n }, (_, i) => `c${i + 1}`);
  const columns = `{${cols.map((c) => `${lit(c)}: 'VARCHAR'`).join(", ")}}`;
  const anyValue =
    n === 1 ? `${ident("c1")} IS NOT NULL` : `coalesce(${cols.map(ident).join(", ")}) IS NOT NULL`;
  const buffer = Math.max(opts.bufferSize ?? BUFFER, 1024 * 1024);
  const maxLine = Math.min(MAX_LINE, buffer);

  // Nomor fisik. CSV satu kolom: DuckDB mengembalikan baris kosong sebagai NULL (sudah terhitung di
  // rn). Lebih dari satu kolom: baris kosong dilewati → tambah jumlah baris kosong sebelumnya
  // lewat ASOF JOIN atas offset kumulatif (linear, bukan subquery berkorelasi).
  let asofJoin = "";
  let physical = "rn";
  if (n > 1 && scan.blanksBefore.length) {
    await duck.conn.run("CREATE TEMP TABLE blank_cum (b INTEGER, c INTEGER)");
    const a = await duck.conn.createAppender("blank_cum");
    const bb = scan.blanksBefore;
    for (let i = 0; i < bb.length; i++) {
      // Satu entri per nilai b (yang terakhir dari deretan nilai sama membawa jumlah kumulatif).
      if (i + 1 < bb.length && bb[i + 1] === bb[i]) continue;
      a.appendInteger(bb[i]!);
      a.appendInteger(i + 1);
      a.endRow();
    }
    a.flushSync();
    a.closeSync();
    asofJoin = "ASOF LEFT JOIN blank_cum ON src.rn > blank_cum.b";
    physical = "rn + coalesce(blank_cum.c, 0)";
  }

  // Watchdog: query panjang diinterupsi bila dataset dihapus / deadline lewat.
  let watchErr: unknown = null;
  const timer = setInterval(() => {
    watch().catch((e: unknown) => {
      watchErr ??= e;
      duck.interrupt();
    });
  }, 5_000);
  try {
    await duck.conn.run(
      `CREATE TABLE s0 AS
       WITH src AS (
         SELECT row_number() OVER () AS rn, *
         FROM read_csv($path, header = false, auto_detect = false, delim = $delim, quote = '"', escape = '"',
                       null_padding = true, parallel = false, max_line_size = ${maxLine},
                       buffer_size = ${buffer}${scan.crOnly ? ", new_line = '\\r'" : ""}, columns = ${columns})
       )
       SELECT (${physical})::INTEGER AS _row, ${cols.map(ident).join(", ")}
       FROM src ${asofJoin}
       WHERE ${anyValue}
       ORDER BY rn`,
      { path, delim: delimiter },
    );
  } catch (e) {
    if (watchErr) throw watchErr;
    throw e;
  } finally {
    clearInterval(timer);
  }
  if (watchErr) throw watchErr;
  await watch();

  const rows = Number(
    (await duck.conn.runAndReadAll("SELECT count(*) AS n FROM s0")).getRowObjects()[0]!.n,
  );
  if (rows === 0) throw new CsvFormatError("File CSV tidak berisi data.");
  // Daftar agregat datar (bukan rantai a + b + … yang melampaui batas kedalaman ekspresi).
  const counts = (
    await duck.conn.runAndReadAll(
      `SELECT ${cols.map((c, i) => `count(*) FILTER (WHERE length(${ident(c)}) > ${CSV_MAX_CELL}) AS t${i}`).join(", ")} FROM s0`,
    )
  ).getRowsJS()[0] as unknown[];
  const truncated = counts.reduce((s: number, v) => s + Number(v), 0);
  const sampleRows = (
    await duck.conn.runAndReadAll(`SELECT * FROM s0 ORDER BY _row LIMIT ${SAMPLE_ROWS}`)
  ).getRowsJS() as unknown[][];
  const sample: SampleRow[] = sampleRows.map((r) => ({
    row: Number(r[0]),
    vals: r.slice(1).map((v) => (typeof v === "string" ? v.slice(0, 256) : null)),
  }));
  const out = join(work, "sheet-0.parquet");
  await copyParquet(
    duck,
    `SELECT _row, ${cols.map((c) => `left(${ident(c)}, ${CSV_MAX_CELL}) AS ${ident(c)}`).join(", ")} FROM s0 ORDER BY _row`,
    out,
    n,
  );
  await duck.conn.run("DROP TABLE s0");
  await duck.conn.run("DROP TABLE IF EXISTS blank_cum");
  const headerRow = guessHeaderRow(sample);
  return {
    path: out,
    rec: {
      index: 0,
      name: "CSV",
      rawRows: rows,
      colCount: n,
      headerRow,
      columns: columnNames(sample.find((s) => s.row === headerRow)?.vals ?? [], n),
      truncatedCells: truncated,
    },
  };
}
