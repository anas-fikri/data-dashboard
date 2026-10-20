/*
 * Perf T-041 (G-6 §3.6): jendela baris "Lihat data" tanpa urut di sheet 10 jt baris × 30 kolom (24
 * segmen), lewat runGridRows sungguhan (QueryEngine: memory_limit 1GB, 2 thread, sandbox) dan cache
 * parquet lokal hangat. Bukan bagian check; hasil dicatat di docs/ai/perf/T-041.md.
 *
 *   npx tsx scripts/perf-grid.ts --dir /path/scratch [--rows 10000000] [--segs 24] [--reps 50] [--keep]
 *
 * Mengukur: (a) rowStart = rows − 200 (AC1), (b) posisi acak di seluruh sheet, (c) lintas batas segmen;
 * p50/p95 server dalam ms, dan kunci yang disewa per permintaan (harus hanya segmen yang beririsan).
 *
 * --load (T-042): dashboard 6 widget (agregat DuckDB, jatah 2/user) diukur sendirian (baseline) lalu
 * bersamaan dengan 5 penggulir (masing-masing 2 jendela in-flight lewat gerbang grid 2/4 slot);
 * dicatat p95 widget dan jumlah QUERY_BUSY widget/grid. Hasil di docs/ai/perf/T-042.md.
 */
import { copyFileSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { cpus, totalmem } from "node:os";
import { join } from "node:path";
import { DuckDBInstance } from "@duckdb/node-api";
import type { ColumnSchema } from "../src/features/ingest/infer";
import { GridGate, gridEngine } from "../src/features/query/grid-gate";
import { runGridRows, type GridDeps, type GridSegment } from "../src/features/query/grid-service";
import { QueryEngine } from "../src/lib/duckdb/engine";
import { ParquetCache } from "../src/lib/duckdb/parquet-cache";

const arg = (name: string, def?: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : def;
};
const DIR = arg("dir") ?? "";
if (!DIR) {
  console.error(
    "pakai: scripts/perf-grid.ts --dir <scratch> [--rows 10000000] [--segs 24] [--reps 50]",
  );
  process.exit(1);
}
const ROWS = Number(arg("rows", "10000000"));
const SEGS = Number(arg("segs", "24"));
const REPS = Number(arg("reps", "50"));
const COLS = 30;
const data = join(DIR, "data");
mkdirSync(data, { recursive: true });
const pct = (xs: number[], p: number) => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.ceil((p / 100) * s.length) - 1)]!;
};

// 30 kolom: 10 teks, 10 desimal, 5 bilangan bulat, 5 tanggal.
const type = (p: number): ColumnSchema["type"] =>
  p <= 10 ? "text" : p <= 20 ? "decimal" : p <= 25 ? "integer" : "date";
const expr = (p: number) =>
  type(p) === "text"
    ? `'teks ' || ((i * ${p}) % 9973)`
    : type(p) === "decimal"
      ? `CAST(((i * ${p}) % 100000) / 7.0 AS DECIMAL(38,6))`
      : type(p) === "integer"
        ? `CAST((i * ${p}) % 1000003 AS BIGINT)`
        : `DATE '2024-01-01' + CAST((i + ${p}) % 700 AS INTEGER)`;
const schema = Array.from({ length: COLS }, (_, k) => ({
  pos: k + 1,
  name: `k${k + 1}`,
  original: `k${k + 1}`,
  type: type(k + 1),
  hidden: false,
  nullPct: 0,
  distinctCount: 0,
  castFailCount: 0,
})) as ColumnSchema[];

async function main() {
  const per = Math.ceil(ROWS / SEGS);
  const segments: GridSegment[] = [];
  const db = await DuckDBInstance.create(":memory:");
  const c = await db.connect();
  await c.run("SET threads = 4");
  for (let k = 0; k < SEGS; k++) {
    const lo = k * per;
    const hi = Math.min(ROWS, lo + per);
    const file = `seg-${k}.parquet`;
    if (!existsSync(join(data, file))) {
      const cols = schema.map((s) => `${expr(s.pos)} AS c${s.pos}`).join(", ");
      await c.run(
        `COPY (SELECT (${k}::BIGINT * 100000000 + i - ${lo} + 2)::BIGINT AS _row, (i - ${lo} + 2)::INTEGER AS _src_row, ${cols}
               FROM range(${lo}, ${hi}) t(i) ORDER BY i)
         TO '${join(data, file)}' (FORMAT parquet, COMPRESSION zstd, ROW_GROUP_SIZE 122880)`,
      );
    }
    segments.push({
      typedKey: file,
      legacyRow: false,
      columns: schema.map((s) => s.pos),
      dataRows: hi - lo,
      rowBase: k * 100000000,
      maxSrcRow: hi - lo + 1,
      rawKey: "-",
      colMap: [],
      fileName: `bulan-${k}.xlsx`,
    });
  }
  c.closeSync();
  db.closeSync();

  const engine = await QueryEngine.create({
    dataDir: join(DIR, "cache"),
    tmpDir: join(DIR, "duck-tmp"),
    memoryLimit: "1GB",
    threads: 2,
    maxTempSize: "8GB",
    maxConcurrency: 4,
    perUser: 2,
    queueWaitMs: 10_000,
  });
  const cache = new ParquetCache({
    dir: join(DIR, "cache"),
    maxBytes: 64 * 2 ** 30,
    maxDownloads: 2,
    download: async (key, dest) => copyFileSync(join(data, key), dest),
  });
  let leased: string[] = [];
  const V = "cmv4kljx40009oczvdperfver1";
  const deps: GridDeps = {
    repo: {
      sheet: async () => ({
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
      }),
    },
    parquet: {
      acquire: (key, opts) => {
        leased.push(key);
        return cache.acquire(key, opts);
      },
    },
    engine,
    timeoutMs: 30_000,
    prepareWaitMs: 600_000,
  };
  const cols = schema.map((s) => s.pos);
  const run = async (rowStart: number) => {
    leased = [];
    const t0 = performance.now();
    const r = await runGridRows(
      "perf",
      "cmv4kljx40009oczvdperfsht1",
      { versionId: V, rowStart, rowCount: 200, cols },
      deps,
    );
    const ms = performance.now() - t0;
    if (!r.ok) throw new Error(`${r.code} ${r.message}`);
    if (r.rows.length !== Math.min(200, ROWS - rowStart)) throw new Error(`baris ${r.rows.length}`);
    if (r.rows[0]!.n !== rowStart + 1) throw new Error("n salah");
    return { ms, leased: [...leased] };
  };
  // Hangatkan: semua segmen ke cache lokal (AC: cache lokal hangat).
  for (let k = 0; k < SEGS; k++) await run(k * per);
  const scenarios: [string, () => number][] = [
    ["ujung (rows-200)", () => ROWS - 200],
    ["acak", () => Math.floor(Math.random() * (ROWS - 200))],
    ["lintas batas segmen", () => per * (1 + Math.floor(Math.random() * (SEGS - 1))) - 100],
  ];
  const out: Record<string, unknown> = {
    rows: ROWS,
    segs: SEGS,
    cols: COLS,
    reps: REPS,
    cpus: cpus().length,
    memGB: Math.round(totalmem() / 2 ** 30),
  };
  async function load() {
    const gate = new GridGate({ maxGlobal: 2, perUser: 2, queueWaitMs: 10_000 });
    const gdeps: GridDeps = { ...deps, engine: gridEngine(engine, gate) };
    const widgetSql = [
      "SELECT count(*) FROM read_parquet($p)",
      "SELECT sum(c11) FROM read_parquet($p)",
      "SELECT c1, sum(c12) s FROM read_parquet($p) GROUP BY c1 ORDER BY s DESC LIMIT 20",
      "SELECT date_trunc('month', c26) m, sum(c13) FROM read_parquet($p) GROUP BY m ORDER BY m",
      "SELECT c2, count(*) FROM read_parquet($p) GROUP BY c2 ORDER BY 2 DESC LIMIT 20",
      "SELECT c1, c11, c21 FROM read_parquet($p) ORDER BY c21 DESC LIMIT 50",
    ];
    const lease = await cache.acquire(segments[0]!.typedKey);
    let busy = 0;
    const dashboard = async () => {
      const t0 = performance.now();
      await Promise.all(
        widgetSql.map(async (sql) => {
          const w0 = performance.now();
          try {
            await engine.run("dash", sql, { p: lease.path }, 30_000);
          } catch (e) {
            if ((e as Error).name === "QueryBusyError") busy++;
            else throw e;
          }
          widget.push(performance.now() - w0);
        }),
      );
      dash.push(performance.now() - t0);
    };
    let widget: number[] = [];
    let dash: number[] = [];
    for (let i = 0; i < REPS; i++) await dashboard();
    const base = { widgetP95: Math.round(pct(widget, 95)), dashP95: Math.round(pct(dash, 95)) };
    widget = [];
    dash = [];
    let stop = false;
    let gridBusy = 0;
    let gridOk = 0;
    const scroller = async (u: string) => {
      while (!stop) {
        const r = await runGridRows(
          u,
          "cmv4kljx40009oczvdperfsht1",
          { versionId: V, rowStart: Math.floor(Math.random() * (ROWS - 200)), rowCount: 200, cols },
          gdeps,
        );
        if (r.ok) gridOk++;
        else if (r.code === "QUERY_BUSY") gridBusy++;
        else throw new Error(`${r.code} ${r.message}`);
      }
    };
    const users = ["s1", "s2", "s3", "s4", "s5"].flatMap((u) => [scroller(u), scroller(u)]);
    await new Promise((r) => setTimeout(r, 200));
    for (let i = 0; i < REPS; i++) await dashboard();
    stop = true;
    await Promise.all(users);
    lease.release();
    const loaded = { widgetP95: Math.round(pct(widget, 95)), dashP95: Math.round(pct(dash, 95)) };
    const res = { base, loaded, widgetBusy: busy, gridOk, gridBusy };
    console.log("beban 5 penggulir + dashboard 6 widget", res);
    return res;
  }

  for (const [name, pos] of scenarios) {
    const ms: number[] = [];
    let maxLeased = 0;
    for (let i = 0; i < REPS; i++) {
      const r = await run(pos());
      ms.push(r.ms);
      maxLeased = Math.max(maxLeased, r.leased.length);
    }
    const res = { p50: Math.round(pct(ms, 50)), p95: Math.round(pct(ms, 95)), maxLeased };
    console.log(name, res);
    out[name] = res;
  }
  if (process.argv.includes("--load")) out.load = await load();
  const end = await run(ROWS - 200);
  console.log("sewa untuk rowStart rows-200:", end.leased);
  console.log(JSON.stringify(out));
  engine.close();
  if (!process.argv.includes("--keep")) rmSync(DIR, { recursive: true, force: true });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
