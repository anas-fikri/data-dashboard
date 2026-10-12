/*
 * CSV → raw.parquet lewat DuckDB read_csv (ADR-0005):
 *   1. delimiter dari 64 KB pertama; UTF-16 ditolak;
 *   2. pindai seluruh file (byte): kolom maksimum, record, baris kosong, akhir baris, validitas UTF-8;
 *   3. encoding dari pindaian seluruh file (bukan hanya 64 KB): UTF-8 valid → apa adanya (BOM dibuang),
 *      selain itu Windows-1252 → transcode ke UTF-8;
 *   4. DuckDB membaca semua sebagai VARCHAR dengan kolom eksplisit, satu thread pembaca, ke tabel r0
 *      (parallel = false: pemindai paralel tidak mendukung baris baru di dalam kutip + null_padding);
 *   5. _row = nomor fisik (termasuk baris kosong, seperti Excel): rowid r0, ditambah offset baris
 *      kosong kumulatif (ASOF JOIN sempit + POSITIONAL JOIN) bila ada.
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
import { MAX_RAW_COLS, SAMPLE_ROWS, copyParquet } from "./raw-writer";

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
  const scan = await scanCsv(src, delimiter, MAX_RAW_COLS);
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
  const r0Cols = cols.map((c) => `r0.${ident(c)}`);
  const anyValue =
    n === 1 ? `${r0Cols[0]} IS NOT NULL` : `coalesce(${r0Cols.join(", ")}) IS NOT NULL`;
  const buffer = Math.max(opts.bufferSize ?? BUFFER, 1024 * 1024);
  const maxLine = Math.min(MAX_LINE, buffer);

  // Watchdog: query panjang diinterupsi bila dataset dihapus / deadline lewat.
  const watched = async <T>(fn: () => Promise<T>): Promise<T> => {
    let watchErr: unknown = null;
    const timer = setInterval(() => {
      watch().catch((e: unknown) => {
        watchErr ??= e;
        duck.interrupt();
      });
    }, 5_000);
    try {
      const r = await fn();
      if (watchErr) throw watchErr;
      return r;
    } catch (e) {
      throw watchErr ?? e;
    } finally {
      clearInterval(timer);
    }
  };

  // Muat apa adanya: satu pembaca + urutan sisip dipertahankan → rowid = urutan record. Tanpa
  // window row_number(): operator window menyimpan semua kolom per blok dan OOM pada tabel lebar
  // (1.100 kolom sudah > 256 MB walau hanya 2 baris).
  await watched(() =>
    duck.conn.run(
      `CREATE TABLE r0 AS
       SELECT * FROM read_csv($path, header = false, auto_detect = false, delim = $delim, quote = '"',
                              escape = '"', null_padding = true, parallel = false,
                              max_line_size = ${maxLine}, buffer_size = ${buffer}${scan.crOnly ? ", new_line = '\\r'" : ""},
                              columns = ${columns})`,
      { path, delim: delimiter },
    ),
  );
  await watch();

  // Nomor fisik. CSV satu kolom: DuckDB mengembalikan baris kosong sebagai NULL (sudah terhitung di
  // rowid). Lebih dari satu kolom: baris kosong dilewati → tambah jumlah baris kosong sebelumnya.
  // ASOF JOIN hanya atas kolom rowid (sempit), lalu POSITIONAL JOIN streaming ke tabel lebar.
  let physical = "(r0.rowid + 1)::INTEGER";
  let from = "r0";
  if (n > 1 && scan.blanksBefore.length) {
    await duck.conn.run("CREATE TABLE blank_cum (b INTEGER, c INTEGER)");
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
    await watched(() =>
      duck.conn.run(
        `CREATE TABLE pos AS
         SELECT (r.rid + 1 + coalesce(blank_cum.c, 0))::INTEGER AS _row
         FROM (SELECT rowid AS rid FROM r0) r ASOF LEFT JOIN blank_cum ON r.rid + 1 > blank_cum.b
         ORDER BY r.rid`,
      ),
    );
    physical = "pos._row";
    from = "r0 POSITIONAL JOIN pos";
  }
  await duck.conn.run(
    `CREATE VIEW s0 AS SELECT ${physical} AS _row, ${r0Cols.map((c, i) => `${c} AS ${ident(cols[i]!)}`).join(", ")}
     FROM ${from} WHERE ${anyValue}`,
  );

  // Satu pass: jumlah baris + sel terpotong. Satu list datar per baris: rantai a + b + … melampaui
  // batas kedalaman ekspresi, dan N agregat FILTER tumbuh superlinear (2.048 kolom ≈ 5 s per baris).
  const agg = (
    await watched(() =>
      duck.conn.runAndReadAll(
        `SELECT count(*) AS n,
                coalesce(sum(len(list_filter([${cols.map((c) => `length(${ident(c)})`).join(", ")}], l -> l > ${CSV_MAX_CELL}))), 0) AS t
         FROM s0`,
      ),
    )
  ).getRowsJS()[0] as unknown[];
  const rows = Number(agg[0]);
  if (rows === 0) throw new CsvFormatError("File CSV tidak berisi data.");
  const truncated = Number(agg[1]);
  // Top-N lebar (ORDER BY … LIMIT atas semua kolom) OOM pada tabel lebar seperti window; urutkan
  // kolom _row saja lalu ambil barisnya.
  const sampleRows = (
    await watched(() =>
      duck.conn.runAndReadAll(
        `SELECT * FROM s0
         WHERE _row <= (SELECT max(_row) FROM (SELECT _row FROM s0 ORDER BY _row LIMIT ${SAMPLE_ROWS}))`,
      ),
    )
  ).getRowsJS() as unknown[][];
  sampleRows.sort((a, b) => Number(a[0]) - Number(b[0]));
  const sample: SampleRow[] = sampleRows.map((r) => ({
    row: Number(r[0]),
    vals: r.slice(1).map((v) => (typeof v === "string" ? v.slice(0, 256) : null)),
  }));
  const out = join(work, "sheet-0.parquet");
  await watched(() =>
    copyParquet(
      duck,
      `SELECT _row, ${cols.map((c) => `left(${ident(c)}, ${CSV_MAX_CELL}) AS ${ident(c)}`).join(", ")} FROM s0 ORDER BY _row`,
      out,
      n,
    ),
  );
  await duck.conn.run("DROP VIEW s0");
  await duck.conn.run("DROP TABLE IF EXISTS pos");
  await duck.conn.run("DROP TABLE IF EXISTS blank_cum");
  await duck.conn.run("DROP TABLE r0");
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
