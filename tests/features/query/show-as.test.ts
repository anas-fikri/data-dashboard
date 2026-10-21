import { copyFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DuckDBInstance } from "@duckdb/node-api";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { ColumnSchema } from "@/features/ingest/infer";
import { ResultCache } from "@/features/query/cache";
import { buildPivotSql, type PivotData } from "@/features/query/pivot";
import {
  runWidgetQuery,
  type CachedQuery,
  type QueryDeps,
  type QueryRepo,
} from "@/features/query/service";
import { buildSql } from "@/features/query/sql";
import { widgetPlan } from "@/features/query/widget";
import { parseWidgetConfig, type WidgetConfig } from "@/features/widgets/spec";
import { QueryEngine } from "@/lib/duckdb/engine";
import { ParquetCache } from "@/lib/duckdb/parquet-cache";

/*
 * T-067 "Tampilkan nilai sebagai" in-process — DuckDB + cache parquet sungguhan, repo palsu. Nilai
 * dibandingkan dengan perhitungan test dari data yang sama: persen terhadap total SELURUH data yang
 * lolos filter (termasuk baris di luar 200 tampil), total berjalan/selisih sepanjang kolom pemisah atau
 * baris terdalam per kelompok (urut label naik, termasuk item sebelum potongan), 0/NULL → kosong, dan
 * spec lama tanpa showAs identik.
 */
const DS = "cmv4klj5r0007oczvgiofocpg";
const VER = "cmv4kljx40009oczvdmpurrxf";
const SHEET = "cmv4kljx40009oczvdmpurrxa";
const EDGE = "cmv4kljx40009oczvdmpurrxe";
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
  col(2, "Layanan", "text"),
  col(3, "Tanggal", "date"),
  col(4, "Omzet", "decimal"),
  col(5, "Resi", "text"),
  col(6, "Hari", "date"),
];
const EDGE_SCHEMA: ColumnSchema[] = [col(1, "Bulan", "date"), col(2, "Nilai", "decimal")];

const cabangOf = (i: number) => (i % 10 === 1 ? "cabang 1" : `cabang ${i % 4}`);
const layananOf = (i: number) => (i % 50 === 0 ? null : ["Express", "Reguler", "Kargo"][i % 3]!);
const omzetOf = (i: number) => ((i * 37) % 1000) + 0.5;
const bulanOf = (i: number) => {
  const d = new Date(Date.UTC(2026, 0, 1 + (i % 90)));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-01`;
};

let root: string;
let source: string;
let edge: string;
let engine: QueryEngine;

beforeAll(async () => {
  root = mkdtempSync(join(tmpdir(), "dd-show-as-test-"));
  source = join(root, "typed.parquet");
  edge = join(root, "edge.parquet");
  const db = await DuckDBInstance.create(":memory:");
  const c = await db.connect();
  await c.run(
    `COPY (SELECT (i + 2)::INTEGER AS _row,
                  CASE WHEN i % 10 = 1 THEN 'CABANG 1' ELSE 'Cabang ' || (i % 4) END AS c1,
                  CASE WHEN i % 50 = 0 THEN NULL ELSE ['Express', 'Reguler', 'Kargo'][(i % 3) + 1] END AS c2,
                  DATE '2026-01-01' + CAST(i % 90 AS INTEGER) AS c3,
                  CAST((i * 37) % 1000 + 0.5 AS DECIMAL(38,6)) AS c4,
                  'R' || lpad(CAST(i AS VARCHAR), 4, '0') AS c5,
                  DATE '2026-01-01' + CAST(i % 60 AS INTEGER) AS c6
           FROM range(${ROWS}) t(i)) TO '${source}' (FORMAT parquet)`,
  );
  // Rata-rata per bulan: Jan 10, Feb 0, Mar 5, Apr kosong (semua NULL), Mei 8.
  await c.run(
    `COPY (SELECT * FROM (VALUES
              (2, DATE '2026-01-05', CAST(10 AS DECIMAL(38,6))),
              (3, DATE '2026-02-05', CAST(0 AS DECIMAL(38,6))),
              (4, DATE '2026-03-05', CAST(5 AS DECIMAL(38,6))),
              (5, DATE '2026-04-05', CAST(NULL AS DECIMAL(38,6))),
              (6, DATE '2026-05-05', CAST(8 AS DECIMAL(38,6)))
           ) t(_row, c1, c2)) TO '${edge}' (FORMAT parquet)`,
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

const fmt = { style: "rupiah", decimals: 0 } as const;
const pivot = (over: Record<string, unknown>) => ({
  type: "pivot",
  spec: {
    sheetId: SHEET,
    format: fmt,
    totals: true,
    subtotals: false,
    sort: "value_desc",
    ...over,
  },
});
const chart = (type: string, over: Record<string, unknown>) => ({
  type,
  spec: { sheetId: SHEET, sort: "value_desc", topN: 12, format: fmt, ...over },
});
const OMZET = { agg: "sum", column: 4 };
const BULAN = { column: 3, timeGrain: "month" };
const WIDGETS: Record<string, { type: string; spec: Record<string, unknown> }> = {
  grand: pivot({
    rows: [{ column: 1 }],
    column: BULAN,
    values: [{ ...OMZET, showAs: "pct_grand" }, { agg: "count" }],
  }),
  cut: pivot({
    rows: [{ column: 5 }],
    totals: false,
    values: [{ agg: "count", showAs: "pct_grand" }],
  }),
  prow: pivot({
    rows: [{ column: 1 }, { column: 2 }],
    column: BULAN,
    subtotals: true,
    sort: "label_asc",
    values: [{ ...OMZET, showAs: "pct_row" }],
  }),
  prowoff: pivot({
    rows: [{ column: 1 }, { column: 2 }],
    column: BULAN,
    subtotals: true,
    totals: false,
    sort: "label_asc",
    values: [{ ...OMZET, showAs: "pct_row" }],
  }),
  pcol: pivot({
    rows: [{ column: 1 }, { column: 2 }],
    column: BULAN,
    subtotals: true,
    sort: "label_asc",
    values: [{ ...OMZET, showAs: "pct_col" }],
  }),
  prow1: pivot({ rows: [{ column: 1 }], values: [{ ...OMZET, showAs: "pct_row" }] }),
  axcol: pivot({
    rows: [{ column: 1 }],
    column: BULAN,
    values: [
      { ...OMZET, showAs: "running" },
      { ...OMZET, showAs: "diff_prev" },
      { ...OMZET, showAs: "pct_diff_prev" },
    ],
  }),
  axrow: pivot({
    rows: [{ column: 5 }],
    sort: "label_desc",
    values: [
      { agg: "count", showAs: "running" },
      { agg: "count", showAs: "diff_prev" },
    ],
  }),
  axgrp: pivot({
    rows: [{ column: 1 }, { column: 2 }],
    subtotals: true,
    sort: "value_desc",
    values: [{ ...OMZET, showAs: "running" }, OMZET],
  }),
  edge: pivot({
    sheetId: EDGE,
    rows: [{ column: 1, timeGrain: "month" }],
    sort: "label_asc",
    values: [
      { agg: "avg", column: 2, showAs: "diff_prev" },
      { agg: "avg", column: 2, showAs: "pct_diff_prev" },
      { agg: "avg", column: 2, showAs: "running" },
    ],
  }),
  datemin: pivot({
    rows: [{ column: 1 }],
    values: [{ agg: "min", column: 3, showAs: "pct_grand" }],
  }),
  old: pivot({
    rows: [{ column: 1 }, { column: 2 }],
    column: BULAN,
    subtotals: true,
    values: [OMZET, { agg: "count" }],
  }),
  none: pivot({
    rows: [{ column: 1 }, { column: 2 }],
    column: BULAN,
    subtotals: true,
    values: [
      { ...OMZET, showAs: "none" },
      { agg: "count", showAs: "none" },
    ],
  }),
  bar: chart("bar", {
    dimension: { column: 1 },
    measure: { ...OMZET, showAs: "pct_grand" },
    topN: 2,
  }),
  pie: chart("pie", {
    dimension: { column: 1 },
    measure: { ...OMZET, showAs: "pct_grand" },
    topN: 2,
  }),
  line: chart("line", {
    dimension: { column: 6 },
    measure: { agg: "count", showAs: "running" },
    sort: "label_desc",
    topN: 5,
  }),
  lined: chart("line", {
    dimension: { column: 6 },
    measure: { agg: "count", showAs: "diff_prev" },
    sort: "label_desc",
    topN: 5,
  }),
};
const WID = (name: string) => `cmv4kljx40009oczvdmpu${name.padEnd(6, "x").slice(0, 6)}`;

function deps(): QueryDeps {
  const repo: QueryRepo = {
    ownedDataset: async () => null,
    sheet: async (versionId, sheetId) =>
      versionId !== VER
        ? null
        : sheetId === SHEET
          ? { typedKey: "parquet/ds/v/s/typed-1.parquet", schemaRevision: 1, schema: SCHEMA }
          : sheetId === EDGE
            ? { typedKey: "parquet/ds/v/e/typed-1.parquet", schemaRevision: 1, schema: EDGE_SCHEMA }
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
    download: async (key, dest) => copyFileSync(key.includes("/e/") ? edge : source, dest),
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
async function pivotOf(name: string): Promise<PivotData> {
  const r = await query(name);
  expect(r.pivot).toBeDefined();
  return r.pivot!;
}

const sumBy = <K>(key: (i: number) => K) => {
  const m = new Map<K, number>();
  for (let i = 0; i < ROWS; i++) m.set(key(i), (m.get(key(i)) ?? 0) + omzetOf(i));
  return m;
};
let ALL = 0;
for (let i = 0; i < ROWS; i++) ALL += omzetOf(i);
const low = (v: unknown) => (v === null ? null : String(v).toLowerCase());

describe("AC 1: % dari total keseluruhan", () => {
  it("setiap sel, total baris/kolom = nilai / total seluruh data; Total = 100%; judul menyebut cara tampil", async () => {
    const p = await pivotOf("grand");
    expect(p.values).toEqual([
      { label: "% dari total keseluruhan · Total Omzet", type: "decimal", showAs: "pct_grand" },
      { label: "Jumlah baris", type: "count" },
    ]);
    const cell = sumBy((i) => `${cabangOf(i)}|${bulanOf(i)}`);
    const perCabang = sumBy(cabangOf);
    const perBulan = sumBy(bulanOf);
    p.rows.forEach((r, ri) => {
      p.columns.forEach((b, ci) =>
        expect(p.cells[ri]![ci]![0]).toBeCloseTo(cell.get(`${low(r.labels[0])}|${b}`)! / ALL, 9),
      );
      expect(p.rowTotals![ri]![0]).toBeCloseTo(perCabang.get(low(r.labels[0])!)! / ALL, 9);
    });
    p.columns.forEach((b, ci) =>
      expect(p.columnTotals![ci]![0]).toBeCloseTo(perBulan.get(b as string)! / ALL, 9),
    );
    expect(p.grandTotal![0]).toBeCloseTo(1, 12);
    // Nilai biasa di sebelahnya tidak berubah.
    expect(p.grandTotal![1]).toBe(ROWS);
  });

  it("baris di luar 200 tampil ikut penyebut: 1 resi = 1/1.000, walau Total dimatikan", async () => {
    const p = await pivotOf("cut");
    expect(p.rows).toHaveLength(200);
    expect(p.rowCount).toBe(ROWS);
    expect(p.grandTotal).toBeNull();
    for (const c of p.cells) expect(c[0]![0]).toBeCloseTo(1 / ROWS, 12);
  });
});

describe("AC 2: % dari total baris / kolom", () => {
  const leaf = sumBy((i) => `${cabangOf(i)}|${layananOf(i)}|${bulanOf(i)}`);
  const leafTot = sumBy((i) => `${cabangOf(i)}|${layananOf(i)}`);
  const sub = sumBy((i) => `${cabangOf(i)}|${bulanOf(i)}`);
  const perCabang = sumBy(cabangOf);
  const perBulan = sumBy(bulanOf);
  const key = (r: PivotData["rows"][number]) => `${low(r.labels[0])}|${r.labels[1]}`;

  it("pct_row: sel / total barisnya, subtotal / total kelompoknya, kolom Total = 100%, baris Total / total keseluruhan", async () => {
    const p = await pivotOf("prow");
    expect(p.values[0]!.label).toBe("% dari total baris · Total Omzet");
    p.rows.forEach((r, ri) => {
      p.columns.forEach((b, ci) => {
        const v = leaf.get(`${key(r)}|${b}`);
        if (v === undefined) expect(p.cells[ri]![ci]).toBeNull();
        else expect(p.cells[ri]![ci]![0]).toBeCloseTo(v / leafTot.get(key(r))!, 9);
      });
      expect(p.rowTotals![ri]![0]).toBeCloseTo(1, 12);
    });
    p.groups.forEach((g, gi) => {
      p.columns.forEach((b, ci) =>
        expect(p.subtotals![gi]![ci]![0]).toBeCloseTo(
          sub.get(`${low(g)}|${b}`)! / perCabang.get(low(g)!)!,
          9,
        ),
      );
      expect(p.subtotalTotals![gi]![0]).toBeCloseTo(1, 12);
    });
    p.columns.forEach((b, ci) =>
      expect(p.columnTotals![ci]![0]).toBeCloseTo(perBulan.get(b as string)! / ALL, 9),
    );
    expect(p.grandTotal![0]).toBeCloseTo(1, 12);
  });

  it("pct_row tetap dihitung walau sakelar Total dimatikan", async () => {
    const p = await pivotOf("prowoff");
    expect(p.rowTotals).toBeNull();
    p.rows.forEach((r, ri) => {
      const sum = p.cells[ri]!.reduce((a, c) => a + ((c?.[0] as number) ?? 0), 0);
      expect(sum).toBeCloseTo(1, 9);
    });
    p.groups.forEach((g, gi) =>
      expect(p.subtotals![gi]![0]![0]).toBeCloseTo(
        sub.get(`${low(g)}|${p.columns[0]}`)! / perCabang.get(low(g)!)!,
        9,
      ),
    );
  });

  it("pct_row tanpa kolom pemisah: setiap baris = 100%", async () => {
    const p = await pivotOf("prow1");
    for (const c of p.cells) expect(c[0]![0]).toBeCloseTo(1, 12);
    expect(p.grandTotal![0]).toBeCloseTo(1, 12);
  });

  it("pct_col: sel dan subtotal / total kolomnya, kolom Total / total keseluruhan, baris Total = 100%", async () => {
    const p = await pivotOf("pcol");
    p.rows.forEach((r, ri) => {
      p.columns.forEach((b, ci) => {
        const v = leaf.get(`${key(r)}|${b}`);
        if (v !== undefined)
          expect(p.cells[ri]![ci]![0]).toBeCloseTo(v / perBulan.get(b as string)!, 9);
      });
      expect(p.rowTotals![ri]![0]).toBeCloseTo(leafTot.get(key(r))! / ALL, 9);
    });
    p.groups.forEach((g, gi) => {
      p.columns.forEach((b, ci) =>
        expect(p.subtotals![gi]![ci]![0]).toBeCloseTo(
          sub.get(`${low(g)}|${b}`)! / perBulan.get(b as string)!,
          9,
        ),
      );
      expect(p.subtotalTotals![gi]![0]).toBeCloseTo(perCabang.get(low(g)!)! / ALL, 9);
    });
    p.columns.forEach((_, ci) => expect(p.columnTotals![ci]![0]).toBeCloseTo(1, 12));
    expect(p.grandTotal![0]).toBeCloseTo(1, 12);
  });
});

describe("AC 3: total berjalan, selisih, % selisih", () => {
  it("sepanjang kolom pemisah (bulan naik) per baris; item pertama kosong; total kosong", async () => {
    const p = await pivotOf("axcol");
    const cell = sumBy((i) => `${cabangOf(i)}|${bulanOf(i)}`);
    expect(p.columns).toEqual(["2026-01-01", "2026-02-01", "2026-03-01"]);
    p.rows.forEach((r, ri) => {
      const v = p.columns.map((b) => cell.get(`${low(r.labels[0])}|${b}`)!);
      let run = 0;
      v.forEach((x, ci) => {
        run += x;
        const [running, diff, pct] = p.cells[ri]![ci]!;
        expect(running).toBeCloseTo(run, 6);
        if (ci === 0) {
          expect(diff).toBeNull();
          expect(pct).toBeNull();
        } else {
          expect(diff).toBeCloseTo(x - v[ci - 1]!, 6);
          expect(pct).toBeCloseTo((x - v[ci - 1]!) / v[ci - 1]!, 9);
        }
      });
      expect(p.rowTotals![ri]).toEqual([null, null, null]);
    });
    p.columnTotals!.forEach((t) => expect(t).toEqual([null, null, null]));
    expect(p.grandTotal).toEqual([null, null, null]);
  });

  it("sepanjang baris terdalam urut label naik, termasuk baris sebelum potongan 200 tampil", async () => {
    const p = await pivotOf("axrow");
    // Urut label turun → tampil R0999..R0800; total berjalan menghitung R0000..R0799 yang tidak tampil.
    expect(p.rows[0]!.labels).toEqual(["R0999"]);
    expect(p.rows).toHaveLength(200);
    p.rows.forEach((r, ri) => {
      const n = Number(String(r.labels[0]).slice(1));
      expect(p.cells[ri]![0]).toEqual([n + 1, 0]);
    });
    expect(p.grandTotal).toEqual([null, null]);
  });

  it("dua baris: reset per kelompok, urut label naik walau tampilan urut nilai; subtotal kosong", async () => {
    const p = await pivotOf("axgrp");
    const leaf = sumBy((i) => `${cabangOf(i)}|${layananOf(i)}`);
    const order = ["Express", "Kargo", "Reguler", null];
    p.rows.forEach((r, ri) => {
      const g = low(r.labels[0]);
      const upto = order.slice(0, order.indexOf(r.labels[1] as string | null) + 1);
      const run = upto.reduce((a, l) => a + (leaf.get(`${g}|${l}`) ?? 0), 0);
      expect(p.cells[ri]![0]![0]).toBeCloseTo(run, 6);
      expect(p.cells[ri]![0]![1]).toBeCloseTo(leaf.get(`${g}|${r.labels[1]}`)!, 6);
    });
    p.subtotals!.forEach((s) => expect(s[0]![0]).toBeNull());
    expect(p.subtotals![0]![0]![1]).not.toBeNull();
  });

  it("sebelumnya 0 atau kosong → % selisih kosong (bukan galat); nilai kosong → selisih kosong", async () => {
    const p = await pivotOf("edge");
    // Jan 10, Feb 0, Mar 5, Apr kosong, Mei 8.
    expect(p.cells.map((c) => c[0])).toEqual([
      [null, null, 10],
      [-10, -1, 10],
      [5, null, 15],
      [null, null, 15],
      [null, null, 23],
    ]);
  });
});

describe("AC 4: grafik", () => {
  it("batang % keseluruhan: N teratas dibagi total semua kategori; total untuk Lainnya = 100%", async () => {
    const r = await query("bar");
    const perCabang = [...sumBy(cabangOf).values()].sort((a, b) => b - a);
    expect(r.columns[1]).toMatchObject({
      label: "% dari total keseluruhan · Total Omzet",
      type: "decimal",
      showAs: "pct_grand",
    });
    expect(r.rows.map((x) => x[1])).toEqual([
      expect.closeTo(perCabang[0]! / ALL, 9),
      expect.closeTo(perCabang[1]! / ALL, 9),
    ]);
    expect(r.categories).toBe(4);
    expect(r.grandTotal).toBe(1);
  });

  it("pai % keseluruhan: irisan + Lainnya = 100%", async () => {
    const r = await query("pie");
    const shown = r.rows.reduce((a, x) => a + (x[1] as number), 0);
    expect(r.grandTotal).toBe(1);
    expect(shown).toBeLessThan(1);
  });

  it("garis N periode terbaru, total berjalan: titik pertama yang tampil memuat periode terpotong", async () => {
    const r = await query("line");
    const perDay = Array.from({ length: 60 }, (_, d) => (d < 40 ? 17 : 16));
    const runAt = (d: number) => perDay.slice(0, d + 1).reduce((a, b) => a + b, 0);
    // Urut label turun (5 hari terbaru: 2026-03-01..02-25), nilai sudah berjalan sejak 1 Jan.
    expect(r.rows.map((x) => x[1])).toEqual([59, 58, 57, 56, 55].map(runAt));
    expect(r.rows[4]![0]).toBe("2026-02-25");
    expect(r.grandTotal).toBeNull();
  });

  it("garis selisih: dihitung dari periode sebelumnya walau terpotong (bukan kosong)", async () => {
    const r = await query("lined");
    expect(r.rows.map((x) => x[1])).toEqual([0, 0, 0, 0, 0]);
  });
});

describe("AC 5: spec lama identik, validasi", () => {
  it("spec tanpa showAs dan showAs none: SQL dan hasil identik", async () => {
    const plan = (name: string) => {
      const c = parseWidgetConfig(WIDGETS[name]!.type, WIDGETS[name]!.spec);
      if (!c.ok) throw new Error(c.message);
      const w = widgetPlan(c.config as Exclude<WidgetConfig, { type: "empty" }>, SCHEMA, {
        page: 0,
      });
      if (!w.ok || w.kind !== "pivot") throw new Error("bukan pivot");
      return buildPivotSql(w.plan, w.pivot, "/x.parquet");
    };
    expect(plan("none")).toEqual(plan("old"));
    expect(plan("old").sql).not.toContain("u AS");
    const [a, b] = [await pivotOf("old"), await pivotOf("none")];
    expect(b).toEqual(a);
    expect(a.values).toEqual([
      { label: "Total Omzet", type: "decimal" },
      { label: "Jumlah baris", type: "count" },
    ]);
  });

  it("grafik tanpa showAs: SQL agregat lama", () => {
    const c = parseWidgetConfig("bar", { ...WIDGETS.bar!.spec, measure: OMZET });
    if (!c.ok) throw new Error(c.message);
    const w = widgetPlan(c.config as Exclude<WidgetConfig, { type: "empty" }>, SCHEMA, { page: 0 });
    if (!w.ok) throw new Error(w.message);
    expect(buildSql(w.plan, "/x.parquet").sql).not.toContain("OVER");
  });

  it("pai hanya % keseluruhan, grafik tanpa % baris/kolom, KPI tanpa showAs, nilai tanggal ditolak", async () => {
    const pie = { ...WIDGETS.pie!.spec, measure: { ...OMZET, showAs: "running" } };
    expect(parseWidgetConfig("pie", pie).ok).toBe(false);
    const bar = { ...WIDGETS.bar!.spec, measure: { ...OMZET, showAs: "pct_row" } };
    expect(parseWidgetConfig("bar", bar).ok).toBe(false);
    expect(
      parseWidgetConfig("line", { ...bar, measure: { ...OMZET, showAs: "diff_prev" } }).ok,
    ).toBe(true);
    const kpi = { sheetId: SHEET, measure: { ...OMZET, showAs: "pct_grand" }, format: fmt };
    expect(parseWidgetConfig("kpi", kpi).ok).toBe(false);
    expect(
      parseWidgetConfig("pivot", { ...WIDGETS.prow!.spec, values: [{ ...OMZET, showAs: "x" }] }).ok,
    ).toBe(false);
    const r = await runWidgetQuery(USER, { widgetId: WID("datemin") }, deps());
    expect(r).toMatchObject({ ok: false, code: "INVALID" });
  });
});
