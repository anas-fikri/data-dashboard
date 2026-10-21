/*
 * Perf "Lihat data" (G-6 §3.6) lewat jalur server sungguhan: runGridRows/runGridValues/runGridStats
 * (QueryEngine produksi: memory_limit 1GB, 2 thread, 4 slot, 2 per user, sandbox) + ParquetCache lokal
 * hangat. Bukan bagian check. Riwayat: T-041 (jendela tanpa urut), T-042 (--load), T-061 (urut/saring/
 * cari/periode, beban dengan widget atas seluruh sheet, 13 jt baris).
 *
 *   npm run perf -- grid --dir /path/scratch [--rows 10000000] [--segs 24] [--layout period|single]
 *                        [--reps 30] [--load] [--grid-slots 2] [--only a,b] [--json out.json] [--keep]
 *
 * Data (deterministik, dibangkitkan DuckDB, tata letak typed ingest: zstd, row group 122.880):
 *   layout period (bawaan): `segs` segmen bulanan (Jan 2024 + k), tiap file `_row BIGINT` (rowBase
 *     unik), `_src_row`, `_period DATE`, c1..c30 — sheet periode (sumber LABEL), urutan (_period, _row).
 *   layout single: satu file tanpa `_period` (sheet non-periode, REPLACE).
 *   30 kolom: 10 teks (resi unik, kota, layanan, pelanggan 200 rb nilai, …, alamat), 10 desimal(38,6),
 *   5 bilangan bulat, 5 tanggal. Data dipakai ulang bila file sudah ada (--keep).
 *
 * Skenario (p50/p95/maks dalam ms waktu server, `reps` kali; "pertama" = rowStart 0 dengan cache count
 * kosong tiap putaran = permintaan pertama sesudah ganti urut/saring; "dalam" = posisi acak di tengah
 * hasil dengan count sudah di-cache seperti gulir lanjutan):
 *   ujung (rows-200), acak, lintas batas segmen, ke baris 9.000.000 (2 blok seperti klien)
 *   urut angka/teks pertama + dalam, saring pertama + dalam, cari pertama, periode (1 dan 3 bulan),
 *   daftar nilai menu saring, ringkasan kolom.
 * --load: dashboard 6 widget atas SELURUH sheet (sumber segmen + gerbang user 2, jatah global 4)
 *   sendirian (baseline) lalu bersamaan dengan 5 penggulir (masing-masing 2 jendela in-flight lewat
 *   gerbang grid 2/4 slot): varian gulir polos dan gulir dalam urut teks. Dicatat p95 widget, rasio,
 *   QUERY_BUSY/QUERY_TIMEOUT widget dan grid.
 * Keluaran: satu baris per skenario + satu baris JSON (juga ke --json). Data dihapus kecuali --keep.
 */
import { copyFileSync, linkSync, rmSync, writeFileSync } from "node:fs";
import { cpus, loadavg, totalmem } from "node:os";
import { join } from "node:path";
import type { ColumnSchema } from "../src/features/ingest/infer";
import { ResultCache } from "../src/features/query/cache";
import { GridGate, gridEngine } from "../src/features/query/grid-gate";
import {
  runGridRows,
  runGridStats,
  runGridValues,
  sourceFor,
  type GridDeps,
  type GridSheet,
} from "../src/features/query/grid-service";
import { runOnParquet, type CachedQuery } from "../src/features/query/service";
import { QueryEngine } from "../src/lib/duckdb/engine";
import { ParquetCache } from "../src/lib/duckdb/parquet-cache";
import { generateGridData, GRID_COLS, gridSchema as schema, type Layout } from "./perf-grid-data";

const arg = (name: string, def?: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : def;
};
const DIR = arg("dir") ?? "";
if (!DIR) {
  console.error(
    "pakai: npm run perf -- grid --dir <scratch> [--rows 10000000] [--segs 24] [--layout period|single] [--reps 30] [--load] [--grid-slots 2] [--only a,b] [--json f] [--keep]",
  );
  process.exit(1);
}
const ROWS = Number(arg("rows", "10000000"));
const LAYOUT = arg("layout", "period") as Layout;
const SEGS = LAYOUT === "single" ? 1 : Number(arg("segs", "24"));
const REPS = Number(arg("reps", "30"));
const ONLY = arg("only")?.split(",");
/** Slot global grid (GRID_MAX_CONCURRENCY produksi, bawaan 2). */
const GRID_SLOTS = Number(arg("grid-slots", "2"));
const COLS = GRID_COLS;

function stats(xs: number[]) {
  const s = [...xs].sort((a, b) => a - b);
  const q = (p: number) => s[Math.min(s.length - 1, Math.max(0, Math.ceil(p * s.length) - 1))]!;
  return {
    n: s.length,
    p50: Math.round(q(0.5)),
    p95: Math.round(q(0.95)),
    max: Math.round(s.at(-1)!),
  };
}

async function main() {
  const gen = await generateGridData({ dir: DIR, rows: ROWS, segs: SEGS, layout: LAYOUT });
  console.log("data", { genSec: gen.genSec, sizeMb: gen.sizeMb });
  const { segments, dir: data } = gen;
  const per = Math.ceil(ROWS / SEGS);
  const engine = await QueryEngine.create({
    dataDir: join(DIR, "cache"),
    tmpDir: join(DIR, "duck-tmp"),
    memoryLimit: "1GB",
    threads: 2,
    maxTempSize: "4GB",
    maxConcurrency: 4,
    perUser: 2,
    queueWaitMs: 10_000,
  });
  const cache = new ParquetCache({
    dir: join(DIR, "cache"),
    maxBytes: 64 * 2 ** 30,
    maxDownloads: 2,
    // Hard link bila bisa (hemat disk); isi sama dengan unduhan.
    download: async (key, dest) => {
      try {
        linkSync(join(data, key), dest);
      } catch {
        copyFileSync(join(data, key), dest);
      }
    },
  });
  let leased: string[] = [];
  const V = "cmv4kljx40009oczvdperfver1";
  const SHEET = "cmv4kljx40009oczvdperfsht1";
  const sheet: GridSheet & { schema: ColumnSchema[] } = {
    versionId: V,
    versionStatus: "READY",
    activeVersionId: V,
    role: "OWNER",
    typedKey: segments[0]!.typedKey,
    rawKey: "-",
    fileName: null,
    schemaRevision: 1,
    schema,
    segments,
    period: LAYOUT === "period" ? { grain: "MONTH", column: null } : null,
  };
  const base: GridDeps = {
    repo: { sheet: async () => sheet },
    parquet: {
      acquire: (key, opts) => {
        leased.push(key);
        return cache.acquire(key, opts);
      },
      acquireMany: (keys, opts) => {
        leased.push(...keys);
        return cache.acquireMany(keys, opts);
      },
    },
    engine,
    timeoutMs: 30_000,
    prepareWaitMs: 600_000,
  };
  const cols = schema.map((s) => s.pos);
  type Body = Record<string, unknown>;
  const rows = async (body: Body, deps: GridDeps, user = "perf") => {
    leased = [];
    const t0 = performance.now();
    const r = await runGridRows(user, SHEET, { versionId: V, rowCount: 200, cols, ...body }, deps);
    const ms = performance.now() - t0;
    if (!r.ok) throw new Error(`${r.code} ${r.message}`);
    return { ms, r, leased: leased.length };
  };
  const out: Record<string, unknown> = {
    rows: ROWS,
    segs: SEGS,
    layout: LAYOUT,
    cols: COLS,
    reps: REPS,
    gridSlots: GRID_SLOTS,
    cpus: cpus().length,
    cpuModel: cpus()[0]?.model,
    memGB: Math.round(totalmem() / 2 ** 30),
    node: process.version,
    load1Start: loadavg()[0],
    dataMb: gen.sizeMb,
  };
  // Hangatkan: semua segmen ke cache lokal (AC: cache lokal hangat) + cache OS.
  for (let k = 0; k < SEGS; k++) await rows({ rowStart: k * per }, base);
  await rows({ rowStart: 0, sort: [{ pos: 11, dir: "desc" }] }, base);

  const rand = (lo: number, hi: number) => lo + Math.floor(Math.random() * (hi - lo));
  const freshCache = () => new ResultCache<CachedQuery>(64 * 2 ** 20);
  const warm = freshCache();
  const SORT_NUM = [{ pos: 11, dir: "desc" }];
  const SORT_TEXT = [{ pos: 4, dir: "asc" }];
  const FILTER = [
    { pos: 2, op: "in", values: ["Jakarta Selatan", "Bandung"] },
    { pos: 12, op: "range", gte: 100000, lte: 600000 },
  ];
  const SEARCH = { text: "jakarta", cols: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] };
  const filteredTotal = async (body: Body) =>
    (await rows({ ...body, rowStart: 0 }, { ...base, cache: warm })).r.filteredTotal;
  const months = segments.map((s) => s.period?.key).filter((k): k is string => !!k);

  type Scenario = [string, () => Promise<{ ms: number; leased?: number }>];
  const deep = async (body: Body) => {
    const n = await filteredTotal(body);
    return () =>
      rows(
        { ...body, rowStart: rand(Math.floor(n * 0.25), Math.max(1, n - 200)) },
        { ...base, cache: warm },
      );
  };
  const deepSortText = await deep({ sort: SORT_TEXT });
  const deepSortNum = await deep({ sort: SORT_NUM });
  const deepFilter = await deep({ filters: FILTER });
  const scenarios: Scenario[] = [
    ["ujung (rows-200)", () => rows({ rowStart: ROWS - 200 }, base)],
    ["acak", () => rows({ rowStart: rand(0, ROWS - 200) }, base)],
    [
      "lintas batas segmen",
      () => rows({ rowStart: SEGS > 1 ? per * rand(1, SEGS) - 100 : rand(0, ROWS - 200) }, base),
    ],
    [
      // "Ke baris 9.000.000" ('middle'): klien meminta blok berisi baris itu + blok sesudahnya.
      "ke baris 9.000.000 (2 blok)",
      async () => {
        const t0 = performance.now();
        const at = Math.min(9_000_000, ROWS - 1);
        const b = Math.floor(at / 200) * 200;
        await Promise.all([
          rows({ rowStart: b }, base),
          rows({ rowStart: Math.min(b + 200, ROWS - 200) }, base),
        ]);
        return { ms: performance.now() - t0 };
      },
    ],
    [
      "urut angka pertama",
      () => rows({ rowStart: 0, sort: SORT_NUM }, { ...base, cache: freshCache() }),
    ],
    ["urut angka dalam", deepSortNum],
    [
      // Kolom urut berganti tiap putaran (10 kolom desimal): seperti pengguna mencoba beberapa kolom.
      "urut angka pertama, kolom berganti",
      () =>
        rows(
          { rowStart: 0, sort: [{ pos: rand(11, 21), dir: "desc" }] },
          { ...base, cache: freshCache() },
        ),
    ],

    [
      "urut teks pertama",
      () => rows({ rowStart: 0, sort: SORT_TEXT }, { ...base, cache: freshCache() }),
    ],
    ["urut teks dalam", deepSortText],
    [
      "saring pertama",
      () => rows({ rowStart: 0, filters: FILTER }, { ...base, cache: freshCache() }),
    ],
    ["saring dalam", deepFilter],
    [
      "saring + urut teks pertama",
      () =>
        rows({ rowStart: 0, filters: FILTER, sort: SORT_TEXT }, { ...base, cache: freshCache() }),
    ],
    [
      "cari 10 kolom pertama",
      () => rows({ rowStart: 0, search: SEARCH }, { ...base, cache: freshCache() }),
    ],
    ...(months.length >= 3
      ? ([
          [
            "periode 1 bulan, acak",
            () =>
              rows(
                { rowStart: rand(0, per - 200), period: [months[rand(0, months.length)]!] },
                base,
              ),
          ],
          [
            "periode 3 bulan, urut teks pertama",
            () =>
              rows(
                { rowStart: 0, sort: SORT_TEXT, period: months.slice(-3) },
                { ...base, cache: freshCache() },
              ),
          ],
        ] as Scenario[])
      : []),
    [
      "daftar nilai teks (pelanggan, cari)",
      async () => {
        const t0 = performance.now();
        const r = await runGridValues(
          "perf",
          SHEET,
          { versionId: V, pos: 4, q: `${rand(1, 99)}` },
          { ...base, cache: freshCache() },
        );
        if (!r.ok) throw new Error(`${r.code} ${r.message}`);
        return { ms: performance.now() - t0 };
      },
    ],
    [
      "ringkasan kolom (tanpa saring)",
      async () => {
        const t0 = performance.now();
        const r = await runGridStats("perf", SHEET, { versionId: V, pos: 13 }, base);
        if (!r.ok) throw new Error(`${r.code} ${r.message}`);
        return { ms: performance.now() - t0 };
      },
    ],
    [
      "ringkasan kolom (saring)",
      async () => {
        const t0 = performance.now();
        const r = await runGridStats(
          "perf",
          SHEET,
          { versionId: V, pos: 13, filters: FILTER },
          base,
        );
        if (!r.ok) throw new Error(`${r.code} ${r.message}`);
        return { ms: performance.now() - t0 };
      },
    ],
  ];

  const results: Record<string, unknown> = {};
  for (const [name, fn] of scenarios) {
    if (ONLY && !ONLY.some((o) => name.includes(o))) continue;
    const ms: number[] = [];
    let maxLeased = 0;
    for (let i = 0; i < REPS; i++) {
      const r = await fn();
      ms.push(r.ms);
      maxLeased = Math.max(maxLeased, r.leased ?? 0);
    }
    const res = { ...stats(ms), ...(maxLeased ? { maxLeased } : {}) };
    console.log(name, JSON.stringify(res));
    results[name] = res;
  }
  out.scenarios = results;
  out.counts = {
    sortedTotal: ROWS,
    filtered: await filteredTotal({ filters: FILTER }),
    search: await filteredTotal({ search: SEARCH }),
  };

  async function load(variant: "polos" | "urut teks") {
    const gate = new GridGate({ maxGlobal: GRID_SLOTS, perUser: 2, queueWaitMs: 10_000 });
    const gdeps: GridDeps = { ...base, engine: gridEngine(engine, gate), cache: warm };
    // Widget = SQL agregat atas SELURUH sheet lewat runOnParquet + sumber segmen (jalur widget).
    const widgetSql = [
      "SELECT count(*) FROM read_parquet($path)",
      "SELECT sum(c11) FROM read_parquet($path)",
      "SELECT c2, sum(c12) s FROM read_parquet($path) GROUP BY c2 ORDER BY s DESC LIMIT 20",
      "SELECT date_trunc('month', c26) m, sum(c13) FROM read_parquet($path) GROUP BY m ORDER BY m",
      "SELECT c3, count(*) FROM read_parquet($path) GROUP BY c3 ORDER BY 2 DESC LIMIT 20",
      "SELECT c1, c11, c21 FROM read_parquet($path) ORDER BY c21 DESC, _row LIMIT 50",
    ];
    const src = sourceFor(sheet, segments);
    let busy = 0;
    let timeout = 0;
    let widget: number[] = [];
    let dash: number[] = [];
    const dashboard = async () => {
      const t0 = performance.now();
      await Promise.all(
        widgetSql.map(async (sql) => {
          const w0 = performance.now();
          const r = await runOnParquet("dash", src, base, (_p, exec) =>
            exec({ sql, params: { path: _p } }),
          );
          if (!r.ok) {
            if (r.code === "QUERY_BUSY") busy++;
            else if (r.code === "QUERY_TIMEOUT") timeout++;
            else throw new Error(`${r.code} ${r.message}`);
          }
          widget.push(performance.now() - w0);
        }),
      );
      dash.push(performance.now() - t0);
    };
    await dashboard(); // pemanasan
    widget = [];
    dash = [];
    for (let i = 0; i < REPS; i++) await dashboard();
    const baseRes = { widget: stats(widget), dash: stats(dash) };
    widget = [];
    dash = [];
    let stop = false;
    const grid = { ok: 0, busy: 0, timeout: 0, ms: [] as number[] };
    const n = ROWS;
    const scroller = async (u: string) => {
      while (!stop) {
        const body =
          variant === "polos"
            ? { rowStart: rand(0, n - 200) }
            : { rowStart: rand(Math.floor(n * 0.25), n - 200), sort: SORT_TEXT };
        const t0 = performance.now();
        const r = await runGridRows(
          u,
          SHEET,
          { versionId: V, rowCount: 200, cols, ...body },
          gdeps,
        );
        if (r.ok) {
          grid.ok++;
          grid.ms.push(performance.now() - t0);
        } else if (r.code === "QUERY_BUSY") grid.busy++;
        else if (r.code === "QUERY_TIMEOUT") grid.timeout++;
        else throw new Error(`${r.code} ${r.message}`);
      }
    };
    const users = ["s1", "s2", "s3", "s4", "s5"].flatMap((u) => [scroller(u), scroller(u)]);
    await new Promise((r) => setTimeout(r, 500));
    const load1 = loadavg()[0];
    for (let i = 0; i < REPS; i++) await dashboard();
    stop = true;
    await Promise.all(users);
    const loaded = { widget: stats(widget), dash: stats(dash) };
    const res = {
      base: baseRes,
      loaded,
      ratioWidgetP95: Math.round((loaded.widget.p95 / baseRes.widget.p95) * 100) / 100,
      widgetBusy: busy,
      widgetTimeout: timeout,
      grid: {
        ok: grid.ok,
        busy: grid.busy,
        timeout: grid.timeout,
        ...(grid.ms.length ? { ms: stats(grid.ms) } : {}),
      },
      load1,
    };
    console.log(`beban 5 penggulir (${variant}) + dashboard 6 widget`, JSON.stringify(res));
    return res;
  }
  if (process.argv.includes("--load")) {
    out.load = { polos: await load("polos"), urutTeks: await load("urut teks") };
  }
  out.load1End = loadavg()[0];
  console.log(JSON.stringify(out));
  const json = arg("json");
  if (json) writeFileSync(json, JSON.stringify(out, null, 2));
  engine.close();
  if (!process.argv.includes("--keep")) rmSync(DIR, { recursive: true, force: true });
  else rmSync(join(DIR, "cache"), { recursive: true, force: true });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
