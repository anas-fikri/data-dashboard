import {
  copyFileSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DuckDBInstance } from "@duckdb/node-api";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { ColumnSchema } from "@/features/ingest/infer";
import { canonical, ResultCache } from "@/features/query/cache";
import { forgetLocalParquet, registerLocalParquet } from "@/features/query/local-parquet";
import {
  rowBytes,
  runQuery,
  type CachedQuery,
  type QueryDeps,
  type QueryRepo,
} from "@/features/query/service";
import { resolveSpec, specSchema } from "@/features/query/spec";
import { buildSql } from "@/features/query/sql";
import { QueryBusyError, QueryEngine, QueryTimeoutError } from "@/lib/duckdb/engine";
import {
  CacheFullError,
  DownloadPendingError,
  ForgottenError,
  ParquetCache,
} from "@/lib/duckdb/parquet-cache";

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

const memoryStore = () => new ResultCache<CachedQuery>(64 * 1024 * 1024);

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
  const parquet = new ParquetCache({
    dir: join(root, "cache"),
    maxBytes: 1 << 30,
    download: async (key, dest) => {
      downloads.push(key);
      copyFileSync(source, dest);
    },
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
    const exec = vi.fn();
    const d = deps({ engine: { withSlot: (_u, fn) => fn(), exec } });
    for (const column of ["Tidak Ada", "Rahasia"]) {
      const r = await runQuery(USER, body({ dimensions: [{ column }] }), d);
      expect(r).toMatchObject({ ok: false, code: "INVALID" });
    }
    expect(exec).not.toHaveBeenCalled();
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
          withSlot: (_u, fn) => fn(),
          exec: async () => {
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
    const cache = new ParquetCache({
      dir,
      maxBytes: 2_500,
      download: async (_key, dest) => {
        writeFileSync(dest, Buffer.alloc(1_000));
      },
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
    const cache = new ParquetCache({
      dir: join(root, "dedupe"),
      maxBytes: 1 << 20,
      download: async (_k, dest) => {
        n++;
        await new Promise((r) => setTimeout(r, 20));
        writeFileSync(dest, "x");
      },
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

describe("regresi review T-009", () => {
  it("F1: cache hasil di memori berbatas byte (LRU) — entri > 4 MB tidak disimpan", () => {
    const c = new ResultCache<string>(3_000);
    c.set("a", "A", 1_000);
    c.set("b", "B", 1_000);
    expect(c.get("a")).toBe("A"); // a jadi paling baru
    c.set("c", "C", 1_500); // total 3.500 > 3.000 → b (paling lama) dibuang
    expect(c.get("b")).toBeNull();
    expect(c.get("a")).toBe("A");
    expect(c.totalBytes).toBeLessThanOrEqual(3_000);
    const big = new ResultCache<string>(64 * 1024 * 1024);
    big.set("x", "X", 5 * 1024 * 1024);
    expect(big.get("x")).toBeNull();
  });

  it("F1: entri kedaluwarsa setelah TTL", () => {
    let now = 0;
    const c = new ResultCache<string>(10_000, () => now);
    c.set("a", "A", 10, 1_000);
    now = 999;
    expect(c.get("a")).toBe("A");
    now = 1_000;
    expect(c.get("a")).toBeNull();
  });

  it("F2: timeout di-cache negatif — spec mahal yang sama tidak dijalankan lagi", async () => {
    const exec = vi.fn(async () => {
      throw new QueryTimeoutError();
    });
    const d = deps({ engine: { withSlot: (_u, fn) => fn(), exec } });
    const b = body({ measures: [{ agg: "count" }] });
    expect(await runQuery(USER, b, d)).toMatchObject({ code: "QUERY_TIMEOUT" });
    expect(await runQuery(USER, b, d)).toMatchObject({ code: "QUERY_TIMEOUT" });
    expect(exec).toHaveBeenCalledTimes(1);
  });

  it("F2/F9: slot per user < global; slot dilepas walau query error", async () => {
    const e = await QueryEngine.create({
      dataDir: join(root, "slot-data"),
      tmpDir: join(root, "slot-tmp"),
      memoryLimit: "128MB",
      threads: 1,
      maxTempSize: "128MB",
      maxConcurrency: 4,
      perUser: 2,
      queueWaitMs: 200,
    });
    try {
      let open = 0;
      const gate = new Promise<void>((r) => setTimeout(r, 300));
      const hold = () =>
        e.withSlot("a", async () => {
          open++;
          await gate;
        });
      const held = [hold(), hold()];
      await expect(e.withSlot("a", async () => 1)).rejects.toBeInstanceOf(QueryBusyError);
      expect(await e.withSlot("b", async () => 2)).toBe(2);
      await Promise.all(held);
      expect(open).toBe(2);
      await expect(e.run("a", "SELECT * FROM tabel_tidak_ada", {}, 5_000)).rejects.toThrow();
      await expect(e.run("a", "SELECT * FROM tabel_tidak_ada", {}, 5_000)).rejects.toThrow();
      expect(await e.run("a", "SELECT 41 + 1 AS x", {}, 5_000)).toMatchObject({ rows: [[42]] });
    } finally {
      e.close();
    }
  });

  it("N2: unduhan tidak memegang slot query — user lain tetap bisa query selama data diunduh", async () => {
    const e = await QueryEngine.create({
      dataDir: join(root, "dl-data"),
      tmpDir: join(root, "dl-tmp"),
      memoryLimit: "128MB",
      threads: 1,
      maxTempSize: "128MB",
      maxConcurrency: 1,
      perUser: 1,
      queueWaitMs: 200,
    });
    let open!: () => void;
    const gate = new Promise<void>((r) => (open = r));
    const fetched: string[] = [];
    const parquet = new ParquetCache({
      dir: join(root, "dl-data"),
      maxBytes: 1 << 30,
      download: async (key, dest) => {
        fetched.push(key);
        if (key === "lambat") await gate;
        copyFileSync(source, dest);
      },
    });
    const VER_B = "cmv4kljx40009oczvdmpurrxg";
    const repo: QueryRepo = {
      ownedDataset: async (userId) => ({ activeVersionId: userId === USER ? VER : VER_B }),
      sheet: async (versionId) => ({
        typedKey: versionId === VER ? "lambat" : "cepat",
        schemaRevision: 1,
        schema: SCHEMA,
      }),
    };
    try {
      const d = deps({ engine: e, parquet, repo, cache: null, prepareWaitMs: 100 });
      const q = body({ measures: [{ agg: "count" }] });
      // Pemilik data yang masih diunduh menunggu ≤ prepareWaitMs lalu diberi tahu data disiapkan…
      expect(await runQuery(USER, q, d)).toMatchObject({
        ok: false,
        code: "QUERY_BUSY",
        message: expect.stringMatching(/disiapkan/),
      });
      // …sementara satu-satunya slot query tidak dipegang unduhan: user lain tetap jalan.
      expect(await runQuery("user-lain", q, d)).toMatchObject({ ok: true, rows: [[1000]] });
      // Unduhan berlanjut di background; permintaan berikutnya memakai hasilnya tanpa unduh ulang.
      open();
      await vi.waitFor(() => expect(parquet.activeDownloads).toBe(0));
      expect(await runQuery(USER, q, d)).toMatchObject({ ok: true, rows: [[1000]] });
      expect(fetched.filter((k) => k === "lambat")).toHaveLength(1);
    } finally {
      e.close();
    }
  });

  it("F3: ruang dipesan sebelum unduh; penuh oleh file yang sedang dipakai → CacheFullError", async () => {
    const c = new ParquetCache({
      dir: join(root, "reserve"),
      maxBytes: 1_500,
      sizeOf: async () => 1_000,
      download: async (_k, dest) => writeFileSync(dest, Buffer.alloc(1_000)),
    });
    const a = await c.acquire("a");
    await expect(c.acquire("b")).rejects.toBeInstanceOf(CacheFullError);
    a.release();
    const b = await c.acquire("b"); // a tidak dipakai lagi → dibuang untuk b
    expect(c.totalBytes).toBe(1_000);
    b.release();
  });

  it("F3: unduhan macet dibatalkan setelah batas waktu; percobaan berikutnya mengunduh ulang", async () => {
    let n = 0;
    const c = new ParquetCache({
      dir: join(root, "stall"),
      maxBytes: 1 << 20,
      downloadTimeoutMs: 100,
      download: (_k, dest, signal) =>
        new Promise<void>((resolve, reject) => {
          n++;
          if (n > 1) {
            writeFileSync(dest, "ok");
            resolve();
            return;
          }
          signal.addEventListener("abort", () => reject(new Error("aborted")));
        }),
    });
    await expect(c.acquire("k")).rejects.toThrow(/aborted/);
    const lease = await c.acquire("k");
    expect(n).toBe(2);
    lease.release();
  });

  it("F4: dimensi teks dipotong 500 karakter; hasil > 5 MB → RESULT_TOO_LARGE", async () => {
    const wide = join(root, "panjang.parquet");
    const db = await DuckDBInstance.create(":memory:");
    const c = await db.connect();
    await c.run(
      `COPY (SELECT (i + 2)::INTEGER AS _row, i || repeat('x', 1000) AS c1 FROM range(6000) t(i)) TO '${wide}' (FORMAT parquet)`,
    );
    c.closeSync();
    db.closeSync();
    const repo: QueryRepo = {
      ownedDataset: async () => ({ activeVersionId: VER }),
      sheet: async () => ({
        typedKey: "parquet/panjang",
        schemaRevision: 1,
        schema: [col(1, "Catatan", "text")],
      }),
    };
    const parquet = new ParquetCache({
      dir: join(root, "cache"),
      maxBytes: 1 << 30,
      download: async (_k, dest) => copyFileSync(wide, dest),
    });
    const d = deps({ repo, parquet });
    const few = await runQuery(USER, body({ dimensions: [{ column: "Catatan" }], limit: 5 }), d);
    expect(few.ok && (few.rows[0]![0] as string).length).toBe(500);
    // Nilai tetap unik setelah dipotong (nomor di depan): 3.000 × 500 karakter ≈ 3 MB lolos,
    // 6.000 × 500 ≈ 6 MB (UTF-16) > 5 MB ditolak sebelum diserialisasi.
    const half = await runQuery(
      USER,
      body({ dimensions: [{ column: "Catatan" }], limit: 3000 }),
      d,
    );
    expect(half).toMatchObject({ ok: true });
    const all = await runQuery(USER, body({ dimensions: [{ column: "Catatan" }], limit: 6000 }), d);
    expect(all).toMatchObject({ ok: false, code: "RESULT_TOO_LARGE" });
  });

  it("F5: tanggal mustahil ditolak 400 sebelum DuckDB; kehabisan memori → QUERY_TOO_HEAVY", async () => {
    for (const v of ["2024-02-30", "2024-13-01", "2024-01-01T25:00"]) {
      const r = await runQuery(
        USER,
        body({
          measures: [{ agg: "count" }],
          filters: [{ column: "Tanggal", op: "gt", value: v }],
        }),
        deps(),
      );
      expect(r).toMatchObject({ ok: false, code: "INVALID" });
    }
    const oom = await runQuery(
      USER,
      body({ measures: [{ agg: "count" }] }),
      deps({
        engine: {
          withSlot: (_u, fn) => fn(),
          exec: async () => {
            throw new Error("Out of Memory Error: failed to allocate data of size 1 MiB");
          },
        },
      }),
    );
    expect(oom).toMatchObject({ ok: false, code: "QUERY_TOO_HEAVY" });
  });

  it("F7: 'bukan X' menyertakan sel kosong (eq + neq = semua baris)", async () => {
    const plan = resolveSpec(
      specSchema.parse({
        sheetId: SHEET,
        measures: [{ agg: "count" }],
        filters: [{ column: "Kota", op: "neq", value: "a" }],
      }),
      SCHEMA,
    );
    expect(plan.ok && buildSql(plan.plan, "/x.parquet").sql).toMatch(/IS NULL OR/);
  });

  it("F8: urutan pilihan user diikuti dimensi sebagai pemecah seri", () => {
    const plan = resolveSpec(
      specSchema.parse({
        sheetId: SHEET,
        dimensions: [{ column: "Kota" }, { column: "Lunas" }],
        measures: [{ agg: "count" }],
        sort: [{ by: "m0", dir: "desc" }],
      }),
      SCHEMA,
    );
    expect(plan.ok && buildSql(plan.plan, "/x.parquet").sql).toMatch(
      /ORDER BY "m0" DESC NULLS LAST, "d0" ASC NULLS LAST, "d1" ASC NULLS LAST/,
    );
  });

  it("F11: SQL selalu satu SELECT yang hanya membaca read_parquet($path)", () => {
    const specs = [
      { measures: [{ agg: "count" }] },
      { dimensions: [{ column: "Kota" }] },
      {
        dimensions: [{ column: "Tanggal", timeGrain: "week" }],
        measures: [{ column: 'Total; "Omzet"', agg: "avg" }],
        filters: [
          { column: "Kota", op: "not_in", values: ["a'; DROP", "b"] },
          { column: "Koli", op: "between", values: [1, 5] },
        ],
        sort: [{ by: "m0", dir: "asc" }],
      },
    ];
    for (const sp of specs) {
      const plan = resolveSpec(specSchema.parse({ sheetId: SHEET, ...sp }), SCHEMA);
      if (!plan.ok) throw new Error(plan.message);
      const { sql, params } = buildSql(plan.plan, "/cache/x.parquet");
      expect(sql.startsWith("SELECT ")).toBe(true);
      expect(sql).not.toContain(";");
      expect(sql.match(/read_parquet/g)).toEqual(["read_parquet"]);
      expect(sql).toContain("FROM read_parquet($path)");
      expect(sql).not.toMatch(/DROP|'a'/);
      expect(params.path).toBe("/cache/x.parquet");
    }
  });

  it("F12: forget menghapus file data yang dihapus; file menganggur dibuang", async () => {
    const dir = join(root, "forget");
    const c = new ParquetCache({
      dir,
      maxBytes: 1 << 20,
      idleMs: 50,
      download: async (_k, dest) => writeFileSync(dest, "x"),
    });
    const a = await c.acquire("a");
    c.forget("a"); // sedang dipakai → dihapus setelah release
    expect(c.totalBytes).toBe(0);
    a.release();
    const b = await c.acquire("b");
    b.release();
    await new Promise((r) => setTimeout(r, 80));
    const z = await c.acquire("z"); // memicu pembersihan file menganggur (b)
    z.release();
    expect(c.totalBytes).toBe(1);
  });
});

describe("regresi review T-009 putaran 2", () => {
  it("N1: perkiraan byte hasil memakai ukuran heap (baris + angka 24 B + string)", () => {
    expect(rowBytes([1.5, 2, 3])).toBe(64 + 3 * 24);
    expect(rowBytes(["abc", null, true])).toBe(64 + (24 + 6) + 8 + 8);
  });

  it("N1: cache menghitung byte dengan perkiraan heap; hasil 10 ribu baris (≈ 3,8 MB) tetap di-cache", async () => {
    const rows = Array.from({ length: 10_000 }, (_, i) =>
      Array.from({ length: 13 }, (_, j) => i + j + 0.5),
    );
    const exec = vi.fn(async () => ({ columns: [], rows }));
    const cache = memoryStore();
    const d = deps({ engine: { withSlot: (_u, fn) => fn(), exec }, cache });
    const measures = Array.from({ length: 10 }, () => ({ column: "Koli", agg: "sum" }));
    const b = body({
      dimensions: [{ column: "Kota" }, { column: "Tanggal" }, { column: "Lunas" }],
      measures,
    });
    expect(await runQuery(USER, b, d)).toMatchObject({ ok: true, cached: false });
    expect(cache.totalBytes).toBe(10_000 * (64 + 13 * 24));
    expect(await runQuery(USER, b, d)).toMatchObject({ ok: true, cached: true });
    expect(exec).toHaveBeenCalledTimes(1);
  });

  it("N2: unduhan dibatasi global dan per user; yang lewat waitMs berlanjut di background", async () => {
    const gates = new Map<string, () => void>();
    const started: string[] = [];
    let running = 0;
    let peak = 0;
    const cache = new ParquetCache({
      dir: join(root, "limit"),
      maxBytes: 1 << 20,
      maxDownloads: 2,
      perOwnerDownloads: 1,
      download: async (key, dest) => {
        started.push(key);
        peak = Math.max(peak, ++running);
        await new Promise<void>((r) => gates.set(key, r));
        running--;
        writeFileSync(dest, key);
      },
    });
    const a = cache.acquire("a", { owner: "u1" });
    // Satu user tidak bisa memulai unduhan kedua selama unduhannya masih berjalan.
    await expect(cache.acquire("b", { owner: "u1" })).rejects.toBeInstanceOf(DownloadPendingError);
    const b = cache.acquire("b", { owner: "u2" });
    // Dua unduhan sudah berjalan: yang ketiga antre, penunggunya menyerah setelah waitMs.
    await expect(cache.acquire("c", { owner: "u3", waitMs: 50 })).rejects.toBeInstanceOf(
      DownloadPendingError,
    );
    expect(started).toEqual(["a", "b"]);
    // Bergabung ke unduhan yang sudah berjalan tidak dihitung ke batas user (u2 sedang mengunduh b).
    const a2 = cache.acquire("a", { owner: "u2" });
    gates.get("a")!();
    const leases = await Promise.all([a, a2]);
    await vi.waitFor(() => expect(started).toEqual(["a", "b", "c"])); // c jalan setelah a selesai
    gates.get("b")!();
    gates.get("c")!();
    leases.push(await b);
    await vi.waitFor(() => expect(cache.activeDownloads).toBe(0));
    leases.push(await cache.acquire("c")); // hasil unduhan background, tanpa unduh ulang
    expect(started).toEqual(["a", "b", "c"]);
    expect(peak).toBe(2);
    for (const l of leases) l.release();
    expect(cache.totalBytes).toBe(3);
  });

  it("N2: file > maxBytes yang selesai diunduh tanpa penunggu langsung dibuang", async () => {
    const dir = join(root, "besar");
    let open!: () => void;
    const cache = new ParquetCache({
      dir,
      maxBytes: 10,
      download: async (_k, dest) => {
        await new Promise<void>((r) => (open = r));
        writeFileSync(dest, Buffer.alloc(100));
      },
    });
    await expect(cache.acquire("besar", { waitMs: 20 })).rejects.toBeInstanceOf(
      DownloadPendingError,
    );
    open();
    await vi.waitFor(() => expect(readdirSync(dir)).toEqual([]));
  });

  it("slot query yang dilepas diserahkan ke antrean; tidak pernah melebihi batas global", async () => {
    const e = await QueryEngine.create({
      dataDir: join(root, "handoff-data"),
      tmpDir: join(root, "handoff-tmp"),
      memoryLimit: "128MB",
      threads: 1,
      maxTempSize: "128MB",
      maxConcurrency: 1,
      perUser: 3,
      queueWaitMs: 2_000,
    });
    try {
      let running = 0;
      let peak = 0;
      const job = (ms: number) =>
        e.withSlot("u", async () => {
          peak = Math.max(peak, ++running);
          await new Promise((r) => setTimeout(r, ms));
          running--;
        });
      await Promise.all([job(30), job(10), job(10)]);
      expect(peak).toBe(1);
      // Slot kembali bebas: query berikutnya tidak menunggu antrean.
      const t0 = Date.now();
      expect(await e.withSlot("u", async () => 7)).toBe(7);
      expect(Date.now() - t0).toBeLessThan(100);
    } finally {
      e.close();
    }
  });

  it("N3: forget membatalkan unduhan yang berjalan atau baru selesai; tidak ada file tersisa", async () => {
    const dir = join(root, "forget-pending");
    const cache = new ParquetCache({
      dir,
      maxBytes: 1 << 20,
      download: (_k, dest, signal) =>
        new Promise<void>((_, reject) => {
          writeFileSync(dest, "setengah");
          signal.addEventListener("abort", () => reject(new Error("aborted")));
        }),
    });
    const p = cache.acquire("hapus");
    await vi.waitFor(() => expect(cache.activeDownloads).toBe(1));
    cache.forget("hapus");
    await expect(p).rejects.toBeInstanceOf(ForgottenError);
    expect(readdirSync(dir)).toEqual([]);

    // Unduhan yang mengabaikan abort dan selesai setelah forget tetap tidak disimpan.
    const dir2 = join(root, "forget-late");
    let open!: () => void;
    const late = new ParquetCache({
      dir: dir2,
      maxBytes: 1 << 20,
      download: async (_k, dest) => {
        await new Promise<void>((r) => (open = r));
        writeFileSync(dest, "x");
      },
    });
    const q = late.acquire("hapus");
    await vi.waitFor(() => expect(late.activeDownloads).toBe(1));
    late.forget("hapus");
    open();
    await expect(q).rejects.toBeInstanceOf(ForgottenError);
    expect(readdirSync(dir2)).toEqual([]);
    expect(late.totalBytes).toBe(0);
  });

  it("N3: data dihapus saat sedang disiapkan → NOT_FOUND", async () => {
    const d = deps({
      parquet: {
        acquire: async () => {
          throw new ForgottenError();
        },
      },
    });
    expect(await runQuery(USER, body({ measures: [{ agg: "count" }] }), d)).toMatchObject({
      ok: false,
      code: "NOT_FOUND",
    });
  });

  it("N3: penghapusan dataset memakai registri tanpa DuckDB yang meneruskan forget", () => {
    const forgot: string[] = [];
    registerLocalParquet({ forget: (k) => forgot.push(k) });
    forgetLocalParquet(["a", "b"]);
    expect(forgot).toEqual(["a", "b"]);
    for (const f of ["src/features/query/local-parquet.ts", "src/features/datasets/service.ts"]) {
      expect(readFileSync(join(process.cwd(), f), "utf8")).not.toMatch(
        /@duckdb|query\/runtime|duckdb\/engine/,
      );
    }
  });
});
