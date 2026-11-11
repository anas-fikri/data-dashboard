import { copyFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DuckDBInstance } from "@duckdb/node-api";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { ColumnSchema } from "@/features/ingest/infer";
import { ResultCache } from "@/features/query/cache";
import {
  runWidgetQuery,
  type CachedQuery,
  type QueryDeps,
  type QueryRepo,
} from "@/features/query/service";
import { resolveSpec, specSchema } from "@/features/query/spec";
import { buildSql } from "@/features/query/sql";
import { parseWidgetConfig } from "@/features/widgets/spec";
import { QueryEngine } from "@/lib/duckdb/engine";
import { ParquetCache } from "@/lib/duckdb/parquet-cache";

/*
 * Ukuran "Jumlah kosong" (T-bwza, COUNTBLANK) in-process — DuckDB + cache parquet sungguhan, repo palsu.
 * Kurir kosong pada baris i % 6 = 0 (167 dari 1000): hanya Cabang 0 (84) dan Cabang 2 (83) punya baris
 * kosong. Nilai dibandingkan dengan hitungan test dari data yang sama.
 */
const DS = "cmv4klj5r0007oczvgiofocpg";
const VER = "cmv4kljx40009oczvdmpurrxf";
const SHEET = "cmv4kljx40009oczvdmpurrxa";
const USER = "user-pemilik";
const ROWS = 1000;

const col = (pos: number, name: string, type: ColumnSchema["type"]) =>
  ({
    pos,
    name,
    original: name,
    type,
    hidden: false,
    nullPct: 0,
    distinctCount: 0,
    castFailCount: 0,
  }) as ColumnSchema;
const SCHEMA: ColumnSchema[] = [
  col(1, "Cabang", "text"),
  col(2, "Kurir", "text"),
  col(3, "Tanggal", "date"),
  col(4, "Omzet", "decimal"),
];
const cabangOf = (i: number) => `Cabang ${i % 4}`;
const blank = (i: number) => i % 6 === 0;
const all = Array.from({ length: ROWS }, (_, i) => i);
const blanksOf = (cabang: string) => all.filter((i) => cabangOf(i) === cabang && blank(i)).length;
const BLANKS = all.filter(blank).length;

let root: string;
let source: string;
let engine: QueryEngine;

beforeAll(async () => {
  root = mkdtempSync(join(tmpdir(), "dd-count-blank-"));
  source = join(root, "typed.parquet");
  const db = await DuckDBInstance.create(":memory:");
  const c = await db.connect();
  await c.run(
    `COPY (SELECT (i + 2)::INTEGER AS _row,
                  'Cabang ' || (i % 4) AS c1,
                  CASE WHEN i % 6 = 0 THEN NULL ELSE 'K' || (i % 7) END AS c2,
                  DATE '2026-01-01' + CAST(i % 90 AS INTEGER) AS c3,
                  CAST((i * 37) % 1000 + 0.5 AS DECIMAL(38,6)) AS c4
           FROM range(${ROWS}) t(i)) TO '${source}' (FORMAT parquet)`,
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
const BLANK = { agg: "count_blank", column: 2 };
const chart = (type: string, over: Record<string, unknown>) => ({
  type,
  spec: { sheetId: SHEET, sort: "label_asc", topN: 12, format: fmt, ...over },
});
const WIDGETS: Record<string, { type: string; spec: Record<string, unknown> }> = {
  kpi: { type: "kpi", spec: { sheetId: SHEET, measure: BLANK, format: fmt } },
  kself: {
    type: "kpi",
    spec: {
      sheetId: SHEET,
      measure: { agg: "count_blank", column: 3 },
      format: fmt,
      compare: { column: 3, grain: "month", against: "previous" },
    },
  },
  kcmp: {
    type: "kpi",
    spec: {
      sheetId: SHEET,
      measure: BLANK,
      format: fmt,
      compare: { column: 3, grain: "month", against: "previous" },
    },
  },
  bar: chart("bar", { dimension: { column: 1 }, measure: BLANK, drill: { columns: [1, 2, 4] } }),
  barsum: chart("bar", {
    dimension: { column: 1 },
    measure: { agg: "sum", column: 4 },
    drill: { columns: [1, 2] },
  }),
  pie: chart("pie", { dimension: { column: 1 }, measure: BLANK, sort: "value_desc", topN: 1 }),
  pivot: {
    type: "pivot",
    spec: {
      sheetId: SHEET,
      format: fmt,
      totals: true,
      subtotals: false,
      sort: "label_asc",
      rows: [{ column: 1 }],
      values: [
        BLANK,
        { agg: "count", column: 2 },
        {
          kind: "calc",
          label: "Terisi + kosong",
          expr: { op: "add", args: [{ agg: "count", column: 2 }, BLANK] },
        },
      ],
    },
  },
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

async function query(name: string, extra: Record<string, unknown> = {}) {
  const r = await runWidgetQuery(USER, { widgetId: WID(name), ...extra }, deps());
  if (!r.ok) throw new Error(`${r.code}: ${r.message}`);
  return r;
}

describe("Jumlah kosong (T-bwza)", { timeout: 60_000 }, () => {
  it("spec: butuh kolom; label 'Jumlah kosong <kolom>' bertipe jumlah; SQL = COUNT(*) − COUNT(kolom)", () => {
    expect(parseWidgetConfig("kpi", { sheetId: SHEET, measure: BLANK, format: fmt }).ok).toBe(true);
    expect(
      parseWidgetConfig("kpi", {
        sheetId: SHEET,
        measure: { agg: "count_blank" },
        format: fmt,
      }).ok,
    ).toBe(false);
    const plan = resolveSpec(
      specSchema.parse({ sheetId: SHEET, measures: [{ agg: "count_blank", column: "Kurir" }] }),
      SCHEMA,
    );
    if (!plan.ok) throw new Error(plan.message);
    expect(plan.plan.columns.at(-1)).toMatchObject({ label: "Jumlah kosong Kurir", type: "count" });
    expect(buildSql(plan.plan, "/x.parquet").sql).toMatch(/count\(\*\) - count\("c2"\)/);
    // Tanpa kolom ditolak.
    expect(
      resolveSpec(specSchema.parse({ sheetId: SHEET, measures: [{ agg: "count_blank" }] }), SCHEMA)
        .ok,
    ).toBe(false);
  });

  it("kolom absent (T-014): dihitung seperti Jumlah terisi (0), bukan jumlah semua baris", () => {
    const absent = SCHEMA.map((c) => (c.pos === 2 ? { ...c, absent: true } : c));
    const plan = resolveSpec(
      specSchema.parse({ sheetId: SHEET, measures: [{ agg: "count_blank", column: "Kurir" }] }),
      absent,
    );
    if (!plan.ok) throw new Error(plan.message);
    expect(plan.plan.columns.at(-1)).toMatchObject({ label: "Jumlah kosong Kurir" });
    const sql = buildSql(plan.plan, "/x.parquet").sql;
    expect(sql).toMatch(/count\("c2"\)/);
    expect(sql).not.toMatch(/count\(\*\) - count/);
  });

  it("pembanding KPI memakai kolom yang dihitung kosongnya → INVALID dengan penjelasan", async () => {
    const r = await runWidgetQuery(USER, { widgetId: WID("kself") }, deps());
    expect(r).toMatchObject({ ok: false, code: "INVALID" });
    expect(r.ok ? "" : r.message).toContain("dihitung kosongnya");
  });

  it("KPI = jumlah baris yang kolomnya kosong", async () => {
    const r = await query("kpi");
    expect(Number(r.rows[0]![0])).toBe(BLANKS);
  });

  it("pembanding KPI: bulan terakhir vs sebelumnya dihitung dari baris kosong bulan itu", async () => {
    const r = await query("kcmp");
    if (!("compare" in r) || !r.compare) throw new Error("tanpa compare");
    // Tanggal = 1 Jan 2026 + (i % 90) hari: Maret = hari ke-59..89.
    const month = (i: number) => new Date(Date.UTC(2026, 0, 1 + (i % 90))).getUTCMonth();
    const blanksIn = (m: number) => all.filter((i) => month(i) === m && blank(i)).length;
    expect(r.compare).toMatchObject({ period: "2026-03-01", previousPeriod: "2026-02-01" });
    expect(Number(r.rows[0]![0])).toBe(blanksIn(2));
    expect(Number(r.compare.previous)).toBe(blanksIn(1));
  });

  it("batang per kategori; kategori tanpa baris kosong = 0", async () => {
    const r = await query("bar");
    const got = Object.fromEntries(r.rows.map((x) => [String(x[0]), Number(x[1])]));
    expect(got).toEqual({
      "Cabang 0": blanksOf("Cabang 0"),
      "Cabang 1": 0,
      "Cabang 2": blanksOf("Cabang 2"),
      "Cabang 3": 0,
    });
  });

  it("pai Top 1: total keseluruhan (sisa 'Lainnya') = semua baris kosong", async () => {
    const r = await query("pie");
    expect(r.rows).toHaveLength(1);
    expect(Number(r.rows[0]![1])).toBe(blanksOf("Cabang 0"));
    expect(r.grandTotal).toBe(BLANKS);
  });

  it("pivot: sel, Total, dan field terhitung (terisi + kosong = semua baris)", async () => {
    const r = await query("pivot");
    const p = r.pivot!;
    expect(p.values.map((v) => v.label)).toEqual([
      "Jumlah kosong Kurir",
      "Jumlah terisi Kurir",
      "Terisi + kosong",
    ]);
    p.rows.forEach((row, ri) => {
      const cab = String(row.labels[0]);
      const n = all.filter((i) => cabangOf(i) === cab).length;
      expect(p.cells[ri]![0]!.map(Number)).toEqual([blanksOf(cab), n - blanksOf(cab), n]);
    });
    expect(p.grandTotal!.map(Number)).toEqual([BLANKS, ROWS - BLANKS, ROWS]);
  });

  it("klik-tembus ukuran Jumlah kosong → hanya baris kategori yang kolomnya kosong; ukuran lain → semua baris kategori", async () => {
    const r = await query("bar", { drill: { value: "Cabang 0" } });
    if (!("total" in r)) throw new Error("bukan tabel");
    expect(r.total).toBe(blanksOf("Cabang 0"));
    expect(r.rows.every((x) => x[0] === "Cabang 0" && x[1] === null)).toBe(true);
    const s = await query("barsum", { drill: { value: "Cabang 0" } });
    if (!("total" in s)) throw new Error("bukan tabel");
    expect(s.total).toBe(all.filter((i) => cabangOf(i) === "Cabang 0").length);
  });
});
