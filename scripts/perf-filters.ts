/*
 * Perf filter dashboard (T-012): parquet 1 juta baris dibuat langsung (row group seukuran ingest) →
 * query widget lewat runWidgetQuery dengan 0/1/3 filter dashboard, dan daftar nilai slicer lewat
 * runFilterValues (halaman pertama + kata cari "jak") pada kolom teks 50.000 nilai unik. Mesin DuckDB +
 * cache parquet sungguhan, TANPA cache hasil (setiap permintaan menjalankan DuckDB). Bukan bagian check.
 *   npx tsx --conditions=react-server scripts/perf-filters.ts [jumlahBaris]
 * Keluaran: satu baris JSON — p50/p95/maks per skenario + load average mesin. Fixture dihapus di akhir.
 */
import { mkdirSync, mkdtempSync, rmSync, statSync } from "node:fs";
import { loadavg, tmpdir } from "node:os";
import { join } from "node:path";
import { DuckDBInstance } from "@duckdb/node-api";
import type { ColumnSchema } from "../src/features/ingest/infer";
import { runFilterValues } from "../src/features/query/filter-values";
import type { DashFilter } from "../src/features/query/filters";
import { runWidgetQuery, type QueryDeps } from "../src/features/query/service";
import { QueryEngine } from "../src/lib/duckdb/engine";

const ROWS = Number(process.argv[2] ?? 1_000_000);
const RUNS = 7;
const DS = "cmv4klj5r0007oczvgiofocpg";
const VER = "cmv4kljx40009oczvdmpurrxf";
const SHEET = "cmv4kljx40009oczvdmpurrxa";
const DASH = "cmv4kljx40009oczvdmpurrd0";
const KEY = "parquet/perf/typed.parquet";

const col = (pos: number, name: string, type: ColumnSchema["type"]) =>
  ({
    pos,
    name,
    original: name,
    type,
    hidden: false,
    nullPct: 0,
    distinctCount: 0,
    castFailCount: 0,
  }) as ColumnSchema;
const SCHEMA = [
  col(1, "Kota", "text"),
  col(2, "Layanan", "text"),
  col(3, "Omzet", "decimal"),
  col(4, "Tanggal", "date"),
  col(5, "Waktu", "timestamp"),
];
const fmt = { style: "number", decimals: 0 };
const WIDGETS: Record<string, { type: string; spec: unknown }> = {
  "kpi jumlah baris": {
    type: "kpi",
    spec: { sheetId: SHEET, measure: { agg: "count" }, format: fmt },
  },
  "kpi total omzet": {
    type: "kpi",
    spec: { sheetId: SHEET, measure: { agg: "sum", column: 3 }, format: fmt },
  },
  "batang omzet per layanan": {
    type: "bar",
    spec: {
      sheetId: SHEET,
      dimension: { column: 2 },
      measure: { agg: "sum", column: 3 },
      sort: "value_desc",
      topN: 10,
      format: fmt,
    },
  },
  "garis omzet per bulan": {
    type: "line",
    spec: {
      sheetId: SHEET,
      dimension: { column: 4, timeGrain: "month" },
      measure: { agg: "sum", column: 3 },
      sort: "label_asc",
      topN: 24,
      format: fmt,
    },
  },
  "batang 20 kota teratas": {
    type: "bar",
    spec: {
      sheetId: SHEET,
      dimension: { column: 1 },
      measure: { agg: "count" },
      sort: "value_desc",
      topN: 20,
      format: fmt,
    },
  },
  "tabel 4 kolom hal 1": {
    type: "table",
    spec: { sheetId: SHEET, columns: [1, 2, 3, 4], format: fmt },
  },
};
const wid = (i: number) => `cmv4kljx40009oczvdmpurw${String(i).padStart(2, "0")}`;
const names = Object.keys(WIDGETS);

const FILTER_SETS: Record<string, DashFilter[]> = {
  "0 filter": [],
  "1 filter (in 2 nilai)": [
    { column: "Kota", op: "in", values: ["Jakarta 00010", "Bandung 00021"] },
  ],
  "3 filter (in 2 nilai + rentang + ytd)": [
    { column: "Layanan", op: "in", values: ["Reguler", "Kilat"] },
    { column: "Omzet", op: "range", gte: 10_000, lte: 400_000 },
    { column: "Tanggal", op: "preset", preset: "ytd" },
  ],
};

const pct = (xs: number[], p: number) => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.ceil((p / 100) * s.length) - 1)]!;
};
const stat = (xs: number[]) => ({
  p50Ms: Math.round(pct(xs, 50)),
  p95Ms: Math.round(pct(xs, 95)),
  maxMs: Math.round(Math.max(...xs)),
  n: xs.length,
});

async function main() {
  const root = mkdtempSync(join(tmpdir(), "dd-perf-filters-"));
  try {
    const data = join(root, "data");
    mkdirSync(data);
    const file = join(data, "typed.parquet");
    const db = await DuckDBInstance.create(":memory:");
    const c = await db.connect();
    // Kota: 10 nama × 5.000 nomor = 50.000 nilai unik (5.000 mengandung "jak").
    await c.run(
      `COPY (
         SELECT range + 2 AS _row,
           ['Jakarta','Bandung','Surabaya','Medan','Semarang','Makassar','Palembang','Depok','Bekasi','Bogor'][range % 10 + 1]
             || ' ' || lpad(CAST((range % 50000) // 10 AS VARCHAR), 5, '0') AS c1,
           ['Reguler','Kilat','Hemat','Kargo','Sameday'][range % 5 + 1] AS c2,
           CAST((range * 7919) % 500000 AS DECIMAL(38,6)) + 0.25 AS c3,
           DATE '2025-01-01' + CAST(range % 650 AS INTEGER) AS c4,
           TIMESTAMP '2025-01-01 00:00:00' + to_seconds(CAST((range * 37) % 56160000 AS BIGINT)) AS c5
         FROM range(${ROWS})
       ) TO '${file}' (FORMAT parquet, COMPRESSION zstd, ROW_GROUP_SIZE 122880)`,
    );
    c.closeSync();
    db.closeSync();
    const parquetMB = Math.round(statSync(file).size / 1e6);

    const engine = await QueryEngine.create({
      dataDir: data,
      tmpDir: join(root, "qtmp"),
      memoryLimit: "1GB",
      threads: 2,
      maxTempSize: "4GB",
      maxConcurrency: 4,
      perUser: 2,
      queueWaitMs: 10_000,
    });
    // File parquet sudah lokal: sewa langsung (unduhan/cache parquet diukur di T-009).
    const deps: QueryDeps = {
      repo: {
        ownedDataset: async () => null,
        sheet: async () => ({ typedKey: KEY, schemaRevision: 1, schema: SCHEMA }),
        widget: async (_u, id) => {
          const name = names[names.findIndex((_, i) => wid(i) === id)];
          return name
            ? {
                ...WIDGETS[name]!,
                datasetId: DS,
                activeVersionId: VER,
                dashboardId: DASH,
                role: "OWNER" as const,
              }
            : null;
        },
        filterSources: async () => SCHEMA.map((s) => ({ name: s.name, type: s.type })),
        filterSource: async () => ({
          datasetId: DS,
          activeVersionId: VER,
          filterColumns: [{ sheet: "Data", column: "Kota" }],
          sheets: [{ id: SHEET, name: "Data" }],
        }),
      },
      parquet: { acquire: async () => ({ path: file, release: () => {} }) },
      engine,
      cache: null,
      timeoutMs: 30_000,
      // Hari ini 2026-10-14 WIB: YTD = 2026-01-01 … 2026-10-14.
      now: () => new Date("2026-10-14T05:00:00Z"),
    };

    const load0 = loadavg()[0]!;
    const widgets: Record<string, ReturnType<typeof stat>> = {};
    const perSet: Record<string, number[]> = {};
    for (const [label, filters] of Object.entries(FILTER_SETS)) {
      for (const [i, name] of names.entries()) {
        const times: number[] = [];
        for (let r = 0; r < RUNS; r++) {
          const t = performance.now();
          const q = await runWidgetQuery(
            "perf",
            { widgetId: wid(i), ...(filters.length ? { dashboardFilters: filters } : {}) },
            deps,
          );
          times.push(performance.now() - t);
          if (!q.ok) throw new Error(`${label} / ${name}: ${JSON.stringify(q)}`);
        }
        widgets[`${label} — ${name}`] = stat(times);
        (perSet[label] ??= []).push(...times);
      }
    }
    // Satu perubahan filter = semua widget dashboard dimuat ulang bersamaan (6 widget, jatah 2/user).
    const dashboard: Record<string, ReturnType<typeof stat>> = {};
    for (const [label, filters] of Object.entries(FILTER_SETS)) {
      const times: number[] = [];
      for (let r = 0; r < RUNS; r++) {
        const t = performance.now();
        const all = await Promise.all(
          names.map((_, i) =>
            runWidgetQuery(
              `perf-${i % 3}`,
              { widgetId: wid(i), ...(filters.length ? { dashboardFilters: filters } : {}) },
              deps,
            ),
          ),
        );
        times.push(performance.now() - t);
        if (all.some((q) => !q.ok)) throw new Error(`${label}: ${JSON.stringify(all)}`);
      }
      dashboard[label] = stat(times);
    }
    const slicer: Record<string, ReturnType<typeof stat> & { values: number; truncated: boolean }> =
      {};
    for (const [label, q] of [
      ["halaman pertama (tanpa cari)", undefined],
      ['cari "jak"', "jak"],
    ] as const) {
      const times: number[] = [];
      let values = 0;
      let truncated = false;
      for (let r = 0; r < RUNS; r++) {
        const t = performance.now();
        const v = await runFilterValues(
          "perf",
          DASH,
          { column: "Kota", ...(q ? { q } : {}) },
          deps,
        );
        times.push(performance.now() - t);
        if (!v.ok) throw new Error(`${label}: ${JSON.stringify(v)}`);
        values = v.values.length;
        truncated = v.truncated;
      }
      slicer[label] = { ...stat(times), values, truncated };
    }
    const all = Object.values(perSet).flat();
    console.log(
      JSON.stringify({
        rows: ROWS,
        parquetMB,
        loadAvgStart: Math.round(load0 * 100) / 100,
        loadAvgEnd: Math.round(loadavg()[0]! * 100) / 100,
        widgetAll: stat(all),
        widgetPerFilterSet: Object.fromEntries(
          Object.entries(perSet).map(([k, v]) => [k, stat(v)]),
        ),
        dashboard6WidgetsParallel: dashboard,
        slicer,
        widgets,
        maxRssMB: Math.round(process.resourceUsage().maxRSS / 1024),
      }),
    );
    engine.close();
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}
void main();
