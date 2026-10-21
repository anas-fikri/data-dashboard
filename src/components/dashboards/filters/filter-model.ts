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
import type { Grain } from "@/features/query/spec";
import { GRAINS, crossFilterPositions, parseWidgetConfig } from "@/features/widgets/spec";

export type { FilterColumnView } from "@/features/dashboards/filter-columns";
export { normName };

/** Nilai terpilih maksimum per slicer (sama dengan batas server). */
export const SELECTED_MAX = 500;
/** Panjang ?f= maksimum yang ditulis ke URL — lebih dari itu URL berisiko ditolak server (431). */
export const URL_PARAM_MAX = 6000;
export const PRESETS = [
  "this_month",
  "this_quarter",
  "ytd",
  "last_month",
  "last_quarter",
  "last_year",
  "last_30_days",
  "last_90_days",
  /** Periode terbaru (T-058): hanya kolom sistem Periode; dihitung server dari manifest. */
  "latest_period",
] as const;
export type Preset = (typeof PRESETS)[number];
export type FilterValue = string | number | boolean | null;
export type Bound = string | number;

export type DashFilter =
  | { column: string; op: "in"; values: FilterValue[] }
  /** "Semua kecuali …" (slicer: pilih semua lalu lepas sebagian). */
  | { column: string; op: "not_in"; values: FilterValue[] }
  | { column: string; op: "range"; gte?: Bound; lte?: Bound; lt?: Bound }
  | { column: string; op: "preset"; preset: Preset };

export interface CrossFilter {
  widgetId: string;
  filter: DashFilter;
}
/** Field pivot yang disaring pembaca (T-f4a7): baris 1–4 (T-070) atau kolom pemisah. */
export type PivotFieldRole = "row0" | "row1" | "row2" | "row3" | "column";
export interface PivotFilter {
  field: PivotFieldRole;
  /** Nama kolom + grain field saat saringan dibuat (field yang sudah diganti → dilewati server). */
  column: string;
  grain?: Grain;
  op: "in" | "not_in";
  values: FilterValue[];
}
export interface FilterState {
  filters: DashFilter[];
  cross?: CrossFilter;
  /** Saringan pivot per id widget (T-f4a7); hanya berlaku untuk widget itu. */
  pivot?: Record<string, PivotFilter[]>;
}
export const EMPTY_STATE: FilterState = { filters: [] };

const name = z.string().min(1).max(200);
const scalar = z.union([z.string().max(1000), z.number().finite(), z.boolean(), z.null()]);
const bound = z.union([z.string().max(40), z.number().finite()]);
const values = z.array(scalar).min(1).max(SELECTED_MAX);
const filterSchema = z.union([
  z.object({ column: name, op: z.literal("in"), values }).strict(),
  z.object({ column: name, op: z.literal("not_in"), values }).strict(),
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
const widgetId = z.string().regex(/^[a-z0-9]{20,32}$/);
const pivotFilterSchema = z
  .object({
    field: z.enum(["row0", "row1", "row2", "row3", "column"]),
    column: name,
    grain: z.enum(GRAINS).optional(),
    op: z.enum(["in", "not_in"]),
    values,
  })
  .strict();
const stateSchema = z
  .object({
    filters: z.array(filterSchema).max(20).default([]),
    cross: z.object({ widgetId, filter: filterSchema }).strict().optional(),
    pivot: z.record(widgetId, z.array(pivotFilterSchema).max(5)).optional(),
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
  const pivot = state.pivot && Object.keys(state.pivot).length ? state.pivot : undefined;
  if (!state.filters.length && !state.cross && !pivot) return null;
  return JSON.stringify({
    filters: state.filters,
    ...(state.cross ? { cross: state.cross } : {}),
    ...(pivot ? { pivot } : {}),
  });
}

const sameValue = (a: FilterValue, b: FilterValue) => a === b;
const uniqueValues = (vs: FilterValue[]) =>
  vs.filter((v, i) => vs.findIndex((w) => sameValue(v, w)) === i);

/** Kunci pembanding filter (urutan nilai/kunci tidak berpengaruh). */
export function filterKey(f: DashFilter): string {
  const col = normName(f.column);
  if (f.op === "in" || f.op === "not_in") {
    const vs = uniqueValues(f.values)
      .map((v) => JSON.stringify(v))
      .sort();
    return `${col}|${f.op}|${vs.join(",")}`;
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
  if (f.op === "in" || f.op === "not_in") return kind === "slicer";
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
      f.op === "in" || f.op === "not_in"
        ? { ...f, column: col.column, values: uniqueValues(f.values).slice(0, SELECTED_MAX) }
        : { ...f, column: col.column },
    );
  }
  const c = state.cross;
  const crossOk =
    !!c &&
    opts.widgetIds.includes(c.widgetId) &&
    opts.crossColumns.some((n) => normName(n) === normName(c.filter.column));
  // Saringan pivot: hanya widget yang ada, satu saringan per field, nilai tanpa ganda.
  const pivot: Record<string, PivotFilter[]> = {};
  for (const [id, list] of Object.entries(state.pivot ?? {})) {
    if (!opts.widgetIds.includes(id)) continue;
    const kept = list
      .filter((f, i) => list.findIndex((g) => g.field === f.field) === i)
      .map((f) => ({ ...f, values: uniqueValues(f.values).slice(0, SELECTED_MAX) }));
    if (kept.length) pivot[id] = kept;
  }
  return {
    filters,
    ...(crossOk ? { cross: c } : {}),
    ...(Object.keys(pivot).length ? { pivot } : {}),
  };
}

/**
 * Satu kontrol per nama kolom: filter berlaku global per nama (semua sheet), jadi kolom bernama sama
 * dari sheet lain (data lama, sebelum pengaturan menolaknya) tidak menjadi kontrol kedua. Yang
 * tersedia didahulukan.
 */
export function oneControlPerName(columns: FilterColumnView[]): FilterColumnView[] {
  const out = new Map<string, FilterColumnView>();
  for (const c of columns) {
    const prev = out.get(normName(c.column));
    if (!prev || (!prev.available && c.available)) out.set(normName(c.column), c);
  }
  return [...out.values()];
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
 * Label sakelar filter silang di pengaturan grafik — juga dirujuk peringatan dialog share sebagai cara
 * menghapus kolom kategori dari daftar kolom lintas sheet (review T-016 R2-UI-3), jadi satu sumber.
 */
export const CROSS_FILTER_LABEL = "Klik grafik menyaring widget lain";
/** Sakelar yang sama untuk widget pivot (T-f4a7): label baris/kolom yang diklik menjadi filter. */
export const PIVOT_CROSS_FILTER_LABEL = "Klik label menyaring widget lain";

/**
 * Kolom kategori grafik yang boleh menyaring widget lain, dihitung di klien dari widget + sumber data
 * mode edit (spec yang baru disimpan langsung berlaku tanpa memuat ulang halaman). Aturannya sama
 * dengan server (crossFilterColumnsOf): grafik dengan crossFilter ≠ false, pivot dengan crossFilter =
 * true (crossFilterPositions), kolom tampil di sheetnya.
 */
export function crossColumnsOf(
  widgets: { type: string; spec: unknown }[],
  sources: { id: string; columns: { pos: number; name: string }[] }[],
): string[] {
  const out = new Map<string, string>();
  for (const w of widgets) {
    const p = parseWidgetConfig(w.type, w.spec);
    if (!p.ok || p.config.type === "empty") continue;
    const sheet = sources.find((s) => s.id === p.config.spec.sheetId);
    for (const pos of crossFilterPositions(p.config)) {
      const col = sheet?.columns.find((c) => c.pos === pos);
      if (col && !out.has(normName(col.name))) out.set(normName(col.name), col.name);
    }
  }
  return [...out.values()];
}
