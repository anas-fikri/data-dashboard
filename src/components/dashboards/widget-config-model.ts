import type { SourceSheet } from "@/features/dashboards/service";
import type { ColumnType } from "@/features/ingest/infer";
import type { Agg } from "@/features/query/spec";
import {
  DEFAULT_FORMAT,
  PIE_AGGS,
  SORT_DEFAULT,
  TABLE_COLUMNS_MAX,
  TOP_N_DEFAULT,
  TOP_N_MAX,
  type ChartSpec,
  type WidgetConfig,
  type WidgetType,
} from "@/features/widgets/spec";

/*
 * Model panel konfigurasi widget (T-011): pilihan yang ditawarkan dan nilai awal yang masuk akal
 * saat jenis/sheet berganti — user langsung melihat hasil, lalu menyesuaikan. Aturan agregasi sama
 * dengan server (resolveSpec T-009). Murni.
 */
export type Source = SourceSheet;
export type SourceColumn = SourceSheet["columns"][number];

export const TYPE_OPTIONS: { type: Exclude<WidgetType, "empty">; label: string }[] = [
  { type: "kpi", label: "Angka" },
  { type: "bar", label: "Batang" },
  { type: "line", label: "Garis" },
  { type: "pie", label: "Pai" },
  { type: "table", label: "Tabel" },
];

export const AGG_LABEL: Record<Agg, string> = {
  sum: "Total",
  avg: "Rata-rata",
  count: "Jumlah baris",
  count_distinct: "Jumlah nilai unik",
  min: "Terkecil",
  max: "Terbesar",
};
export const AGG_ORDER: Agg[] = ["sum", "avg", "count", "count_distinct", "min", "max"];

export const GRAIN_LABEL = {
  day: "Per hari",
  week: "Per minggu",
  month: "Per bulan",
  quarter: "Per kuartal",
  year: "Per tahun",
} as const;

/** Label urutan sesuai jenis kolom pengelompokan (tanggal: terlama/terbaru, teks: A–Z/Z–A). */
export function sortLabel(
  sort: ChartSpec["sort"],
  dimType: ColumnType | undefined,
  chart?: WidgetType,
): string {
  const temporal = !!dimType && isTemporal(dimType);
  // Garis selalu digambar urut waktu; urutan menentukan N titik mana yang diambil.
  if (chart === "line" && temporal) {
    if (sort === "label_desc") return "Periode terbaru";
    if (sort === "label_asc") return "Periode terlama";
  }
  switch (sort) {
    case "value_desc":
      return "Nilai terbesar dulu";
    case "value_asc":
      return "Nilai terkecil dulu";
    case "label_asc":
      return temporal ? "Terlama dulu" : "A–Z";
    case "label_desc":
      return temporal ? "Terbaru dulu" : "Z–A";
  }
}
export const CHART_SORT_ORDER: ChartSpec["sort"][] = [
  "value_desc",
  "value_asc",
  "label_asc",
  "label_desc",
];

const NUMERIC: ColumnType[] = ["integer", "decimal", "duration"];
const TEMPORAL: ColumnType[] = ["date", "timestamp"];
export const isNumeric = (t: ColumnType) => NUMERIC.includes(t);
export const isTemporal = (t: ColumnType) => TEMPORAL.includes(t);

/** Kolom yang boleh dipakai agregasi ini (count tanpa kolom = semua baris). */
export function columnsForAgg(agg: Agg, columns: SourceColumn[]): SourceColumn[] {
  if (agg === "sum" || agg === "avg") return columns.filter((c) => isNumeric(c.type));
  if (agg === "min" || agg === "max") {
    return columns.filter((c) => isNumeric(c.type) || isTemporal(c.type));
  }
  return columns;
}

type Measure = { agg: Agg; column?: number };

/** Agregasi yang ditawarkan: cocok dengan kolom sheet; pai hanya Total/Jumlah baris. */
export function aggOptions(type: WidgetType, columns: SourceColumn[]): Agg[] {
  const allowed: readonly Agg[] = type === "pie" ? PIE_AGGS : AGG_ORDER;
  return AGG_ORDER.filter(
    (a) => allowed.includes(a) && (a === "count" || columnsForAgg(a, columns).length > 0),
  );
}

function defaultMeasure(
  columns: SourceColumn[],
  prev?: Measure,
  allowed: readonly Agg[] = AGG_ORDER,
): Measure {
  if (
    prev &&
    allowed.includes(prev.agg) &&
    (prev.agg === "count" || columnsForAgg(prev.agg, columns).some((c) => c.pos === prev.column))
  ) {
    return prev.agg === "count" ? { agg: "count" } : prev;
  }
  const num = columns.find((c) => isNumeric(c.type));
  return num ? { agg: "sum", column: num.pos } : { agg: "count" };
}

function defaultDimension(
  type: "bar" | "line" | "pie",
  columns: SourceColumn[],
  prev?: ChartSpec["dimension"],
): ChartSpec["dimension"] | null {
  if (prev) {
    const c = columns.find((x) => x.pos === prev.column);
    if (c) return isTemporal(c.type) ? prev : { column: c.pos };
  }
  const date = columns.find((c) => isTemporal(c.type));
  if (type === "line" && date) return { column: date.pos, timeGrain: "month" };
  const text = columns.find((c) => c.type === "text") ?? columns.find((c) => !isNumeric(c.type));
  const pick = text ?? columns[0];
  if (!pick) return null;
  return isTemporal(pick.type) ? { column: pick.pos, timeGrain: "month" } : { column: pick.pos };
}

/**
 * Konfigurasi awal untuk jenis `type` di sheet `sheetId` (atau sheet sebelumnya / pertama), dengan
 * mempertahankan pilihan lama yang masih berlaku. null bila belum ada data yang bisa dipakai.
 */
export function defaultConfig(
  type: Exclude<WidgetType, "empty">,
  sources: Source[],
  prev: WidgetConfig,
  sheetId?: string,
): WidgetConfig | null {
  const prevSheet = prev.type === "empty" ? undefined : prev.spec.sheetId;
  const sheet =
    sources.find((s) => s.id === (sheetId ?? prevSheet) && s.columns.length) ??
    sources.find((s) => s.columns.length);
  if (!sheet) return null;
  const cols = sheet.columns;
  const format = prev.type === "empty" ? DEFAULT_FORMAT : prev.spec.format;
  const prevMeasure =
    prev.type === "kpi" || (prev.type !== "empty" && prev.type !== "table")
      ? (prev.spec as { measure: Measure }).measure
      : undefined;

  if (type === "table") {
    const keep =
      prev.type === "table" ? prev.spec.columns.filter((p) => cols.some((c) => c.pos === p)) : [];
    const columns = keep.length
      ? keep
      : cols.slice(0, Math.min(6, TABLE_COLUMNS_MAX)).map((c) => c.pos);
    return { type, spec: { sheetId: sheet.id, columns, format } };
  }
  const measure = defaultMeasure(cols, prevMeasure, type === "pie" ? PIE_AGGS : AGG_ORDER);
  if (type === "kpi") return { type, spec: { sheetId: sheet.id, measure, format } };

  const prevChart =
    prev.type === "bar" || prev.type === "line" || prev.type === "pie" ? prev.spec : undefined;
  const dimension = defaultDimension(type, cols, prevChart?.dimension);
  if (!dimension) return null;
  return {
    type,
    spec: {
      sheetId: sheet.id,
      dimension,
      measure,
      // Jenis sama (mis. ganti sheet): pertahankan urutan/jumlah; jenis baru: bawaan jenis itu.
      sort: prev.type === type ? prevChart!.sort : SORT_DEFAULT[type],
      topN: prev.type === type ? Math.min(prevChart!.topN, TOP_N_MAX[type]) : TOP_N_DEFAULT[type],
      format,
    },
  };
}

/**
 * Posisi kolom yang dirujuk konfigurasi tetapi tidak (lagi) ada di sheet yang tampil — disembunyikan
 * atau dihapus. Panel menampilkan peringatan dan membuangnya saat user mengubah sesuatu (review M2).
 */
export function missingColumns(config: WidgetConfig, sources: Source[]): number[] {
  if (config.type === "empty") return [];
  const sheet = sources.find((s) => s.id === config.spec.sheetId);
  const has = new Set((sheet?.columns ?? []).map((c) => c.pos));
  const used =
    config.type === "table"
      ? config.spec.columns
      : config.type === "kpi"
        ? [config.spec.measure.column]
        : [config.spec.dimension.column, config.spec.measure.column];
  return used.filter((p): p is number => p !== undefined && !has.has(p));
}
