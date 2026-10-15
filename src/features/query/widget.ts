/*
 * Query dari widget (T-011): /api/query menerima { widgetId, dashboardFilters?, page?, sort? }
 * (dashboardFilters = filter dashboard T-012, diterapkan di service lewat filters.ts) dan spec diambil
 * dari widget di DB, bukan dari klien. Filter posisional `filters` lama dihapus (review keamanan T-012
 * putaran 2): body strict → field itu ditolak INVALID; jalur viewer D6 = { widgetId, dashboardFilters }. Spec merujuk kolom lewat posisi; di sini posisi diterjemahkan ke
 * nama kolom skema aktif lalu masuk resolveSpec T-009 (aturan tipe/agregasi/filter yang sama).
 * Kolom yang disembunyikan atau hilang → "tidak tersedia" untuk widget ini saja. Murni (tanpa I/O).
 */
import { z } from "zod";
import type { ColumnSchema } from "@/features/ingest/infer";
import {
  TABLE_PAGE_SIZE,
  columnsOf,
  type ChartSort,
  type WidgetConfig,
} from "@/features/widgets/spec";
import { dashFiltersSchema } from "./filters";
import { resolveSpec, type Plan, type QuerySpec } from "./spec";

/** Halaman tabel maksimum (100 baris/halaman → 10 juta baris). */
export const TABLE_PAGE_MAX = 100_000;

const cuid = z.string().regex(/^[a-z0-9]{20,32}$/);
const pos = z.number().int().min(1).max(16_384);

export const widgetBodySchema = z
  .object({
    widgetId: cuid,
    /**
     * Filter dashboard (T-012) — satu-satunya filter dari klien: kolom lewat NAMA tampil, hanya kolom
     * yang diizinkan dashboard (kolom filter + dimensi grafik cross-filter, D6). Kolom yang tidak ada di
     * sheet widget ini, disembunyikan, atau beda kelompok tipe dengan sumbernya dilewati.
     */
    dashboardFilters: dashFiltersSchema.optional(),
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

/**
 * Rencana query satu widget dari spec tersimpan + halaman/urutan dari klien. Filter dashboard tidak
 * lewat sini (diterapkan service sebagai klausa terpisah), jadi spec.filters selalu kosong.
 */
export function widgetPlan(
  config: Exclude<WidgetConfig, { type: "empty" }>,
  schema: ColumnSchema[],
  body: Pick<WidgetQueryBody, "page" | "sort">,
): WidgetPlan {
  const byPos = new Map(schema.map((c) => [c.pos, c]));
  let unavailable: string | null = null;
  /**
   * Kolom spec widget (diatur pemilik/editor) boleh disebut namanya di pesan; untuk viewer pesan
   * COLUMN_UNAVAILABLE diganti pesan umum di service (forRole, T-016).
   */
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
  const filters: QuerySpec["filters"] = [];
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
      const measureType = m.column ? byPos.get(m.column)?.type : undefined;
      const dated = measureType === "date" || measureType === "timestamp";
      if (dated && (m.agg === "min" || m.agg === "max")) {
        // Grafik hanya menggambar angka; min/maks tanggal tetap bisa lewat KPI atau tabel.
        return {
          ok: false,
          code: "INVALID",
          message:
            "Grafik hanya bisa menggambar nilai angka. Pilih kolom angka di pengaturan widget, atau ubah jenis tampilan ke Angka untuk tanggal terkecil/terbesar.",
        };
      }
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
  if (table) {
    return {
      ok: true,
      kind: "table",
      spec,
      plan: resolved.plan,
      sort: table.sort,
      page: body.page,
    };
  }
  // Grafik: sertakan jumlah kategori + total (irisan "Lainnya", "N teratas dari M").
  const totals = config.type !== "kpi";
  return { ok: true, kind: "agg", spec, plan: { ...resolved.plan, totals } };
}

/**
 * Nama tampil kolom kosong (absent, T-014: tidak ada di file versi ini dan dikonfirmasi pemilik saat
 * pemetaan) yang dipakai widget, urut spec tanpa duplikat. Widget tetap jalan (nilainya NULL); UI
 * memberi catatan "kosong di versi data ini" alih-alih angka 0 yang menyesatkan.
 */
export function absentNames(config: WidgetConfig, schema: ColumnSchema[]): string[] {
  const byPos = new Map(schema.map((c) => [c.pos, c]));
  const names = columnsOf(config).flatMap((p) => {
    const c = byPos.get(p);
    return c?.absent ? [c.name] : [];
  });
  return [...new Set(names)];
}
