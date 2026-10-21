import { copyFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DuckDBInstance } from "@duckdb/node-api";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { ColumnSchema } from "@/features/ingest/infer";
import { ResultCache } from "@/features/query/cache";
import {
  COLUMN_UNAVAILABLE_VIEWER,
  runWidgetQuery,
  type CachedQuery,
  type QueryDeps,
  type QueryRepo,
} from "@/features/query/service";
import type { DashboardAccessRole } from "@/features/sharing/access";
import { REPICK_VALUE, SOURCE_MISMATCH_VIEWER } from "@/features/widgets/bound";
import { MISSING_COLUMN, missingMessage } from "@/features/widgets/remap";
import { QueryEngine } from "@/lib/duckdb/engine";
import { ParquetCache } from "@/lib/duckdb/parquet-cache";

/*
 * T-073 (ADR-0009, rencana G-7 §4.3/§5): widget pivot, bar, line, pie, KPI, dan tabel terikat SATU pivot
 * tersimpan — mesin DuckDB + cache hasil sungguhan, repo palsu yang meniru prismaQueryRepo.widget
 * (pivot tersimpan dibaca bersama widget). Nilai dibandingkan dengan hitungan test dari data yang sama.
 */
const DS = "cmv4klj5r0007oczvgiofocpg";
const DS_OTHER = "cmv4klj5r0007oczvgiofocpo";
const VER = "cmv4kljx40009oczvdmpurrxf";
const SHEET = "cmv4kljx40009oczvdmpurrxa";
const DASH = "cmv4kljx40009oczvdmpurrd0";
const SP = "cmv4kljx40009oczvdmpusp01";
const OWNER = "u-pemilik";
const VIEWER = "u-viewer";
const ROLES: Record<string, DashboardAccessRole> = { [OWNER]: "OWNER", [VIEWER]: "VIEWER" };

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
  col(2, "Omzet", "decimal"),
  col(3, "Biaya", "decimal"),
  col(4, "Tanggal", "date"),
  col(5, "Layanan", "text"),
];
const ROWS = 600;
const cabangOf = (i: number) => `Cabang ${i % 3}`;
const layananOf = (i: number) => (i % 2 ? "Kilat" : "Reguler");
const omzetOf = (i: number) => (i % 50) + 10;
const biayaOf = (i: number) => i % 7;

let root: string;
let source: string;
let engine: QueryEngine;

beforeAll(async () => {
  root = mkdtempSync(join(tmpdir(), "dd-bound-test-"));
  source = join(root, "typed.parquet");
  const db = await DuckDBInstance.create(":memory:");
  const c = await db.connect();
  await c.run(
    `COPY (SELECT (i + 2)::INTEGER AS _row,
                  'Cabang ' || (i % 3) AS c1,
                  CAST(i % 50 + 10 AS DECIMAL(38,6)) AS c2,
                  CAST(i % 7 AS DECIMAL(38,6)) AS c3,
                  DATE '2026-01-01' + CAST(i % 90 AS INTEGER) AS c4,
                  CASE WHEN i % 2 = 1 THEN 'Kilat' ELSE 'Reguler' END AS c5
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

const fmt = { style: "number", decimals: 2 } as const;
/** Margin = (ΣOmzet − ΣBiaya) / Σ(penyebut). */
const margin = (den: 2 | 3) => ({
  kind: "calc",
  label: "Margin",
  expr: {
    op: "div",
    args: [
      {
        op: "sub",
        args: [
          { agg: "sum", column: 2 },
          { agg: "sum", column: 3 },
        ],
      },
      { agg: "sum", column: den },
    ],
  },
});
const pivotSpec = (over: Record<string, unknown> = {}) => ({
  sheetId: SHEET,
  rows: [{ column: 1 }],
  column: { column: 4, timeGrain: "month" },
  values: [{ agg: "sum", column: 2 }, margin(2)],
  sort: "label_asc",
  format: fmt,
  totals: true,
  subtotals: false,
  ...over,
});

interface SavedRow {
  id: string;
  datasetId: string;
  spec: unknown;
  revision: number;
  missingColumns: string[];
}
const BOUND: Record<string, { type: string; spec: unknown }> = {
  pivot: { type: "pivot", spec: { sort: "label_asc", totals: true, subtotals: false } },
  bar: {
    type: "bar",
    spec: { dimension: "row", value: 0, sort: "label_asc", topN: 12, crossFilter: true },
  },
  line: { type: "line", spec: { dimension: "column", value: 0, sort: "label_desc", topN: 24 } },
  pie: { type: "pie", spec: { dimension: "row", value: 0, sort: "value_desc", topN: 5 } },
  kpi: { type: "kpi", spec: { value: 1 } },
  table: { type: "table", spec: { sort: "label_asc", totals: false } },
  stale: { type: "kpi", spec: { value: 5 } },
};
const OTHER = { type: "kpi", spec: { sheetId: SHEET, measure: { agg: "count" }, format: fmt } };
const WID = (name: string) => `cmv4kljx40009oczvdmpu${name.padEnd(6, "x").slice(0, 6)}`;

function setup() {
  const state = {
    saved: {
      id: SP,
      datasetId: DS,
      spec: pivotSpec(),
      revision: 1,
      missingColumns: [],
    } as SavedRow,
  };
  const repo: QueryRepo = {
    ownedDataset: async () => null,
    sheet: async (versionId, sheetId) =>
      versionId === VER && sheetId === SHEET
        ? { typedKey: "parquet/ds/v/s/typed-1.parquet", schemaRevision: 1, schema: SCHEMA }
        : null,
    widget: vi.fn(async (userId: string, widgetId: string) => {
      const role = ROLES[userId];
      if (!role) return null;
      const base = {
        updatedAt: new Date(0),
        datasetId: DS,
        activeVersionId: VER,
        dashboardId: DASH,
        filterColumns: [{ sheet: "Data", column: "Cabang" }],
        role,
      };
      if (widgetId === WID("other")) return { ...OTHER, ...base };
      const name = Object.keys(BOUND).find((n) => WID(n) === widgetId);
      if (!name) return null;
      return {
        ...BOUND[name]!,
        ...base,
        savedPivotId: SP,
        savedPivot: state.saved,
        sourceStamp: `${SP}@${state.saved.revision}`,
      };
    }),
    filterSources: async () => [{ name: "Cabang", type: "text" as const }],
  };
  const parquet = new ParquetCache({
    dir: join(root, "cache"),
    maxBytes: 1 << 30,
    download: async (_key, dest) => copyFileSync(source, dest),
  });
  const exec = vi.spyOn(engine, "exec");
  const deps: QueryDeps = {
    repo,
    parquet,
    engine,
    cache: new ResultCache<CachedQuery>(64 * 1024 * 1024),
    timeoutMs: 30_000,
  };
  return { state, deps, repo, exec };
}

const sumBy = <K>(
  key: (i: number) => K,
  val: (i: number) => number,
  where = (_i: number) => true,
) => {
  const m = new Map<K, number>();
  for (let i = 0; i < ROWS; i++) if (where(i)) m.set(key(i), (m.get(key(i)) ?? 0) + val(i));
  return m;
};
const total = (val: (i: number) => number, where = (_i: number) => true) => {
  let t = 0;
  for (let i = 0; i < ROWS; i++) if (where(i)) t += val(i);
  return t;
};
const SIX = ["pivot", "bar", "line", "pie", "kpi", "table"];
const run = (deps: QueryDeps, name: string, extra: Record<string, unknown> = {}, user = OWNER) =>
  runWidgetQuery(user, { widgetId: WID(name), ...extra }, deps);

describe("AC1: enam widget satu pivot tersimpan berubah serempak, tanpa menunggu TTL", () => {
  it("nilai benar dari pivot tersimpan; edit nilai + field terhitung → muat berikutnya memakai definisi baru; widget lain tetap", async () => {
    const { state, deps } = setup();
    const omzet = sumBy(cabangOf, omzetOf);
    const bar = await run(deps, "bar");
    expect(bar).toMatchObject({ ok: true });
    expect(new Map((bar.ok ? bar.rows : []).map((r) => [r[0], r[1]]))).toEqual(omzet);
    const kpi = await run(deps, "kpi");
    const m1 = (total(omzetOf) - total(biayaOf)) / total(omzetOf);
    expect(kpi.ok && (kpi.rows[0]![0] as number)).toBeCloseTo(m1, 9);
    for (const n of SIX) expect(await run(deps, n), n).toMatchObject({ ok: true });
    // Pivot dan tabel: hasil berbentuk pivot (tabel = pivot rata tanpa kolom pemisah).
    const pivot = await run(deps, "pivot");
    expect(pivot.ok && pivot.pivot?.columns.length).toBeGreaterThan(1);
    const table = await run(deps, "table");
    expect(table.ok && table.pivot).toBeTruthy();
    expect(table.ok && table.columns.map((c) => c.label)).toEqual([
      "Cabang",
      "Total Omzet",
      "Margin",
    ]);
    const other = await run(deps, "other");
    expect(other).toMatchObject({ ok: true, rows: [[ROWS]] });

    // Semua dari cache sekarang.
    for (const n of [...SIX, "other"])
      expect(await run(deps, n), n).toMatchObject({ cached: true });

    // Pemilik mengubah pivot tersimpan: nilai 1 = Total Biaya, margin dibagi Biaya → revisi 2.
    state.saved = {
      ...state.saved,
      spec: pivotSpec({ values: [{ agg: "sum", column: 3 }, margin(3)] }),
      revision: 2,
    };
    for (const n of SIX) expect(await run(deps, n), n).toMatchObject({ ok: true, cached: false });
    const bar2 = await run(deps, "bar");
    expect(new Map((bar2.ok ? bar2.rows : []).map((r) => [r[0], r[1]]))).toEqual(
      sumBy(cabangOf, biayaOf),
    );
    const kpi2 = await run(deps, "kpi");
    const m2 = (total(omzetOf) - total(biayaOf)) / total(biayaOf);
    expect(kpi2.ok && (kpi2.rows[0]![0] as number)).toBeCloseTo(m2, 9);
    const table2 = await run(deps, "table");
    expect(table2.ok && table2.columns.map((c) => c.label)).toEqual([
      "Cabang",
      "Total Biaya",
      "Margin",
    ]);
    // Widget yang tidak terikat tidak tersentuh (masih dari cache, nilai sama).
    expect(await run(deps, "other")).toMatchObject({ ok: true, cached: true, rows: [[ROWS]] });
  });

  it("revisi naik dengan spec yang sama (mis. ganti nama, remap aktivasi) tetap miss — revisi ada di kunci", async () => {
    const { state, deps } = setup();
    expect(await run(deps, "kpi")).toMatchObject({ ok: true, cached: false });
    expect(await run(deps, "kpi")).toMatchObject({ cached: true });
    state.saved = { ...state.saved, revision: 3 };
    expect(await run(deps, "kpi")).toMatchObject({ ok: true, cached: false });
  });

  it("Saring pivot tersimpan berlaku juga untuk grafik dan KPI (SQL WHERE, bukan hanya pivot)", async () => {
    const { state, deps } = setup();
    state.saved = {
      ...state.saved,
      spec: pivotSpec({ filters: [{ column: 5, op: "in", values: ["Reguler"] }] }),
      revision: 2,
    };
    const reg = (i: number) => layananOf(i) === "Reguler";
    const bar = await run(deps, "bar");
    expect(new Map((bar.ok ? bar.rows : []).map((r) => [r[0], r[1]]))).toEqual(
      sumBy(cabangOf, omzetOf, reg),
    );
    const kpi = await run(deps, "kpi");
    const m = (total(omzetOf, reg) - total(biayaOf, reg)) / total(omzetOf, reg);
    expect(kpi.ok && (kpi.rows[0]![0] as number)).toBeCloseTo(m, 9);
    const pivot = await run(deps, "pivot");
    // Pivot terikat: catatan Saring tersimpan tampil di tabel/PDF seperti pivot mandiri.
    expect(pivot.ok && pivot.pivot?.filters).toEqual([
      expect.objectContaining({ label: "Layanan", values: ["Reguler"], saved: true }),
    ]);
  });

  it("filter dashboard dan filter silang tetap berlaku pada widget terikat", async () => {
    const { deps } = setup();
    const r = await run(deps, "bar", {
      dashboardFilters: [{ column: "Cabang", op: "in", values: ["Cabang 1"] }],
    });
    expect(r.ok && r.rows).toEqual([["Cabang 1", sumBy(cabangOf, omzetOf).get("Cabang 1")]]);
    const k = await run(deps, "kpi", {
      dashboardFilters: [{ column: "Cabang", op: "in", values: ["Cabang 1"] }],
    });
    const c1 = (i: number) => cabangOf(i) === "Cabang 1";
    const m = (total(omzetOf, c1) - total(biayaOf, c1)) / total(omzetOf, c1);
    expect(k.ok && (k.rows[0]![0] as number)).toBeCloseTo(m, 9);
  });
});

describe("AC2: D6 — viewer hanya { widgetId, dashboardFilters }", () => {
  it("viewer mendapat hasil yang sama dengan pemilik", async () => {
    const { deps } = setup();
    const owner = await run(deps, "kpi");
    const viewer = await run(deps, "kpi", {}, VIEWER);
    expect(viewer.ok && viewer.rows).toEqual(owner.ok && owner.rows);
  });

  it.each([
    [{ savedPivotId: SP }],
    [{ spec: { sheetId: SHEET } }],
    [{ datasetId: DS }],
    [{ sql: "SELECT 1" }],
  ])("body memuat %j → 400 INVALID tanpa membaca widget", async (extra) => {
    const { deps, repo, exec } = setup();
    exec.mockClear();
    const r = await run(deps, "kpi", extra, VIEWER);
    expect(r).toMatchObject({ ok: false, code: "INVALID" });
    expect(repo.widget).not.toHaveBeenCalled();
    expect(exec).not.toHaveBeenCalled();
  });

  it("pivot tersimpan dataset lain (DB tidak menjaminnya) → NOT_FOUND, tanpa versi widget, cache, atau DuckDB", async () => {
    const { state, deps, exec } = setup();
    exec.mockClear();
    const get = vi.spyOn(deps.cache!, "get");
    state.saved = { ...state.saved, datasetId: DS_OTHER };
    for (const user of [OWNER, VIEWER]) {
      expect(await run(deps, "kpi", {}, user)).toEqual({
        ok: false,
        code: "NOT_FOUND",
        message: "Widget tidak ditemukan.",
      });
    }
    expect(get).not.toHaveBeenCalled();
    expect(exec).not.toHaveBeenCalled();
  });

  it("widget terikat yang pivot tersimpannya hilang dari baris (id tidak cocok) → NOT_FOUND", async () => {
    const { state, deps } = setup();
    state.saved = { ...state.saved, id: "cmv4kljx40009oczvdmpusp99" };
    expect(await run(deps, "pivot")).toMatchObject({ ok: false, code: "NOT_FOUND" });
  });
});

describe("AC4: kolom hilang dan tampilan yang tidak cocok — pesan per widget", () => {
  it("MISSING_COLUMN di pivot tersimpan: widget yang memakainya → COLUMN_UNAVAILABLE (nama untuk pemilik, umum untuk viewer); widget lain tetap jalan", async () => {
    const { state, deps } = setup();
    state.saved = {
      ...state.saved,
      spec: pivotSpec({
        values: [
          { agg: "sum", column: 2 },
          { agg: "sum", column: MISSING_COLUMN },
        ],
      }),
      revision: 2,
      missingColumns: ["Diskon"],
    };
    for (const n of ["pivot", "kpi", "table"]) {
      expect(await run(deps, n), n).toEqual({
        ok: false,
        code: "COLUMN_UNAVAILABLE",
        message: missingMessage(["Diskon"]),
        widgetVersion: new Date(0).toISOString(),
      });
      expect(await run(deps, n, {}, VIEWER)).toMatchObject({
        code: "COLUMN_UNAVAILABLE",
        message: COLUMN_UNAVAILABLE_VIEWER,
      });
    }
    // Grafik memakai nilai 1 (Total Omzet) → tidak terdampak.
    expect(await run(deps, "bar")).toMatchObject({ ok: true });
  });

  it("Saring pivot tersimpan memakai kolom hilang → grafik/KPI juga COLUMN_UNAVAILABLE dengan namanya", async () => {
    const { state, deps } = setup();
    state.saved = {
      ...state.saved,
      spec: pivotSpec({ filters: [{ column: MISSING_COLUMN, op: "in", values: ["x"] }] }),
      revision: 2,
      missingColumns: ["Wilayah"],
    };
    for (const n of ["bar", "kpi"]) {
      expect(await run(deps, n)).toMatchObject({
        code: "COLUMN_UNAVAILABLE",
        message: missingMessage(["Wilayah"]),
      });
    }
  });

  it("T-hbcp: kolom pemisah + Top N baris terdalam + Total berjalan → tabel tampil dengan catatan ignoredShowAs (juga viewer)", async () => {
    const { state, deps } = setup();
    state.saved = {
      ...state.saved,
      spec: pivotSpec({
        rows: [{ column: 1, topN: { n: 2, by: 0 } }],
        values: [{ agg: "sum", column: 2, showAs: "running" }],
      }),
      revision: 2,
    };
    for (const user of [OWNER, VIEWER]) {
      const r = await run(deps, "table", {}, user);
      expect(r, user).toMatchObject({ ok: true, ignoredShowAs: ["Total berjalan"] });
      expect(r.ok && r.pivot?.rows.length).toBeGreaterThan(0);
    }
    // Widget pivot terikat memakai total berjalan sepanjang kolom pemisah, tanpa catatan.
    const p = await run(deps, "pivot");
    expect(p).toMatchObject({ ok: true });
    expect(p.ok && p.ignoredShowAs).toBeUndefined();
  });

  it("tampilan memilih nilai yang sudah dihapus → INVALID 'Pilih ulang nilai di pengaturan widget'", async () => {
    const { deps } = setup();
    const r = await run(deps, "stale", {}, VIEWER);
    // Viewer: pesan umum tanpa menyebut pivot tersimpan (review T-073 L3); pemilik: rinci.
    expect(r).toMatchObject({ ok: false, code: "INVALID", message: SOURCE_MISMATCH_VIEWER });
    expect(!r.ok && r.message.endsWith(REPICK_VALUE)).toBe(true);
    expect(!r.ok && r.message).not.toContain("pivot tersimpan");
    const o = await run(deps, "stale");
    expect(!o.ok && o.message).toContain("pivot tersimpan");
  });
});
