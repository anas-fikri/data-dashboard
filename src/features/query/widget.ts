/*
 * Query dari widget (T-011): /api/query menerima { widgetId, filters?, page?, sort? } dan spec diambil
 * dari widget di DB, bukan dari klien. Spec merujuk kolom lewat posisi; di sini posisi diterjemahkan ke
 * nama kolom skema aktif lalu masuk resolveSpec T-009 (aturan tipe/agregasi/filter yang sama).
 * Kolom yang disembunyikan atau hilang → "tidak tersedia" untuk widget ini saja. Murni (tanpa I/O).
 */
import { z } from "zod";
import type { ColumnSchema } from "@/features/ingest/infer";
import { TABLE_PAGE_SIZE, type ChartSort, type WidgetConfig } from "@/features/widgets/spec";
import { FILTER_OPS, filterScalar, resolveSpec, type Plan, type QuerySpec } from "./spec";

/** Halaman tabel maksimum (100 baris/halaman → 10 juta baris). */
export const TABLE_PAGE_MAX = 100_000;

const cuid = z.string().regex(/^[a-z0-9]{20,32}$/);
const pos = z.number().int().min(1).max(16_384);

export const widgetBodySchema = z
  .object({
    widgetId: cuid,
    /** Filter dashboard (T-012) — kolom lewat posisi, aturan nilai sama dengan T-009. */
    filters: z
      .array(
        z
          .object({
            column: pos,
            op: z.enum(FILTER_OPS),
            value: filterScalar.optional(),
            values: z.array(filterScalar).max(500).optional(),
          })
          .strict(),
      )
      .max(20)
      .default([]),
    page: z.number().int().min(0).max(TABLE_PAGE_MAX).default(0),
    sort: z
      .object({ column: pos, dir: z.enum(["asc", "desc"]) })
      .strict()
      .optional(),
  })
  .strict();
export type WidgetQueryBody = z.infer<typeof widgetBodySchema>;

export type WidgetPlan =
  | { ok: true; kind: "agg"; spec: QuerySpec; plan: Plan }
  | {
      ok: true;
      kind: "table";
      spec: QuerySpec;
      plan: Plan;
      sort: { index: number; dir: "asc" | "desc" } | null;
      page: number;
    }
  | { ok: false; code: "COLUMN_UNAVAILABLE" | "INVALID"; message: string };

const SORT: Record<ChartSort, { by: string; dir: "asc" | "desc" }> = {
  value_desc: { by: "m0", dir: "desc" },
  value_asc: { by: "m0", dir: "asc" },
  label_asc: { by: "d0", dir: "asc" },
  label_desc: { by: "d0", dir: "desc" },
};

export function widgetPlan(
  config: Exclude<WidgetConfig, { type: "empty" }>,
  schema: ColumnSchema[],
  body: WidgetQueryBody,
): WidgetPlan {
  const byPos = new Map(schema.map((c) => [c.pos, c]));
  let unavailable: string | null = null;
  const name = (p: number): string => {
    const c = byPos.get(p);
    if (!c) {
      unavailable ??= "Kolom yang dipakai widget ini sudah tidak ada di data. Atur ulang widget.";
      return "";
    }
    if (c.hidden) {
      unavailable ??= `Kolom "${c.name}" disembunyikan di skema, jadi widget ini tidak bisa ditampilkan. Tampilkan lagi kolomnya di halaman skema atau atur ulang widget.`;
      return "";
    }
    return c.name;
  };

  const base = { sheetId: config.spec.sheetId };
  const filters: QuerySpec["filters"] = body.filters.map((f) => ({
    column: name(f.column),
    op: f.op,
    ...(f.value !== undefined ? { value: f.value } : {}),
    ...(f.values !== undefined ? { values: f.values } : {}),
  }));
  let spec: QuerySpec;
  let table: { sort: { index: number; dir: "asc" | "desc" } | null } | null = null;
  switch (config.type) {
    case "kpi": {
      const m = config.spec.measure;
      spec = {
        ...base,
        dimensions: [],
        measures: [{ agg: m.agg, ...(m.column ? { column: name(m.column) } : {}) }],
        filters,
        sort: [],
        limit: 1,
      };
      break;
    }
    case "table": {
      const cols = config.spec.columns;
      let sort: { index: number; dir: "asc" | "desc" } | null = null;
      if (body.sort) {
        // Urutan hanya untuk kolom yang tampil di tabel ini, bukan seluruh skema (catatan T-011).
        const index = cols.indexOf(body.sort.column);
        if (index < 0) {
          return { ok: false, code: "INVALID", message: "Urutan hanya untuk kolom di tabel ini." };
        }
        sort = { index, dir: body.sort.dir };
      }
      spec = {
        ...base,
        dimensions: cols.map((c) => ({ column: name(c) })),
        measures: [],
        filters,
        sort: [],
        limit: TABLE_PAGE_SIZE,
      };
      table = { sort };
      break;
    }
    default: {
      const { dimension: d, measure: m } = config.spec;
      spec = {
        ...base,
        dimensions: [
          { column: name(d.column), ...(d.timeGrain ? { timeGrain: d.timeGrain } : {}) },
        ],
        measures: [{ agg: m.agg, ...(m.column ? { column: name(m.column) } : {}) }],
        filters,
        sort: [SORT[config.spec.sort]],
        limit: config.spec.topN,
      };
    }
  }
  if (unavailable) return { ok: false, code: "COLUMN_UNAVAILABLE", message: unavailable };
  const resolved = resolveSpec(spec, schema);
  if (!resolved.ok) return { ok: false, code: "INVALID", message: resolved.message };
  return table
    ? { ok: true, kind: "table", spec, plan: resolved.plan, sort: table.sort, page: body.page }
    : { ok: true, kind: "agg", spec, plan: resolved.plan };
}
