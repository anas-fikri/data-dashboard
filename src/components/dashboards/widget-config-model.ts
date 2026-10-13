import type { SourceSheet } from "@/features/dashboards/service";
import type { ColumnType } from "@/features/ingest/infer";
import type { Agg } from "@/features/query/spec";
import { MISSING_COLUMN } from "@/features/widgets/remap";
import {
  DEFAULT_FORMAT,
  PIE_AGGS,
  SORT_DEFAULT,
  TABLE_COLUMNS_MAX,
  TOP_N_DEFAULT,
  TOP_N_MAX,
  type ChartSort,
  type ChartSpec,
  type ChartType,
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

/**
 * Label urutan sesuai jenis kolom pengelompokan (tanggal: terlama/terbaru, angka: terkecil/terbesar —
 * "A–Z" untuk Bulan 1–12 membingungkan, teks: A–Z/Z–A).
 */
export function sortLabel(
  sort: ChartSpec["sort"],
  dimType: ColumnType | undefined,
  chart?: WidgetType,
): string {
  const temporal = !!dimType && isTemporal(dimType);
  const numeric = !!dimType && isNumeric(dimType);
  // Garis selalu digambar urut waktu; urutan menentukan N titik mana yang diambil.
  if (chart === "line" && temporal) {
    if (sort === "label_desc") return "Periode terbaru";
    if (sort === "label_asc") return "Periode terlama";
    // Spec lama dengan urutan nilai: tetap N titik bernilai terbesar/terkecil, digambar urut waktu.
    return sort === "value_desc" ? "Titik bernilai terbesar" : "Titik bernilai terkecil";
  }
  switch (sort) {
    case "value_desc":
      return "Nilai terbesar dulu";
    case "value_asc":
      return "Nilai terkecil dulu";
    case "label_asc":
      return temporal ? "Terlama dulu" : numeric ? "Terkecil ke terbesar" : "A–Z";
    case "label_desc":
      return temporal ? "Terbaru dulu" : numeric ? "Terbesar ke terkecil" : "Z–A";
  }
}
export const CHART_SORT_ORDER: ChartSpec["sort"][] = [
  "value_desc",
  "value_asc",
  "label_asc",
  "label_desc",
];

/**
 * Pilihan urutan untuk Select. Garis bertanggal hanya periode terbaru/terlama (urutan nilai tidak
 * mengubah urutan gambar); nilai lama di spec tetap jadi pilihan agar tidak tampil kosong.
 */
export function sortOptions(
  chart: ChartType,
  dimType: ColumnType | undefined,
  current: ChartSort,
): { value: ChartSort; label: string }[] {
  const periodOnly = chart === "line" && !!dimType && isTemporal(dimType);
  const order: ChartSort[] = periodOnly ? ["label_desc", "label_asc"] : CHART_SORT_ORDER;
  const values = order.includes(current) ? order : [...order, current];
  return values.map((value) => ({ value, label: sortLabel(value, dimType, chart) }));
}

const NUMERIC: ColumnType[] = ["integer", "decimal", "duration"];
const TEMPORAL: ColumnType[] = ["date", "timestamp"];
export const isNumeric = (t: ColumnType) => NUMERIC.includes(t);
export const isTemporal = (t: ColumnType) => TEMPORAL.includes(t);

/**
 * Kolom yang boleh dipakai agregasi ini (count tanpa kolom = semua baris). Jumlah baris/nilai unik:
 * semua kolom di semua jenis (hasilnya angka, termasuk dari kolom tanggal). Min/maks tanggal hanya
 * untuk KPI: grafik hanya bisa menggambar angka.
 */
export function columnsForAgg(
  agg: Agg,
  columns: SourceColumn[],
  type: WidgetType = "kpi",
): SourceColumn[] {
  if (agg === "sum" || agg === "avg") return columns.filter((c) => isNumeric(c.type));
  if (agg === "min" || agg === "max") {
    const dates = type === "kpi";
    return columns.filter((c) => isNumeric(c.type) || (dates && isTemporal(c.type)));
  }
  return columns;
}

type Measure = { agg: Agg; column?: number };

/** Agregasi yang ditawarkan: cocok dengan kolom sheet; pai hanya Total/Jumlah baris. */
export function aggOptions(type: WidgetType, columns: SourceColumn[]): Agg[] {
  const allowed: readonly Agg[] = type === "pie" ? PIE_AGGS : AGG_ORDER;
  return AGG_ORDER.filter(
    (a) => allowed.includes(a) && (a === "count" || columnsForAgg(a, columns, type).length > 0),
  );
}

function defaultMeasure(
  columns: SourceColumn[],
  prev?: Measure,
  allowed: readonly Agg[] = AGG_ORDER,
  type: WidgetType = "kpi",
): Measure {
  if (
    prev &&
    allowed.includes(prev.agg) &&
    (prev.agg === "count" ||
      columnsForAgg(prev.agg, columns, type).some((c) => c.pos === prev.column))
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
  const measure = defaultMeasure(cols, prevMeasure, type === "pie" ? PIE_AGGS : AGG_ORDER, type);
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
 * Posisi kolom yang dirujuk konfigurasi tetapi tidak (lagi) ada di sheet yang tampil — disembunyikan,
 * dihapus, atau MISSING_COLUMN (tidak ada di data terbaru setelah diganti). Panel menampilkan
 * peringatan, menandai isiannya, dan tidak menyimpan sampai user memilih pengganti (review M2).
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

/** Penjelasan di atas panel: data diganti (MISSING_COLUMN) atau kolom disembunyikan/dihapus. */
export function missingNotice(missing: number[], all = false): string {
  const which = all ? "Semua" : "Sebagian";
  return missing.includes(MISSING_COLUMN)
    ? `${which} kolom yang dipakai widget ini tidak ada di data terbaru (dihapus atau diganti namanya).`
    : `${which} kolom yang dipakai widget ini tidak tersedia lagi (disembunyikan atau dihapus di skema).`;
}

/** Pesan di isian kolom yang nilainya tidak lagi bisa dipilih. */
export function missingColumnText(pos: number): string {
  return pos === MISSING_COLUMN
    ? "Kolom tidak ada di data terbaru — pilih pengganti."
    : "Kolom tidak tersedia lagi — pilih pengganti.";
}

/**
 * Pesan di isian "dari kolom" bila kolom tersimpan tidak bisa dipilih: tidak ada di sheet (tidak
 * tersedia lagi), atau ada tetapi tidak cocok untuk agregasi/jenis ini — mis. spec lama berisi
 * maks. tanggal di grafik (server menolaknya; KPI boleh). undefined bila kolomnya sah.
 */
export function measureColumnText(
  measure: Measure,
  columns: SourceColumn[],
  type: WidgetType,
): string | undefined {
  const { agg, column } = measure;
  if (column === undefined) return undefined;
  const col = columns.find((c) => c.pos === column);
  if (!col) return missingColumnText(column);
  if (columnsForAgg(agg, columns, type).includes(col)) return undefined;
  const minMax = agg === "min" || agg === "max";
  if (minMax && type !== "kpi" && isTemporal(col.type)) {
    return "Kolom tanggal tidak bisa digambar di grafik — pilih kolom angka, atau ubah jenis tampilan ke Angka.";
  }
  const kind = minMax && type === "kpi" ? "angka atau tanggal" : "angka";
  return `${AGG_LABEL[agg]} hanya bisa dari kolom ${kind} — pilih kolom lain.`;
}

/**
 * Kolom nilai ada di sheet tetapi tidak cocok untuk agregasi/jenis ini (spec lama). Panel menandai
 * isiannya dan tidak menyimpan sampai diganti — server akan menolaknya.
 */
export function measureMismatch(config: WidgetConfig, sources: Source[]): boolean {
  if (config.type === "empty" || config.type === "table") return false;
  const { column } = config.spec.measure;
  const cols = sources.find((s) => s.id === config.spec.sheetId)?.columns ?? [];
  if (!cols.some((c) => c.pos === column)) return false;
  return measureColumnText(config.spec.measure, cols, config.type) !== undefined;
}

type TableConfig = Extract<WidgetConfig, { type: "table" }>;
type ChartConfig = Extract<WidgetConfig, { type: ChartType }>;

/**
 * Tabel tanpa kolom yang tidak lagi tersedia. Bila semuanya hilang: tetap apa adanya (user memilih
 * sendiri), kecuali `fallback` — kolom pertama sheet (tombol di peringatan panel).
 */
export function withoutMissingColumns(
  config: TableConfig,
  sources: Source[],
  fallback = false,
): WidgetConfig {
  const gone = new Set(missingColumns(config, sources));
  if (!gone.size) return config;
  const columns = config.spec.columns.filter((p) => !gone.has(p));
  if (!columns.length) return (fallback && defaultConfig("table", sources, config)) || config;
  return {
    ...config,
    spec: {
      ...config.spec,
      columns,
      formatColumns: config.spec.formatColumns?.filter((p) => columns.includes(p)),
    },
  };
}

/**
 * Ganti kolom pengelompokan: tanggal → per bulan. Garis yang kini bertanggal memakai urutan periode
 * (pilihan urutan nilai tidak ditawarkan lagi di sana).
 */
export function withDimension(
  config: ChartConfig,
  column: number,
  type: ColumnType | undefined,
): ChartConfig {
  const temporal = !!type && isTemporal(type);
  const byValue = config.spec.sort === "value_desc" || config.spec.sort === "value_asc";
  return {
    ...config,
    spec: {
      ...config.spec,
      dimension: temporal ? { column, timeGrain: "month" } : { column },
      sort: config.type === "line" && temporal && byValue ? SORT_DEFAULT.line : config.spec.sort,
    },
  };
}
