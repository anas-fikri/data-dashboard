/*
 * Spec pivot lama (1–2 field baris, ≤ 3 nilai) untuk uji "SQL + kunci cache identik" T-070: golden
 * di pivot-levels.test.ts dihitung dari HEAD 52486eb (sebelum T-070) dengan fungsi legacyHashes di
 * bawah. Murni.
 */
import { createHash } from "node:crypto";
import type { ColumnSchema } from "@/features/ingest/infer";
import { resultKey } from "@/features/query/cache";
import { buildPivotSql, buildPivotValuesSql } from "@/features/query/pivot";
import { widgetPlan, type WidgetQueryBody } from "@/features/query/widget";
import { parseWidgetConfig, type WidgetConfig } from "@/features/widgets/spec";

export const LEGACY_SHEET = "cmv4kljx40009oczvdmpurrxa";
const S = LEGACY_SHEET;
const col = (pos: number, name: string, type: ColumnSchema["type"]) =>
  ({
    pos,
    name,
    original: name,
    type,
    hidden: false,
    nullPct: 0,
    distinctCount: 0,
    samples: [],
  }) as unknown as ColumnSchema;
export const LEGACY_SCHEMA: ColumnSchema[] = [
  col(1, "Cabang", "text"),
  col(2, "Layanan", "text"),
  col(3, "Tanggal", "date"),
  col(4, "Omzet", "decimal"),
  col(5, "Qty", "integer"),
  col(6, "Aktif", "boolean"),
];
const f = { style: "rupiah", decimals: 0 } as const;
const margin = {
  kind: "calc",
  label: "Margin",
  expr: {
    op: "div",
    args: [
      {
        op: "sub",
        args: [
          { agg: "sum", column: 4 },
          { agg: "sum", column: 5 },
        ],
      },
      { agg: "sum", column: 4 },
    ],
  },
};

type Case = [name: string, spec: Record<string, unknown>, body?: Partial<WidgetQueryBody>];
const base = { sheetId: S, format: f, sort: "value_desc", totals: true, subtotals: true };
export const LEGACY_CASES: Case[] = [
  ["1 baris, 1 nilai", { ...base, rows: [{ column: 1 }], values: [{ agg: "sum", column: 4 }] }],
  [
    "1 baris + kolom, 3 nilai",
    {
      ...base,
      rows: [{ column: 1 }],
      column: { column: 3, timeGrain: "month" },
      values: [{ agg: "sum", column: 4 }, { agg: "count" }, { agg: "avg", column: 5 }],
    },
  ],
  [
    "2 baris + kolom + subtotal, 3 nilai",
    {
      ...base,
      rows: [{ column: 1 }, { column: 2 }],
      column: { column: 3, timeGrain: "month" },
      values: [{ agg: "sum", column: 4 }, { agg: "count" }, { agg: "max", column: 5 }],
    },
  ],
  [
    "2 baris tanpa subtotal/total, urut label",
    {
      ...base,
      sort: "label_desc",
      totals: false,
      subtotals: false,
      rows: [{ column: 1 }, { column: 3, timeGrain: "quarter" }],
      values: [{ agg: "count_distinct", column: 2 }],
    },
  ],
  [
    "2 baris + kolom, showAs semua jenis",
    {
      ...base,
      rows: [{ column: 1 }, { column: 2 }],
      column: { column: 3, timeGrain: "month" },
      values: [
        { agg: "sum", column: 4, showAs: "pct_row" },
        { agg: "sum", column: 4, showAs: "pct_col" },
        { agg: "count", showAs: "running" },
      ],
    },
  ],
  [
    "2 baris tanpa kolom, selisih + % grand",
    {
      ...base,
      sort: "value_asc",
      rows: [{ column: 1 }, { column: 3, timeGrain: "month" }],
      values: [
        { agg: "sum", column: 4, showAs: "diff_prev" },
        { agg: "sum", column: 4, showAs: "pct_diff_prev" },
        { agg: "sum", column: 5, showAs: "pct_grand" },
      ],
    },
  ],
  [
    "1 baris tanpa kolom, % baris",
    {
      ...base,
      rows: [{ column: 2 }],
      values: [
        { agg: "sum", column: 4, showAs: "pct_row" },
        { agg: "count", showAs: "running" },
      ],
    },
  ],
  [
    "field terhitung + Saring + filter silang",
    {
      ...base,
      rows: [{ column: 1 }, { column: 2 }],
      column: { column: 6 },
      values: [margin, { agg: "sum", column: 4 }],
      filters: [{ column: 2, op: "not_in", values: ["Kargo", null] }],
      crossFilter: true,
    },
  ],
  [
    "saringan pembaca baris 2 + kolom",
    {
      ...base,
      rows: [{ column: 1 }, { column: 2 }],
      column: { column: 3, timeGrain: "month" },
      values: [{ agg: "sum", column: 4 }],
    },
    {
      pivotFilters: [
        { field: "row1", column: "Layanan", op: "in", values: ["Express", null] },
        {
          field: "column",
          column: "Tanggal",
          grain: "month",
          op: "not_in",
          values: ["2026-01-01"],
        },
      ],
    },
  ],
  [
    "daftar nilai baris 2",
    {
      ...base,
      rows: [{ column: 1 }, { column: 2 }],
      values: [{ agg: "sum", column: 4 }],
    },
    {
      pivotValues: "row1",
      pivotFilters: [{ field: "row0", column: "Cabang", op: "in", values: ["Jakarta"] }],
    },
  ],
];

const sha = (v: unknown) => createHash("sha256").update(JSON.stringify(v)).digest("hex");

/** [kunci cache widget, hash SQL + parameter] satu spec lama — sama dengan service.ts runWidget. */
export function legacyHashes(spec: Record<string, unknown>, body: Partial<WidgetQueryBody> = {}) {
  const c = parseWidgetConfig("pivot", spec);
  if (!c.ok) throw new Error(c.message);
  const w = widgetPlan(c.config as Exclude<WidgetConfig, { type: "empty" }>, LEGACY_SCHEMA, {
    page: 0,
    ...body,
  });
  if (!w.ok || w.kind !== "pivot") throw new Error(w.ok ? "bukan pivot" : w.message);
  const show = w.plan.measures.some((m) => m.showAs && m.showAs !== "none")
    ? { show: w.plan.measures.map((m) => m.showAs ?? "none") }
    : {};
  const parts = { datasetId: "d", versionId: "v", sheetId: S, schemaRevision: 1 };
  const list = w.pivot.list !== undefined;
  const key = resultKey({
    ...parts,
    spec: list
      ? { pivotValues: w.spec, shape: w.pivot, dash: [] }
      : { pivot: w.spec, shape: w.pivot, dash: [], ...show },
  });
  const sql = list
    ? buildPivotValuesSql(w.plan, w.pivot, w.pivot.list!, 500, "/x")
    : buildPivotSql(w.plan, w.pivot, "/x");
  return [key, sha(sql)] as const;
}
