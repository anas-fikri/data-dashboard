import type { SourceSheet } from "@/features/dashboards/service";
import type { ColumnType } from "@/features/ingest/infer";
import type { Agg } from "@/features/query/spec";
import { MISSING_COLUMN } from "@/features/widgets/remap";
import {
  DEFAULT_FORMAT,
  PIE_AGGS,
  SHOW_AS_FOR,
  SORT_DEFAULT,
  TABLE_COLUMNS_MAX,
  TOP_N_DEFAULT,
  TOP_N_MAX,
  PIVOT_VALUES_MAX,
  columnsOf,
  isCalcValue,
  type CalcValue,
  type ChartSort,
  type ChartSpec,
  type ChartType,
  type ShowAs,
  type WidgetConfig,
  type WidgetType,
} from "@/features/widgets/spec";
import { isAdditiveCalc } from "@/features/widgets/calc";
import { defaultPivot } from "./pivot-config-model";

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
  { type: "pivot", label: "Pivot" },
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

/**
 * Pilihan "Nilai" di panel (T-3z0y). Spec tetap memakai agg "count": tanpa kolom = Jumlah baris (semua baris),
 * dengan kolom = Jumlah terisi (baris yang kolom itu berisi; sel kosong/hanya spasi sudah NULL sejak ingest),
 * setara COUNTA di Excel.
 */
export type AggChoice = Agg | "count_filled";
export const COUNT_FILLED_LABEL = "Jumlah terisi";

export const aggChoiceOf = (m: { agg: Agg; column?: number }): AggChoice =>
  m.agg === "count" && m.column !== undefined ? "count_filled" : m.agg;

/** Nama ukuran untuk teks panel: "Total Omzet", "Jumlah baris", "Jumlah terisi Resi". */
export function measureText(m: { agg: Agg; column?: number }, name: (pos: number) => string) {
  if (m.agg === "count") {
    return m.column === undefined ? AGG_LABEL.count : `${COUNT_FILLED_LABEL} ${name(m.column)}`;
  }
  return `${AGG_LABEL[m.agg]} ${m.column === undefined ? "kolom" : name(m.column)}`;
}

/** Opsi "Nilai": "Jumlah terisi" tepat di bawah "Jumlah baris" bila sheet punya kolom. */
export function aggChoiceOptions(
  type: WidgetType,
  columns: SourceColumn[],
): { value: AggChoice; label: string }[] {
  return aggOptions(type, columns).flatMap((a): { value: AggChoice; label: string }[] =>
    a === "count" && columns.length > 0
      ? [
          { value: "count", label: AGG_LABEL.count },
          { value: "count_filled", label: COUNT_FILLED_LABEL },
        ]
      : [{ value: a, label: AGG_LABEL[a] }],
  );
}

/** Ukuran setelah pilihan "Nilai" berganti: kolom lama dipertahankan bila masih boleh dipakai. */
export function measureForChoice(
  choice: AggChoice,
  prev: { agg: Agg; column?: number },
  columns: SourceColumn[],
  type: WidgetType,
): { agg: Agg; column?: number } {
  if (choice === "count") return { agg: "count" };
  const agg: Agg = choice === "count_filled" ? "count" : choice;
  const allowed = columnsForAgg(agg, columns, type);
  const keep = allowed.some((c) => c.pos === prev.column);
  return { agg, column: keep ? prev.column! : allowed[0]!.pos };
}

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
    // KPI dan pivot bisa menampilkan tanggal terkecil/terbesar; grafik hanya angka.
    const dates = type === "kpi" || type === "pivot";
    return columns.filter((c) => isNumeric(c.type) || (dates && isTemporal(c.type)));
  }
  return columns;
}

type Measure = { agg: Agg; column?: number };

/** Agregasi yang ditawarkan: cocok dengan kolom sheet; pai hanya Total/Jumlah baris/Jumlah terisi. */
export function aggOptions(type: WidgetType, columns: SourceColumn[]): Agg[] {
  const allowed: readonly Agg[] = type === "pie" ? PIE_AGGS : AGG_ORDER;
  return AGG_ORDER.filter(
    (a) => allowed.includes(a) && (a === "count" || columnsForAgg(a, columns, type).length > 0),
  );
}

export function defaultMeasure(
  columns: SourceColumn[],
  prev?: Measure,
  allowed: readonly Agg[] = AGG_ORDER,
  type: WidgetType = "kpi",
): Measure {
  if (prev && allowed.includes(prev.agg)) {
    // Jumlah terisi tetap memakai kolomnya bila kolom itu ada di sheet ini; selain itu Jumlah baris.
    if (prev.agg === "count") {
      return prev.column !== undefined && columns.some((c) => c.pos === prev.column)
        ? prev
        : { agg: "count" };
    }
    if (columnsForAgg(prev.agg, columns, type).some((c) => c.pos === prev.column)) return prev;
  }
  const num = columns.find((c) => isNumeric(c.type));
  return num ? { agg: "sum", column: num.pos } : { agg: "count" };
}

/**
 * Grain bawaan dimensi tanggal: per bulan; kolom sistem Periode (T-058) memakai satuan periodenya
 * sehingga label seperti "Mar 2026" / "K1 2026" tanpa memecah periode.
 */
export const defaultGrain = (c: Pick<SourceColumn, "period"> | undefined) => c?.period ?? "month";

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
  if (type === "line" && date) return { column: date.pos, timeGrain: defaultGrain(date) };
  const text = columns.find((c) => c.type === "text") ?? columns.find((c) => !isNumeric(c.type));
  const pick = text ?? columns[0];
  if (!pick) return null;
  return isTemporal(pick.type)
    ? { column: pick.pos, timeGrain: defaultGrain(pick) }
    : { column: pick.pos };
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
  const prevAny =
    prev.type === "pivot"
      ? prev.spec.values[0]
      : prev.type === "kpi" || (prev.type !== "empty" && prev.type !== "table")
        ? prev.spec.measure
        : undefined;
  const prevMeasure = prevAny && !isCalcValue(prevAny) ? prevAny : undefined;

  if (type === "table") {
    const keep =
      prev.type === "table" ? prev.spec.columns.filter((p) => cols.some((c) => c.pos === p)) : [];
    const columns = keep.length
      ? keep
      : cols.slice(0, Math.min(6, TABLE_COLUMNS_MAX)).map((c) => c.pos);
    return { type, spec: { sheetId: sheet.id, columns, format } };
  }
  // Field terhitung ikut ke KPI/batang/garis/pivot di sheet yang sama (rumusnya berlaku sama; KPI
  // tanpa cara tampil); pai hanya rumus aditif (isAdditiveCalc) — selain itu kembali ke ukuran bawaan
  // dan panel memberi tahu (droppedCalcNotice).
  const keepCalc =
    prevAny &&
    isCalcValue(prevAny) &&
    prevSheet === sheet.id &&
    (type !== "pie" || isAdditiveCalc(prevAny.expr))
      ? prevAny
      : undefined;
  const kept =
    keepCalc ?? defaultMeasure(cols, prevMeasure, type === "pie" ? PIE_AGGS : AGG_ORDER, type);
  // "Tampilkan nilai sebagai" (T-067) hanya ikut ke jenis yang mendukung cara itu (KPI tidak; pai
  // hanya % keseluruhan; grafik tanpa % baris/kolom).
  const { showAs, ...measure } = kept as Measure & { showAs?: ShowAs };
  if (type === "kpi") return { type, spec: { sheetId: sheet.id, measure, format } };
  const shownMeasure =
    showAs && SHOW_AS_FOR[type].includes(showAs) ? { ...measure, showAs } : measure;
  if (type === "pivot") {
    const spec = defaultPivot(sheet.id, cols, prev, shownMeasure, format);
    return spec ? { type, spec } : null;
  }

  const prevChart =
    prev.type === "bar" || prev.type === "line" || prev.type === "pie" ? prev.spec : undefined;
  const dimension = defaultDimension(type, cols, prevChart?.dimension);
  if (!dimension) return null;
  return {
    type,
    spec: {
      sheetId: sheet.id,
      dimension,
      measure: shownMeasure,
      // Jenis sama (mis. ganti sheet): pertahankan urutan/jumlah; jenis baru: bawaan jenis itu.
      sort: prev.type === type ? prevChart!.sort : SORT_DEFAULT[type],
      topN: prev.type === type ? Math.min(prevChart!.topN, TOP_N_MAX[type]) : TOP_N_DEFAULT[type],
      format,
    },
  };
}

/** Field terhitung (nilai pertama pivot, atau ukuran grafik/KPI) di konfigurasi ini. */
export function calcOf(c: WidgetConfig): CalcValue | undefined {
  if (c.type === "empty" || c.type === "table") return undefined;
  const v = c.type === "pivot" ? c.spec.values[0] : c.spec.measure;
  return v && isCalcValue(v) ? v : undefined;
}

/**
 * Bawa field terhitung yang sedang dipakai ke konfigurasi jenis lain di sheet yang sama (juga ke
 * pengaturan jenis itu yang diingat panel): ukuran grafik/KPI diganti rumusnya (KPI tanpa cara tampil,
 * grafik hanya cara tampil yang didukung), pivot mendapatkannya sebagai nilai pertama. Pai hanya rumus
 * aditif; tabel dan sheet lain tidak.
 */
export function carryCalc(prev: WidgetConfig, next: WidgetConfig): WidgetConfig {
  const calc = calcOf(prev);
  if (!calc || next.type === "empty" || next.type === "table") return next;
  if (prev.type === "empty" || prev.spec.sheetId !== next.spec.sheetId) return next;
  if (next.type === "pie" && !isAdditiveCalc(calc.expr)) return next;
  const { showAs, ...plain } = calc as CalcValue & { showAs?: ShowAs };
  if (next.type === "kpi") return { ...next, spec: { ...next.spec, measure: plain } };
  if (next.type === "pivot") {
    const rest = next.spec.values.filter((v) => !(isCalcValue(v) && v.label === calc.label));
    return {
      ...next,
      spec: { ...next.spec, values: [calc, ...rest].slice(0, PIVOT_VALUES_MAX) },
    };
  }
  const measure = showAs && SHOW_AS_FOR[next.type].includes(showAs) ? calc : plain;
  return { ...next, spec: { ...next.spec, measure } };
}

/**
 * Pemberitahuan saat berganti jenis/sheet membuang field terhitung (T-068 L3): pai hanya menerima
 * rumus penjumlahan/pengurangan Total atau Jumlah baris, tabel baris mentah tidak punya ukuran, dan
 * rumus tidak dibawa ke sheet lain (kolomnya berbeda). null bila tidak ada yang dibuang.
 */
export function droppedCalcNotice(prev: WidgetConfig, next: WidgetConfig): string | null {
  const calc = calcOf(prev);
  if (!calc || next.type === "empty") return null;
  const kept =
    next.type === "pivot"
      ? next.spec.values.some((v) => isCalcValue(v) && v.label === calc.label)
      : !!calcOf(next);
  if (kept) return null;
  const reason =
    next.type === "table"
      ? "tabel menampilkan baris mentah, bukan ukuran"
      : prev.type !== "empty" && prev.spec.sheetId !== next.spec.sheetId
        ? "rumusnya memakai kolom sheet lain"
        : "pai hanya untuk rumus yang menjumlah atau mengurangkan Total atau Jumlah baris";
  return `Field terhitung “${calc.label}” tidak dipakai di sini karena ${reason}. Kembali ke jenis sebelumnya untuk memakainya lagi.`;
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
  return columnsOf(config).filter((p) => !has.has(p));
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
  const cols = sources.find((s) => s.id === config.spec.sheetId)?.columns ?? [];
  const measures = config.type === "pivot" ? config.spec.values : [config.spec.measure];
  return measures.some(
    (m) =>
      !isCalcValue(m) &&
      cols.some((c) => c.pos === m.column) &&
      measureColumnText(m, cols, config.type) !== undefined,
  );
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
  period?: SourceColumn["period"],
): ChartConfig {
  const temporal = !!type && isTemporal(type);
  const byValue = config.spec.sort === "value_desc" || config.spec.sort === "value_asc";
  return {
    ...config,
    spec: {
      ...config.spec,
      dimension: temporal ? { column, timeGrain: defaultGrain({ period }) } : { column },
      // Kolom sistem Periode (T-058) pada batang: kronologis (bisa diubah lewat Urutkan).
      sort:
        config.type === "line" && temporal && byValue
          ? SORT_DEFAULT.line
          : config.type === "bar" && period
            ? "label_asc"
            : config.spec.sort,
    },
  };
}

export type SaveStatus = "idle" | "saving" | "saved" | "error";

/**
 * Status simpanan yang ditampilkan panel. Kegagalan dicatat editor (saveError) sampai simpanan widget
 * ini berhasil — juga lewat "Coba lagi"/"Selesai" di toolbar. Jadi alasan dari editor menang (juga di
 * panel yang dibuka ulang setelah gagal), dan "error" panel tanpa alasan dari editor = sudah tersimpan.
 */
export function panelSaveStatus(own: SaveStatus, saveError: string | undefined): SaveStatus {
  if (own === "saving") return own;
  if (saveError !== undefined) return "error";
  return own === "error" ? "saved" : own;
}
