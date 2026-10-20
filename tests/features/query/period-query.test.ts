import { copyFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DuckDBInstance } from "@duckdb/node-api";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { ColumnSchema } from "@/features/ingest/infer";
import { PERIOD_COLUMN, withPeriodColumn } from "@/features/query/period-column";
import {
  execOnParquet,
  runWidgetQuery,
  type QueryDeps,
  type QueryRepo,
} from "@/features/query/service";
import { sheetSource, type SegmentFile } from "@/features/query/source";
import { buildFilterValuesSql } from "@/features/query/sql";
import { QueryEngine } from "@/lib/duckdb/engine";
import { ParquetCache } from "@/lib/duckdb/parquet-cache";

/*
 * T-058: kolom sistem Periode + pemangkasan segmen di atas DuckDB sungguhan. Sheet periode = 6 segmen
 * bulanan (Maret diunggah terakhir: ordinal terakhir, rowBase terbesar; Februari tanpa kolom c5 →
 * proyeksi skema campuran). Pembanding = satu file gabungan dengan `_period` dan kolom Periode fisik
 * (tanpa proyeksi, tanpa pemangkasan). Setiap widget × filter memberi jawaban identik, dan hanya
 * segmen yang beririsan dengan filter yang disewa.
 */
const DS = "cmv4klj5r0007oczvgiofocpg";
const VER = "cmv4kljx40009oczvdmpurrxf";
const USER = "user-pemilik";
const VIEWER = "user-viewer";
const VIEW_DASH = "cmv4kljx40009oczvdmpudashv";
const SHEETS = {
  one: "cmv4kljx40009oczvdmpusone",
  per: "cmv4kljx40009oczvdmpusper",
  single: "cmv4kljx40009oczvdmpussgl",
} as const;
const MONTHS = ["01", "02", "04", "05", "06", "03"]; // urutan manifest (Maret diunggah terakhir)
const PER = 50;

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
const RAW: ColumnSchema[] = [
  col(1, "Cabang", "text"),
  col(3, "Tanggal", "date"),
  col(4, "Omzet", "decimal"),
  col(5, "Kode", "integer"),
];
const SCHEMA = withPeriodColumn(RAW, { grain: "MONTH", source: "COLUMN", latest: "2026-06-01" });

let root: string;
let engine: QueryEngine;
const segs: SegmentFile[] = [];

/** Baris i (0-based) periode bulan `m`: rowBase per urutan unggah, tanggal 1–28. */
const select = (m: string, k: number, c5: boolean) => `
  (${(k + 1) * 1000} + i + 2)::BIGINT AS _row, (i + 2)::INTEGER AS _src_row,
  DATE '2026-${m}-01' AS _period,
  'Cabang ' || (i % 4) AS c1,
  DATE '2026-${m}-01' + CAST(i % 28 AS INTEGER) AS c3,
  CAST((i * 37) % 1000 + 0.5 + ${Number(m)} AS DECIMAL(38,6)) AS c4
  ${c5 ? ", CAST(i AS BIGINT) AS c5" : ""}`;

beforeAll(async () => {
  root = mkdtempSync(join(tmpdir(), "dd-period-query-"));
  const db = await DuckDBInstance.create(":memory:");
  const c = await db.connect();
  const parts: string[] = [];
  for (const [k, m] of MONTHS.entries()) {
    const c5 = m !== "02";
    const file = `seg-${m}.parquet`;
    await c.run(
      `COPY (SELECT ${select(m, k, c5)} FROM range(${PER}) t(i) ORDER BY _row) TO '${join(root, file)}' (FORMAT parquet)`,
    );
    segs.push({
      typedKey: file,
      legacyRow: false,
      columns: c5 ? [1, 3, 4, 5] : [1, 3, 4],
      period: {
        key: `2026-${m}`,
        start: `2026-${m}-01`,
        min: `2026-${m}-01T00:00:00`,
        max: `2026-${m}-28T00:00:00`,
      },
    });
    parts.push(
      `SELECT * REPLACE (${c5 ? "c5" : "CAST(NULL AS BIGINT)"} AS c5), _period AS c${PERIOD_COLUMN} FROM (SELECT ${select(m, k, true)} FROM range(${PER}) t(i))`,
    );
  }
  await c.run(
    `COPY (${parts.join(" UNION ALL ")}) TO '${join(root, "all.parquet")}' (FORMAT parquet)`,
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

const fmt = { style: "auto", decimals: 0 } as const;
const P = PERIOD_COLUMN;
const WIDGETS: Record<string, { type: string; spec: Record<string, unknown> }> = {
  kpi: { type: "kpi", spec: { measure: { agg: "sum", column: 4 }, format: fmt } },
  kpi5: { type: "kpi", spec: { measure: { agg: "count", column: 5 }, format: fmt } },
  bar: {
    type: "bar",
    spec: {
      dimension: { column: P, timeGrain: "month" },
      measure: { agg: "sum", column: 4 },
      sort: "label_asc",
      topN: 12,
      format: fmt,
    },
  },
  table: { type: "table", spec: { columns: [P, 1, 3, 4, 5], format: fmt } },
  pivot: {
    type: "pivot",
    spec: {
      rows: [{ column: 1 }],
      column: { column: P, timeGrain: "month" },
      values: [{ agg: "sum", column: 4 }],
      sort: "label_asc",
      format: fmt,
      totals: true,
      subtotals: false,
    },
  },
};
const WID = (name: string, sheet: string) =>
  `cmv4kljx40009oczvd${name.padEnd(4, "x").slice(0, 4)}${sheet.slice(-3)}`;

function deps(leased: string[] = []): QueryDeps {
  const repo: QueryRepo = {
    ownedDataset: async () => null,
    // Kolom filter dashboard (D6) + tipenya: Periode sistem dan Tanggal; dashboard viewer hanya Tanggal.
    filterSources: async ({ dashboardId }) =>
      dashboardId === VIEW_DASH
        ? [{ name: "Tanggal", type: "date" }]
        : [
            { name: "Periode", type: "date" },
            { name: "Tanggal", type: "date" },
          ],
    sheet: async (versionId, sheetId) => {
      if (versionId !== VER) return null;
      if (sheetId === SHEETS.one)
        return { typedKey: "all.parquet", schemaRevision: 1, schema: SCHEMA };
      if (sheetId === SHEETS.per)
        return {
          typedKey: segs[0]!.typedKey,
          schemaRevision: 1,
          schema: SCHEMA,
          segments: segs,
          period: { column: 3 },
        };
      if (sheetId === SHEETS.single)
        return {
          typedKey: "seg-02.parquet",
          schemaRevision: 1,
          schema: withPeriodColumn(RAW, { grain: "MONTH", source: "LABEL", latest: "2026-02-01" }),
          segments: [segs[1]!],
          period: { column: null },
        };
      return null;
    },
    widget: async (userId, widgetId) => {
      if (userId === VIEWER && widgetId === WID("kpi", SHEETS.per)) {
        // Dashboard viewer tanpa kolom filter Periode (pemilik tidak memasangnya).
        return {
          type: "kpi",
          spec: { ...WIDGETS.kpi!.spec, sheetId: SHEETS.per },
          updatedAt: new Date(0),
          datasetId: DS,
          activeVersionId: VER,
          filterColumns: [{ sheet: "Data", column: "Tanggal" }],
          dashboardId: VIEW_DASH,
          role: "VIEWER" as const,
        };
      }
      for (const [name, w] of Object.entries(WIDGETS)) {
        for (const sheetId of Object.values(SHEETS)) {
          if (WID(name, sheetId) !== widgetId || userId !== USER) continue;
          return {
            type: w.type,
            spec: { ...w.spec, sheetId },
            updatedAt: new Date(0),
            datasetId: DS,
            activeVersionId: VER,
            filterColumns: [
              { sheet: "Data", column: "Periode" },
              { sheet: "Data", column: "Tanggal" },
            ],
            dashboardId: "cmv4kljx40009oczvdmpudash0",
            role: "OWNER" as const,
          };
        }
      }
      return null;
    },
  };
  const cache = new ParquetCache({
    dir: join(root, "cache"),
    maxBytes: 1 << 30,
    maxDownloads: 2,
    download: async (key, dest) => copyFileSync(join(root, key), dest),
  });
  return {
    repo,
    parquet: {
      acquire: (key, opts) => {
        leased.push(key);
        return cache.acquire(key, opts);
      },
      acquireMany: (keys, opts) => {
        leased.push(...keys);
        return cache.acquireMany(keys, opts);
      },
    },
    engine,
    cache: null,
    timeoutMs: 30_000,
  };
}

async function answer(
  name: string,
  sheetId: string,
  body: Record<string, unknown>,
  leased?: string[],
) {
  const r = await runWidgetQuery(USER, { widgetId: WID(name, sheetId), ...body }, deps(leased));
  if (!r.ok) throw new Error(`${name}@${sheetId}: ${r.code} ${r.message}`);
  const {
    ms: _ms,
    cached: _c,
    widgetVersion: _v,
    ...rest
  } = r as typeof r & {
    ms?: number;
    cached?: boolean;
    widgetVersion?: string;
  };
  return rest;
}

const ALL = MONTHS.map((m) => `seg-${m}.parquet`).sort();
const FILTERS: [string, Record<string, unknown>[], string[]][] = [
  ["tanpa filter", [], ALL],
  [
    "Periode = Maret",
    [{ column: "Periode", op: "in", values: ["2026-03-01"] }],
    ["seg-03.parquet"],
  ],
  [
    "Tanggal 10 Feb–5 Apr (kolom periode, min/max aktual)",
    [{ column: "Tanggal", op: "range", gte: "2026-02-10", lte: "2026-04-05" }],
    ["seg-02.parquet", "seg-03.parquet", "seg-04.parquet"],
  ],
  [
    "Periode terbaru",
    [{ column: "Periode", op: "preset", preset: "latest_period" }],
    ["seg-06.parquet"],
  ],
  [
    "Periode ≥ Mei DAN Tanggal ≤ 3 Mei",
    [
      { column: "Periode", op: "range", gte: "2026-05-01" },
      { column: "Tanggal", op: "range", lte: "2026-05-03" },
    ],
    ["seg-05.parquet"],
  ],
];
const CASES = Object.keys(WIDGETS).flatMap((w) =>
  FILTERS.map(([label, f, keys]) => [w, label, f, keys] as const),
);

describe("T-058 AC2: pemangkasan segmen — hasil identik, hanya segmen beririsan disewa", () => {
  it.each(CASES)("%s · %s", async (name, _label, dashboardFilters, keys) => {
    const one = await answer(name, SHEETS.one, { dashboardFilters });
    const leased: string[] = [];
    const per = await answer(name, SHEETS.per, { dashboardFilters }, leased);
    expect(per).toEqual(one);
    expect([...new Set(leased)].sort()).toEqual(keys);
  });

  it("tabel halaman 2 identik (urutan + pemangkasan)", async () => {
    const one = await answer("table", SHEETS.one, { page: 2 });
    expect(await answer("table", SHEETS.per, { page: 2 })).toEqual(one);
  });
});

describe("T-058 AC1/AC3: dimensi Periode kronologis, urutan bawaan tabel (_period, _row)", () => {
  it("grafik per Periode: satu batang per bulan, Jan…Jun", async () => {
    const r = (await answer("bar", SHEETS.per, {})) as { rows: unknown[][] };
    expect(r.rows.map((x) => x[0])).toEqual([
      "2026-01-01",
      "2026-02-01",
      "2026-03-01",
      "2026-04-01",
      "2026-05-01",
      "2026-06-01",
    ]);
  });

  it("tabel tanpa urut: Maret (diunggah terakhir, _row terbesar) tetap di antara Feb dan Apr", async () => {
    const p1 = (await answer("table", SHEETS.per, { page: 1 })) as { rows: unknown[][] };
    // 50 baris/periode, 100/halaman: halaman 2 = Maret lalu April.
    expect(p1.rows[0]![0]).toBe("2026-03-01");
    expect(p1.rows[99]![0]).toBe("2026-04-01");
    const periods = p1.rows.map((x) => x[0] as string);
    expect([...periods].sort()).toEqual(periods);
  });
});

describe("T-058 (review T-049 L3 / T-057): filter _period pada skema campuran dan satu file berproyeksi NULL", () => {
  it("satu segmen tanpa c5 (proyeksi NULL) — filter Periode berlaku, c5 kosong", async () => {
    const r = await answer("kpi5", SHEETS.single, {
      dashboardFilters: [{ column: "Periode", op: "in", values: ["2026-02-01"] }],
    });
    expect((r as { rows: unknown[][] }).rows[0]![0]).toBe(0);
    const k = (await answer("kpi", SHEETS.single, {
      dashboardFilters: [{ column: "Periode", op: "in", values: ["2026-02-01"] }],
    })) as { rows: unknown[][] };
    const one = (await answer("kpi", SHEETS.one, {
      dashboardFilters: [{ column: "Periode", op: "in", values: ["2026-02-01"] }],
    })) as { rows: unknown[][] };
    expect(k.rows).toEqual(one.rows);
  });

  it("nilai slicer Periode dari sumber skema campuran = enam awal bulan", async () => {
    const src = sheetSource({
      typedKey: "x",
      schema: SCHEMA,
      segments: segs,
      period: { column: 3 },
    });
    const r = await execOnParquet(USER, src, deps(), (path) =>
      buildFilterValuesSql({ col: `c${PERIOD_COLUMN}`, type: "date" }, null, path),
    );
    if (!r.ok) throw new Error(r.message);
    expect(r.out.rows.map((x) => (x[0] as Date).toISOString().slice(0, 10))).toEqual([
      "2026-01-01",
      "2026-02-01",
      "2026-03-01",
      "2026-04-01",
      "2026-05-01",
      "2026-06-01",
    ]);
  });
});

describe("T-058 AC3 (D6): viewer hanya memakai filter Periode bila dipasang pemilik", () => {
  it("dashboard tanpa kolom filter Periode → INVALID tanpa query, untuk viewer", async () => {
    const leased: string[] = [];
    const r = await runWidgetQuery(
      VIEWER,
      {
        widgetId: WID("kpi", SHEETS.per),
        dashboardFilters: [{ column: "Periode", op: "preset", preset: "latest_period" }],
      },
      deps(leased),
    );
    expect(r).toMatchObject({ ok: false, code: "INVALID" });
    expect(leased).toEqual([]);
    const ok = await runWidgetQuery(
      VIEWER,
      {
        widgetId: WID("kpi", SHEETS.per),
        dashboardFilters: [{ column: "Tanggal", op: "range", gte: "2026-06-01" }],
      },
      deps(leased),
    );
    expect(ok.ok).toBe(true);
    expect([...new Set(leased)]).toEqual(["seg-06.parquet"]);
  });
});
