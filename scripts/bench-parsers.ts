/*
 * Benchmark satu parser atas satu fixture (T-005). Dijalankan per proses agar puncak RSS terpisah:
 *
 *   npx tsx scripts/bench-parsers.ts --file tests/fixtures/perf/besar.xlsx --parser sax [--verify]
 *
 * parser: exceljs | duckdb | sax | duckdb-csv. Membaca <file>.manifest.json (dari make-fixture).
 * --verify membandingkan SETIAP sel dengan model fixture (lambat; pakai untuk fixture ≤ ~200k baris).
 * Keluaran: satu baris JSON (waktu, puncak RSS, baris, sel, ketidakcocokan).
 */
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { duckdbParser } from "./bench/parser-duckdb";
import { parseCsvDuckdb } from "./bench/parser-duckdb-csv";
import { exceljsParser } from "./bench/parser-exceljs";
import { createSaxParser } from "./bench/parser-sax";
import type { Parser, RawValue } from "./bench/types";
import {
  columnKinds,
  fnv1a,
  dataCell,
  ddmmyyyy,
  headerNames,
  isoDate,
  preambleRows,
  type Cell,
  type FixtureOptions,
  type SheetManifest,
} from "./fixtures/model";

interface Manifest {
  file: string;
  bytes: number;
  params: FixtureOptions & { kind: "xlsx" | "csv"; delimiter: string; numberLocale: "id" | "us" };
  sheets: SheetManifest[];
}

const arg = (n: string) => {
  const i = process.argv.indexOf(`--${n}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const file = arg("file");
const parserName = arg("parser");
const verify = process.argv.includes("--verify");
if (!file || !parserName) {
  console.error("pakai: --file <fixture> --parser exceljs|duckdb|sax|duckdb-csv [--verify]");
  process.exit(1);
}
const manifest = JSON.parse(readFileSync(`${file}.manifest.json`, "utf8")) as Manifest;
const opts = manifest.params;

// Puncak RSS proses (termasuk memori native DuckDB), sampel tiap 100 ms.
// Pengaman mesin benchmark: hentikan bila RSS > RSS_ABORT_MB (default 6000) dan laporkan.
const rssAbortMB = Number(process.env.RSS_ABORT_MB ?? 6000);
const startedAt = performance.now();
let peakRss = process.memoryUsage().rss;
const sampler = setInterval(() => {
  peakRss = Math.max(peakRss, process.memoryUsage().rss);
  if (peakRss / 1048576 > rssAbortMB) {
    console.log(
      JSON.stringify({
        parser: parserName,
        file: manifest.file,
        aborted: `RSS melewati ${rssAbortMB} MB setelah ${Math.round((performance.now() - startedAt) / 1000)} s`,
        peakRssMB: Math.round(peakRss / 1048576),
        rowsSoFar: stats.map((s) => s?.emittedRows ?? 0),
      }),
    );
    process.exit(2);
  }
}, 100);

function expectedCell(sheet: number, row: number, col: number): Cell {
  const hr = opts.headerRow;
  if (row < hr) {
    const p = preambleRows(opts, sheet)[row - 1];
    return col === 0 && p ? { t: "s", v: p } : null;
  }
  if (row === hr) {
    const h = headerNames(opts)[col];
    return h ? { t: "s", v: h } : null;
  }
  const r = row - hr - 1;
  if (r >= opts.rows || col >= opts.cols) return null;
  return dataCell(opts, sheet, r, col, kinds[col]!);
}
const kinds = columnKinds(opts);
const EXCEL_EPOCH = Date.UTC(1899, 11, 30);

function colLetter(n: number): string {
  let s = "";
  for (let x = n; x > 0; x = Math.floor((x - 1) / 26))
    s = String.fromCharCode(65 + ((x - 1) % 26)) + s;
  return s;
}

function matches(exp: Cell, got: RawValue, csv: boolean): boolean {
  const empty = got === null || got === undefined || got === "";
  if (exp === null) return empty;
  if (empty) return false;
  if (exp.t === "s") return got === exp.v;
  if (exp.t === "n") {
    if (typeof got === "number") return Math.abs(got - exp.v) < 1e-9;
    const s = String(got);
    const n = csv && opts.numberLocale === "id" ? Number(s.replace(",", ".")) : Number(s);
    return Math.abs(n - exp.v) < 1e-9;
  }
  const t = exp.v.getTime();
  if (got instanceof Date) return Math.abs(got.getTime() - t) < 1000;
  const s = String(got);
  if (csv) return s === ddmmyyyy(exp.v);
  if (s.startsWith(isoDate(exp.v))) return true;
  const serial = Number(s);
  return Number.isFinite(serial) && Math.abs(EXCEL_EPOCH + serial * 86_400_000 - t) < 1000;
}

interface SheetStats {
  emittedRows: number;
  nonEmptyRows: number;
  cells: number;
  mismatches: number;
  examples: string[];
  /** XOR fnv1a("<baris>:<kolom>:<teks>") atas nilai string — dibandingkan dengan manifest. */
  textChecksum: number;
}
const stats: SheetStats[] = [];
const statOf = (s: number) =>
  (stats[s] ??= {
    emittedRows: 0,
    nonEmptyRows: 0,
    cells: 0,
    mismatches: 0,
    examples: [],
    textChecksum: 0,
  });

function onRow(sheet: number, rowNumber: number, values: RawValue[], csv = false) {
  const st = statOf(sheet);
  st.emittedRows++;
  let any = false;
  for (let c = 0; c < values.length; c++) {
    const v = values[c];
    if (v !== null && v !== undefined && v !== "") {
      st.cells++;
      any = true;
      if (typeof v === "string") {
        st.textChecksum = (st.textChecksum ^ fnv1a(`${rowNumber}:${c + 1}:${v}`)) >>> 0;
      }
    }
  }
  if (any) st.nonEmptyRows++;
  if (!verify) return;
  const width = Math.max(values.length, opts.cols);
  for (let c = 0; c < width; c++) {
    const exp = expectedCell(sheet, rowNumber, c);
    if (!matches(exp, values[c], csv)) {
      st.mismatches++;
      if (st.examples.length < 5) {
        st.examples.push(
          `baris ${rowNumber} kolom ${c + 1}: harap ${JSON.stringify(exp && (exp.t === "d" ? isoDate(exp.v) : exp.v))}, dapat ${JSON.stringify(values[c] instanceof Date ? (values[c] as Date).toISOString() : values[c])}`,
        );
      }
    }
  }
}

async function main() {
  const tmp = mkdtempSync(join(tmpdir(), "dd-bench-"));
  const t0 = performance.now();
  let error: string | null = null;
  let physical = true;
  try {
    if (parserName === "duckdb-csv") {
      physical = false;
      await parseCsvDuckdb(
        file!,
        { cols: opts.cols, delimiter: opts.delimiter, tmpDir: tmp },
        (n, v) => onRow(0, n, v, true),
      );
    } else {
      const parsers: Record<string, Parser> = {
        exceljs: exceljsParser,
        duckdb: duckdbParser,
        sax: createSaxParser(),
      };
      const p = parsers[parserName!];
      if (!p) throw new Error(`parser tidak dikenal: ${parserName}`);
      physical = p.physicalRowNumbers;
      // Kondisi terbaik untuk DuckDB: range persis dari manifest (produksi harus membaca <dimension> dulu).
      const ranges = manifest.sheets.map((s) => `A1:${colLetter(opts.cols)}${s.lastRow}`);
      await p.parse(
        file!,
        { sheetNames: manifest.sheets.map((s) => s.name), tmpDir: tmp, ranges },
        onRow,
      );
    }
  } catch (e) {
    error = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
  const seconds = (performance.now() - t0) / 1000;
  clearInterval(sampler);
  peakRss = Math.max(peakRss, process.memoryUsage().rss);
  const expectedCells = (m: SheetManifest) => m.textCells + m.numberCells + m.dateCells;
  console.log(
    JSON.stringify({
      parser: parserName,
      file: manifest.file,
      fileMB: Math.round(manifest.bytes / 1024 / 1024),
      seconds: Math.round(seconds * 10) / 10,
      // Waktu CPU proses (user + system): tidak terpengaruh beban proses lain di mesin.
      cpuSeconds: Math.round((process.cpuUsage().user + process.cpuUsage().system) / 1e5) / 10,
      peakRssMB: Math.round(peakRss / 1024 / 1024),
      // Puncak sebenarnya dari kernel (sampel 100 ms bisa melewatkan lonjakan singkat). Satuan KB.
      maxRssMB: Math.round(process.resourceUsage().maxRSS / 1024),
      physicalRowNumbers: physical,
      error,
      sheets: manifest.sheets.map((m, i) => ({
        name: m.name,
        expected: { lastRow: m.lastRow, nonEmptyRows: m.nonEmptyRows, cells: expectedCells(m) },
        got: stats[i] ?? null,
        rowsOk: stats[i]?.nonEmptyRows === m.nonEmptyRows,
        cellsOk: stats[i]?.cells === expectedCells(m),
        // Isi teks per sel (bukan hanya jumlah). DuckDB read_xlsx mengembalikan semua sel sebagai
        // VARCHAR sehingga checksum teks tidak sebanding (null); kebenarannya dibuktikan --verify.
        textChecksumOk: parserName === "duckdb" ? null : stats[i]?.textChecksum === m.textChecksum,
      })),
    }),
  );
  process.exit(0);
}

void main();
