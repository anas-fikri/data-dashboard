/*
 * Spec widget (T-011): disimpan di Widget.spec, divalidasi zod per tipe (enum tertutup, batas jumlah).
 * Kolom dirujuk lewat posisi fisik (pos di skema sheet, = c<pos> di typed.parquet), bukan nama tampil:
 * mengganti nama kolom di editor skema tidak merusak widget, sedangkan kolom yang disembunyikan tetap
 * ditolak saat query (pesan "kolom tidak tersedia" di widget itu saja). Murni (tanpa I/O) — dipakai
 * server dan form konfigurasi di klien.
 */
import { z } from "zod";
import type { Agg, Grain } from "@/features/query/spec";
import { calcExprSchema, calcLabelSchema, calcLeaves, isAdditiveCalc, type CalcExpr } from "./calc";

export const WIDGET_TYPES = ["empty", "table", "kpi", "bar", "line", "pie", "pivot"] as const;
export type WidgetType = (typeof WIDGET_TYPES)[number];
export const CHART_TYPES = ["bar", "line", "pie"] as const;
export type ChartType = (typeof CHART_TYPES)[number];

export const AGGS = [
  "sum",
  "avg",
  "count",
  "count_distinct",
  "min",
  "max",
] as const satisfies Agg[];
export const GRAINS = ["day", "week", "month", "quarter", "year"] as const satisfies Grain[];
export const CHART_SORTS = ["value_desc", "value_asc", "label_asc", "label_desc"] as const;
export type ChartSort = (typeof CHART_SORTS)[number];

export const TABLE_PAGE_SIZE = 100;
export const TABLE_COLUMNS_MAX = 20;
/**
 * Batas kategori per tipe grafik. Pai: 5 irisan teratas + "Lainnya" (sisanya dijumlahkan) — lebih dari
 * itu warna berulang dan persen tidak terbaca (review desain T-011 H1).
 */
export const TOP_N_MAX: Record<ChartType, number> = { bar: 50, line: 1000, pie: 5 };
export const TOP_N_DEFAULT: Record<ChartType, number> = { bar: 12, line: 365, pie: 5 };
/** Pai hanya untuk ukuran yang bisa dijumlahkan (bagian dari keseluruhan). */
export const PIE_AGGS = ["sum", "count"] as const satisfies Agg[];
export const SORT_DEFAULT: Record<ChartType, ChartSort> = {
  bar: "value_desc",
  // Garis: N periode TERBARU (ditampilkan urut waktu naik) — bukan N tertua.
  line: "label_desc",
  pie: "value_desc",
};

const sheetId = z.string().regex(/^[a-z0-9]{20,32}$/);
/** Kolom terakhir yang bisa ada di sheet (batas xlsx, sama dengan maxCols parser). */
export const MAX_COLUMN = 16_384;
/**
 * Penanda kolom lama yang tidak ada di versi data terbaru (lihat widgets/remap.ts). Di luar rentang
 * kolom sungguhan agar tidak pernah tertukar dengan kolom ke-16.384; spec tetap valid sehingga kartu
 * dan panel bisa menyebut kolom yang hilang.
 */
export const MISSING_COLUMN = MAX_COLUMN + 1;
/**
 * Kolom sistem "Periode" (T-058, rencana G-6 §4.10): `_period` sheet periode, diproyeksikan sumber
 * query sebagai c<PERIOD_COLUMN> (features/query/source.ts). Di luar rentang kolom sungguhan dan
 * MISSING_COLUMN; hanya ada di skema yang dibaca lapisan query/dashboard, tidak pernah disimpan.
 */
export const PERIOD_COLUMN = MAX_COLUMN + 2;
/**
 * Kolom urut tabel dari klien (widget /api/query dan ekspor): kolom sungguhan atau kolom sistem
 * Periode (T-058) — tidak ada posisi lain di atas MAX_COLUMN.
 */
export const sortColumnSchema = z.union([
  z.number().int().min(1).max(MAX_COLUMN),
  z.literal(PERIOD_COLUMN),
]);
/** Posisi kolom di skema sheet (1-based, sama dengan c<pos>), MISSING_COLUMN, atau PERIOD_COLUMN. */
const column = z.number().int().min(1).max(PERIOD_COLUMN);

/**
 * Format angka. "auto" (bawaan): bilangan bulat tanpa desimal, desimal maks. 2 angka di belakang
 * koma — kolom rasio 0,07 tidak tampil "0" (review desain T-011 H8).
 */
export const formatSchema = z
  .object({
    style: z.enum(["auto", "number", "percent", "rupiah"]),
    decimals: z.number().int().min(0).max(4),
  })
  .strict();
export type NumberFormat = z.infer<typeof formatSchema>;
export const DEFAULT_FORMAT: NumberFormat = { style: "auto", decimals: 0 };

const needsColumn = {
  check: (m: { agg: Agg; column?: number }) => m.agg === "count" || m.column !== undefined,
  message: "Agregasi ini membutuhkan kolom",
};
const measureBase = z.object({ agg: z.enum(AGGS), column: column.optional() }).strict();
const measure = measureBase.refine(needsColumn.check, { message: needsColumn.message });

/**
 * "Tampilkan nilai sebagai" (T-067, rencana G-7 §3.1), seperti Show Values As Excel. Tidak ada /
 * "none" = nilai biasa (spec lama). Persen terhadap total SELURUH data yang lolos filter; total
 * berjalan/selisih sepanjang kolom pemisah, selain itu baris terdalam per kelompok, urut label naik.
 * Dihitung server (DuckDB), bukan dari baris yang tampil.
 */
export const SHOW_AS = [
  "none",
  "pct_grand",
  "pct_row",
  "pct_col",
  "running",
  "diff_prev",
  "pct_diff_prev",
] as const;
export type ShowAs = (typeof SHOW_AS)[number];
/** Cara tampil per jenis widget: grafik satu dimensi tanpa % baris/kolom; pai hanya % keseluruhan. */
export const SHOW_AS_FOR: Record<"pivot" | ChartType, readonly ShowAs[]> = {
  pivot: SHOW_AS,
  bar: ["none", "pct_grand", "running", "diff_prev", "pct_diff_prev"],
  line: ["none", "pct_grand", "running", "diff_prev", "pct_diff_prev"],
  pie: ["none", "pct_grand"],
};
/** Ukuran grafik/pivot: ukuran biasa + cara tampil opsional. */
const shownMeasure = measureBase
  .extend({ showAs: z.enum(SHOW_AS).optional() })
  .strict()
  .refine(needsColumn.check, { message: needsColumn.message });
const dimension = z.object({ column, timeGrain: z.enum(GRAINS).optional() }).strict();

/**
 * Field terhitung (T-068, ADR-0009): rumus atas ukuran teragregasi (lihat calc.ts), dengan nama tampil
 * dan format opsional (tanpa format = format widget). `showAs` hanya di pivot/grafik (bukan KPI).
 */
const calcBase = z
  .object({
    kind: z.literal("calc"),
    label: calcLabelSchema,
    expr: calcExprSchema(column),
    format: formatSchema.optional(),
  })
  .strict();
const calcValue = calcBase.extend({ showAs: z.enum(SHOW_AS).optional() }).strict();
export type CalcValue = z.infer<typeof calcValue>;

/**
 * Nilai = ukuran biasa ATAU field terhitung (`kind: "calc"`). Dipilih menurut `kind` agar pesan galat
 * berasal dari skema yang dimaksud (bukan "Invalid input" union zod). Ukuran tanpa `kind` = bentuk
 * 1.0.0, tidak berubah.
 */
function measureOrCalc<M extends z.ZodTypeAny, C extends z.ZodTypeAny>(m: M, c: C) {
  return z.unknown().transform((v, ctx): z.output<M> | z.output<C> => {
    const calc = typeof v === "object" && v !== null && (v as { kind?: unknown }).kind === "calc";
    const r = (calc ? c : m).safeParse(v);
    if (!r.success) {
      for (const i of r.error.issues) ctx.addIssue(i);
      return z.NEVER;
    }
    return r.data as z.output<M> | z.output<C>;
  });
}
const kpiValue = measureOrCalc(measure, calcBase);
const shownValue = measureOrCalc(shownMeasure, calcValue);
export type MeasureValue = z.infer<typeof shownValue>;

/** Nilai berupa field terhitung. */
export const isCalcValue = (v: object): v is { kind: "calc"; label: string; expr: CalcExpr } =>
  (v as { kind?: unknown }).kind === "calc";
/** Agregasi ukuran biasa; undefined untuk field terhitung. */
export const aggOf = (v: { agg?: Agg } | { kind: "calc" }): Agg | undefined =>
  "agg" in v ? v.agg : undefined;
/** Posisi kolom yang dirujuk satu nilai (daun rumus untuk field terhitung). */
export function valueColumns(v: { column?: number } | { kind: "calc"; expr: CalcExpr }): number[] {
  if ("expr" in v) return calcLeaves(v.expr).flatMap((l) => (l.column ? [l.column] : []));
  return v.column ? [v.column] : [];
}

export const kpiSpecSchema = z
  .object({ sheetId, measure: kpiValue, format: formatSchema })
  .strict();
export const chartSpecSchema = z
  .object({
    sheetId,
    dimension,
    measure: shownValue,
    sort: z.enum(CHART_SORTS),
    topN: z.number().int().min(1).max(1000),
    format: formatSchema,
    /**
     * Klik elemen grafik menyaring widget lain (T-012). Tidak ada = aktif; false = dimatikan untuk
     * widget ini (dimensinya tidak lagi termasuk kolom cross-filter yang diizinkan dashboard).
     */
    crossFilter: z.boolean().optional(),
  })
  .strict();
export const tableSpecSchema = z
  .object({
    sheetId,
    columns: z
      .array(column)
      .min(1)
      .max(TABLE_COLUMNS_MAX)
      .refine((c) => new Set(c).size === c.length, { message: "Kolom tidak boleh ganda" }),
    format: formatSchema,
    /**
     * Kolom angka yang memakai `format` (selain itu "auto") — rupiah/persen hanya untuk kolom yang
     * dipilih, bukan semua kolom angka.
     */
    formatColumns: z.array(column).max(TABLE_COLUMNS_MAX).optional(),
  })
  .strict()
  .refine((t) => (t.formatColumns ?? []).every((p) => t.columns.includes(p)), {
    message: "Kolom format harus kolom yang ditampilkan",
    path: ["formatColumns"],
  });

/**
 * Pivot (seperti PivotTable Excel): baris 1–4 kolom (T-070; 1.0.0: 1–2), kolom pemisah opsional (mis.
 * periode per bulan), nilai 1–8 (1.0.0: 1–3). Batas tampilan: PIVOT_ROWS_SHOWN baris terdalam ×
 * PIVOT_COLUMNS_SHOWN nilai kolom, dan anggaran sel PIVOT_CELLS_MAX (baris tampil × kolom tampil ×
 * nilai; baris tampil = baris terdalam + baris subtotal): bila lewat, kolom tampil dipangkas (min. 1).
 * Total dan subtotal tetap dihitung dari seluruh data (termasuk yang tidak tampil).
 */
export const PIVOT_ROWS_MAX = 4;
export const PIVOT_VALUES_MAX = 8;
export const PIVOT_ROWS_SHOWN = 200;
export const PIVOT_COLUMNS_SHOWN = 40;
/**
 * Anggaran sel (rencana G-7 §3.4) = 200 × 40 × 3, batas efektif 1.0.0: spec lama (≤ 2 baris, ≤ 3
 * nilai) tidak pernah melewatinya dihitung per baris terdalam, jadi SQL-nya tidak berubah.
 */
export const PIVOT_CELLS_MAX = 24_000;

const dimKey = (d: { column: number; timeGrain?: string }) => `${d.column}:${d.timeGrain ?? ""}`;

/**
 * Top N per kelompok induk (T-071, rencana G-7 §3.4): per field baris, hanya N kelompok teratas di
 * dalam induknya menurut nilai ke-`by` (nilai dasar: agregat atau field terhitung, bukan hasil
 * "Tampilkan nilai sebagai"; seri dipecah label naik); sisanya digabung menjadi satu kelompok
 * PIVOT_OTHER_LABEL yang dihitung ulang dari baris mentahnya. Subtotal/total tidak berubah.
 */
export const PIVOT_TOP_N_MAX = 50;
/** Label kelompok sisa Top N (sistem, bukan data): berkurung agar beda dari kategori bernama "Lainnya". */
export const PIVOT_OTHER_LABEL = "(Lainnya)";
const pivotTopN = z
  .object({
    n: z.number().int().min(1).max(PIVOT_TOP_N_MAX),
    /** Indeks nilai (0 = Nilai 1) yang menentukan peringkat. */
    by: z
      .number()
      .int()
      .min(0)
      .max(PIVOT_VALUES_MAX - 1),
  })
  .strict();
export type PivotTopN = z.infer<typeof pivotTopN>;
const pivotRow = z
  .object({ column, timeGrain: z.enum(GRAINS).optional(), topN: pivotTopN.optional() })
  .strict();
/** Cara tampil yang berjalan sepanjang sumbu (item "sebelumnya"), lihat show-as.ts isAxisShowAs. */
const AXIS_SHOW_AS: readonly ShowAs[] = ["running", "diff_prev", "pct_diff_prev"];

/**
 * Field baris ber-Top N yang menjadi sumbu total berjalan/selisih (baris terdalam tanpa kolom
 * pemisah): item "sebelumnya" akan tergabung ke "(Lainnya)", jadi ditolak. Indeks baris itu atau null.
 */
export function pivotTopNAxisRow(p: {
  rows: readonly { topN?: unknown }[];
  column?: unknown;
  values: readonly { showAs?: ShowAs }[];
}): number | null {
  const last = p.rows.length - 1;
  if (p.column || !p.rows[last]?.topN) return null;
  return p.values.some((v) => AXIS_SHOW_AS.includes(v.showAs ?? "none")) ? last : null;
}
export const TOP_N_AXIS_TEXT =
  "Top N tidak bisa dipakai pada baris terdalam bersama Total berjalan atau Selisih tanpa Pisahkan per: item sebelumnya akan tergabung ke (Lainnya). Hapus Top N, ganti cara tampil, atau tambahkan Pisahkan per.";

/** Bagian Saring pivot (T-f4a7, seperti Filters di PivotTable): batas kolom dan nilai per kolom. */
export const PIVOT_FILTERS_MAX = 3;
export const PIVOT_FILTER_VALUES_MAX = 500;
const filterValue = z.union([z.string().max(2_000), z.number().finite(), z.boolean(), z.null()]);
/** Nilai mentah kolom (teks, angka, boolean, tanggal ISO); null = (kosong). */
const pivotSavedFilter = z
  .object({
    column,
    op: z.enum(["in", "not_in"]),
    values: z.array(filterValue).min(1).max(PIVOT_FILTER_VALUES_MAX),
  })
  .strict();
export type PivotSavedFilter = z.infer<typeof pivotSavedFilter>;

export const pivotSpecSchema = z
  .object({
    sheetId,
    /** Field baris; masing-masing boleh Top N per kelompok induk (T-071). */
    rows: z.array(pivotRow).min(1).max(PIVOT_ROWS_MAX),
    /** Pisahkan per (opsional): satu kolom, mis. tanggal per bulan → satu kolom tabel per periode. */
    column: dimension.optional(),
    values: z.array(shownValue).min(1).max(PIVOT_VALUES_MAX),
    /** Urutan baris: nilai pertama (value_*) atau label (label_*); kolom selalu urut naik. */
    sort: z.enum(CHART_SORTS),
    /** Format untuk nilai berupa angka (Total/Rata-rata/Terkecil/Terbesar); jumlah selalu angka biasa. */
    format: formatSchema,
    /** Kolom "Total" di kanan dan baris "Total" di bawah. */
    totals: z.boolean(),
    /**
     * Baris subtotal per kelompok induk. Baris 2 kolom: kelompok baris pertama. Baris 3–4 kolom
     * (T-070): semua level induk, kecuali `subtotalLevels` memilih sebagian.
     */
    subtotals: z.boolean(),
    /**
     * Level induk yang diberi subtotal (1 = kelompok baris pertama … 3), bila tidak semua (T-070);
     * hanya bermakna untuk baris ≥ 3 kolom. Tidak ada = semua level (bentuk 1.0.0).
     */
    subtotalLevels: z
      .array(
        z
          .number()
          .int()
          .min(1)
          .max(PIVOT_ROWS_MAX - 1),
      )
      .max(PIVOT_ROWS_MAX - 1)
      .refine((l) => new Set(l).size === l.length, { message: "Level subtotal tidak boleh ganda" })
      .optional(),
    /** Saring (opsional): pivot hanya menghitung baris yang cocok semua kolom ini. */
    filters: z.array(pivotSavedFilter).max(PIVOT_FILTERS_MAX).optional(),
    /**
     * Klik label baris/kolom menyaring widget lain (T-f4a7). Hanya `true` = aktif (pivot baru diisi
     * true): pivot yang tersimpan sebelum T-f4a7 tidak diam-diam menambah kolom filter silang yang
     * boleh dikirim viewer di dashboard yang sudah dibagikan (D6, review M3).
     */
    crossFilter: z.boolean().optional(),
  })
  .strict()
  .refine(
    (p) => {
      const cols = (p.filters ?? []).map((f) => f.column).filter((c) => c !== MISSING_COLUMN);
      return new Set(cols).size === cols.length;
    },
    { message: "Satu kolom hanya boleh sekali di bagian Saring", path: ["filters"] },
  )
  .refine(
    (p) => {
      // Penanda kolom hilang (hasil pemetaan/versi baru) boleh berulang: widgetPlan melaporkannya
      // sebagai COLUMN_UNAVAILABLE dan panel meminta kolom pengganti, spec tetap utuh.
      const keys = [...p.rows, ...(p.column ? [p.column] : [])]
        .filter((d) => d.column !== MISSING_COLUMN)
        .map(dimKey);
      return new Set(keys).size === keys.length;
    },
    { message: "Kolom yang sama tidak boleh dipakai dua kali dengan pengelompokan yang sama" },
  )
  .superRefine((p, ctx) => {
    p.rows.forEach((r, i) => {
      if (r.topN && r.topN.by >= p.values.length) {
        ctx.addIssue({
          code: "custom",
          message: "Top N memakai nilai yang tidak ada. Pilih nilai lain.",
          path: ["rows", i, "topN", "by"],
        });
      }
    });
    const axis = pivotTopNAxisRow(p);
    if (axis !== null) {
      ctx.addIssue({ code: "custom", message: TOP_N_AXIS_TEXT, path: ["rows", axis, "topN"] });
    }
  });

/**
 * Level induk (1-based, naik) yang mendapat baris subtotal: [] bila subtotal mati atau baris 1 kolom;
 * `subtotalLevels` di luar jumlah baris diabaikan (spec tetap valid setelah baris dihapus).
 */
export function pivotSubtotalLevels(p: Pick<PivotSpec, "rows" | "subtotals" | "subtotalLevels">) {
  if (!p.subtotals) return [];
  const all = Array.from({ length: p.rows.length - 1 }, (_, i) => i + 1);
  return p.subtotalLevels ? all.filter((l) => p.subtotalLevels!.includes(l)) : all;
}

export type KpiSpec = z.infer<typeof kpiSpecSchema>;
export type ChartSpec = z.infer<typeof chartSpecSchema>;
export type TableSpec = z.infer<typeof tableSpecSchema>;
export type PivotSpec = z.infer<typeof pivotSpecSchema>;

export type WidgetConfig =
  | { type: "empty"; spec: Record<string, never> }
  | { type: "kpi"; spec: KpiSpec }
  | { type: ChartType; spec: ChartSpec }
  | { type: "table"; spec: TableSpec }
  | { type: "pivot"; spec: PivotSpec };

export type ParsedConfig = { ok: true; config: WidgetConfig } | { ok: false; message: string };

const issueText = (e: z.ZodError) => {
  const i = e.issues[0];
  return `${i?.path.length ? `${i.path.join(".")}: ` : ""}${i?.message ?? "format salah"}`;
};

/** Validasi tipe + spec dari klien/DB. Spec widget kosong selalu {}. */
export function parseWidgetConfig(type: unknown, spec: unknown): ParsedConfig {
  const t = z.enum(WIDGET_TYPES).safeParse(type);
  if (!t.success) return { ok: false, message: "Tipe widget tidak dikenal." };
  const bad = (e: z.ZodError): ParsedConfig => ({
    ok: false,
    message: `Pengaturan widget tidak valid (${issueText(e)}).`,
  });
  switch (t.data) {
    case "empty":
      return { ok: true, config: { type: "empty", spec: {} } };
    case "kpi": {
      const p = kpiSpecSchema.safeParse(spec);
      return p.success ? { ok: true, config: { type: "kpi", spec: p.data } } : bad(p.error);
    }
    case "table": {
      const p = tableSpecSchema.safeParse(spec);
      return p.success ? { ok: true, config: { type: "table", spec: p.data } } : bad(p.error);
    }
    case "pivot": {
      const p = pivotSpecSchema.safeParse(spec);
      return p.success ? { ok: true, config: { type: "pivot", spec: p.data } } : bad(p.error);
    }
    default: {
      const type = t.data;
      const p = chartSpecSchema.safeParse(spec);
      if (!p.success) return bad(p.error);
      if (p.data.topN > TOP_N_MAX[type]) {
        return { ok: false, message: `Maksimal ${TOP_N_MAX[type]} kategori untuk grafik ini.` };
      }
      const showAs = p.data.measure.showAs ?? "none";
      if (!SHOW_AS_FOR[type].includes(showAs)) {
        return {
          ok: false,
          message:
            type === "pie"
              ? "Grafik pai hanya bisa menampilkan nilai biasa atau % dari total keseluruhan."
              : "% dari total baris/kolom hanya untuk pivot. Pilih cara tampil lain untuk grafik ini.",
        };
      }
      const m = p.data.measure;
      if (type === "pie" && isCalcValue(m) && !isAdditiveCalc(m.expr)) {
        return {
          ok: false,
          message:
            "Grafik pai hanya untuk field terhitung yang menjumlah/mengurangkan Total atau Jumlah baris. Untuk rasio atau perkalian pakai grafik batang.",
        };
      }
      if (type === "pie" && !isCalcValue(m) && !(PIE_AGGS as readonly string[]).includes(m.agg)) {
        return {
          ok: false,
          message:
            "Grafik pai hanya untuk Total, Jumlah baris, atau Jumlah terisi. Untuk rata-rata, terkecil, terbesar, atau jumlah unik pakai grafik batang.",
        };
      }
      return { ok: true, config: { type, spec: p.data } };
    }
  }
}

/** Sheet yang dirujuk spec (widget kosong tidak punya). */
export const sheetOf = (c: WidgetConfig): string | null =>
  c.type === "empty" ? null : c.spec.sheetId;

/**
 * Kolom yang bila diklik menyaring widget lain (filter silang): dimensi grafik, atau baris + kolom
 * pemisah pivot (T-f4a7); [] bila jenisnya tidak bisa atau sakelarnya dimatikan.
 */
export function crossFilterPositions(c: WidgetConfig): number[] {
  if (c.type === "empty" || c.type === "kpi" || c.type === "table") return [];
  if (c.type === "pivot") {
    if (c.spec.crossFilter !== true) return [];
    return [...c.spec.rows, ...(c.spec.column ? [c.spec.column] : [])].map((d) => d.column);
  }
  if (c.spec.crossFilter === false) return [];
  return [c.spec.dimension.column];
}

/** Semua posisi kolom yang dirujuk (untuk validasi terhadap skema). */
export function columnsOf(c: WidgetConfig): number[] {
  switch (c.type) {
    case "empty":
      return [];
    case "kpi":
      return valueColumns(c.spec.measure);
    case "table":
      return c.spec.columns;
    case "pivot":
      return [
        ...c.spec.rows.map((d) => d.column),
        ...(c.spec.column ? [c.spec.column.column] : []),
        ...c.spec.values.flatMap(valueColumns),
        ...(c.spec.filters ?? []).map((f) => f.column),
      ];
    default:
      return [c.spec.dimension.column, ...valueColumns(c.spec.measure)];
  }
}
