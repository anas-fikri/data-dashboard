/*
 * Perf T-075 (G-7 fase 5): pivot lanjutan pada data 10 jt baris lewat jalur query widget sungguhan
 * (runWidgetQuery: otorisasi repo palsu → spec efektif pivot tersimpan → widgetPlan → DuckDB → bentuk
 * hasil → cache hasil), mesin query dengan setelan produksi (QueryEngine: memory_limit 1 GB, 2 thread,
 * MAX_QUERY_CONCURRENCY 4, 2 per user, QUERY_TIMEOUT_MS 30 s) dan cache parquet lokal (hard link).
 *
 *   npm run perf -- pivot-lanjutan [baris=10000000] [ulang=10] [dir=tests/fixtures/perf/pivot]
 *
 * A. Satu widget pivot, tanpa cache hasil (setiap putaran dieksekusi), bergantian antar-spec:
 *    2×3 (baseline T-070), 4×8, 4×8 + field terhitung + Tampilkan nilai sebagai + Top N, 4×6 (fallback).
 * B. Dashboard 6 widget terikat SATU pivot tersimpan (pivot, tabel, batang, garis, pai, KPI) dibuka
 *    seperti browser (2 query per halaman, QUERY_BUSY dicoba ulang): dingin (cache hasil kosong), hangat (hit), lalu revisi pivot tersimpan
 *    naik (semua miss). QUERY_TIMEOUT dicatat per widget.
 * Data: scripts/perf-grid-data.ts (satu file parquet 30 kolom). Bukan bagian `npm run check`.
 * Hasil dicatat di docs/ai/perf/T-075.md.
 */
import { linkSync, mkdirSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { ResultCache } from "../src/features/query/cache";
import {
  runWidgetQuery,
  type CachedQuery,
  type QueryDeps,
  type QueryRepo,
} from "../src/features/query/service";
import { QueryEngine } from "../src/lib/duckdb/engine";
import { ParquetCache } from "../src/lib/duckdb/parquet-cache";
import { generateGridData, gridSchema } from "./perf-grid-data";

const ROWS = Number(process.argv[2] ?? 10_000_000);
const REPEAT = Number(process.argv[3] ?? 10);
const DIR = resolve(process.argv[4] ?? "tests/fixtures/perf/pivot");
const TIMEOUT_MS = 30_000;

const DS = "cmv4klj5r0007oczvgiofocpg";
const VER = "cmv4kljx40009oczvdmpurrxf";
const sheetId = "cmv4kljx40009oczvdmpurrxa";
const SP = "cmv4kljx40009oczvdmpurrsp";

const margin = {
  kind: "calc",
  label: "Margin",
  format: { style: "percent", decimals: 1 },
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
const laba = {
  kind: "calc",
  label: "Laba",
  expr: {
    op: "sub",
    args: [
      { agg: "sum", column: 11 },
      { agg: "sum", column: 12 },
    ],
  },
};
const THREE = [{ agg: "sum", column: 11 }, { agg: "count" }, { agg: "avg", column: 12 }];
// = T-070: 3 nilai + Terkecil, Terbesar, Total Jumlah 21, Jumlah unik Kurir, Margin.
const EIGHT = [
  ...THREE,
  { agg: "min", column: 13 },
  { agg: "max", column: 14 },
  { agg: "sum", column: 21 },
  { agg: "count_distinct", column: 5 },
  margin,
];
// G-7 penuh: 2 field terhitung, 2 cara tampil (% kolom, total berjalan sepanjang bulan), Jumlah unik.
const EIGHT_ADV = [
  { agg: "sum", column: 11 },
  { agg: "count", showAs: "running" },
  { agg: "avg", column: 12 },
  { agg: "sum", column: 11, showAs: "pct_col" },
  { agg: "max", column: 14 },
  { agg: "count_distinct", column: 5 },
  laba,
  margin,
];
const base = {
  sheetId,
  format: { style: "rupiah", decimals: 0 },
  sort: "value_desc",
  totals: true,
  subtotals: true,
  // Pisahkan per bulan (Tanggal 26, 700 hari → 24 bulan).
  column: { column: 26, timeGrain: "month" },
};
// Kota Tujuan (10) › Layanan (6) › Status (5) › Cabang (300).
const ROWS2 = [{ column: 2 }, { column: 3 }];
const ROWS4 = [{ column: 2 }, { column: 3 }, { column: 7 }, { column: 6 }];
const ROWS4_TOP = [
  { column: 2 },
  { column: 3 },
  { column: 7 },
  { column: 6, topN: { n: 10, by: 0 } },
];

const PIVOTS: Record<string, unknown> = {
  "2 tingkat × 3 nilai (baseline)": { ...base, rows: ROWS2, values: THREE },
  "4 tingkat × 8 nilai (T-070)": { ...base, rows: ROWS4, values: EIGHT },
  "4 × 8 + Top 10 Cabang": { ...base, rows: ROWS4_TOP, values: EIGHT },
  "4 × 8 + terhitung + tampil sebagai": { ...base, rows: ROWS4, values: EIGHT_ADV },
  "4 × 8 + terhitung + tampil sebagai + Top 10": { ...base, rows: ROWS4_TOP, values: EIGHT_ADV },
  "4 tingkat × 6 nilai (fallback)": { ...base, rows: ROWS4, values: EIGHT.slice(0, 6) },
};

/**
 * Pivot tersimpan sumber dashboard B = spec G-7 terberat, kecuali total berjalan diganti % total
 * keseluruhan: widget tabel terikat membuang kolom pemisah, dan total berjalan sepanjang baris terdalam
 * ber-Top N ditolak (TOP_N_AXIS_TEXT) — temuan T-075, lihat docs/ai/perf/T-075.md.
 */
const SAVED = {
  ...base,
  rows: ROWS4_TOP,
  values: EIGHT_ADV.map((v, i) => (i === 1 ? { ...v, showAs: "pct_grand" } : v)),
};
const BOUND: Record<string, { type: string; spec: unknown }> = {
  pivot: {
    type: "pivot",
    spec: { sort: "value_desc", totals: true, subtotals: true },
  },
  tabel: { type: "table", spec: { sort: "value_desc", totals: true } },
  batang: {
    type: "bar",
    spec: { dimension: "row", value: 7, sort: "value_desc", topN: 10 },
  },
  garis: {
    type: "line",
    spec: { dimension: "column", value: 0, sort: "label_asc", topN: 100 },
  },
  pai: { type: "pie", spec: { dimension: "row", value: 0, sort: "value_desc", topN: 5 } },
  kpi: { type: "kpi", spec: { value: 6 } },
};

const pct = (xs: number[], p: number) => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.ceil((p / 100) * s.length) - 1)]!;
};
/** Id widget berbentuk cuid (body /api/query memvalidasinya). */
const wid = (k: number) => `cmv4kljx40009oczvdmpw${String(k).padStart(4, "0")}`;
const ms = (x: number) => Math.round(x).toLocaleString("id-ID");

async function main() {
  mkdirSync(DIR, { recursive: true });
  const data = await generateGridData({ dir: DIR, rows: ROWS, segs: 1, layout: "single" });
  const file = join(data.dir, data.segments[0]!.typedKey);
  console.log(`data: ${ROWS} baris, ${data.sizeMb} MB (${file})`);
  const q = join(DIR, `q-${process.pid}`);
  const typedKey = `typed/${DS}/${VER}/typed.parquet`;
  const parquet = new ParquetCache({
    dir: join(q, "parquet"),
    maxBytes: 10 * 1024 ** 3,
    download: async (_key, dest) => linkSync(file, dest),
  });
  const engine = await QueryEngine.create({
    dataDir: parquet.dir,
    tmpDir: join(q, "tmp"),
    memoryLimit: "1GB",
    threads: 2,
    maxTempSize: "4GB",
    maxConcurrency: 4,
    perUser: 2,
    queueWaitMs: 10_000,
  });

  // Widget = pivot mandiri (A) atau terikat pivot tersimpan SP (B); revisi SP bisa dinaikkan.
  let revision = 1;
  const widgets = new Map<string, { type: string; spec: unknown; bound: boolean }>();
  const updatedAt = new Date("2026-10-21T00:00:00Z");
  const repo: QueryRepo = {
    ownedDataset: async () => ({ activeVersionId: VER }),
    sheet: async () => ({ typedKey, schemaRevision: 1, schema: gridSchema }),
    widget: async (_u, id) => {
      const w = widgets.get(id);
      if (!w) return null;
      return {
        type: w.type,
        spec: w.spec,
        updatedAt,
        datasetId: DS,
        activeVersionId: VER,
        role: "VIEWER",
        dashboardId: "dash",
        filterColumns: [],
        dashboardUpdatedAt: updatedAt,
        schemaStamp: 1,
        ...(w.bound
          ? {
              savedPivotId: SP,
              savedPivot: { id: SP, datasetId: DS, spec: SAVED, revision, missingColumns: [] },
              sourceStamp: `${SP}@${revision}`,
            }
          : {}),
      };
    },
  };
  const deps = (cache: ResultCache<CachedQuery> | null): QueryDeps => ({
    repo,
    parquet,
    engine,
    cache,
    timeoutMs: TIMEOUT_MS,
  });
  const run = async (id: string, cache: ResultCache<CachedQuery> | null, user = "perf") => {
    const t0 = performance.now();
    const r = await runWidgetQuery(user, { widgetId: id }, deps(cache));
    const t = performance.now() - t0;
    return { t, r };
  };

  // PERF_PART=A atau B: jalankan satu bagian saja.
  if (process.env.PERF_PART !== "B") {
    // ---------- A. satu widget pivot, tanpa cache hasil ----------
    const plans = Object.entries(PIVOTS).map(([name, spec], i) => {
      const id = wid(i);
      widgets.set(id, { type: "pivot", spec, bound: false });
      return { name, id, ms: [] as number[], info: "" };
    });
    for (const p of plans) {
      const { r } = await run(p.id, null);
      if (!r.ok) throw new Error(`${p.name}: ${r.code} ${r.message}`);
    }
    for (let k = 0; k < REPEAT; k++) {
      for (const p of plans) {
        const { t, r } = await run(p.id, null);
        if (!r.ok) throw new Error(`${p.name}: ${r.code} ${r.message}`);
        p.ms.push(t);
        if (!p.info && "pivot" in r && r.pivot) {
          const s = r.pivot;
          p.info = `${s.rows.length}/${s.rowCount} baris, ${s.columns.length}/${s.columnCount} kolom`;
        }
      }
    }
    const b95 = pct(plans[0]!.ms, 95);
    console.log("\nA. Satu widget pivot (tanpa cache hasil)\n");
    console.log("| Spec | p50 (ms) | p95 (ms) | maks (ms) | Rasio p95 vs 2×3 | Hasil |");
    console.log("|---|---|---|---|---|---|");
    for (const p of plans) {
      const p95 = pct(p.ms, 95);
      console.log(
        `| ${p.name} | ${ms(pct(p.ms, 50))} | ${ms(p95)} | ${ms(Math.max(...p.ms))} | ${(p95 / b95).toFixed(2).replace(".", ",")} | ${p.info} |`,
      );
    }
  }

  if (process.env.PERF_PART === "A") {
    engine.close();
    rmSync(q, { recursive: true, force: true });
    return;
  }
  // ---------- B. dashboard 6 widget terikat satu pivot tersimpan ----------
  const names = Object.keys(BOUND);
  const bid = (n: string) => wid(100 + names.indexOf(n));
  for (const [name, w] of Object.entries(BOUND)) widgets.set(bid(name), { ...w, bound: true });
  const cold: Record<string, number[]> = Object.fromEntries(names.map((n) => [n, []]));
  const warm: Record<string, number[]> = Object.fromEntries(names.map((n) => [n, []]));
  const bump: Record<string, number[]> = Object.fromEntries(names.map((n) => [n, []]));
  const walls = { cold: [] as number[], warm: [] as number[], bump: [] as number[] };
  const failures: string[] = [];
  /**
   * Buka dashboard seperti browser (widget-query.ts): paling banyak 2 query widget berjalan per halaman
   * (urutan kartu), QUERY_BUSY dicoba ulang 2× dengan jeda 400·2^n + acak 300 ms. Waktu per widget =
   * sejak halaman dibuka sampai jawaban (termasuk antre), seperti yang dilihat pengguna.
   */
  const open = async (
    cache: ResultCache<CachedQuery>,
    into: Record<string, number[]>,
    tag: string,
  ) => {
    const t0 = performance.now();
    const queue = [...names];
    const worker = async () => {
      for (let n = queue.shift(); n; n = queue.shift()) {
        for (let attempt = 0; ; attempt++) {
          const { r } = await run(bid(n), cache, "viewer");
          if (!r.ok && r.code === "QUERY_BUSY" && attempt < 2) {
            await new Promise((ok) => setTimeout(ok, 400 * 2 ** attempt + Math.random() * 300));
            continue;
          }
          into[n]!.push(performance.now() - t0);
          if (!r.ok) failures.push(`${tag} ${n}: ${r.code}`);
          break;
        }
      }
    };
    await Promise.all([worker(), worker()]);
    return performance.now() - t0;
  };
  const rounds = Math.max(3, Math.ceil(REPEAT / 2));
  for (let k = 0; k < rounds; k++) {
    const cache = new ResultCache<CachedQuery>(64 * 1024 * 1024);
    walls.cold.push(await open(cache, cold, "dingin"));
    walls.warm.push(await open(cache, warm, "hangat"));
    revision++;
    walls.bump.push(await open(cache, bump, "revisi"));
  }
  console.log(
    `\nB. Dashboard 6 widget terikat satu pivot tersimpan (${rounds} putaran; seperti browser: 2 query per halaman, BUSY dicoba ulang)\n`,
  );
  console.log(
    "| Widget | Dingin p50 / p95 (ms) | Hangat, cache hit p50 / p95 (ms) | Revisi naik, miss p50 / p95 (ms) |",
  );
  console.log("|---|---|---|---|");
  for (const n of names) {
    const f = (xs: number[]) => `${ms(pct(xs, 50))} / ${ms(pct(xs, 95))}`;
    console.log(`| ${n} | ${f(cold[n]!)} | ${f(warm[n]!)} | ${f(bump[n]!)} |`);
  }
  const f = (xs: number[]) => `${ms(pct(xs, 50))} / ${ms(Math.max(...xs))}`;
  console.log(
    `| **seluruh dashboard (p50 / maks)** | ${f(walls.cold)} | ${f(walls.warm)} | ${f(walls.bump)} |`,
  );
  console.log(
    `Gagal (QUERY_TIMEOUT/QUERY_BUSY/lainnya): ${failures.length ? failures.join(", ") : "tidak ada"}`,
  );
  console.log(`maxRSS: ${Math.round(process.resourceUsage().maxRSS / 1024)} MB`);
  engine.close();
  rmSync(q, { recursive: true, force: true });
}

void main();
