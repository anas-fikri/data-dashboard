/*
 * Spec widget (T-011): disimpan di Widget.spec, divalidasi zod per tipe (enum tertutup, batas jumlah).
 * Kolom dirujuk lewat posisi fisik (pos di skema sheet, = c<pos> di typed.parquet), bukan nama tampil:
 * mengganti nama kolom di editor skema tidak merusak widget, sedangkan kolom yang disembunyikan tetap
 * ditolak saat query (pesan "kolom tidak tersedia" di widget itu saja). Murni (tanpa I/O) — dipakai
 * server dan form konfigurasi di klien.
 */
import { z } from "zod";
import type { Agg, Grain } from "@/features/query/spec";

export const WIDGET_TYPES = ["empty", "table", "kpi", "bar", "line", "pie"] as const;
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
/** Posisi kolom di skema sheet (1-based, sama dengan c<pos>), atau MISSING_COLUMN. */
const column = z.number().int().min(1).max(MISSING_COLUMN);

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

const measure = z
  .object({ agg: z.enum(AGGS), column: column.optional() })
  .strict()
  .refine((m) => m.agg === "count" || m.column !== undefined, {
    message: "Agregasi ini membutuhkan kolom",
  });
const dimension = z.object({ column, timeGrain: z.enum(GRAINS).optional() }).strict();

export const kpiSpecSchema = z.object({ sheetId, measure, format: formatSchema }).strict();
export const chartSpecSchema = z
  .object({
    sheetId,
    dimension,
    measure,
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

export type KpiSpec = z.infer<typeof kpiSpecSchema>;
export type ChartSpec = z.infer<typeof chartSpecSchema>;
export type TableSpec = z.infer<typeof tableSpecSchema>;

export type WidgetConfig =
  | { type: "empty"; spec: Record<string, never> }
  | { type: "kpi"; spec: KpiSpec }
  | { type: ChartType; spec: ChartSpec }
  | { type: "table"; spec: TableSpec };

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
    default: {
      const type = t.data;
      const p = chartSpecSchema.safeParse(spec);
      if (!p.success) return bad(p.error);
      if (p.data.topN > TOP_N_MAX[type]) {
        return { ok: false, message: `Maksimal ${TOP_N_MAX[type]} kategori untuk grafik ini.` };
      }
      if (type === "pie" && !(PIE_AGGS as readonly string[]).includes(p.data.measure.agg)) {
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

/** Semua posisi kolom yang dirujuk (untuk validasi terhadap skema). */
export function columnsOf(c: WidgetConfig): number[] {
  switch (c.type) {
    case "empty":
      return [];
    case "kpi":
      return c.spec.measure.column ? [c.spec.measure.column] : [];
    case "table":
      return c.spec.columns;
    default:
      return [c.spec.dimension.column, ...(c.spec.measure.column ? [c.spec.measure.column] : [])];
  }
}
