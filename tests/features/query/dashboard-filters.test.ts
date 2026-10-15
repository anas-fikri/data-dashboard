import { copyFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DuckDBInstance } from "@duckdb/node-api";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { filterSourcesOf, storedFilterColumns } from "@/features/dashboards/filter-columns";
import type { ColumnSchema } from "@/features/ingest/infer";
import { ResultCache } from "@/features/query/cache";
import {
  addDays,
  applyDashFilters,
  canonicalValues,
  dashFilterSchema,
  parseFilterState,
  presetRange,
  todayJakarta,
  type DashFilter,
} from "@/features/query/filters";
import {
  runWidgetQuery,
  type CachedQuery,
  type FilterSource,
  type QueryDeps,
  type QueryRepo,
} from "@/features/query/service";
import { decimal6, DIM_TEXT_MAX } from "@/features/query/sql";
import { QueryEngine } from "@/lib/duckdb/engine";
import { ParquetCache } from "@/lib/duckdb/parquet-cache";

/*
 * T-012: filter dashboard pada query widget dengan mesin DuckDB + cache parquet sungguhan (repo palsu).
 * Data kecil yang ditulis eksplisit agar hasil yang diharapkan bisa dihitung tangan: slicer (in + kosong),
 * rentang angka DECIMAL/DOUBLE dan tanggal, preset Asia/Jakarta (D8) pada DATE dan TIMESTAMP, filter yang
 * dilewati widget sheet lain (kolom tidak ada atau kelompok tipe beda), "semua kecuali" (not_in), kolom
 * tidak diizinkan, `filters` posisional lama ditolak (jalur viewer D6 hanya dashboardFilters), dan kunci
 * cache kanonik.
 */
const DS = "cmv4klj5r0007oczvgiofocpg";
const VER = "cmv4kljx40009oczvdmpurrxf";
const SHEET = "cmv4kljx40009oczvdmpurrxa";
const SHEET2 = "cmv4kljx40009oczvdmpurrxb";
const DASH = "cmv4kljx40009oczvdmpurrd0";
const USER = "user-pemilik";
const LONG = "X".repeat(600);

const col = (
  pos: number,
  name: string,
  type: ColumnSchema["type"],
  extra: Partial<ColumnSchema> = {},
) =>
  ({
    pos,
    name,
    original: name,
    type,
    hidden: false,
    nullPct: 0,
    distinctCount: 0,
    castFailCount: 0,
    ...extra,
  }) as ColumnSchema;
const SCHEMA: ColumnSchema[] = [
  col(1, "Cabang", "text"),
  col(2, "Omzet", "decimal"),
  col(3, "Tanggal", "date"),
  col(4, "Waktu", "timestamp"),
  col(5, "Rahasia", "text", { hidden: true }),
  col(6, "Rasio", "decimal", { float: true }),
];
/**
 * Sheet lain di versi yang sama: tidak punya kolom "Cabang"; "Tanggal" dan "Rasio" di sini bertipe teks
 * (kelompok tipe beda dengan kolom filter di sheet Penjualan → filternya dilewati).
 */
const SCHEMA2: ColumnSchema[] = [
  col(1, "Wilayah", "text"),
  col(2, "Omzet", "decimal"),
  col(3, "Tanggal", "text"),
  col(6, "Rasio", "text"),
];

// [Cabang, Omzet, Tanggal, Waktu, Rasio]
const ROWS: [string | null, string, string | null, string | null, number][] = [
  ["Jakarta", "100.5", "2025-12-31", "2025-12-31 23:59:59", 0.5],
  ["Jakarta", "200.25", "2026-01-01", "2026-01-01 00:00:00", 0.1234567],
  ["Bandung", "300", "2026-03-31", "2026-03-31 12:00:00", 1],
  ["Bandung", "0.1", "2026-07-01", "2026-07-01 00:00:00", 2],
  ["Surabaya", "1234567890.123456", "2026-09-30", "2026-09-30 23:00:00", 3],
  [null, "50", "2026-10-01", "2026-10-01 00:00:00", 4],
  ["Jakarta", "75", "2026-10-11", "2026-10-11 23:59:00.4", 5],
  ["Bandung", "25", "2026-10-12", "2026-10-12 00:00:00", 6],
  ["Medan", "10", null, null, 7],
  [LONG, "5", "2026-10-05", "2026-10-05 08:00:00", 8],
];

let root: string;
let source: string;
let engine: QueryEngine;

beforeAll(async () => {
  root = mkdtempSync(join(tmpdir(), "dd-dash-filter-test-"));
  source = join(root, "typed.parquet");
  const q = (v: string | null) => (v === null ? "NULL" : `'${v}'`);
  const values = ROWS.map(
    ([cabang, omzet, tgl, waktu, rasio], i) =>
      `(${i + 2}, ${q(cabang)}, CAST('${omzet}' AS DECIMAL(38,6)), CAST(${q(tgl)} AS DATE), CAST(${q(waktu)} AS TIMESTAMP), 'rahasia', CAST(${rasio} AS DOUBLE))`,
  ).join(",\n");
  const db = await DuckDBInstance.create(":memory:");
  const c = await db.connect();
  await c.run(
    `COPY (SELECT * FROM (VALUES ${values}) t(_row, c1, c2, c3, c4, c5, c6)) TO '${source}' (FORMAT parquet)`,
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

const fmt = { style: "number", decimals: 0 } as const;
const WIDGETS: Record<string, { type: string; spec: unknown }> = {
  kpi: { type: "kpi", spec: { sheetId: SHEET, measure: { agg: "count" }, format: fmt } },
  sum: { type: "kpi", spec: { sheetId: SHEET, measure: { agg: "sum", column: 2 }, format: fmt } },
  bar: {
    type: "bar",
    spec: {
      sheetId: SHEET,
      dimension: { column: 1 },
      measure: { agg: "sum", column: 2 },
      sort: "label_asc",
      topN: 12,
      format: fmt,
    },
  },
  table: { type: "table", spec: { sheetId: SHEET, columns: [1, 2], format: fmt } },
  other: { type: "kpi", spec: { sheetId: SHEET2, measure: { agg: "count" }, format: fmt } },
};
const WID = (name: string) => `cmv4kljx40009oczvdmpu${name.padEnd(4, "x").slice(0, 4)}0`;

/** Kolom filter dashboard; sumber filter (+ dimensi grafik cross-filter) lewat repo.filterSources. */
const FILTER_COLUMNS = [
  { sheet: "Penjualan", column: "Cabang" },
  { sheet: "Penjualan", column: "Omzet" },
  { sheet: "Penjualan", column: "Tanggal" },
  { sheet: "Penjualan", column: "Waktu" },
  { sheet: "Penjualan", column: "Rasio" },
  { sheet: "Penjualan", column: "Rahasia" },
];

/** Sumber filter seperti produksi (dashboards/filter-columns): kolom filter + tipenya di sheet aktif. */
const SOURCES: FilterSource[] = filterSourcesOf(
  storedFilterColumns(FILTER_COLUMNS),
  [],
  [{ id: SHEET, name: "Penjualan", schema: SCHEMA }],
);

function deps(
  over: Partial<QueryDeps> = {},
  cross: FilterSource[] = [],
  sources: FilterSource[] = SOURCES,
): QueryDeps {
  const repo: QueryRepo = {
    ownedDataset: async () => null,
    sheet: async (versionId, sheetId) =>
      versionId !== VER
        ? null
        : sheetId === SHEET
          ? { typedKey: "parquet/ds/v/s/typed-1.parquet", schemaRevision: 1, schema: SCHEMA }
          : sheetId === SHEET2
            ? { typedKey: "parquet/ds/v/s/typed-1.parquet", schemaRevision: 1, schema: SCHEMA2 }
            : null,
    widget: async (userId, widgetId) => {
      const name = Object.keys(WIDGETS).find((n) => WID(n) === widgetId);
      if (userId !== USER || !name) return null;
      return {
        ...WIDGETS[name]!,
        datasetId: DS,
        activeVersionId: VER,
        dashboardId: DASH,
        filterColumns: FILTER_COLUMNS,
        role: "OWNER" as const,
      };
    },
    filterSources: vi.fn(async () => [...sources, ...cross]),
  };
  const parquet = new ParquetCache({
    dir: join(root, "cache"),
    maxBytes: 1 << 30,
    download: async (_key, dest) => copyFileSync(source, dest),
  });
  return {
    repo,
    parquet,
    engine,
    cache: new ResultCache<CachedQuery>(64 * 1024 * 1024),
    timeoutMs: 30_000,
    // 2026-10-11 12:00 WIB
    now: () => new Date("2026-10-11T05:00:00Z"),
    ...over,
  };
}

/** Jumlah baris (KPI count) dengan filter dashboard. */
async function count(filters: DashFilter[], d = deps()) {
  const r = await runWidgetQuery(USER, { widgetId: WID("kpi"), dashboardFilters: filters }, d);
  if (!r.ok) throw new Error(JSON.stringify(r));
  return r.rows[0]![0];
}

describe("AC 1: slicer (in) — nilai terpilih + (Kosong)", () => {
  it("2 nilai + null → baris cabang itu dan sel kosong; urutan/duplikat tidak mengubah kunci cache", async () => {
    const d = deps();
    const r = await runWidgetQuery(
      USER,
      {
        widgetId: WID("kpi"),
        dashboardFilters: [{ column: "Cabang", op: "in", values: ["Jakarta", "Bandung", null] }],
      },
      d,
    );
    // Jakarta 3 + Bandung 3 + kosong 1
    expect(r).toMatchObject({ ok: true, rows: [[7]], cached: false });
    // Sama secara makna: urutan nilai dan filter berbeda, nilai ganda, nama kolom beda kapital/spasi.
    const again = await runWidgetQuery(
      USER,
      {
        widgetId: WID("kpi"),
        dashboardFilters: [
          { column: "  cabang ", op: "in", values: [null, "Bandung", "Jakarta", "Bandung"] },
        ],
      },
      d,
    );
    expect(again).toMatchObject({ ok: true, rows: [[7]], cached: true });
    expect(await count([{ column: "Cabang", op: "in", values: [null] }])).toBe(1);
    expect(await count([{ column: "Cabang", op: "in", values: ["jakarta"] }])).toBe(0);
  });

  it("dua filter dalam urutan berbeda = kunci cache sama (kanonik)", async () => {
    const d = deps();
    const a: DashFilter = { column: "Cabang", op: "in", values: ["Jakarta", "Bandung"] };
    const b: DashFilter = { column: "Tanggal", op: "range", gte: "2026-01-01" };
    const first = await runWidgetQuery(USER, { widgetId: WID("kpi"), dashboardFilters: [a, b] }, d);
    expect(first).toMatchObject({ ok: true, rows: [[5]], cached: false });
    const second = await runWidgetQuery(
      USER,
      { widgetId: WID("kpi"), dashboardFilters: [b, { ...a, values: ["Bandung", "Jakarta"] }, b] },
      d,
    );
    expect(second).toMatchObject({ ok: true, rows: [[5]], cached: true });
    expect(canonicalValues(["b", null, 2, "a", true, 2, null])).toEqual([null, true, 2, "a", "b"]);
  });

  it("grafik + tabel ikut terfilter; total tabel memakai filter yang sama", async () => {
    const filters: DashFilter[] = [{ column: "Cabang", op: "in", values: ["Jakarta"] }];
    const bar = await runWidgetQuery(
      USER,
      { widgetId: WID("bar"), dashboardFilters: filters },
      deps(),
    );
    expect(bar).toMatchObject({ ok: true, rows: [["Jakarta", 375.75]], categories: 1 });
    const table = await runWidgetQuery(
      USER,
      { widgetId: WID("table"), dashboardFilters: filters },
      deps(),
    );
    expect(table).toMatchObject({ ok: true, total: 3 });
    expect(table.ok && table.rows.map((r) => r[0])).toEqual(["Jakarta", "Jakarta", "Jakarta"]);
  });

  it("cross-filter dari label grafik yang dipotong 500 karakter tetap mengenai baris aslinya", async () => {
    const label = LONG.slice(0, DIM_TEXT_MAX);
    expect(await count([{ column: "Cabang", op: "in", values: [label] }])).toBe(1);
    expect(await count([{ column: "Cabang", op: "in", values: [LONG.slice(0, 499)] }])).toBe(0);
  });
});

describe('"semua kecuali" (not_in) dan tanggal saja pada TIMESTAMP', () => {
  it("not_in: sel kosong ikut kecuali (Kosong) ikut dikecualikan", async () => {
    // 10 baris: Jakarta 3, Bandung 3, Surabaya, Medan, LONG, kosong.
    expect(await count([{ column: "Cabang", op: "not_in", values: ["Jakarta"] }])).toBe(7);
    expect(await count([{ column: "Cabang", op: "not_in", values: ["Jakarta", null] }])).toBe(6);
    expect(await count([{ column: "Cabang", op: "not_in", values: [null] }])).toBe(9);
    // Label grafik terpotong 500 karakter dikecualikan lewat awalan, sama dengan in.
    const label = LONG.slice(0, DIM_TEXT_MAX);
    expect(await count([{ column: "Cabang", op: "not_in", values: [label] }])).toBe(9);
    // Nilai yang tidak mungkin ada (> 6 desimal pada DECIMAL) tidak mengecualikan apa pun.
    expect(await count([{ column: "Omzet", op: "not_in", values: [0.1000001] }])).toBe(10);
    expect(await count([{ column: "Omzet", op: "not_in", values: [0.1, 300] }])).toBe(8);
    // in + not_in = semua baris.
    const sel: DashFilter = { column: "Cabang", op: "in", values: ["Bandung", null] };
    const both = Number(await count([sel])) + Number(await count([{ ...sel, op: "not_in" }]));
    expect(both).toBe(ROWS.length);
    expect(dashFilterSchema.safeParse({ column: "x", op: "not_in", values: [] }).success).toBe(
      false,
    );
  });

  it("tanggal saja pada kolom TIMESTAMP cocok sehari penuh (in dan not_in), seperti kolom DATE", async () => {
    // 2026-10-11 23:59:00.4 dan 2026-03-31 12:00 — dulu hanya jam 00:00:00 yang cocok.
    expect(await count([{ column: "Waktu", op: "in", values: ["2026-10-11", "2026-03-31"] }])).toBe(
      2,
    );
    expect(await count([{ column: "Waktu", op: "in", values: ["2026-10-11", null] }])).toBe(2);
    expect(await count([{ column: "Waktu", op: "not_in", values: ["2026-10-11"] }])).toBe(9);
    // Nilai berjam tetap dicocokkan per detik.
    expect(
      await count([{ column: "Waktu", op: "in", values: ["2026-10-11T23:59:00", "2026-03-31"] }]),
    ).toBe(2);
    const { clauses } = applyDashFilters(
      [{ column: "Waktu", op: "in", values: ["2026-10-11", "2026-10-11T08:00"] }],
      SCHEMA,
      new Date(),
    );
    expect(clauses[0]).toMatchObject({ values: ["2026-10-11", "2026-10-11T08:00:00"] });
  });
});

describe("rentang angka dan tanggal", () => {
  it("DECIMAL dibandingkan sebagai DECIMAL: batas inklusif tepat, batas > 6 desimal dibulatkan aman", async () => {
    // 100.5, 0.1, 50, 75, 25, 10, 5
    expect(await count([{ column: "Omzet", op: "range", gte: 0.1, lte: 100.5 }])).toBe(7);
    expect(await count([{ column: "Omzet", op: "range", gte: 0.1000001, lte: 100.5 }])).toBe(6);
    expect(await count([{ column: "Omzet", op: "range", lt: 100.5 }])).toBe(6);
    expect(await count([{ column: "Omzet", op: "range", gte: 1234567890.123456 }])).toBe(1);
    expect(
      await count([{ column: "Omzet", op: "in", values: [0.1, 300, 1234567890.123456] }]),
    ).toBe(3);
    // Angka dengan > 6 desimal tidak mungkin sama dengan nilai DECIMAL(38,6) (tidak dibulatkan jadi sama).
    expect(await count([{ column: "Omzet", op: "in", values: [0.1000001] }])).toBe(0);
    // Kolom desimal DOUBLE (float): dibandingkan sebagai DOUBLE.
    expect(await count([{ column: "Rasio", op: "in", values: [0.1234567] }])).toBe(1);
    expect(await count([{ column: "Rasio", op: "range", gte: 0.1234567, lt: 2 }])).toBe(3);
  });

  it("decimal6: representasi terpendek, pembulatan terarah, negatif", () => {
    expect(decimal6(0.1, "exact")).toBe("0.100000");
    expect(decimal6(1234567890.123456, "exact")).toBe("1234567890.123456");
    expect(decimal6(0.1234564, "exact")).toBeNull();
    expect(decimal6(0.1234564, "ceil")).toBe("0.123457");
    expect(decimal6(0.1234564, "floor")).toBe("0.123456");
    expect(decimal6(-0.1234564, "ceil")).toBe("-0.123456");
    expect(decimal6(-0.1234564, "floor")).toBe("-0.123457");
    expect(decimal6(1.5e-7, "ceil")).toBe("0.000001");
    expect(decimal6(1.5e-7, "floor")).toBe("0.000000");
    expect(decimal6(-5, "exact")).toBe("-5.000000");
  });

  it("tanggal naive: DATE inklusif; batas atas tanggal saja pada TIMESTAMP = sampai akhir hari", async () => {
    expect(
      await count([{ column: "Tanggal", op: "range", gte: "2026-03-31", lte: "2026-07-01" }]),
    ).toBe(2);
    // 2026-10-11 23:59:00.4 masuk; 2026-10-12 00:00 tidak.
    expect(
      await count([{ column: "Waktu", op: "range", gte: "2026-10-11", lte: "2026-10-11" }]),
    ).toBe(1);
    expect(await count([{ column: "Waktu", op: "range", lt: "2026-01-01" }])).toBe(1);
    expect(
      await count([{ column: "Waktu", op: "range", gte: "2026-10-11T23:59", lt: "2026-10-12" }]),
    ).toBe(1);
    // Nilai waktu dari hasil query (tanpa pecahan detik) tetap cocok dengan sel ber-milidetik.
    expect(await count([{ column: "Waktu", op: "in", values: ["2026-10-11T23:59:00"] }])).toBe(1);
    expect(await count([{ column: "Tanggal", op: "in", values: ["2026-10-11", null] }])).toBe(2);
  });
});

describe("AC 3: preset tanggal dihitung Asia/Jakarta, dibandingkan naive (D8)", () => {
  it("hari ini 2026-10-11 WIB, kolom DATE: YTD = 2026-01-01 ≤ tanggal ≤ 2026-10-11", async () => {
    const clauses = applyDashFilters(
      [{ column: "Tanggal", op: "preset", preset: "ytd" }],
      SCHEMA,
      new Date("2026-10-11T05:00:00Z"),
    ).clauses;
    expect(clauses).toEqual([
      { col: "c3", type: "date", float: false, op: "range", gte: "2026-01-01", lte: "2026-10-11" },
    ]);
    // Baris 2026-01-01 … 2026-10-11 (7); 2025-12-31, 2026-10-12, dan kosong tidak.
    expect(await count([{ column: "Tanggal", op: "preset", preset: "ytd" }])).toBe(7);
    expect(await count([{ column: "Tanggal", op: "preset", preset: "this_month" }])).toBe(3);
    expect(await count([{ column: "Tanggal", op: "preset", preset: "this_quarter" }])).toBe(3);
  });

  it("kolom TIMESTAMP: termasuk 2026-10-11 23:59, tidak termasuk 2026-10-12 00:00 (tanpa geser zona)", async () => {
    const { clauses } = applyDashFilters(
      [{ column: "Waktu", op: "preset", preset: "ytd" }],
      SCHEMA,
      new Date("2026-10-11T05:00:00Z"),
    );
    expect(clauses[0]).toMatchObject({ gte: "2026-01-01T00:00:00", lt: "2026-10-12T00:00:00" });
    expect(await count([{ column: "Waktu", op: "preset", preset: "ytd" }])).toBe(7);
  });

  it("2026-12-31 23:30 UTC sudah 2027-01-01 di Jakarta: YTD tahun 2027, bukan 2026", async () => {
    expect(todayJakarta(new Date("2026-12-31T16:59:59Z"))).toBe("2026-12-31");
    expect(todayJakarta(new Date("2026-12-31T17:00:00Z"))).toBe("2027-01-01");
    const late = deps({ now: () => new Date("2026-12-31T23:30:00Z") });
    expect(await count([{ column: "Tanggal", op: "preset", preset: "ytd" }], late)).toBe(0);
    const before = deps({ now: () => new Date("2026-12-31T16:00:00Z") });
    // 23:00 WIB tanggal 31: YTD 2026 = semua tanggal 2026 (8 baris).
    expect(await count([{ column: "Tanggal", op: "preset", preset: "ytd" }], before)).toBe(8);
  });

  it("aritmetika kalender preset: kuartal, akhir bulan, tahun kabisat", () => {
    expect(presetRange("this_quarter", "2026-08-15")).toEqual({
      start: "2026-07-01",
      end: "2026-08-15",
    });
    expect(presetRange("this_month", "2026-02-28").start).toBe("2026-02-01");
    expect(presetRange("ytd", "2026-10-11").start).toBe("2026-01-01");
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
  });
});

describe("filter yang dilewati, kolom tidak diizinkan", () => {
  it("widget di sheet lain tanpa kolom itu: filter dilewati dan dilaporkan, data tidak terfilter", async () => {
    const r = await runWidgetQuery(
      USER,
      {
        widgetId: WID("other"),
        dashboardFilters: [
          { column: "Cabang", op: "in", values: ["Jakarta"] },
          { column: "Omzet", op: "range", gte: 100 },
        ],
      },
      deps(),
    );
    // Omzet ada di sheet itu juga → tetap berlaku (100.5, 200.25, 300, 1234567890.123456).
    expect(r).toMatchObject({ ok: true, rows: [[4]], skippedFilters: ["Cabang"] });
  });

  it("kolom tersembunyi atau tipe nilai tidak cocok → dilewati, bukan error widget", async () => {
    const r = await runWidgetQuery(
      USER,
      {
        widgetId: WID("kpi"),
        dashboardFilters: [
          { column: "Rahasia", op: "in", values: ["rahasia"] },
          { column: "Tanggal", op: "in", values: [123] },
          { column: "Cabang", op: "preset", preset: "ytd" },
          { column: "Cabang", op: "range", gte: 1 },
        ],
      },
      deps(),
    );
    expect(r).toMatchObject({
      ok: true,
      rows: [[ROWS.length]],
      skippedFilters: ["Rahasia", "Tanggal", "Cabang"],
    });
  });

  it("kolom di luar kolom filter + dimensi cross-filter → INVALID tanpa menjalankan query", async () => {
    const exec = vi.fn();
    const d = deps({ engine: { withSlot: (_u, fn) => fn(), exec } });
    const r = await runWidgetQuery(
      USER,
      { widgetId: WID("kpi"), dashboardFilters: [{ column: "Wilayah", op: "in", values: ["x"] }] },
      d,
    );
    expect(r).toEqual({
      ok: false,
      code: "INVALID",
      message: "Filter tidak diizinkan untuk dashboard ini.",
    });
    expect(exec).not.toHaveBeenCalled();
    expect(d.repo.filterSources).toHaveBeenCalledWith({
      dashboardId: DASH,
      activeVersionId: VER,
      updatedAt: undefined,
    });
    // Tanpa filter apa pun sumber filter tidak dibaca.
    const d2 = deps();
    await runWidgetQuery(USER, { widgetId: WID("kpi") }, d2);
    expect(d2.repo.filterSources).not.toHaveBeenCalled();
  });

  it("`filters` posisional lama ditolak (strict) tanpa membaca sumber filter atau DuckDB (D6, review putaran 2)", async () => {
    const exec = vi.fn();
    const d = deps({ engine: { withSlot: (_u, fn) => fn(), exec } });
    // Juga untuk kolom yang diizinkan (Cabang) dan bersama dashboardFilters yang sah: tidak ada jalur
    // posisional yang melewati pemeriksaan nama + kelompok tipe (oracle kolom bernama sama di sheet lain).
    const answers = [];
    for (const body of [
      { widgetId: WID("kpi"), filters: [{ column: 1, op: "eq", value: "Jakarta" }] },
      { widgetId: WID("other"), filters: [{ column: 3, op: "contains", value: "2026" }] },
      { widgetId: WID("kpi"), filters: [{ column: 99, op: "is_null" }] },
      {
        widgetId: WID("kpi"),
        filters: [{ column: 2, op: "gte", value: 120 }],
        dashboardFilters: [{ column: "Cabang", op: "in", values: ["Jakarta"] }],
      },
    ]) {
      const r = await runWidgetQuery(USER, body, d);
      expect(r).toMatchObject({ ok: false, code: "INVALID" });
      answers.push(JSON.stringify(r));
    }
    // Posisi ada/tidak ada dijawab sama: lebar skema (termasuk kolom tersembunyi) tidak terbaca.
    expect(new Set(answers).size).toBe(1);
    expect(exec).not.toHaveBeenCalled();
    expect(d.repo.filterSources).not.toHaveBeenCalled();
    // Jalur pengganti: dashboardFilters pada kolom yang diizinkan tetap jalan.
    expect(await count([{ column: "Cabang", op: "in", values: ["Jakarta"] }])).toBe(3);
  });

  it("kelompok tipe beda dengan kolom sumber filter → dilewati (tanggal vs teks, angka vs teks)", async () => {
    const r = await runWidgetQuery(
      USER,
      {
        widgetId: WID("other"),
        dashboardFilters: [
          // Sumber Tanggal = DATE (Penjualan); di sheet lain Tanggal = teks → tidak dicocokkan sebagai teks.
          { column: "Tanggal", op: "in", values: ["2026-10-11"] },
          { column: "Tanggal", op: "not_in", values: ["2026-10-11"] },
          { column: "Rasio", op: "in", values: [0.5] },
          { column: "Omzet", op: "range", gte: 100 },
        ],
      },
      deps(),
    );
    // Omzet (DECIMAL di kedua sheet) tetap berlaku: 4 baris.
    expect(r).toMatchObject({ ok: true, rows: [[4]], skippedFilters: ["Tanggal", "Rasio"] });
    // Di sheet sumbernya sendiri filter Tanggal tetap berlaku.
    expect(await count([{ column: "Tanggal", op: "in", values: ["2026-10-11"] }])).toBe(1);
    // Nama yang hanya dikenal lewat dimensi cross-filter: tipe dimensinya (tanggal) yang menentukan.
    const viaCross = await runWidgetQuery(
      USER,
      {
        widgetId: WID("other"),
        dashboardFilters: [{ column: "Wilayah", op: "in", values: ["Jakarta"] }],
      },
      deps({}, [{ name: "Wilayah", type: "date" }]),
    );
    expect(viaCross).toMatchObject({
      ok: true,
      rows: [[ROWS.length]],
      skippedFilters: ["Wilayah"],
    });
  });

  it("dimensi grafik cross-filter diizinkan walau bukan kolom filter", async () => {
    const d = deps({}, [{ name: "Wilayah", type: "text" }]);
    const r = await runWidgetQuery(
      USER,
      {
        widgetId: WID("other"),
        dashboardFilters: [{ column: "wilayah", op: "in", values: ["Jakarta"] }],
      },
      d,
    );
    expect(r).toMatchObject({ ok: true, rows: [[3]] });
    expect(r.ok && "skippedFilters" in r).toBe(false);
  });

  it("bentuk filter divalidasi zod: rentang tanpa batas, tanggal palsu, > 500 nilai, > 20 filter", async () => {
    const exec = vi.fn();
    const d = deps({ engine: { withSlot: (_u, fn) => fn(), exec } });
    for (const dashboardFilters of [
      [{ column: "Omzet", op: "range" }],
      [{ column: "Tanggal", op: "range", gte: "2026-02-30" }],
      [{ column: "Cabang", op: "in", values: Array.from({ length: 501 }, (_, i) => `v${i}`) }],
      [{ column: "Cabang", op: "in", values: [] }],
      [{ column: "Cabang", op: "eq", value: "x" }],
      [{ column: "Tanggal", op: "preset", preset: "last_year" }],
      Array.from({ length: 21 }, () => ({ column: "Cabang", op: "in", values: ["x"] })),
    ]) {
      expect(
        await runWidgetQuery(USER, { widgetId: WID("kpi"), dashboardFilters }, d),
      ).toMatchObject({ ok: false, code: "INVALID" });
    }
    expect(exec).not.toHaveBeenCalled();
    expect(
      dashFilterSchema.safeParse({ column: "x", op: "range", lte: Number.MAX_SAFE_INTEGER + 2 })
        .success,
    ).toBe(false);
  });

  it("status URL ?f=: rusak/tidak valid → null; valid → filter + cross", () => {
    const ok = {
      filters: [{ column: "Cabang", op: "in", values: ["Jakarta", null] }],
      cross: { widgetId: WID("bar"), filter: { column: "Cabang", op: "in", values: ["Jakarta"] } },
    };
    expect(parseFilterState(JSON.stringify(ok))).toEqual(ok);
    expect(parseFilterState("{bukan json")).toBeNull();
    expect(parseFilterState(JSON.stringify({ filters: [{ column: "x", op: "drop" }] }))).toBeNull();
    expect(parseFilterState(null)).toBeNull();
  });
});
