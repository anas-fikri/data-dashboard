import { createHash } from "node:crypto";
import { copyFileSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DuckDBInstance, type DuckDBConnection } from "@duckdb/node-api";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { writePivotExport } from "@/features/exports/pivot";
import type { ColumnSchema } from "@/features/ingest/infer";
import { ResultCache, resultKey } from "@/features/query/cache";
import { buildPivotSql, pivotOutTypes, shapePivot, type PivotData } from "@/features/query/pivot";
import {
  runWidgetQuery,
  toJson,
  type CachedQuery,
  type QueryDeps,
  type QueryRepo,
} from "@/features/query/service";
import { resolveSpec, specSchema } from "@/features/query/spec";
import { buildSql, buildTotalsSql } from "@/features/query/sql";
import { widgetPlan } from "@/features/query/widget";
import type { CalcExpr } from "@/features/widgets/calc";
import { parseWidgetConfig, type WidgetConfig } from "@/features/widgets/spec";
import { QueryEngine } from "@/lib/duckdb/engine";
import { ParquetCache } from "@/lib/duckdb/parquet-cache";

/*
 * T-068 field terhitung in-process — DuckDB + cache parquet sungguhan, repo palsu. Nilai fixture kecil
 * dihitung manual di komentar; uji properti membandingkan pohon acak di DuckDB dengan evaluator acuan
 * JS atas agregat yang sama; spec lama: SQL + kunci cache identik dengan HEAD sebelum T-068 (golden).
 */
const DS = "cmv4klj5r0007oczvgiofocpg";
const VER = "cmv4kljx40009oczvdmpurrxf";
const SHEET = "cmv4kljx40009oczvdmpurrxa";
const RAND = "cmv4kljx40009oczvdmpurrxr";
const USER = "user-pemilik";
const INJECT = `Harga"; DROP TABLE x;--'`;

const col = (pos: number, name: string, type: ColumnSchema["type"], extra = {}) =>
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
  col(1, "Wilayah", "text"),
  col(2, "Kota", "text"),
  col(3, "Tanggal", "date"),
  col(4, "Pendapatan", "decimal"),
  col(5, "Biaya", "decimal"),
  col(6, "No Kiriman", "text"),
  col(7, "Qty", "integer"),
  col(8, "Catatan", "text"),
  col(9, "Rahasia", "decimal", { hidden: true }),
  col(10, INJECT, "decimal"),
  col(11, "Diskon", "decimal"),
  col(12, "Besar", "decimal", { float: true }),
];
const RAND_SCHEMA: ColumnSchema[] = [
  col(1, "G", "text"),
  col(2, "X", "decimal"),
  col(3, "Y", "decimal"),
  col(4, "N", "integer"),
  col(5, "F", "decimal", { float: true }),
];

/*
 * Fixture (Pendapatan P, Biaya B):
 *   Jawa    Bandung 2026-01 P 100 B  60 K1    Qty 2
 *   Jawa    Bandung 2026-02 P  50 B  40 K2    Qty 1
 *   Jawa    Jakarta 2026-01 P 200 B 150 K3    Qty 5
 *   Sumatra Medan   2026-01 P  80 B  20 K4    Qty 3
 *   Sumatra Medan   2026-02 P   0 B  10 K5    Qty 1
 *   Sumatra Padang  2026-02 P NUL B   5 (nul) Qty 1
 * Margin = (ΣP − ΣB) / ΣP per kelompok (bukan jumlah margin per baris).
 */
let root: string;
let source: string;
let randSource: string;
let engine: QueryEngine;
let db: DuckDBInstance;
let conn: DuckDBConnection;

/** Data acak (seed tetap) untuk uji properti: kelipatan 1/4 → jumlah tepat di DOUBLE juga. */
const RAND_ROWS = 240;
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
type RandRow = {
  g: string;
  x: number | null;
  y: number | null;
  n: number | null;
  f: number | null;
};
const RAND_DATA: RandRow[] = (() => {
  const r = rng(68);
  const q = (lo: number, hi: number) => Math.round((lo + r() * (hi - lo)) * 4) / 4;
  return Array.from({ length: RAND_ROWS }, (_, i) => ({
    // Kelompok E hanya berisi nilai kosong/nol → penyebut 0/NULL.
    g: i % 40 === 0 ? "E" : ["A", "B", "C", "D"][i % 4]!,
    x: i % 40 === 0 ? null : r() < 0.1 ? null : q(-50, 200),
    y: i % 40 === 0 ? 0 : r() < 0.1 ? null : q(0, 80),
    n: i % 40 === 0 ? null : r() < 0.05 ? null : Math.floor(r() * 20) - 3,
    f: i % 40 === 0 ? null : q(-10, 10),
  }));
})();
const lit = (v: number | null, t: string) =>
  v === null ? `CAST(NULL AS ${t})` : `CAST(${v} AS ${t})`;

beforeAll(async () => {
  root = mkdtempSync(join(tmpdir(), "dd-calc-test-"));
  source = join(root, "typed.parquet");
  randSource = join(root, "rand.parquet");
  db = await DuckDBInstance.create(":memory:");
  conn = await db.connect();
  const D = "DECIMAL(38,6)";
  await conn.run(
    `COPY (SELECT * FROM (VALUES
       (2, 'Jawa', 'Bandung', DATE '2026-01-10', CAST(100 AS ${D}), CAST(60 AS ${D}), 'K1', 2::BIGINT, 'x', CAST(1 AS ${D}), CAST(0.2 AS ${D}), CAST(0.1 AS ${D}), 1e300::DOUBLE),
       (3, 'Jawa', 'Bandung', DATE '2026-02-10', CAST(50 AS ${D}), CAST(40 AS ${D}), 'K2', 1::BIGINT, 'x', CAST(1 AS ${D}), CAST(0 AS ${D}), CAST(0 AS ${D}), 1e300::DOUBLE),
       (4, 'Jawa', 'Jakarta', DATE '2026-01-15', CAST(200 AS ${D}), CAST(150 AS ${D}), 'K3', 5::BIGINT, 'x', CAST(1 AS ${D}), CAST(0 AS ${D}), CAST(0 AS ${D}), 0::DOUBLE),
       (5, 'Sumatra', 'Medan', DATE '2026-01-20', CAST(80 AS ${D}), CAST(20 AS ${D}), 'K4', 3::BIGINT, 'x', CAST(1 AS ${D}), CAST(0 AS ${D}), CAST(0 AS ${D}), 0::DOUBLE),
       (6, 'Sumatra', 'Medan', DATE '2026-02-20', CAST(0 AS ${D}), CAST(10 AS ${D}), 'K5', 1::BIGINT, 'x', CAST(1 AS ${D}), CAST(0 AS ${D}), CAST(0 AS ${D}), 0::DOUBLE),
       (7, 'Sumatra', 'Padang', DATE '2026-02-25', CAST(NULL AS ${D}), CAST(5 AS ${D}), NULL, 1::BIGINT, 'x', CAST(1 AS ${D}), CAST(0 AS ${D}), CAST(0 AS ${D}), 0::DOUBLE)
     ) t(_row, c1, c2, c3, c4, c5, c6, c7, c8, c9, c10, c11, c12)) TO '${source}' (FORMAT parquet)`,
  );
  const values = RAND_DATA.map(
    (d, i) =>
      `(${i + 2}, '${d.g}', ${lit(d.x, D)}, ${lit(d.y, D)}, ${lit(d.n, "BIGINT")}, ${lit(d.f, "DOUBLE")})`,
  ).join(",\n");
  await conn.run(
    `COPY (SELECT * FROM (VALUES ${values}) t(_row, c1, c2, c3, c4, c5)) TO '${randSource}' (FORMAT parquet)`,
  );
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
  conn?.closeSync();
  db?.closeSync();
  rmSync(root, { recursive: true, force: true });
});

const fmt = { style: "rupiah", decimals: 0 } as const;
const sum = (column: number) => ({ agg: "sum", column });
const op = (o: string, ...args: unknown[]) => ({ op: o, args });
const MARGIN = op("div", op("sub", sum(4), sum(5)), sum(4));
const calc = (label: string, expr: unknown, over: Record<string, unknown> = {}) => ({
  kind: "calc",
  label,
  expr,
  ...over,
});
const pivot = (over: Record<string, unknown>) => ({
  type: "pivot",
  spec: {
    sheetId: SHEET,
    format: fmt,
    totals: true,
    subtotals: false,
    sort: "label_asc",
    ...over,
  },
});
const chart = (type: string, over: Record<string, unknown>) => ({
  type,
  spec: { sheetId: SHEET, sort: "value_desc", topN: 12, format: fmt, ...over },
});
const kpi = (measure: unknown) => ({ type: "kpi", spec: { sheetId: SHEET, measure, format: fmt } });
const PER_KIRIMAN = op("div", sum(4), { agg: "count_distinct", column: 6 });

const WIDGETS: Record<string, { type: string; spec: Record<string, unknown> }> = {
  margin: pivot({
    rows: [{ column: 1 }, { column: 2 }],
    column: { column: 3, timeGrain: "month" },
    subtotals: true,
    values: [calc("Margin", MARGIN, { format: { style: "percent", decimals: 1 } })],
  }),
  byval: pivot({
    rows: [{ column: 1 }],
    sort: "value_desc",
    values: [calc("Margin", MARGIN), sum(4)],
  }),
  kiriman: pivot({ rows: [{ column: 2 }], values: [calc("Per kiriman", PER_KIRIMAN)] }),
  pct: pivot({
    rows: [{ column: 1 }],
    values: [calc("Laba", op("sub", sum(4), sum(5)), { showAs: "pct_grand" })],
  }),
  running: pivot({
    rows: [{ column: 2 }],
    values: [calc("Laba", op("sub", sum(4), sum(5)), { showAs: "running" })],
  }),
  bar: chart("bar", { dimension: { column: 2 }, measure: calc("Margin", MARGIN), topN: 1 }),
  pie: chart("pie", {
    dimension: { column: 1 },
    measure: calc("Laba", op("sub", sum(4), sum(5))),
    topN: 1,
  }),
  kpi: kpi(calc("Margin", MARGIN)),
  exact: kpi(calc("Diskon + harga", op("add", { agg: "max", column: 10 }, sum(11)))),
  float: kpi(
    calc("Diskon + harga", op("add", { agg: "max", column: 10 }, op("mul", sum(11), { const: 1 }))),
  ),
  konst: kpi(calc("Pendapatan × 1,5", op("mul", sum(4), { const: 1.5 }))),
  overflow: kpi(calc("Besar²", op("mul", sum(12), sum(12)))),
  hidden: kpi(calc("Rahasia", op("add", sum(9), sum(4)))),
  text: kpi(calc("Teks", op("add", sum(8), sum(4)))),
  inject: kpi(calc("Injeksi", op("sub", sum(10), { const: 0.05 }))),
  qty: kpi(calc("Qty − baris", op("sub", sum(7), { agg: "count" }))),
};
const WID = (name: string) => `cmv4kljx40009oczvdmpu${name.padEnd(6, "x").slice(0, 6)}`;

function deps(): QueryDeps {
  const repo: QueryRepo = {
    ownedDataset: async () => null,
    sheet: async (versionId, sheetId) =>
      versionId === VER && sheetId === SHEET
        ? { typedKey: "parquet/ds/v/s/typed-1.parquet", schemaRevision: 1, schema: SCHEMA }
        : null,
    widget: async (userId, widgetId) => {
      const name = Object.keys(WIDGETS).find((n) => WID(n) === widgetId);
      if (userId !== USER || !name) return null;
      return {
        ...WIDGETS[name]!,
        updatedAt: new Date(0),
        datasetId: DS,
        activeVersionId: VER,
        filterColumns: [],
        dashboardId: "cmv4kljx40009oczvdmpudash0",
        role: "OWNER" as const,
      };
    },
    filterSources: async () => [],
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
  };
}

async function query(name: string) {
  const r = await runWidgetQuery(USER, { widgetId: WID(name) }, deps());
  if (!r.ok) throw new Error(`${r.code}: ${r.message}`);
  return r;
}
const pivotOf = async (name: string): Promise<PivotData> => (await query(name)).pivot!;
const planOf = (type: string, spec: unknown, schema = SCHEMA) => {
  const c = parseWidgetConfig(type, spec);
  if (!c.ok) throw new Error(c.message);
  const w = widgetPlan(c.config as Exclude<WidgetConfig, { type: "empty" }>, schema, { page: 0 });
  if (!w.ok) throw new Error(w.message);
  return w;
};
/** Semua angka di hasil berhingga (tidak ada Infinity/NaN yang lolos ke JSON). */
function allFinite(v: unknown): boolean {
  if (typeof v === "number") return Number.isFinite(v);
  if (Array.isArray(v)) return v.every(allFinite);
  if (v && typeof v === "object") return Object.values(v).every(allFinite);
  return true;
}
const v0 = (c: unknown[] | null | undefined) => (c ? c[0] : undefined);

describe("AC 1: margin = rumus atas agregat di sel, subtotal, total", () => {
  it("pivot Wilayah › Kota × bulan: semua sel/subtotal/total = (ΣP − ΣB)/ΣP kelompoknya", async () => {
    const p = await pivotOf("margin");
    expect(p.values).toEqual([
      { label: "Margin", type: "decimal", format: { style: "percent", decimals: 1 } },
    ]);
    expect(p.columns).toEqual(["2026-01-01", "2026-02-01"]);
    expect(p.rows.map((r) => r.labels)).toEqual([
      ["Jawa", "Bandung"],
      ["Jawa", "Jakarta"],
      ["Sumatra", "Medan"],
      ["Sumatra", "Padang"],
    ]);
    const cells = p.cells.map((r) => r.map(v0));
    // Bandung: 40/100, 10/50; Jakarta: 50/200, (tidak ada Feb); Medan: 60/80, P=0 → –; Padang: P kosong → –.
    expect(cells[0]![0]).toBeCloseTo(0.4, 12);
    expect(cells[0]![1]).toBeCloseTo(0.2, 12);
    expect(cells[1]![0]).toBeCloseTo(0.25, 12);
    expect(cells[1]![1]).toBeUndefined();
    expect(cells[2]![0]).toBeCloseTo(0.75, 12);
    expect(cells[2]![1]).toBeNull();
    expect(cells[3]![0]).toBeUndefined();
    expect(cells[3]![1]).toBeNull();
    // Total baris: Bandung 50/150, Jakarta 50/200, Medan 50/80, Padang –.
    const rowTot = p.rowTotals!.map(v0);
    expect(rowTot[0]).toBeCloseTo(1 / 3, 12);
    expect(rowTot[1]).toBeCloseTo(0.25, 12);
    expect(rowTot[2]).toBeCloseTo(0.625, 12);
    expect(rowTot[3]).toBeNull();
    // Subtotal Jawa: Jan 90/300, Feb 10/50, total 100/350; Sumatra: Jan 60/80, Feb P=0 → –, total 45/80.
    const sub = p.subtotals!.map((r) => r.map(v0));
    expect(sub[0]![0]).toBeCloseTo(0.3, 12);
    expect(sub[0]![1]).toBeCloseTo(0.2, 12);
    expect(sub[1]![0]).toBeCloseTo(0.75, 12);
    expect(sub[1]![1]).toBeNull();
    expect(v0(p.subtotalTotals![0])).toBeCloseTo(100 / 350, 12);
    expect(v0(p.subtotalTotals![1])).toBeCloseTo(45 / 80, 12);
    // Total kolom: Jan 150/380, Feb −5/50; total keseluruhan 145/430 — bukan jumlah/rata margin baris.
    expect(v0(p.columnTotals![0])).toBeCloseTo(150 / 380, 12);
    expect(v0(p.columnTotals![1])).toBeCloseTo(-0.1, 12);
    expect(v0(p.grandTotal)).toBeCloseTo(145 / 430, 12);
    expect(v0(p.grandTotal)).not.toBeCloseTo(0.4 + 0.2 + 0.25 + 0.75, 3);
    expect(allFinite(p)).toBe(true);
  });

  it("urut value_desc memakai nilai terhitung: Sumatra (45/80) sebelum Jawa (100/350)", async () => {
    const p = await pivotOf("byval");
    expect(p.rows.map((r) => r.labels[0])).toEqual(["Sumatra", "Jawa"]);
    expect(v0(p.cells[0]![0])).toBeCloseTo(45 / 80, 12);
    expect(p.cells[1]![0]![1]).toBe(350);
    expect(p.values.map((v) => v.label)).toEqual(["Margin", "Total Pendapatan"]);
  });

  it("KPI = total keseluruhan rumus; grafik Top N memakai nilai terhitung", async () => {
    const k = await query("kpi");
    expect(k.rows[0]![0]).toBeCloseTo(145 / 430, 12);
    expect(k.columns).toEqual([{ key: "m0", label: "Margin", type: "decimal" }]);
    // Bandung 1/3, Jakarta 0,25, Medan 0,625, Padang – → 1 teratas = Medan; rasio tidak punya total.
    const b = await query("bar");
    expect(b.rows).toHaveLength(1);
    expect(b.rows[0]![0]).toBe("Medan");
    expect(b.rows[0]![1]).toBeCloseTo(0.625, 12);
    expect(b.categories).toBe(4);
    expect(b.grandTotal).toBeNull();
    // Pai aditif: "Lainnya" = total − irisan (Jawa 100 dari 145).
    const pie = await query("pie");
    expect(pie.rows).toEqual([["Jawa", 100]]);
    expect(pie.grandTotal).toBe(145);
  });
});

describe("AC 2: pembagi 0/NULL → NULL, tanpa galat/Infinity/NaN", () => {
  it("pendapatan per kiriman: Padang (0 kiriman) kosong, kota lain dan total benar", async () => {
    const p = await pivotOf("kiriman");
    expect(p.rows.map((r) => r.labels[0])).toEqual(["Bandung", "Jakarta", "Medan", "Padang"]);
    expect(p.cells.map((r) => v0(r[0]))).toEqual([75, 200, 40, null]);
    expect(v0(p.grandTotal)).toBe(86);
    expect(allFinite(p)).toBe(true);
  });

  it("rumus terdalam/terlebar yang diizinkan (31 node, 6 tingkat ÷) tetap cepat di pivot 2 level", async () => {
    // Regresi: penjaga berhingga berbasis NULLIF/CASE menyalin operand → perencana DuckDB eksponensial.
    const full = (d: number, i = 0): unknown =>
      d === 1
        ? [sum(4), sum(5), { agg: "count" }, sum(7)][i % 4]
        : op("div", full(d - 1, i), full(d - 1, i + 1));
    const w = planOf("pivot", {
      ...WIDGETS.margin!.spec,
      values: [calc("Dalam", full(5)), calc("Neg", op("neg", full(5)))],
    });
    if (w.kind !== "pivot") throw new Error("pivot");
    const built = buildPivotSql(w.plan, w.pivot, source);
    expect(built.sql.length).toBeLessThan(200_000);
    const t0 = performance.now();
    await conn.runAndReadAll(built.sql, built.params);
    expect(performance.now() - t0).toBeLessThan(5_000);
  });

  it("overflow DOUBLE (1e300 × 1e300) → NULL, bukan Infinity", async () => {
    const r = await query("overflow");
    expect(r.rows).toEqual([[null]]);
    expect(JSON.stringify(r)).not.toMatch(/Infinity|NaN/);
  });
});

describe("AC 3: SQL aman — konstanta parameter, identifier c<pos>, injeksi nama kolom", () => {
  it("konstanta di-bind (tidak ada di teks SQL), nilainya benar", async () => {
    const w = planOf(WIDGETS.konst!.type, WIDGETS.konst!.spec);
    const built = buildSql(w.plan, "/x.parquet");
    expect(built.sql).not.toContain("1.5");
    expect(built.sql).toContain("CAST($m0k1 AS DOUBLE)");
    expect(built.params).toMatchObject({ path: "/x.parquet", m0k1: 1.5 });
    expect((await query("konst")).rows[0]![0]).toBe(645);
  });

  it("nama kolom berisi kutip/;-- tidak pernah masuk SQL; query berjalan", async () => {
    const w = planOf(WIDGETS.inject!.type, WIDGETS.inject!.spec);
    const built = buildSql(w.plan, "/x.parquet");
    expect(built.sql).not.toMatch(/DROP|Harga|--/);
    expect(built.sql).toContain(`"c10"`);
    // Σ = 0,2; − 0,05 → 0,15 (konstanta pecahan → DOUBLE).
    expect((await query("inject")).rows[0]![0]).toBeCloseTo(0.15, 12);
    // Spec bebas dengan nama yang sama: resolve ke c10, nama tetap di luar SQL.
    const free = resolveSpec(
      specSchema.parse({
        sheetId: SHEET,
        measures: [
          {
            kind: "calc",
            label: "x",
            expr: op("add", { agg: "sum", column: INJECT }, { const: 1 }),
          },
        ],
      }),
      SCHEMA,
    );
    if (!free.ok) throw new Error(free.message);
    const sql = buildSql(free.plan, "/x.parquet").sql;
    expect(sql).not.toContain("DROP");
    expect(sql).toContain(`"c10"`);
  });

  it("kolom tersembunyi → COLUMN_UNAVAILABLE; Total kolom teks → INVALID (pesan Indonesia)", async () => {
    const h = await runWidgetQuery(USER, { widgetId: WID("hidden") }, deps());
    expect(h).toMatchObject({ ok: false, code: "COLUMN_UNAVAILABLE" });
    expect(h.ok ? "" : h.message).toContain("disembunyikan");
    const t = await runWidgetQuery(USER, { widgetId: WID("text") }, deps());
    expect(t).toMatchObject({ ok: false, code: "INVALID" });
    expect(t.ok ? "" : t.message).toContain('"Catatan"');
  });

  it("parameter konstanta tidak terpakai tidak di-bind (total grafik rasio = NULL)", () => {
    const w = planOf("bar", {
      ...WIDGETS.bar!.spec,
      measure: calc("x", op("div", sum(4), { const: 3 })),
    });
    expect(buildTotalsSql(w.plan, "/x")!.params).toEqual({ path: "/x" });
    expect(buildSql(w.plan, "/x").params).toEqual({ path: "/x", m0k1: 3 });
  });
});

describe("AC 4: jenis hasil, showAs, urutan", () => {
  const typeOf = async (name: string) => {
    const w = planOf(WIDGETS[name]!.type, WIDGETS[name]!.spec);
    const built = buildSql(w.plan, source);
    const r = await conn.run(built.sql, built.params);
    return { type: String(r.columnTypes()[0]), value: (await r.getRowsJS())[0]![0] };
  };

  it("± atas DECIMAL → DECIMAL(38,6) tepat (0,2 + 0,1 = 0,3); × konstanta → DOUBLE", async () => {
    expect(await typeOf("exact")).toEqual({ type: "DECIMAL(38,6)", value: 0.3 });
    const f = await typeOf("float");
    expect(f.type).toBe("DOUBLE");
    expect(f.value).toBe(0.2 + 0.1);
    expect(await typeOf("kpi")).toMatchObject({ type: "DOUBLE" });
    // Bilangan bulat ± jumlah baris tetap bilangan bulat: ΣQty 13 − 6 baris = 7.
    expect((await query("qty")).rows[0]![0]).toBe(7);
    expect((await query("qty")).columns[0]!.type).toBe("integer");
  });

  it("showAs pada field terhitung: % keseluruhan dan total berjalan dari nilai rumus", async () => {
    const p = await pivotOf("pct");
    expect(p.values[0]).toMatchObject({
      label: "% dari total keseluruhan · Laba",
      showAs: "pct_grand",
    });
    expect(p.cells.map((r) => v0(r[0]))).toEqual([100 / 145, 45 / 145]);
    expect(v0(p.grandTotal)).toBe(1);
    const run = await pivotOf("running");
    // Laba per kota urut label: Bandung 50, Jakarta 50, Medan 50, Padang −5 → 50, 100, 150, 145.
    expect(run.cells.map((r) => v0(r[0]))).toEqual([50, 100, 150, 145]);
  });

  it("ekspor XLSX/CSV pivot memakai nilai yang sama dengan layar", async () => {
    const w = planOf(WIDGETS.byval!.type, WIDGETS.byval!.spec);
    if (w.kind !== "pivot") throw new Error("pivot");
    const out = join(root, "m.csv");
    await writePivotExport(
      conn,
      { planned: w, dash: { clauses: [], skipped: [] } } as never,
      source,
      "csv",
      out,
      "Pivot",
    );
    const lines = readFileSync(out, "utf8").trim().split("\n");
    expect(lines[0]).toContain("Margin");
    expect(lines[1]).toMatch(/^"Sumatra",0\.5625,80$/);
    expect(Number(lines[2]!.split(",")[1])).toBeCloseTo(100 / 350, 12);
  });
});

describe("spec lama: SQL dan kunci cache identik dengan sebelum T-068", () => {
  const S = "cmv4kljx40009oczvdmpurrxa";
  const G: ColumnSchema[] = [
    col(1, "Cabang", "text"),
    col(2, "Layanan", "text"),
    col(3, "Tanggal", "date"),
    col(4, "Omzet", "decimal"),
    col(5, "Qty", "integer"),
    col(6, "F", "decimal", { float: true }),
  ];
  const f = { style: "rupiah", decimals: 0 };
  // Golden dihitung dari HEAD 693edf2 (sebelum T-068) dengan skrip yang sama.
  const GOLDEN: [string, unknown, string, string][] = [
    [
      "pivot",
      {
        sheetId: S,
        rows: [{ column: 1 }, { column: 2 }],
        column: { column: 3, timeGrain: "month" },
        values: [
          { agg: "sum", column: 4 },
          { agg: "count" },
          { agg: "avg", column: 5, showAs: "pct_row" },
        ],
        sort: "value_desc",
        format: f,
        totals: true,
        subtotals: true,
      },
      "39f846867d509d39f8c36e2a3fd9f5592876d4fd858ec489d88b360e964f85ef",
      "75cbb98b4a0fe277c91d07a644f9bb374ad02a130938fa742d108e01b8689ed6",
    ],
    [
      "pivot",
      {
        sheetId: S,
        rows: [{ column: 1 }],
        values: [{ agg: "max", column: 6, showAs: "running" }],
        sort: "label_asc",
        format: f,
        totals: false,
        subtotals: false,
        filters: [{ column: 2, op: "in", values: ["A", null] }],
      },
      "ca72ad3c544d296e7c356abd5896bfdc9b506142716f78336b3f6d908739c299",
      "f2a8510b8cf6afe2f8d71dd8b1dce0def85cd5cfbba58e2acb46ab0bfbfb2d9f",
    ],
    [
      "bar",
      {
        sheetId: S,
        dimension: { column: 1 },
        measure: { agg: "sum", column: 4 },
        sort: "value_desc",
        topN: 12,
        format: f,
      },
      "906643c7340dc0fc1abe024ccceb68a09fd148e6f5bbb6e02e4923888373a1e1",
      "1b557397351b65467b5d7c4d27a078389dde2c27628a3fd0394af53058343525",
    ],
    [
      "line",
      {
        sheetId: S,
        dimension: { column: 3, timeGrain: "month" },
        measure: { agg: "count", showAs: "diff_prev" },
        sort: "label_desc",
        topN: 30,
        format: f,
      },
      "34ed4bd8512d2b7ba52e05e8620fc61928e22f691a1993ef36a7f6d796a0e7f0",
      "3c798782ffc20fb2e8e261b17680c64e7805c500b50f1ca0d32447ed62e67d8d",
    ],
    [
      "pie",
      {
        sheetId: S,
        dimension: { column: 2 },
        measure: { agg: "sum", column: 5, showAs: "pct_grand" },
        sort: "value_desc",
        topN: 5,
        format: f,
      },
      "ae37b4c257c5226d0ea890e172d90c2ed16bb81cf81eedba63a39c7f59d8539b",
      "0f232cc5e61882140b282303a0a7e70caefcfc9dffbaf9fce48545d925de1a17",
    ],
    [
      "kpi",
      { sheetId: S, measure: { agg: "count_distinct", column: 1 }, format: f },
      "3abd3f3747bff0fb6047ee6898123940b82268dfe43b739543087f316bbe3641",
      "63455a1449b4ff828d1a8beabfea37bb74dbb05a91a889ef0b0c17f0759b9aca",
    ],
  ];

  it.each(GOLDEN)("%s: kunci cache + SQL sama persis", (type, spec, key, sqlHash) => {
    const p = planOf(type, spec, G);
    expect(
      resultKey({ datasetId: "d", versionId: "v", sheetId: S, schemaRevision: 1, spec: p.spec }),
    ).toBe(key);
    const sql = p.kind === "pivot" ? buildPivotSql(p.plan, p.pivot, "/x") : buildSql(p.plan, "/x");
    const tot = p.kind === "agg" ? buildTotalsSql(p.plan, "/x") : null;
    expect(
      createHash("sha256")
        .update(JSON.stringify([sql, tot]))
        .digest("hex"),
    ).toBe(sqlHash);
  });
});

/* ---------- Uji properti: DuckDB = evaluator acuan JS atas agregat yang sama ---------- */

type Leaf = { agg: "sum" | "avg" | "count" | "count_distinct" | "min" | "max"; column?: number };
const LEAVES: Leaf[] = [
  { agg: "sum", column: 2 },
  { agg: "sum", column: 3 },
  { agg: "sum", column: 4 },
  { agg: "sum", column: 5 },
  { agg: "avg", column: 2 },
  { agg: "avg", column: 4 },
  { agg: "min", column: 3 },
  { agg: "max", column: 2 },
  { agg: "max", column: 4 },
  { agg: "count" },
  { agg: "count", column: 2 },
  { agg: "count_distinct", column: 1 },
  { agg: "count_distinct", column: 3 },
];
const CONSTS = [0, 1, 2, -3, 0.5, 2.25, 100, 1e-3];

function randomTree(r: () => number, depth: number): CalcExpr {
  const leaf = (): CalcExpr =>
    r() < 0.15
      ? { const: CONSTS[Math.floor(r() * CONSTS.length)]! }
      : { ...LEAVES[Math.floor(r() * LEAVES.length)]! };
  if (depth <= 1 || r() < 0.25) return leaf();
  const x = r();
  if (x < 0.1) return { op: "neg", args: [randomTree(r, depth - 1)] };
  const o = (["add", "sub", "mul", "div"] as const)[Math.floor(r() * 4)]!;
  return { op: o, args: [randomTree(r, depth - 1), randomTree(r, depth - 1)] };
}

/** Agregat acuan per kelompok (semantik measureExpr: Total kosong = 0, count = terisi). */
function refAgg(rows: RandRow[], l: Leaf): number | null {
  const key = (["", "g", "x", "y", "n", "f"] as const)[l.column ?? 0];
  const vals: unknown[] = key
    ? rows.map((r) => r[key as keyof RandRow]).filter((v) => v !== null)
    : rows;
  const nums = vals as number[];
  switch (l.agg) {
    case "count":
      return vals.length;
    case "count_distinct":
      return new Set(vals).size;
    case "sum":
      return nums.reduce((a, b) => a + b, 0);
    case "avg":
      return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : null;
    case "min":
      return nums.length ? Math.min(...nums) : null;
    case "max":
      return nums.length ? Math.max(...nums) : null;
  }
}
const fin = (v: number | null) => (v === null || !Number.isFinite(v) ? null : v);
function refEval(e: CalcExpr, rows: RandRow[]): number | null {
  if ("agg" in e) return fin(refAgg(rows, e as Leaf));
  if ("const" in e) return e.const;
  const a = refEval(e.args[0], rows);
  if (e.op === "neg") return a === null ? null : -a;
  const b = refEval(e.args[1]!, rows);
  if (a === null || b === null) return null;
  switch (e.op) {
    case "add":
      return fin(a + b);
    case "sub":
      return fin(a - b);
    case "mul":
      return fin(a * b);
    case "div":
      return b === 0 ? null : fin(a / b);
  }
}
const close = (a: unknown, b: number | null) =>
  b === null
    ? a === null
    : typeof a === "number" && Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b));

describe("uji properti: pohon acak di DuckDB = evaluator JS", () => {
  it("300 pohon acak valid: setiap sel kelompok dan total keseluruhan cocok", async () => {
    const r = rng(20261021);
    const groups = ["A", "B", "C", "D", "E"];
    let checked = 0;
    let nulls = 0;
    for (let t = 0; t < 300; t++) {
      const expr = randomTree(r, 1 + Math.floor(r() * 6));
      const spec = {
        sheetId: RAND,
        rows: [{ column: 1 }],
        values: [{ kind: "calc", label: "R", expr }],
        sort: "label_asc",
        format: fmt,
        totals: true,
        subtotals: false,
      };
      const c = parseWidgetConfig("pivot", spec);
      if (!c.ok) {
        // Generator boleh menghasilkan pohon tanpa ukuran (hanya konstanta) — itu memang ditolak.
        expect(c.message).toMatch(/minimal satu ukuran|terlalu/);
        continue;
      }
      const w = widgetPlan(c.config as Exclude<WidgetConfig, { type: "empty" }>, RAND_SCHEMA, {
        page: 0,
      });
      if (!w.ok || w.kind !== "pivot")
        throw new Error(`${JSON.stringify(expr)}: ${w.ok ? "" : w.message}`);
      const built = buildPivotSql(w.plan, w.pivot, randSource);
      const raw = (await conn.runAndReadAll(built.sql, built.params)).getRowsJS() as unknown[][];
      const types = pivotOutTypes(w.plan, w.pivot);
      const p = shapePivot(
        raw.map((x) => x.map((v, i) => toJson(v, types[i]!))),
        w.plan,
        w.pivot,
      );
      expect(p.rows.map((x) => x.labels[0])).toEqual(groups);
      groups.forEach((g, i) => {
        const want = refEval(
          expr,
          RAND_DATA.filter((d) => d.g === g),
        );
        const got = v0(p.cells[i]![0]);
        if (!close(got, want)) throw new Error(`${JSON.stringify(expr)} ${g}: ${got} ≠ ${want}`);
        if (want === null) nulls++;
        checked++;
      });
      const want = refEval(expr, RAND_DATA);
      const got = v0(p.grandTotal);
      if (!close(got, want)) throw new Error(`${JSON.stringify(expr)} total: ${got} ≠ ${want}`);
      expect(allFinite(p)).toBe(true);
      checked++;
    }
    expect(checked).toBeGreaterThan(1000);
    // Kelompok E (semua kosong/nol) memastikan cabang pembagi 0/NULL ikut teruji.
    expect(nulls).toBeGreaterThan(20);
  });

  it("pohon jahat ditolak sebelum SQL dibangun", () => {
    const bad: unknown[] = [
      { const: Infinity },
      op("div", sum(2), { const: NaN }),
      op("mul", sum(2), { const: 1e16 }),
      op("add", { agg: "sum", column: 99 }, sum(2)),
      op("add", { agg: "sum", column: 1 }, sum(2)),
      op("add", { agg: "avg", column: 1 }, sum(2)),
      op("pow", sum(2), sum(3)),
      { agg: "sum", column: "c2" },
      "SUM(c2)",
    ];
    let deep: unknown = sum(2);
    for (let i = 0; i < 7; i++) deep = op("neg", deep);
    bad.push(deep);
    for (const expr of bad) {
      const c = parseWidgetConfig("pivot", {
        sheetId: RAND,
        rows: [{ column: 1 }],
        values: [{ kind: "calc", label: "R", expr }],
        sort: "label_asc",
        format: fmt,
        totals: true,
        subtotals: false,
      });
      const planned = c.ok
        ? widgetPlan(c.config as Exclude<WidgetConfig, { type: "empty" }>, RAND_SCHEMA, { page: 0 })
        : c;
      expect(planned.ok, JSON.stringify(expr)).toBe(false);
    }
  });
});
