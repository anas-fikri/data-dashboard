import { copyFileSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DuckDBInstance } from "@duckdb/node-api";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { ColumnSchema } from "@/features/ingest/infer";
import { canonical, type ResultStore } from "@/features/query/cache";
import { runQuery, type QueryDeps, type QueryRepo } from "@/features/query/service";
import { QueryEngine, QueryTimeoutError } from "@/lib/duckdb/engine";
import { ParquetCache } from "@/lib/duckdb/parquet-cache";

/*
 * Query deklaratif (T-009) in-process: mesin DuckDB + cache parquet sungguhan, DB dan Redis palsu.
 */
const DS = "cmv4klj5r0007oczvgiofocpg";
const OTHER_DS = "cmv4klj5r0007oczvgiofocpz";
const VER = "cmv4kljx40009oczvdmpurrxf";
const SHEET = "cmv4kljx40009oczvdmpurrxa";
const OTHER_SHEET = "cmv4kljx40009oczvdmpurrxb";
const USER = "user-pemilik";

const col = (
  pos: number,
  name: string,
  type: ColumnSchema["type"],
  hidden = false,
): ColumnSchema => ({
  pos,
  name,
  original: name,
  type,
  hidden,
  nullPct: 0,
  distinctCount: 0,
  castFailCount: 0,
});
const SCHEMA: ColumnSchema[] = [
  col(1, "Kota", "text"),
  col(2, 'Total; "Omzet"', "decimal"),
  col(3, "Tanggal", "date"),
  col(4, "Lunas", "boolean"),
  col(5, "Rahasia", "text", true),
  col(6, "Koli", "integer"),
];

let root: string;
let source: string;
let engine: QueryEngine;

beforeAll(async () => {
  root = mkdtempSync(join(tmpdir(), "dd-query-test-"));
  source = join(root, "typed.parquet");
  const db = await DuckDBInstance.create(":memory:");
  const c = await db.connect();
  await c.run(
    `COPY (SELECT (i + 2)::INTEGER AS _row,
                  'Kota ' || (i % 3) AS c1,
                  CAST(i * 1.5 AS DECIMAL(38,6)) AS c2,
                  DATE '2026-01-01' + CAST(i % 60 AS INTEGER) AS c3,
                  i % 2 = 0 AS c4,
                  'x' AS c5,
                  CAST(i % 7 AS BIGINT) AS c6
           FROM range(1000) t(i)) TO '${source}' (FORMAT parquet)`,
  );
  c.closeSync();
  db.closeSync();
  engine = await QueryEngine.create({
    dataDir: join(root, "cache"),
    tmpDir: join(root, "duck-tmp"),
    memoryLimit: "256MB",
    threads: 2,
    maxTempSize: "1GB",
    maxConcurrency: 4,
    perUser: 4,
    queueWaitMs: 2_000,
  });
});
afterAll(() => {
  engine?.close();
  rmSync(root, { recursive: true, force: true });
});

function memoryStore(): ResultStore & { keys: () => string[] } {
  const m = new Map<string, string>();
  return {
    keys: () => [...m.keys()],
    get: async (k) => m.get(k) ?? null,
    set: async (k, v) => {
      m.set(k, v);
      return "OK";
    },
  };
}

function deps(over: Partial<QueryDeps> = {}, revision = 1): QueryDeps & { downloads: string[] } {
  const downloads: string[] = [];
  const repo: QueryRepo = {
    ownedDataset: async (userId, datasetId) =>
      userId === USER && datasetId === DS ? { activeVersionId: VER } : null,
    sheet: async (versionId, sheetId) =>
      versionId === VER && sheetId === SHEET
        ? { typedKey: "parquet/ds/v/s/typed-1.parquet", schemaRevision: revision, schema: SCHEMA }
        : null,
  };
  const parquet = new ParquetCache(join(root, "cache"), 1 << 30, async (key, dest) => {
    downloads.push(key);
    copyFileSync(source, dest);
  });
  return { repo, parquet, engine, cache: memoryStore(), timeoutMs: 30_000, downloads, ...over };
}

const body = (spec: Record<string, unknown>, datasetId = DS) => ({
  datasetId,
  spec: { sheetId: SHEET, ...spec },
});

describe("AC 1: kolom dari skema", () => {
  it("nama kolom berisi ; dan kutip dipetakan ke kolom fisik — query berhasil", async () => {
    const r = await runQuery(
      USER,
      body({
        dimensions: [{ column: "Kota" }],
        measures: [{ column: 'Total; "Omzet"', agg: "sum" }, { agg: "count" }],
      }),
      deps(),
    );
    expect(r).toMatchObject({ ok: true, cached: false });
    if (!r.ok) return;
    expect(r.columns.map((c) => c.key)).toEqual(["d0", "m0", "m1"]);
    expect(r.rows).toHaveLength(3);
    expect(r.rows[0]).toEqual(["Kota 0", expect.any(Number), 334]);
  });

  it("kolom tidak ada atau disembunyikan → INVALID tanpa menyentuh DuckDB", async () => {
    const run = vi.fn();
    const d = deps({ engine: { run } });
    for (const column of ["Tidak Ada", "Rahasia"]) {
      const r = await runQuery(USER, body({ dimensions: [{ column }] }), d);
      expect(r).toMatchObject({ ok: false, code: "INVALID" });
    }
    expect(run).not.toHaveBeenCalled();
    expect(d.downloads).toEqual([]);
  });
});

describe("AC 2 & 7: kepemilikan", () => {
  it("bukan pemilik dataset → NOT_FOUND", async () => {
    const r = await runQuery("orang-lain", body({ measures: [{ agg: "count" }] }), deps());
    expect(r).toMatchObject({ ok: false, code: "NOT_FOUND" });
  });

  it("sheetId milik dataset lain → NOT_FOUND (sheet di-resolve per versi aktif)", async () => {
    const r = await runQuery(
      USER,
      { datasetId: DS, spec: { sheetId: OTHER_SHEET, measures: [{ agg: "count" }] } },
      deps(),
    );
    expect(r).toMatchObject({ ok: false, code: "NOT_FOUND" });
    const other = await runQuery(USER, body({ measures: [{ agg: "count" }] }, OTHER_DS), deps());
    expect(other).toMatchObject({ ok: false, code: "NOT_FOUND" });
  });
});

describe("AC 3: cache hasil", () => {
  it("spec sama dengan urutan key berbeda → dari cache; schemaRevision naik → miss", async () => {
    const d = deps();
    const a = await runQuery(
      USER,
      body({ dimensions: [{ column: "Kota" }], measures: [{ agg: "count" }], limit: 50 }),
      d,
    );
    const b = await runQuery(
      USER,
      {
        spec: {
          limit: 50,
          measures: [{ agg: "count" }],
          dimensions: [{ column: "Kota" }],
          sheetId: SHEET,
        },
        datasetId: DS,
      },
      d,
    );
    expect(a).toMatchObject({ ok: true, cached: false });
    expect(b).toMatchObject({ ok: true, cached: true });
    if (a.ok && b.ok) expect(b.rows).toEqual(a.rows);
    const c = await runQuery(
      USER,
      body({ dimensions: [{ column: "Kota" }], measures: [{ agg: "count" }], limit: 50 }),
      { ...deps({}, 2), cache: d.cache },
    );
    expect(c).toMatchObject({ ok: true, cached: false });
    expect(canonical({ b: 1, a: [{ y: 2, x: 1 }] })).toBe(canonical({ a: [{ x: 1, y: 2 }], b: 1 }));
  });

  it("Redis gagal → hasil tetap dikirim (cache miss)", async () => {
    const broken: ResultStore = {
      get: async () => {
        throw new Error("redis mati");
      },
      set: async () => {
        throw new Error("OOM command not allowed");
      },
    };
    const r = await runQuery(USER, body({ measures: [{ agg: "count" }] }), deps({ cache: broken }));
    expect(r).toMatchObject({ ok: true, rows: [[1000]] });
  });
});

describe("AC 4: batas waktu", () => {
  it("query lambat → DuckDB di-interrupt, QueryTimeoutError", async () => {
    const t0 = Date.now();
    await expect(
      engine.run(USER, "SELECT count(*) FROM range(100000000000) a", {}, 300),
    ).rejects.toBeInstanceOf(QueryTimeoutError);
    expect(Date.now() - t0).toBeLessThan(10_000);
  });

  it("service memetakan timeout ke QUERY_TIMEOUT dengan saran mempersempit filter", async () => {
    const r = await runQuery(
      USER,
      body({ measures: [{ agg: "count" }] }),
      deps({
        engine: {
          run: async () => {
            throw new QueryTimeoutError();
          },
        },
      }),
    );
    expect(r).toMatchObject({ ok: false, code: "QUERY_TIMEOUT" });
    if (!r.ok) expect(r.message).toMatch(/Persempit filter/);
  });
});

describe("AC 5: cache parquet lokal (LRU)", () => {
  it("penuh → file paling lama tidak dipakai dihapus, total ≤ batas; yang sedang dipakai aman", async () => {
    const dir = join(root, "lru");
    const cache = new ParquetCache(dir, 2_500, async (_key, dest) => {
      writeFileSync(dest, Buffer.alloc(1_000));
    });
    const a = await cache.acquire("a");
    a.release();
    const b = await cache.acquire("b");
    b.release();
    const inUse = await cache.acquire("c"); // a, b, c = 3.000 > 2.500 → a (paling lama) dibuang
    expect(cache.totalBytes).toBeLessThanOrEqual(2_500);
    const d = await cache.acquire("d"); // b dibuang; c sedang dipakai
    expect(cache.totalBytes).toBeLessThanOrEqual(2_500);
    const again = await cache.acquire("c");
    expect(again.path).toBe(inUse.path);
    inUse.release();
    again.release();
    d.release();
  });

  it("unduhan bersamaan untuk kunci sama digabung", async () => {
    let n = 0;
    const cache = new ParquetCache(join(root, "dedupe"), 1 << 20, async (_k, dest) => {
      n++;
      await new Promise((r) => setTimeout(r, 20));
      writeFileSync(dest, "x");
    });
    const [x, y] = await Promise.all([cache.acquire("k"), cache.acquire("k")]);
    expect(n).toBe(1);
    expect(x.path).toBe(y.path);
  });
});

describe("AC 8: batas dan enum", () => {
  it.each([
    ["agg di luar enum", { measures: [{ column: "Koli", agg: "median" }] }],
    ["timeGrain di luar enum", { dimensions: [{ column: "Tanggal", timeGrain: "hour" }] }],
    ["arah sort di luar enum", { measures: [{ agg: "count" }], sort: [{ by: "m0", dir: "up" }] }],
    ["dimensi > 3", { dimensions: Array.from({ length: 4 }, () => ({ column: "Kota" })) }],
    ["ukuran > 10", { measures: Array.from({ length: 11 }, () => ({ agg: "count" })) }],
    [
      "filter > 20",
      {
        measures: [{ agg: "count" }],
        filters: Array.from({ length: 21 }, () => ({ column: "Kota", op: "eq", value: "x" })),
      },
    ],
    ["limit > 10k", { measures: [{ agg: "count" }], limit: 10_001 }],
    ["kunci tak dikenal", { measures: [{ agg: "count" }], sql: "DROP TABLE x" }],
    ["sum atas teks", { measures: [{ column: "Kota", agg: "sum" }] }],
    ["timeGrain atas teks", { dimensions: [{ column: "Kota", timeGrain: "month" }] }],
    [
      "nilai filter salah tipe",
      { measures: [{ agg: "count" }], filters: [{ column: "Koli", op: "gt", value: "lima" }] },
    ],
  ])("%s → INVALID", async (_label, spec) => {
    const r = await runQuery(USER, body(spec), deps());
    expect(r).toMatchObject({ ok: false, code: "INVALID" });
  });
});

describe("hasil dan filter", () => {
  it("filter bertipe + grain bulan + urut ukuran menurun", async () => {
    const r = await runQuery(
      USER,
      body({
        dimensions: [{ column: "Tanggal", timeGrain: "month" }],
        measures: [{ column: "Koli", agg: "sum" }, { agg: "count" }],
        filters: [
          { column: "Lunas", op: "eq", value: true },
          { column: "Tanggal", op: "between", values: ["2026-01-01", "2026-02-28"] },
          { column: "Kota", op: "contains", value: "KOTA" },
        ],
        sort: [{ by: "m1", dir: "desc" }],
      }),
      deps(),
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.rows.map((x) => x[0])).toEqual(["2026-01-01", "2026-02-01"]);
    expect(r.rows.reduce((s, x) => s + (x[2] as number), 0)).toBe(500);
  });

  it("nilai filter tidak pernah masuk teks SQL (injeksi tidak berpengaruh)", async () => {
    const r = await runQuery(
      USER,
      body({
        measures: [{ agg: "count" }],
        filters: [{ column: "Kota", op: "eq", value: "x' OR 1=1 --" }],
      }),
      deps(),
    );
    expect(r).toMatchObject({ ok: true, rows: [[0]] });
  });
});

describe("sandbox mesin DuckDB", () => {
  it("file di luar direktori cache dan perubahan konfigurasi ditolak", async () => {
    await expect(
      engine.run(USER, "SELECT * FROM read_csv('/etc/passwd') LIMIT 1", {}, 5_000),
    ).rejects.toThrow(/Permission|disabled/i);
    await expect(engine.run(USER, "SET enable_external_access = true", {}, 5_000)).rejects.toThrow(
      /lock/i,
    );
  });
});
