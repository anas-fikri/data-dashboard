import { copyFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DuckDBInstance } from "@duckdb/node-api";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { ColumnSchema } from "@/features/ingest/infer";
import { ResultCache } from "@/features/query/cache";
import { normalizeSearch, runFilterValues } from "@/features/query/filter-values";
import type { CachedQuery, QueryDeps, QueryRepo } from "@/features/query/service";
import { escapeLikePattern, numberNeedle } from "@/features/query/sql";
import { QueryEngine } from "@/lib/duckdb/engine";
import { ParquetCache } from "@/lib/duckdb/parquet-cache";

/*
 * T-012 AC 4: daftar nilai slicer dari DuckDB sungguhan — 5.000 nilai unik → 1000 pertama + penanda
 * terpotong, kosong lebih dulu, urutan seperti Excel, pencarian di server (tidak peka huruf besar/kecil
 * dan aksen, wildcard di-escape, boolean lewat label Ya/Tidak, angka format Indonesia), kunci cache dari
 * kata cari ternormalisasi, daftar besar tidak di-cache, permintaan batal tidak menjalankan DuckDB,
 * pemilik saja.
 */
const DS = "cmv4klj5r0007oczvgiofocpg";
const VER = "cmv4kljx40009oczvdmpurrxf";
const SHEET = "cmv4kljx40009oczvdmpurrxa";
const DASH = "cmv4kljx40009oczvdmpurrd0";
const USER = "user-pemilik";

const col = (pos: number, name: string, type: ColumnSchema["type"], hidden = false) =>
  ({
    pos,
    name,
    original: name,
    type,
    hidden,
    nullPct: 0,
    distinctCount: 0,
    castFailCount: 0,
  }) as ColumnSchema;
const SCHEMA: ColumnSchema[] = [
  col(1, "Kota", "text"),
  col(2, "Jumlah", "integer"),
  col(3, "Tanggal", "date"),
  col(4, "Rahasia", "text", true),
  col(5, "Aktif", "boolean"),
  col(6, "Nilai", "decimal"),
  col(7, "Catatan", "text"),
];
const SPECIAL = ["Jakarta", "JAKARTA Selatan", "Jákarta Barat", "Bekasi", "a%b", "a_b", "axb"];
const DISTINCT = 5_000;

let root: string;
let source: string;
let engine: QueryEngine;

beforeAll(async () => {
  root = mkdtempSync(join(tmpdir(), "dd-filter-values-test-"));
  source = join(root, "typed.parquet");
  const db = await DuckDBInstance.create(":memory:");
  const c = await db.connect();
  const special = SPECIAL.map((s) => `('${s}')`).join(", ");
  await c.run(
    `COPY (
       SELECT row_number() OVER () + 1 AS _row, k AS c1, CAST(n AS BIGINT) AS c2,
              DATE '2026-01-01' + CAST(n % 300 AS INTEGER) AS c3, 'r' AS c4, n % 2 = 0 AS c5,
              CAST(n AS DECIMAL(38,6)) / 4 AS c6, repeat(k, 20) AS c7
       FROM (
         SELECT 'Kota ' || lpad(CAST(i AS VARCHAR), 4, '0') AS k, i AS n FROM range(${DISTINCT}) t(i)
         UNION ALL SELECT 'Kota 0001', 1
         UNION ALL SELECT s, 7 FROM (VALUES ${special}) v(s)
         UNION ALL SELECT NULL, NULL
         UNION ALL SELECT repeat('p', 1500), 9
       )
     ) TO '${source}' (FORMAT parquet)`,
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

const FILTER_COLUMNS = [
  { sheet: "Data", column: "Kota" },
  { sheet: "Data", column: "Jumlah" },
  { sheet: "Data", column: "Tanggal" },
  { sheet: "Data", column: "Rahasia" },
  { sheet: "Data", column: "Aktif" },
  { sheet: "Data", column: "Nilai" },
  { sheet: "Data", column: "Catatan" },
];

function deps(over: Partial<QueryDeps> = {}): QueryDeps {
  const repo: QueryRepo = {
    ownedDataset: async () => null,
    widget: async () => null,
    sheet: async (versionId, sheetId) =>
      versionId === VER && sheetId === SHEET
        ? { typedKey: "parquet/ds/v/s/typed-1.parquet", schemaRevision: 1, schema: SCHEMA }
        : null,
    filterSource: vi.fn(async (userId: string, dashboardId: string) =>
      userId === USER && dashboardId === DASH
        ? {
            datasetId: DS,
            activeVersionId: VER,
            filterColumns: FILTER_COLUMNS,
            sheets: [{ id: SHEET, name: "Data" }],
            role: "OWNER" as const,
          }
        : null,
    ),
  };
  return {
    repo,
    parquet: new ParquetCache({
      dir: join(root, "cache"),
      maxBytes: 1 << 30,
      download: async (_key, dest) => copyFileSync(source, dest),
    }),
    engine,
    cache: new ResultCache<CachedQuery>(64 * 1024 * 1024),
    timeoutMs: 30_000,
    ...over,
  };
}

describe("AC 4: slicer dengan 5.000 nilai unik", () => {
  it("1000 nilai pertama + truncated; kosong dulu; teks > 1000 karakter tidak ikut; di-cache", async () => {
    const d = deps();
    const exec = vi.spyOn(engine, "exec");
    const r = await runFilterValues(USER, DASH, { column: "Kota" }, d);
    expect(r).toMatchObject({ ok: true, type: "text", truncated: true });
    if (!r.ok) return;
    expect(r.values).toHaveLength(1000);
    expect(r.values[0]).toBeNull();
    // Urutan nocase.noaccent: "a%b", "a_b", "axb", "Bekasi", "Jakarta", "Jákarta Barat", …
    expect(r.values.slice(1, 7)).toEqual([
      "a%b",
      "a_b",
      "axb",
      "Bekasi",
      "Jakarta",
      "Jákarta Barat",
    ]);
    expect(new Set(r.values).size).toBe(1000);
    expect(r.values.some((v) => typeof v === "string" && v.startsWith("ppp"))).toBe(false);
    expect(await runFilterValues(USER, DASH, { column: " kota " }, d)).toEqual(r);
    expect(exec).toHaveBeenCalledTimes(1);
    exec.mockRestore();
  });

  it('mengetik "jak" menyaring di server: tidak peka huruf besar/kecil dan aksen', async () => {
    const r = await runFilterValues(USER, DASH, { column: "Kota", q: "jak" }, deps());
    expect(r).toEqual({
      ok: true,
      type: "text",
      values: ["Jakarta", "Jákarta Barat", "JAKARTA Selatan"],
      truncated: false,
    });
    expect(await runFilterValues(USER, DASH, { column: "Kota", q: "JÁK" }, deps())).toEqual(r);
  });

  it("wildcard LIKE di kata cari diperlakukan sebagai huruf biasa", async () => {
    const values = async (q: string) => {
      const r = await runFilterValues(USER, DASH, { column: "Kota", q }, deps());
      return r.ok ? r.values : r;
    };
    expect(await values("%")).toEqual(["a%b"]);
    expect(await values("a_")).toEqual(["a_b"]);
    expect(await values("a%b")).toEqual(["a%b"]);
    expect(escapeLikePattern("50%_\\x")).toBe("50\\%\\_\\\\x");
  });

  it("T-9gs1: months → bulan yang ada di data (YYYY-MM, terbaru dulu); kolom bukan tanggal → INVALID", async () => {
    const m = await runFilterValues(USER, DASH, { column: "Tanggal", months: true }, deps());
    expect(m).toEqual({
      ok: true,
      type: "date",
      values: Array.from({ length: 10 }, (_, i) => `2026-${String(10 - i).padStart(2, "0")}`),
      truncated: false,
    });
    expect(
      await runFilterValues(USER, DASH, { column: "Kota", months: true }, deps()),
    ).toMatchObject({ ok: false, code: "INVALID" });
  });

  it("kolom angka/tanggal: urutan alami, cari pada teks baku", async () => {
    const n = await runFilterValues(USER, DASH, { column: "Jumlah", q: "4999" }, deps());
    expect(n).toEqual({ ok: true, type: "integer", values: [4999], truncated: false });
    const all = await runFilterValues(USER, DASH, { column: "Jumlah" }, deps());
    expect(all.ok && all.values.slice(0, 4)).toEqual([null, 0, 1, 2]);
    const t = await runFilterValues(USER, DASH, { column: "Tanggal", q: "2026-10-2" }, deps());
    expect(t.ok && t.values).toEqual([
      "2026-10-20",
      "2026-10-21",
      "2026-10-22",
      "2026-10-23",
      "2026-10-24",
      "2026-10-25",
      "2026-10-26",
      "2026-10-27",
    ]);
  });
});

describe("pencarian boolean/angka, cache, dan pembatalan", () => {
  it('boolean dicari lewat label tampil "Ya"/"Tidak" (atau true/false)', async () => {
    const values = async (q: string) => {
      const r = await runFilterValues(USER, DASH, { column: "Aktif", q }, deps());
      return r.ok ? r.values : r;
    };
    expect(await values("ya")).toEqual([true]);
    expect(await values("Tidak")).toEqual([false]);
    expect(await values("TRUE")).toEqual([true]);
    expect(await values("a")).toEqual([false, true]);
    expect(await values("x")).toEqual([]);
  });

  it("angka: koma desimal dan titik ribuan gaya Indonesia", async () => {
    expect(numberNeedle("1.234,25")).toBe("1234.25");
    expect(numberNeedle("1,5")).toBe("1.5");
    expect(numberNeedle("4.999")).toBe("4999");
    expect(numberNeedle("0.500")).toBe("0.500");
    expect(numberNeedle("12.5")).toBe("12.5");
    const n = await runFilterValues(USER, DASH, { column: "Nilai", q: "1.234,25" }, deps());
    expect(n).toEqual({ ok: true, type: "decimal", values: [1234.25], truncated: false });
    const j = await runFilterValues(USER, DASH, { column: "Jumlah", q: "4.999" }, deps());
    expect(j).toEqual({ ok: true, type: "integer", values: [4999], truncated: false });
  });

  it("kunci cache dari kata cari ternormalisasi (NFC, huruf kecil, tanpa aksen) — satu query", async () => {
    expect(normalizeSearch(" JÁK ")).toBe("jak");
    expect(normalizeSearch("Ja\u0301k")).toBe("jak");
    expect(normalizeSearch("  ")).toBeNull();
    const d = deps();
    const exec = vi.spyOn(engine, "exec");
    const first = await runFilterValues(USER, DASH, { column: "Kota", q: "Jak" }, d);
    for (const q of ["JAK", "jÁk", " ják ", "Ja\u0301K"]) {
      expect(await runFilterValues(USER, DASH, { column: "Kota", q }, d)).toEqual(first);
    }
    expect(exec).toHaveBeenCalledTimes(1);
    exec.mockRestore();
  });

  it("daftar nilai > 256 KB tidak di-cache (cache hasil bersama tidak terkuras)", async () => {
    const d = deps();
    const exec = vi.spyOn(engine, "exec");
    const r = await runFilterValues(USER, DASH, { column: "Catatan" }, d);
    expect(r).toMatchObject({ ok: true, truncated: true });
    await runFilterValues(USER, DASH, { column: "Catatan" }, d);
    expect(exec).toHaveBeenCalledTimes(2);
    expect(d.cache?.totalBytes).toBe(0);
    exec.mockRestore();
  });

  it("permintaan yang sudah dibatalkan klien tidak menjalankan DuckDB dan tidak di-cache", async () => {
    const d = deps();
    const exec = vi.spyOn(engine, "exec");
    const ac = new AbortController();
    ac.abort();
    expect(await runFilterValues(USER, DASH, { column: "Kota", q: "x" }, d, ac.signal)).toEqual({
      ok: false,
      code: "QUERY_BUSY",
      message: "Permintaan dibatalkan.",
    });
    expect(exec).not.toHaveBeenCalled();
    expect(d.cache?.totalBytes).toBe(0);
    exec.mockRestore();
  });
});

describe("akses dan validasi", () => {
  it("bukan pemilik atau dashboard tidak ada → NOT_FOUND tanpa query", async () => {
    const exec = vi.fn();
    const d = deps({ engine: { withSlot: (_u, fn) => fn(), exec } });
    expect(await runFilterValues("orang-lain", DASH, { column: "Kota" }, d)).toMatchObject({
      ok: false,
      code: "NOT_FOUND",
    });
    expect(await runFilterValues(USER, "../x", { column: "Kota" }, d)).toMatchObject({
      code: "NOT_FOUND",
    });
    expect(exec).not.toHaveBeenCalled();
  });

  it("kolom bukan kolom filter → INVALID; kolom tersembunyi → COLUMN_UNAVAILABLE; bentuk salah → INVALID", async () => {
    const exec = vi.fn();
    const d = deps({ engine: { withSlot: (_u, fn) => fn(), exec } });
    expect(await runFilterValues(USER, DASH, { column: "Wilayah" }, d)).toMatchObject({
      code: "INVALID",
    });
    expect(await runFilterValues(USER, DASH, { column: "Rahasia" }, d)).toMatchObject({
      code: "COLUMN_UNAVAILABLE",
    });
    for (const body of [
      {},
      { column: "Kota", q: "x".repeat(101) },
      { column: "Kota", extra: 1 },
      { column: "" },
      null,
    ]) {
      expect(await runFilterValues(USER, DASH, body, d)).toMatchObject({ code: "INVALID" });
    }
    expect(exec).not.toHaveBeenCalled();
  });
});
