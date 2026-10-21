/*
 * Widget terikat pivot tersimpan (T-073, ADR-0009, rencana G-7 §4.3). Widget.spec widget terikat hanya
 * berisi TAMPILAN; definisi (sheet, baris, kolom pemisah, nilai + field terhitung + "Tampilkan nilai
 * sebagai", Saring, Top N) dibaca server dari SavedPivot. effectiveConfig (murni) menyusun keduanya
 * menjadi WidgetConfig biasa yang masuk jalur widgetPlan/resolveSpec/pembangun SQL yang sama — tidak
 * ada cabang SQL kedua. Tampilan per jenis:
 *  - pivot: urut, total, subtotal (+ level), filter silang, format;
 *  - bar/line/pie: dimensi = baris pertama atau kolom pemisah, SATU nilai (Q6), urut, N teratas,
 *    format, filter silang; Saring pivot tersimpan tetap berlaku (dikembalikan terpisah sebagai
 *    `filters`, diterapkan service seperti Saring pivot);
 *  - kpi: SATU nilai (total keseluruhan, tanpa cara tampil), format; Saring tetap berlaku;
 *  - table: tabel teragregasi = pivot rata (baris + nilai, tanpa kolom pemisah dan subtotal) dengan
 *    total/urut/format tampilan; hasil dan ekspornya berbentuk pivot.
 * Tampilan yang tidak cocok lagi dengan sumber (nilai ke-6 dihapus, cara tampil yang tidak bisa dipakai
 * grafik, kolom pemisah dihapus) → pesan "Pilih ulang … di pengaturan widget", per widget.
 */
import { z } from "zod";
import {
  CHART_SORTS,
  PIVOT_ROWS_MAX,
  PIVOT_VALUES_MAX,
  TOP_N_MAX,
  formatSchema,
  isCalcValue,
  parseWidgetConfig,
  type PivotSavedFilter,
  type PivotSpec,
  type WidgetConfig,
} from "./spec";

/** Jenis widget yang bisa memakai pivot tersimpan sebagai sumber. */
export const BOUND_TYPES = ["pivot", "bar", "line", "pie", "kpi", "table"] as const;
export type BoundType = (typeof BOUND_TYPES)[number];
export const isBoundType = (t: unknown): t is BoundType =>
  (BOUND_TYPES as readonly unknown[]).includes(t);

const valueIndex = z
  .number()
  .int()
  .min(0)
  .max(PIVOT_VALUES_MAX - 1);

export const pivotDisplaySchema = z
  .object({
    sort: z.enum(CHART_SORTS),
    totals: z.boolean(),
    subtotals: z.boolean(),
    subtotalLevels: z
      .array(
        z
          .number()
          .int()
          .min(1)
          .max(PIVOT_ROWS_MAX - 1),
      )
      .max(PIVOT_ROWS_MAX - 1)
      .optional(),
    crossFilter: z.boolean().optional(),
    format: formatSchema.optional(),
  })
  .strict();
export const chartDisplaySchema = z
  .object({
    /** "row" = field baris pertama pivot tersimpan; "column" = kolom pemisah (Pisahkan per). */
    dimension: z.enum(["row", "column"]),
    value: valueIndex,
    sort: z.enum(CHART_SORTS),
    topN: z.number().int().min(1).max(1000),
    format: formatSchema.optional(),
    crossFilter: z.boolean().optional(),
  })
  .strict();
export const kpiDisplaySchema = z
  .object({ value: valueIndex, format: formatSchema.optional() })
  .strict();
export const tableDisplaySchema = z
  .object({ sort: z.enum(CHART_SORTS), totals: z.boolean(), format: formatSchema.optional() })
  .strict();

export type PivotDisplay = z.infer<typeof pivotDisplaySchema>;
export type ChartDisplay = z.infer<typeof chartDisplaySchema>;
export type KpiDisplay = z.infer<typeof kpiDisplaySchema>;
export type TableDisplay = z.infer<typeof tableDisplaySchema>;

export type BoundDisplay =
  | { type: "pivot"; display: PivotDisplay }
  | { type: "bar" | "line" | "pie"; display: ChartDisplay }
  | { type: "kpi"; display: KpiDisplay }
  | { type: "table"; display: TableDisplay };

/** Validasi tipe + tampilan widget terikat (dari klien atau DB). */
export function parseBoundDisplay(
  type: unknown,
  display: unknown,
): { ok: true; bound: BoundDisplay } | { ok: false; message: string } {
  if (!isBoundType(type)) {
    return { ok: false, message: "Jenis widget ini tidak bisa memakai pivot tersimpan." };
  }
  const bad = (e: z.ZodError) => {
    const i = e.issues[0];
    return {
      ok: false as const,
      message: `Pengaturan tampilan tidak valid (${i?.path.length ? `${i.path.join(".")}: ` : ""}${i?.message ?? "format salah"}).`,
    };
  };
  switch (type) {
    case "pivot": {
      const p = pivotDisplaySchema.safeParse(display);
      return p.success ? { ok: true, bound: { type, display: p.data } } : bad(p.error);
    }
    case "kpi": {
      const p = kpiDisplaySchema.safeParse(display);
      return p.success ? { ok: true, bound: { type, display: p.data } } : bad(p.error);
    }
    case "table": {
      const p = tableDisplaySchema.safeParse(display);
      return p.success ? { ok: true, bound: { type, display: p.data } } : bad(p.error);
    }
    default: {
      const p = chartDisplaySchema.safeParse(display);
      if (!p.success) return bad(p.error);
      if (p.data.topN > TOP_N_MAX[type]) {
        return { ok: false, message: `Maksimal ${TOP_N_MAX[type]} kategori untuk grafik ini.` };
      }
      return { ok: true, bound: { type, display: p.data } };
    }
  }
}

/** Akhiran pesan tampilan yang tidak cocok lagi dengan pivot tersimpan (AC4 T-073). */
export const REPICK_VALUE = "Pilih ulang nilai di pengaturan widget.";
/**
 * Pesan yang sama untuk viewer (review keamanan T-073 L3): tanpa menyebut pivot tersimpan atau rincian
 * definisinya; pemilik/editor tetap mendapat pesan rinci.
 */
export const SOURCE_MISMATCH_VIEWER = `Pengaturan widget ini tidak cocok lagi dengan sumber datanya. ${REPICK_VALUE}`;

export type EffectiveConfig =
  | {
      ok: true;
      config: Exclude<WidgetConfig, { type: "empty" }>;
      /** Grafik/KPI: Saring pivot tersimpan (pivot/tabel membawanya di config). */
      filters?: PivotSavedFilter[];
    }
  | { ok: false; message: string };

/**
 * Spec efektif widget terikat = pivot tersimpan + tampilan widget (murni). Hasil divalidasi lagi
 * dengan parseWidgetConfig sehingga aturan per jenis (pai hanya Total/Jumlah, cara tampil grafik, Top
 * N) sama persis dengan widget mandiri.
 */
export function effectiveConfig(
  type: unknown,
  display: unknown,
  pivot: PivotSpec,
): EffectiveConfig {
  const parsed = parseBoundDisplay(type, display);
  if (!parsed.ok) return parsed;
  const { bound } = parsed;
  const format = bound.display.format ?? pivot.format;
  let built: { type: string; spec: unknown };
  let filters: PivotSavedFilter[] | undefined;
  switch (bound.type) {
    case "pivot": {
      const d = bound.display;
      const { subtotalLevels: _l, crossFilter: _c, ...base } = pivot;
      built = {
        type: "pivot",
        spec: {
          ...base,
          sort: d.sort,
          totals: d.totals,
          subtotals: d.subtotals,
          ...(d.subtotalLevels ? { subtotalLevels: d.subtotalLevels } : {}),
          ...(d.crossFilter !== undefined ? { crossFilter: d.crossFilter } : {}),
          format,
        },
      };
      break;
    }
    case "table": {
      // Tabel teragregasi: pivot rata (tanpa kolom pemisah/subtotal), bukan sumber filter silang.
      const d = bound.display;
      const { subtotalLevels: _l, crossFilter: _c, column: _k, ...base } = pivot;
      built = {
        type: "pivot",
        spec: { ...base, sort: d.sort, totals: d.totals, subtotals: false, format },
      };
      break;
    }
    case "kpi": {
      const v = pivot.values[bound.display.value];
      if (!v) return { ok: false, message: missingValue };
      // KPI = total keseluruhan, tanpa "Tampilkan nilai sebagai".
      const { showAs: _s, ...measure } = v;
      built = { type: "kpi", spec: { sheetId: pivot.sheetId, measure, format } };
      filters = pivot.filters;
      break;
    }
    default: {
      const d = bound.display;
      const v = pivot.values[d.value];
      if (!v) return { ok: false, message: missingValue };
      const dim = d.dimension === "row" ? pivot.rows[0] : pivot.column;
      if (!dim) {
        return {
          ok: false,
          message: `Pivot tersimpan ini tidak lagi punya Pisahkan per. Pilih ulang dimensi di pengaturan widget.`,
        };
      }
      // Field terhitung membawa format sendiri; ukuran biasa tidak punya format per nilai.
      const measure = isCalcValue(v)
        ? v
        : {
            agg: v.agg,
            ...(v.column ? { column: v.column } : {}),
            ...(v.showAs ? { showAs: v.showAs } : {}),
          };
      built = {
        type: bound.type,
        spec: {
          sheetId: pivot.sheetId,
          dimension: { column: dim.column, ...(dim.timeGrain ? { timeGrain: dim.timeGrain } : {}) },
          measure,
          sort: d.sort,
          topN: d.topN,
          format,
          ...(d.crossFilter !== undefined ? { crossFilter: d.crossFilter } : {}),
        },
      };
      filters = pivot.filters;
    }
  }
  const config = parseWidgetConfig(built.type, built.spec);
  if (!config.ok) return { ok: false, message: `${config.message} ${REPICK_VALUE}` };
  if (config.config.type === "empty") return { ok: false, message: missingValue };
  return { ok: true, config: config.config, ...(filters?.length ? { filters } : {}) };
}

const missingValue = `Nilai yang dipilih widget ini sudah tidak ada di pivot tersimpan. ${REPICK_VALUE}`;
