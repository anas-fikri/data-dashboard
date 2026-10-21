/*
 * Perf T-070 (AC5): pivot 4 tingkat baris × 8 nilai vs 2 tingkat × 3 nilai pada data yang sama
 * (scripts/perf-grid-data.ts, satu file, 30 kolom). DuckDB dengan setelan mesin query aplikasi
 * (runtime.ts: 2 thread, memory_limit QUERY_MEMORY_LIMIT bawaan 1 GB), SQL dari buildPivotSql yang
 * sama dengan /api/query, hasil dibentuk shapePivot. Tanpa cache hasil (setiap putaran dieksekusi).
 *
 *   npx tsx scripts/perf-pivot-levels.ts [baris=1000000] [ulang=15] [dir=tests/fixtures/perf/pivot]
 *
 * Bukan bagian `npm run check`. Hasil dicatat di docs/ai/perf/T-070.md.
 */
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { DuckDBInstance } from "@duckdb/node-api";
import { buildPivotSql, pivotOutTypes, shapePivot } from "../src/features/query/pivot";
import { rowBytes, toJson } from "../src/features/query/service";
import { widgetPlan } from "../src/features/query/widget";
import { parseWidgetConfig, type WidgetConfig } from "../src/features/widgets/spec";
import { generateGridData, gridSchema } from "./perf-grid-data";

const ROWS = Number(process.argv[2] ?? 1_000_000);
const REPEAT = Number(process.argv[3] ?? 15);
const DIR = process.argv[4] ?? "tests/fixtures/perf/pivot";

const sheetId = "cmv4kljx40009oczvdmpurrxa";
const base = {
  sheetId,
  format: { style: "rupiah", decimals: 0 },
  sort: "value_desc",
  totals: true,
  subtotals: true,
  // Pisahkan per bulan (Tanggal 26, 700 hari → 24 bulan).
  column: { column: 26, timeGrain: "month" },
};
const margin = {
  kind: "calc",
  label: "Margin",
  expr: {
    op: "div",
    args: [
      {
        op: "sub",
        args: [
          { agg: "sum", column: 11 },
          { agg: "sum", column: 12 },
        ],
      },
      { agg: "sum", column: 11 },
    ],
  },
};
const THREE = [{ agg: "sum", column: 11 }, { agg: "count" }, { agg: "avg", column: 12 }];
const EIGHT = [
  ...THREE,
  { agg: "min", column: 13 },
  { agg: "max", column: 14 },
  { agg: "sum", column: 21 },
  { agg: "count_distinct", column: 5 },
  margin,
];
// Kota Tujuan (10) › Layanan (6) › Status (5) › Cabang (300).
const SPECS: Record<string, unknown> = {
  "2 tingkat × 3 nilai": { ...base, rows: [{ column: 2 }, { column: 3 }], values: THREE },
  "4 tingkat × 3 nilai": {
    ...base,
    rows: [{ column: 2 }, { column: 3 }, { column: 7 }, { column: 6 }],
    values: THREE,
  },
  "2 tingkat × 8 nilai": { ...base, rows: [{ column: 2 }, { column: 3 }], values: EIGHT },
  "4 tingkat × 8 nilai": {
    ...base,
    rows: [{ column: 2 }, { column: 3 }, { column: 7 }, { column: 6 }],
    values: EIGHT,
  },
  "4 tingkat × 6 nilai": {
    ...base,
    rows: [{ column: 2 }, { column: 3 }, { column: 7 }, { column: 6 }],
    values: EIGHT.slice(0, 6),
  },
};

const pct = (xs: number[], p: number) => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.ceil((p / 100) * s.length) - 1)]!;
};

async function main() {
  mkdirSync(DIR, { recursive: true });
  const data = await generateGridData({ dir: DIR, rows: ROWS, segs: 1, layout: "single" });
  const file = join(data.dir, data.segments[0]!.typedKey);
  console.log(`data: ${ROWS} baris, ${data.sizeMb} MB (${file})`);
  const db = await DuckDBInstance.create(":memory:", { memory_limit: "1GB", threads: "2" });
  const conn = await db.connect();
  const plans = Object.entries(SPECS).map(([name, spec]) => {
    const c = parseWidgetConfig("pivot", spec);
    if (!c.ok) throw new Error(`${name}: ${c.message}`);
    const w = widgetPlan(c.config as Exclude<WidgetConfig, { type: "empty" }>, gridSchema, {
      page: 0,
    });
    if (!w.ok || w.kind !== "pivot")
      throw new Error(`${name}: ${w.ok ? "bukan pivot" : w.message}`);
    return { name, w, built: buildPivotSql(w.plan, w.pivot, file), ms: [] as number[], info: "" };
  });
  // Pemanasan: cache OS + metadata parquet.
  for (const p of plans) await conn.runAndReadAll(p.built.sql, p.built.params);
  // Bergantian per putaran agar beban mesin merata di semua spec.
  for (let r = 0; r < REPEAT; r++) {
    for (const p of plans) {
      const t0 = performance.now();
      const raw = (await conn.runAndReadAll(p.built.sql, p.built.params)).getRowsJS();
      const types = pivotOutTypes(p.w.plan, p.w.pivot);
      const rows = raw.map((x) => x.map((v, i) => toJson(v, types[i]!)));
      const shaped = shapePivot(rows, p.w.plan, p.w.pivot);
      p.ms.push(performance.now() - t0);
      if (!p.info) {
        const kb = Math.round(rows.reduce((n, x) => n + rowBytes(x), 0) / 1024);
        p.info = `${shaped.rows.length}/${shaped.rowCount} baris, ${shaped.columns.length}/${shaped.columnCount} kolom, ${kb} KiB`;
      }
    }
  }
  conn.closeSync();
  db.closeSync();
  const base2 = pct(plans[0]!.ms, 95);
  console.log("| Spec | p50 (ms) | p95 (ms) | Rasio p95 vs 2×3 | Hasil |");
  console.log("|---|---|---|---|---|");
  for (const p of plans) {
    const p95 = pct(p.ms, 95);
    console.log(
      `| ${p.name} | ${Math.round(pct(p.ms, 50))} | ${Math.round(p95)} | ${(p95 / base2).toFixed(2)} | ${p.info} |`,
    );
  }
}

void main();
