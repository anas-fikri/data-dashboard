/*
 * Data perf "Lihat data" (T-061; dipakai scripts/perf-grid.ts dan scripts/dev-grid-perf-seed.ts):
 * sheet `rows` baris × 30 kolom, deterministik, dibangkitkan DuckDB langsung ke parquet dengan tata letak
 * typed ingest (zstd, row group 122.880, `_row BIGINT` = rowBase + baris fisik, `_src_row`).
 *   layout period: `segs` segmen bulanan (Jan 2024 + k), tiap file membawa `_period DATE` (sheet periode
 *     bersumber LABEL, urutan (_period, _row)).
 *   layout single: satu file tanpa `_period` (sheet non-periode, REPLACE).
 * 30 kolom: 10 teks (resi unik, kota, layanan, pelanggan 200 rb nilai, kurir, cabang, status, SKU,
 * catatan 1 jt nilai, alamat), 10 desimal(38,6), 5 bilangan bulat, 5 tanggal. File yang sudah ada dipakai
 * ulang (nama file memuat layout/baris/segmen).
 */
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { DuckDBInstance } from "@duckdb/node-api";
import type { ColumnSchema } from "../src/features/ingest/infer";
import type { GridSegment } from "../src/features/query/grid-service";

export type Layout = "period" | "single";
export const GRID_COLS = 30;
/** Jarak rowBase antar segmen (unik, seperti rowHighWater). */
export const ROW_BASE_STEP = 100_000_000;

export const CITIES = [
  "Jakarta Selatan",
  "Jakarta Barat",
  "Bandung",
  "Surabaya",
  "Medan",
  "Semarang",
  "Makassar",
  "Denpasar",
  "Balikpapan",
  "Yogyakarta",
];

const colType = (p: number): ColumnSchema["type"] =>
  p <= 10 ? "text" : p <= 20 ? "decimal" : p <= 25 ? "integer" : "date";
const NAMES = [
  "No Resi",
  "Kota Tujuan",
  "Layanan",
  "Pelanggan",
  "Kurir",
  "Cabang",
  "Status",
  "SKU",
  "Catatan",
  "Alamat",
];
const nameOf = (p: number) =>
  p <= 10
    ? NAMES[p - 1]!
    : `${colType(p) === "decimal" ? "Nilai" : colType(p) === "integer" ? "Jumlah" : "Tanggal"} ${p}`;

export const gridSchema: ColumnSchema[] = Array.from({ length: GRID_COLS }, (_, k) => ({
  pos: k + 1,
  name: nameOf(k + 1),
  original: nameOf(k + 1),
  type: colType(k + 1),
  hidden: false,
  nullPct: 0,
  distinctCount: 0,
  castFailCount: 0,
}));

const list = (xs: string[]) => `[${xs.map((x) => `'${x}'`).join(", ")}]`;
const h = (p: number) => `hash(i * 37 + ${p})`;
const pick = (xs: string[], p: number) =>
  `${list(xs)}[1 + CAST(${h(p)} % ${xs.length} AS INTEGER)]`;

/** Ekspresi kolom p untuk baris global i; `month` = ekspresi DATE awal bulan baris itu. */
function expr(p: number, month: string): string {
  switch (p) {
    case 1:
      return `'PCP' || lpad(CAST(i AS VARCHAR), 11, '0')`;
    case 2:
      return pick(CITIES, p);
    case 3:
      return pick(["Reguler", "Same Day", "Next Day", "Kargo", "Ekonomi", "Premium"], p);
    case 4:
      return `'Pelanggan ' || (${h(p)} % 200000)`;
    case 5:
      return `'Kurir ' || (${h(p)} % 2000)`;
    case 6:
      return `'Cabang ' || (${h(p)} % 300)`;
    case 7:
      return pick(["Terkirim", "Dalam perjalanan", "Gagal kirim", "Retur", "Menunggu"], p);
    case 8:
      return `'SKU-' || (${h(p)} % 50000)`;
    case 9:
      return `'Catatan ' || (${h(p)} % 1000000)`;
    case 10:
      return `'Jl. Merdeka No. ' || (${h(p)} % 500) || ', ' || ${pick(CITIES, 99)}`;
  }
  if (colType(p) === "decimal") return `CAST((${h(p)} % 100000000) / 100.0 AS DECIMAL(38,6))`;
  if (colType(p) === "integer") return `CAST(${h(p)} % ${p === 21 ? 50 : 1000003} AS BIGINT)`;
  return `${month} + CAST(${h(p)} % 28 AS INTEGER)`;
}

/** Kunci bulan segmen k: Jan 2024 + k. */
export const monthOf = (k: number) =>
  `${2024 + Math.floor(k / 12)}-${String((k % 12) + 1).padStart(2, "0")}`;

export interface GridData {
  dir: string;
  /** Segmen urut periode; typedKey = nama file di `dir`. */
  segments: GridSegment[];
  sizeMb: number;
  genSec: number;
}

export async function generateGridData(o: {
  dir: string;
  rows: number;
  segs: number;
  layout: Layout;
}): Promise<GridData> {
  const segs = o.layout === "single" ? 1 : o.segs;
  const dir = join(o.dir, `data-${o.layout}-${o.rows}-${segs}`);
  mkdirSync(dir, { recursive: true });
  const per = Math.ceil(o.rows / segs);
  const segments: GridSegment[] = [];
  const db = await DuckDBInstance.create(":memory:");
  const c = await db.connect();
  await c.run("SET threads = 4");
  const t0 = performance.now();
  for (let k = 0; k < segs; k++) {
    const lo = k * per;
    const hi = Math.min(o.rows, lo + per);
    const file = `seg-${k}.parquet`;
    const key = monthOf(k);
    const month =
      o.layout === "single" ? `DATE '2024-01-01' + CAST(i % 700 AS INTEGER)` : `DATE '${key}-01'`;
    if (!existsSync(join(dir, file))) {
      const cols = gridSchema.map((s) => `${expr(s.pos, month)} AS c${s.pos}`).join(", ");
      const period = o.layout === "period" ? `DATE '${key}-01' AS _period, ` : "";
      await c.run(
        `COPY (SELECT (${k}::BIGINT * ${ROW_BASE_STEP} + i - ${lo} + 2)::BIGINT AS _row, (i - ${lo} + 2)::INTEGER AS _src_row, ${period}${cols}
               FROM range(${lo}, ${hi}) t(i) ORDER BY i)
         TO '${join(dir, file)}' (FORMAT parquet, COMPRESSION zstd, ROW_GROUP_SIZE 122880)`,
      );
    }
    segments.push({
      typedKey: file,
      legacyRow: false,
      columns: gridSchema.map((s) => s.pos),
      dataRows: hi - lo,
      rowBase: k * ROW_BASE_STEP,
      maxSrcRow: hi - lo + 1,
      rawKey: "-",
      colMap: [],
      fileName: `bulan-${key}.csv`,
      ...(o.layout === "period"
        ? { period: { key, start: `${key}-01`, min: null, max: null } }
        : {}),
    });
  }
  const r = await c.runAndReadAll(
    `SELECT sum(total_compressed_size) / 1e6 FROM parquet_metadata('${join(dir, "*.parquet")}')`,
  );
  const sizeMb = Math.round(Number(r.getRows()[0]![0]));
  c.closeSync();
  db.closeSync();
  return { dir, segments, sizeMb, genSec: Math.round((performance.now() - t0) / 1000) };
}
