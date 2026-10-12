/*
 * Perf API query (T-009 AC 6): CSV → runIngest sungguhan (raw + typed) → 20× query group-by
 * 2 dimensi + 2 ukuran lewat runQuery (mesin DuckDB + cache parquet lokal sungguhan). Bukan bagian check.
 *   npx tsx --conditions=react-server scripts/perf-query.ts tests/fixtures/perf/10jt-baris.csv
 * Keluaran: satu baris JSON — waktu ingest, p50/p95/maks query tanpa cache hasil (mesin DuckDB) dan
 * dengan cache hasil (memori).
 */
import { execFileSync } from "node:child_process";
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
import { ResultCache } from "../src/features/query/cache";
import { runQuery, type CachedQuery, type QueryDeps } from "../src/features/query/service";
import { QueryEngine } from "../src/lib/duckdb/engine";
import { ParquetCache } from "../src/lib/duckdb/parquet-cache";

const file = process.argv[2];
if (!file) {
  console.error("pakai: scripts/perf-query.ts <fixture.csv|xlsx>");
  process.exit(1);
}
const DS = "cmv4klj5r0007oczvgiofocpg";
const VER = "cmv4kljx40009oczvdmpurrxf";
const SHEET = "cmv4kljx40009oczvdmpurrxa";

const pct = (xs: number[], p: number) => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.ceil((p / 100) * s.length) - 1)]!;
};

const freeGB = () =>
  Number(
    execFileSync("df", ["-k", tmpdir()]).toString().trim().split("\n").pop()!.split(/\s+/)[3],
  ) /
  1024 /
  1024;

async function main() {
  const root = mkdtempSync(join(tmpdir(), "dd-perf-query-"));
  const guard = setInterval(() => {
    if (freeGB() < 1) {
      console.error("berhenti: sisa disk < 1 GB");
      rmSync(root, { recursive: true, force: true });
      process.exit(3);
    }
  }, 2_000);
  const store = join(root, "store");
  let typedKey = "";
  let schema: ColumnSchema[] = [];
  const repo: IngestRepo = {
    load: async () => ({
      datasetId: DS,
      sourceKey: `raw/${DS}/${VER}/source.${file!.endsWith(".csv") ? "csv" : "xlsx"}`,
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
    finish: async () => true,
    recordCleanup: async () => {},
    fail: async (_v, m) => {
      console.error("FAILED:", m);
    },
  };
  const storage: IngestStorage = {
    // Hard link dan rename: tanpa salinan (disk mesin uji terbatas).
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

  // 2 dimensi: kolom teks dengan nilai unik paling sedikit (kategori) + tanggal per bulan atau teks
  // kategori kedua; 2 ukuran: total angka pertama + jumlah baris.
  const visible = schema.filter((c) => !c.hidden);
  const cats = visible
    .filter((c) => c.type === "text" && c.distinctCount > 1)
    .sort((a, b) => a.distinctCount - b.distinctCount);
  const date = visible.find((c) => c.type === "date" || c.type === "timestamp");
  const num = visible.find((c) => c.type === "decimal" || c.type === "integer");
  if (!cats[0] || !num)
    throw new Error(`skema tidak cocok: ${JSON.stringify(visible.map((c) => c.type))}`);
  const dimensions = [
    { column: cats[0].name },
    date ? { column: date.name, timeGrain: "month" } : { column: cats[1]!.name },
  ];
  const measures = [{ column: num.name, agg: "sum" }, { agg: "count" }];

  const engine = await QueryEngine.create({
    dataDir: join(root, "qcache"),
    tmpDir: join(root, "qtmp"),
    memoryLimit: "1GB",
    threads: 2,
    maxTempSize: "4GB",
    maxConcurrency: 4,
    perUser: 4,
    queueWaitMs: 10_000,
  });
  const parquet = new ParquetCache({
    dir: join(root, "qcache"),
    maxBytes: 10 * 1024 ** 3,
    download: async (key, dest) => {
      linkSync(join(store, key), dest);
    },
  });
  const memStore = new ResultCache<CachedQuery>(128 * 1024 * 1024);
  const deps = (cache: ResultCache<CachedQuery> | null): QueryDeps => ({
    repo: {
      widget: async () => null,
      ownedDataset: async () => ({ activeVersionId: VER }),
      sheet: async () => ({ typedKey, schemaRevision: 1, schema }),
    },
    parquet,
    engine,
    cache,
    timeoutMs: 30_000,
  });
  const spec = { sheetId: SHEET, dimensions, measures, limit: 10_000 };
  const run = async (cache: ResultCache<CachedQuery> | null) => {
    const times: number[] = [];
    let rows = 0;
    for (let i = 0; i < 20; i++) {
      const a = performance.now();
      const q = await runQuery("perf", { datasetId: DS, spec }, deps(cache));
      times.push(performance.now() - a);
      if (!q.ok) throw new Error(JSON.stringify(q));
      rows = q.rows.length;
    }
    return {
      rows,
      firstMs: Math.round(times[0]!),
      p50Ms: Math.round(pct(times, 50)),
      p95Ms: Math.round(pct(times, 95)),
      maxMs: Math.round(Math.max(...times)),
    };
  };
  const noCache = await run(null);
  const cached = await run(memStore);
  console.log(
    JSON.stringify({
      file: file!.split("/").pop(),
      ingestSeconds,
      spec: { dimensions, measures },
      noResultCache: noCache,
      withResultCache: cached,
      maxRssMB: Math.round(process.resourceUsage().maxRSS / 1024),
    }),
  );
  engine.close();
  clearInterval(guard);
  rmSync(root, { recursive: true, force: true });
}
void main();
