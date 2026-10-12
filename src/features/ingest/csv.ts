/*
 * CSV → raw.parquet lewat DuckDB read_csv (ADR-0005): sniff 64 KB (encoding/delimiter/quote),
 * transcode Windows-1252/BOM ke UTF-8, pindai jumlah kolom maksimum, lalu baca semua sebagai VARCHAR
 * dengan kolom eksplisit (baris pembuka yang lebih sempit dipadatkan NULL). _row = nomor record.
 */
import { createReadStream, createWriteStream } from "node:fs";
import { open } from "node:fs/promises";
import { join } from "node:path";
import { Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { ident, lit, type Duck } from "@/lib/duckdb";
import { CsvFormatError, scanCsv, sniffCsv } from "./csv-sniff";
import { columnNames, guessHeaderRow, type SampleRow } from "./header";
import { SAMPLE_ROWS, copyParquet } from "./raw-writer";
import type { SheetRecord } from "./ingest";

export const CSV_MAX_COLS = 16_384;
export const CSV_MAX_CELL = 32_767;
const MAX_LINE = 8 * 1024 * 1024;
// Buffer baca eksplisit (default DuckDB = 16 × max_line_size = 128 MB+) agar muat di memory_limit kecil.
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

/**
 * @param watch dipanggil berkala (≤ 5 s) selama query panjang; melempar → query diinterupsi.
 */
export async function csvToParquet(
  duck: Duck,
  src: string,
  work: string,
  watch: () => Promise<void>,
  onEstimate: (records: number) => void,
): Promise<CsvResult> {
  const sniff = sniffCsv(await readHead(src));
  let path = src;
  if (sniff.encoding !== "utf-8" || sniff.bom) {
    path = join(work, "source-utf8.csv");
    await toUtf8(src, path, sniff.encoding, sniff.bom);
  }
  const { maxFields, records, blanksBefore } = await scanCsv(path, sniff.delimiter, CSV_MAX_COLS);
  onEstimate(records);
  // DuckDB melewati baris kosong; nomor fisik = urutan record + baris kosong sebelumnya.
  let physical = "rn";
  if (blanksBefore.length) {
    await duck.conn.run("CREATE TEMP TABLE blanks (b INTEGER)");
    const a = await duck.conn.createAppender("blanks");
    for (const b of blanksBefore) {
      a.appendInteger(b);
      a.endRow();
    }
    a.flushSync();
    a.closeSync();
    physical = "rn + (SELECT count(*) FROM blanks WHERE blanks.b < src.rn)";
  }
  const n = maxFields;
  const cols = Array.from({ length: n }, (_, i) => `c${i + 1}`);
  const columns = `{${cols.map((c) => `${lit(c)}: 'VARCHAR'`).join(", ")}}`;
  const anyValue =
    n === 1 ? `${ident("c1")} IS NOT NULL` : `coalesce(${cols.map(ident).join(", ")}) IS NOT NULL`;

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
                       null_padding = true, max_line_size = ${MAX_LINE}, buffer_size = ${BUFFER}, columns = ${columns})
       )
       SELECT (${physical})::INTEGER AS _row, * EXCLUDE (rn) FROM src WHERE ${anyValue}`,
      { path, delim: sniff.delimiter },
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
  const truncated = Number(
    (
      await duck.conn.runAndReadAll(
        `SELECT ${cols.map((c) => `count(*) FILTER (WHERE length(${ident(c)}) > ${CSV_MAX_CELL})`).join(" + ")} AS t FROM s0`,
      )
    ).getRowObjects()[0]!.t,
  );
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
  );
  await duck.conn.run("DROP TABLE s0");
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
