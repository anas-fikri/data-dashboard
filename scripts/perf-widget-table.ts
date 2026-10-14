/*
 * Perf widget tabel (T-011 AC 5): CSV → runIngest sungguhan (raw + typed) → widget tabel 6 kolom lewat
 * runWidgetQuery (mesin DuckDB + cache parquet lokal sungguhan, TANPA cache hasil) — urut kolom angka /
 * teks / tanggal dan pindah ke halaman awal, tengah, dan terakhir. Bukan bagian check.
 *   npx tsx --conditions=react-server scripts/perf-widget-table.ts tests/fixtures/perf/1jt-baris.csv
 * Keluaran: satu baris JSON — waktu ingest, p50/p95/maks semua permintaan, maks per skenario.
 */
import { linkSync, mkdirSync, mkdtempSync, renameSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import type { ColumnSchema } from "../src/features/ingest/infer";
import {
  runIngest,
  type IngestRepo,
  type IngestStorage,
  type SheetRecord,
} from "../src/features/ingest/ingest";
import { runWidgetQuery, type QueryDeps } from "../src/features/query/service";
import { QueryEngine } from "../src/lib/duckdb/engine";
import { ParquetCache } from "../src/lib/duckdb/parquet-cache";

const file = process.argv[2];
if (!file) {
  console.error("pakai: scripts/perf-widget-table.ts <fixture.csv|xlsx>");
  process.exit(1);
}
const DS = "cmv4klj5r0007oczvgiofocpg";
const VER = "cmv4kljx40009oczvdmpurrxf";
const SHEET = "cmv4kljx40009oczvdmpurrxa";
const WIDGET = "cmv4kljx40009oczvdmpurrwt";
const RUNS = 5;

const pct = (xs: number[], p: number) => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.ceil((p / 100) * s.length) - 1)]!;
};

async function main() {
  const root = mkdtempSync(join(tmpdir(), "dd-perf-table-"));
  const store = join(root, "store");
  let typedKey = "";
  let schema: ColumnSchema[] = [];
  const repo: IngestRepo = {
    load: async () => ({
      datasetId: DS,
      sourceKey: `raw/${DS}/${VER}/source.${file!.endsWith(".csv") ? "csv" : "xlsx"}`,
      active: null,
    }),
    begin: async () => true,
    exists: async () => true,
    progress: async () => {},
    deleteSheets: async () => {},
    createSheet: async (_v, _s: SheetRecord) => SHEET,
    setSheetKey: async () => {},
    setTyped: async (_id, d) => {
      typedKey = d.typedKey;
      schema = d.schema;
    },
    finish: async () => "activated",
    recordCleanup: async () => {},
    fail: async (_v, m) => {
      console.error("FAILED:", m);
    },
  };
  const storage: IngestStorage = {
    download: async (_k, dest) => {
      linkSync(file!, dest);
      return { sha256: "-", bytes: 0 };
    },
    upload: async (key, path) => {
      const dest = join(store, key);
      mkdirSync(dirname(dest), { recursive: true });
      renameSync(path, dest);
    },
    deletePrefix: async () => 0,
  };
  const work = join(root, "work");
  mkdirSync(work);
  const t0 = performance.now();
  const r = await runIngest(VER, repo, storage, { tmpRoot: work });
  const ingestSeconds = Math.round((performance.now() - t0) / 100) / 10;
  if (r.outcome !== "done") throw new Error(`ingest ${JSON.stringify(r)}`);

  const visible = schema.filter((c) => !c.hidden);
  const columns = visible.slice(0, 6);
  const num = columns.find((c) => c.type === "decimal" || c.type === "integer");
  const text = columns.find((c) => c.type === "text");
  const date = columns.find((c) => c.type === "date" || c.type === "timestamp");
  if (!num || !text)
    throw new Error(`skema tidak cocok: ${JSON.stringify(columns.map((c) => c.type))}`);

  const engine = await QueryEngine.create({
    dataDir: join(root, "qcache"),
    tmpDir: join(root, "qtmp"),
    memoryLimit: "1GB",
    threads: 2,
    maxTempSize: "4GB",
    maxConcurrency: 4,
    perUser: 2,
    queueWaitMs: 10_000,
  });
  const parquet = new ParquetCache({
    dir: join(root, "qcache"),
    maxBytes: 10 * 1024 ** 3,
    download: async (key, dest) => {
      linkSync(join(store, key), dest);
    },
  });
  const spec = {
    sheetId: SHEET,
    columns: columns.map((c) => c.pos),
    format: { style: "number", decimals: 0 },
  };
  const deps: QueryDeps = {
    repo: {
      widget: async () => ({ type: "table", spec, datasetId: DS, activeVersionId: VER }),
      ownedDataset: async () => null,
      sheet: async () => ({ typedKey, schemaRevision: 1, schema }),
    },
    parquet,
    engine,
    cache: null,
    timeoutMs: 30_000,
  };

  // Halaman terakhir dihitung dari total yang dikembalikan permintaan pertama.
  const first = await runWidgetQuery("perf", { widgetId: WIDGET }, deps);
  if (!first.ok || !("total" in first)) throw new Error(JSON.stringify(first));
  const last = Math.ceil(first.total / 100) - 1;
  const scenarios: { name: string; body: Record<string, unknown> }[] = [
    { name: "tanpa urut, hal 1", body: {} },
    { name: `urut ${num.name} turun, hal 1`, body: { sort: { column: num.pos, dir: "desc" } } },
    {
      name: `urut ${num.name} turun, hal 2`,
      body: { sort: { column: num.pos, dir: "desc" }, page: 1 },
    },
    {
      name: `urut ${num.name} turun, hal tengah`,
      body: { sort: { column: num.pos, dir: "desc" }, page: Math.floor(last / 2) },
    },
    {
      name: `urut ${num.name} turun, hal terakhir`,
      body: { sort: { column: num.pos, dir: "desc" }, page: last },
    },
    { name: `urut ${text.name} naik, hal 1`, body: { sort: { column: text.pos, dir: "asc" } } },
    {
      name: `urut ${text.name} naik, hal tengah`,
      body: { sort: { column: text.pos, dir: "asc" }, page: Math.floor(last / 2) },
    },
    ...(date
      ? [
          {
            name: `urut ${date.name} turun, hal 1`,
            body: { sort: { column: date.pos, dir: "desc" } },
          },
        ]
      : []),
  ];
  const all: number[] = [];
  const perScenario: Record<string, { p50Ms: number; maxMs: number; rows: number }> = {};
  for (const s of scenarios) {
    const times: number[] = [];
    let rows = 0;
    for (let i = 0; i < RUNS; i++) {
      const a = performance.now();
      const q = await runWidgetQuery("perf", { widgetId: WIDGET, ...s.body }, deps);
      times.push(performance.now() - a);
      if (!q.ok) throw new Error(`${s.name}: ${JSON.stringify(q)}`);
      rows = q.rows.length;
    }
    all.push(...times);
    perScenario[s.name] = {
      p50Ms: Math.round(pct(times, 50)),
      maxMs: Math.round(Math.max(...times)),
      rows,
    };
  }
  console.log(
    JSON.stringify({
      file: file!.split("/").pop(),
      ingestSeconds,
      totalRows: first.total,
      columns: columns.map((c) => `${c.name} (${c.type})`),
      requests: all.length,
      p50Ms: Math.round(pct(all, 50)),
      p95Ms: Math.round(pct(all, 95)),
      maxMs: Math.round(Math.max(...all)),
      perScenario,
      maxRssMB: Math.round(process.resourceUsage().maxRSS / 1024),
    }),
  );
  engine.close();
  rmSync(root, { recursive: true, force: true });
}
void main();
