import { describe, expect, it, vi } from "vitest";
import type { ColumnSchema } from "@/features/ingest/infer";
import { ResultCache } from "@/features/query/cache";
import {
  runWidgetQuery,
  type CachedQuery,
  type QueryDeps,
  type QueryRepo,
} from "@/features/query/service";

/*
 * T-073: widget TANPA pivot tersimpan (spec 1.0.0–1.2.0) harus menghasilkan SQL, parameter, dan kunci
 * cache hasil yang byte-identik dengan sebelum pengikatan pivot tersimpan ada. Snapshot direkam pada
 * commit e2c6cf1 (sebelum T-073) dan tidak boleh berubah.
 */
const DS = "cmv4klj5r0007oczvgiofocpg";
const VER = "cmv4kljx40009oczvdmpurrxf";
const SHEET = "cmv4kljx40009oczvdmpurrxa";
const DASH = "cmv4kljx40009oczvdmpurrd0";
const USER = "u-pemilik";

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
const fmt = { style: "number", decimals: 0 } as const;
const margin = {
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
      { agg: "sum", column: 2 },
    ],
  },
};
const chart = (type: string, extra: Record<string, unknown> = {}) => ({
  type,
  spec: {
    sheetId: SHEET,
    dimension: { column: 1 },
    measure: { agg: "sum", column: 2 },
    sort: "value_desc",
    topN: type === "pie" ? 5 : 12,
    format: fmt,
    ...extra,
  },
});
const WIDGETS: Record<string, { type: string; spec: unknown }> = {
  pivot: {
    type: "pivot",
    spec: {
      sheetId: SHEET,
      rows: [{ column: 1, topN: { n: 3, by: 0 } }, { column: 5 }],
      column: { column: 4, timeGrain: "month" },
      values: [
        { agg: "sum", column: 2 },
        { ...margin, showAs: "pct_col" },
      ],
      sort: "value_desc",
      format: fmt,
      totals: true,
      subtotals: true,
      filters: [{ column: 5, op: "in", values: ["Reguler", null] }],
      crossFilter: true,
    },
  },
  plain: {
    type: "pivot",
    spec: {
      sheetId: SHEET,
      rows: [{ column: 1 }],
      values: [{ agg: "count" }],
      sort: "label_asc",
      format: fmt,
      totals: false,
      subtotals: false,
    },
  },
  bar: chart("bar"),
  barshow: chart("bar", { measure: { agg: "sum", column: 2, showAs: "running" } }),
  line: chart("line", {
    dimension: { column: 4, timeGrain: "month" },
    sort: "label_desc",
    crossFilter: false,
  }),
  pie: chart("pie", { measure: { agg: "count" } }),
  kpi: { type: "kpi", spec: { sheetId: SHEET, measure: margin, format: fmt } },
  kpisum: {
    type: "kpi",
    spec: { sheetId: SHEET, measure: { agg: "sum", column: 2 }, format: fmt },
  },
  table: { type: "table", spec: { sheetId: SHEET, columns: [1, 2, 4], format: fmt } },
};
const WID = (name: string) => `cmv4kljx40009oczvdmpu${name.padEnd(6, "x").slice(0, 6)}`;

function makeDeps() {
  const exec = vi.fn(async (sql: string, _params?: unknown) => ({
    columns: ["n"],
    rows: (sql.startsWith("SELECT count(*) AS n") ? [[250]] : []) as unknown[][],
  }));
  const repo: QueryRepo = {
    ownedDataset: async () => null,
    sheet: async (versionId, sheetId) =>
      versionId === VER && sheetId === SHEET
        ? { typedKey: "parquet/ds/v/s/typed-1.parquet", schemaRevision: 3, schema: SCHEMA }
        : null,
    widget: async (userId, widgetId) => {
      const name = Object.keys(WIDGETS).find((n) => WID(n) === widgetId);
      if (userId !== USER || !name) return null;
      return {
        ...WIDGETS[name]!,
        updatedAt: new Date(0),
        datasetId: DS,
        activeVersionId: VER,
        dashboardId: DASH,
        filterColumns: [{ sheet: "Data", column: "Cabang" }],
        role: "OWNER" as const,
      };
    },
    filterSources: async () => [{ name: "Cabang", type: "text" as const }],
  };
  const cache = new ResultCache<CachedQuery>(1 << 22);
  const set = vi.spyOn(cache, "set");
  const deps: QueryDeps = {
    repo,
    parquet: { acquire: async () => ({ path: "/tmp/t073-legacy.parquet", release: () => {} }) },
    engine: { withSlot: (_u, fn) => fn(), exec },
    cache,
    timeoutMs: 5_000,
    now: () => new Date("2026-10-21T00:00:00Z"),
  };
  return { deps, exec, set };
}

const BODIES: [string, Record<string, unknown>][] = [
  ["pivot", {}],
  ["pivot", { dashboardFilters: [{ column: "Cabang", op: "in", values: ["Jakarta"] }] }],
  ["pivot", { pivotValues: "row1" }],
  ["plain", {}],
  ["bar", {}],
  ["bar", { dashboardFilters: [{ column: "Cabang", op: "in", values: ["Bandung", null] }] }],
  ["barshow", {}],
  ["line", {}],
  ["pie", {}],
  ["kpi", {}],
  ["kpisum", {}],
  ["table", {}],
  ["table", { page: 2, sort: { column: 2, dir: "desc" } }],
];

describe("T-073: widget tanpa pivot tersimpan tidak berubah (SQL + kunci cache)", () => {
  it.each(BODIES)("%s %j", async (name, extra) => {
    const { deps, exec, set } = makeDeps();
    const r = await runWidgetQuery(USER, { widgetId: WID(name), ...extra }, deps);
    expect(r.ok, JSON.stringify(r)).toBe(true);
    expect({
      keys: set.mock.calls.map((c) => c[0]),
      sql: exec.mock.calls.map((c) => ({ sql: c[0], params: c[1] })),
    }).toMatchSnapshot();
  });
});
