/*
 * Filter dashboard (T-012) — bentuk yang sama dengan kontrak server (body.dashboardFilters di
 * /api/query) dan status di URL (?f=). Kolom dirujuk lewat nama tampil, dicocokkan tanpa peduli
 * besar/kecil huruf dan spasi (sama dengan remap widget). Status dari URL selalu disaring terhadap
 * kolom yang diizinkan dashboard (kolom filter + kolom kategori grafik yang boleh menyaring): filter
 * lain akan ditolak server untuk SEMUA widget, jadi dibuang di sini tanpa pesan. Murni — dipakai
 * halaman server (membaca ?f=) dan klien.
 */
import { z } from "zod";
import type { FilterColumnView } from "@/features/dashboards/filter-columns";
import type { ColumnType } from "@/features/ingest/infer";
import { normName } from "@/features/widgets/remap";
import { parseWidgetConfig } from "@/features/widgets/spec";

export type { FilterColumnView } from "@/features/dashboards/filter-columns";
export { normName };

/** Nilai terpilih maksimum per slicer (sama dengan batas server). */
export const SELECTED_MAX = 500;
/** Panjang ?f= maksimum yang ditulis ke URL — lebih dari itu URL berisiko ditolak server (431). */
export const URL_PARAM_MAX = 6000;
export const PRESETS = ["this_month", "this_quarter", "ytd"] as const;
export type Preset = (typeof PRESETS)[number];
export type FilterValue = string | number | boolean | null;
export type Bound = string | number;

export type DashFilter =
  | { column: string; op: "in"; values: FilterValue[] }
  | { column: string; op: "range"; gte?: Bound; lte?: Bound; lt?: Bound }
  | { column: string; op: "preset"; preset: Preset };

export interface CrossFilter {
  widgetId: string;
  filter: DashFilter;
}
export interface FilterState {
  filters: DashFilter[];
  cross?: CrossFilter;
}
export const EMPTY_STATE: FilterState = { filters: [] };

const name = z.string().min(1).max(200);
const scalar = z.union([z.string().max(1000), z.number().finite(), z.boolean(), z.null()]);
const bound = z.union([z.string().max(40), z.number().finite()]);
const filterSchema = z.union([
  z
    .object({ column: name, op: z.literal("in"), values: z.array(scalar).min(1).max(SELECTED_MAX) })
    .strict(),
  z
    .object({
      column: name,
      op: z.literal("range"),
      gte: bound.optional(),
      lte: bound.optional(),
      lt: bound.optional(),
    })
    .strict()
    .refine((f) => f.gte !== undefined || f.lte !== undefined || f.lt !== undefined),
  z.object({ column: name, op: z.literal("preset"), preset: z.enum(PRESETS) }).strict(),
]);
const stateSchema = z
  .object({
    filters: z.array(filterSchema).max(20).default([]),
    cross: z
      .object({ widgetId: z.string().regex(/^[a-z0-9]{20,32}$/), filter: filterSchema })
      .strict()
      .optional(),
  })
  .strict();

/** ?f= (JSON ter-encode) → status; rusak/tidak valid → kosong tanpa pesan. */
export function parseFilterParam(raw: string | string[] | undefined): FilterState {
  const text = Array.isArray(raw) ? raw[0] : raw;
  if (!text || text.length > URL_PARAM_MAX * 2) return EMPTY_STATE;
  try {
    const p = stateSchema.safeParse(JSON.parse(text));
    return p.success ? (p.data as FilterState) : EMPTY_STATE;
  } catch {
    return EMPTY_STATE;
  }
}

/** Status → nilai ?f= (null bila tidak ada filter). */
export function encodeFilterParam(state: FilterState): string | null {
  if (!state.filters.length && !state.cross) return null;
  return JSON.stringify(state.cross ? state : { filters: state.filters });
}

const sameValue = (a: FilterValue, b: FilterValue) => a === b;
const uniqueValues = (vs: FilterValue[]) =>
  vs.filter((v, i) => vs.findIndex((w) => sameValue(v, w)) === i);

/** Kunci pembanding filter (urutan nilai/kunci tidak berpengaruh). */
export function filterKey(f: DashFilter): string {
  const col = normName(f.column);
  if (f.op === "in") {
    const vs = uniqueValues(f.values)
      .map((v) => JSON.stringify(v))
      .sort();
    return `${col}|in|${vs.join(",")}`;
  }
  if (f.op === "preset") return `${col}|preset|${f.preset}`;
  return `${col}|range|${JSON.stringify([f.gte ?? null, f.lte ?? null, f.lt ?? null])}`;
}

const NUMERIC: ColumnType[] = ["integer", "decimal", "duration"];
const TEMPORAL: ColumnType[] = ["date", "timestamp"];
export const isNumericType = (t: ColumnType) => NUMERIC.includes(t);
export const isTemporalType = (t: ColumnType) => TEMPORAL.includes(t);

/** Jenis kontrol per tipe kolom: slicer (pilih nilai), rentang tanggal, atau rentang angka. */
export type ControlKind = "slicer" | "date" | "number";
export const controlOf = (t: ColumnType): ControlKind =>
  isTemporalType(t) ? "date" : isNumericType(t) ? "number" : "slicer";

/** Operasi filter cocok dengan jenis kontrol kolomnya (filter basi setelah tipe kolom diubah dibuang). */
function fits(f: DashFilter, t: ColumnType): boolean {
  const kind = controlOf(t);
  if (f.op === "in") return kind === "slicer";
  if (f.op === "preset") return kind === "date";
  const ok = (b: Bound | undefined) =>
    b === undefined || (kind === "number" ? typeof b === "number" : typeof b === "string");
  return kind !== "slicer" && ok(f.gte) && ok(f.lte) && ok(f.lt);
}

/**
 * Status yang benar-benar dipakai: filter hanya untuk kolom filter yang tersedia (satu per kolom,
 * nama kolom dari dashboard), nilai `in` tanpa ganda; filter silang hanya dari widget yang ada dan
 * kolom kategori yang diizinkan.
 */
export function sanitize(
  state: FilterState,
  opts: { columns: FilterColumnView[]; crossColumns: readonly string[]; widgetIds: string[] },
): FilterState {
  const seen = new Set<string>();
  const filters: DashFilter[] = [];
  for (const f of state.filters) {
    const col = opts.columns.find((c) => c.available && normName(c.column) === normName(f.column));
    if (!col || seen.has(normName(col.column)) || !fits(f, col.type)) continue;
    seen.add(normName(col.column));
    filters.push(
      f.op === "in"
        ? { ...f, column: col.column, values: uniqueValues(f.values).slice(0, SELECTED_MAX) }
        : { ...f, column: col.column },
    );
  }
  const c = state.cross;
  const crossOk =
    !!c &&
    opts.widgetIds.includes(c.widgetId) &&
    opts.crossColumns.some((n) => normName(n) === normName(c.filter.column));
  return crossOk ? { filters, cross: c } : { filters };
}

/** Filter yang dikirim widget: filter global + filter silang (kecuali widget sumbernya sendiri). */
export function filtersFor(state: FilterState, widgetId: string): DashFilter[] {
  const out = [...state.filters];
  if (state.cross && state.cross.widgetId !== widgetId) out.push(state.cross.filter);
  return out;
}

/** Tanggal naive "YYYY-MM-DD" ± n hari (aritmetika UTC, tanpa zona). */
export function addDays(iso: string, n: number): string {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return new Date(Date.UTC(y!, m! - 1, d! + n)).toISOString().slice(0, 10);
}

/** Tanggal kalender yang sah ("2026-02-30" tidak). */
export function isIsoDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  return addDays(s, 0) === s;
}

/**
 * Kolom kategori grafik yang boleh menyaring widget lain, dihitung di klien dari widget + sumber data
 * mode edit (spec yang baru disimpan langsung berlaku tanpa memuat ulang halaman). Aturannya sama
 * dengan server (crossFilterColumnsOf): grafik dengan crossFilter ≠ false, kolom tampil di sheetnya.
 */
export function crossColumnsOf(
  widgets: { type: string; spec: unknown }[],
  sources: { id: string; columns: { pos: number; name: string }[] }[],
): string[] {
  const out = new Map<string, string>();
  for (const w of widgets) {
    const p = parseWidgetConfig(w.type, w.spec);
    if (!p.ok || !("dimension" in p.config.spec) || p.config.spec.crossFilter === false) continue;
    const { sheetId, dimension } = p.config.spec;
    const col = sources
      .find((s) => s.id === sheetId)
      ?.columns.find((c) => c.pos === dimension.column);
    if (col && !out.has(normName(col.name))) out.set(normName(col.name), col.name);
  }
  return [...out.values()];
}
