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
  sortColumnSchema,
  isCalcValue,
  pivotSubtotalLevels,
  type ChartSort,
  type MeasureValue,
  type PivotSavedFilter,
  type ShowAs,
  type WidgetConfig,
} from "@/features/widgets/spec";
import { mapCalcColumns } from "@/features/widgets/calc";
import { isPercentShowAs, showAsTitle, shown } from "@/features/widgets/show-as";
import {
  PIVOT_FIELDS,
  dashFiltersSchema,
  pivotFiltersSchema,
  valuesClause,
  type DashClause,
} from "./filters";
import { normName } from "@/features/widgets/remap";
import { isCalendarDate, resolveSpec, type Grain, type Plan, type QuerySpec } from "./spec";

/** Halaman tabel maksimum (100 baris/halaman → 10 juta baris). */
export const TABLE_PAGE_MAX = 100_000;

const cuid = z.string().regex(/^[a-z0-9]{20,32}$/);
// Kolom sungguhan atau kolom sistem Periode (T-058).
const pos = sortColumnSchema;

export const widgetBodySchema = z
  .object({
    widgetId: cuid,
    /**
     * Filter dashboard (T-012) — satu-satunya filter dari klien: kolom lewat NAMA tampil, hanya kolom
     * yang diizinkan dashboard (kolom filter + dimensi grafik cross-filter, D6). Kolom yang tidak ada di
     * sheet widget ini, disembunyikan, atau beda kelompok tipe dengan sumbernya dilewati.
     */
    dashboardFilters: dashFiltersSchema.optional(),
    /** Widget pivot: saringan field pivot dari pembaca (T-f4a7); jenis lain mengabaikannya. */
    pivotFilters: pivotFiltersSchema.optional(),
    /**
     * Widget pivot: minta daftar nilai satu field (menu saring, T-f4a7) alih-alih tabel — dengan filter
     * dashboard, Saring tersimpan, dan saringan field LAIN (saringan field itu sendiri diabaikan).
     */
    pivotValues: z.enum(PIVOT_FIELDS).optional(),
    page: z.number().int().min(0).max(TABLE_PAGE_MAX).default(0),
    sort: z
      .object({ column: pos, dir: z.enum(["asc", "desc"]) })
      .strict()
      .optional(),
  })
  .strict();
export type WidgetQueryBody = z.infer<typeof widgetBodySchema>;

/** Bentuk pivot di atas rencana: dimensi = baris (1–4) lalu kolom pemisah (opsional), ukuran = nilai. */
export interface PivotShape {
  rowFields: 1 | 2 | 3 | 4;
  column: boolean;
  sort: ChartSort;
  totals: boolean;
  /** Baris 2 kolom: subtotal kelompok pertama. Baris ≥ 3 kolom: ada level di `levels`. */
  subtotals: boolean;
  /**
   * Baris ≥ 3 kolom (T-070): level induk ber-subtotal (1-based, naik). Tidak ada untuk baris ≤ 2
   * kolom, jadi bentuk (dan kunci cache) pivot 1.0.0 tidak berubah.
   */
  levels?: number[];
  /**
   * Top N per kelompok induk (T-071): level baris (0-based), jumlah kelompok, dan indeks nilai
   * peringkatnya. Tidak ada bila tidak dipakai, jadi bentuk (dan kunci cache) pivot lain tidak berubah.
   */
  top?: { level: number; n: number; by: number }[];
  /** Saringan pembaca per dimensi pivot (indeks plan.dimensions), T-f4a7. */
  local?: PivotLocal[];
  /** Bagian Saring tersimpan (T-f4a7): klausa nilai kolom, di-AND dengan filter dashboard. */
  saved?: DashClause[];
  /** Mode daftar nilai (pivotValues): indeks dimensi yang didaftar. */
  list?: number;
  /** Saringan yang berlaku (Saring tersimpan lalu saringan pembaca) untuk catatan di tabel/PDF. */
  notes?: PivotNote[];
}

/** Satu saringan untuk catatan pivot: nama kolom + nilai mentah (diformat pemakai sesuai tipe). */
export interface PivotNote {
  label: string;
  type: ColumnSchema["type"];
  grain?: Grain;
  op: "in" | "not_in";
  values: (string | number | boolean | null)[];
  /** Bagian Saring tersimpan (bukan saringan pembaca). */
  saved?: true;
}

/** Saringan satu dimensi pivot: kunci kelompok IN/NOT IN nilai (null = (kosong)). */
export interface PivotLocal {
  dim: number;
  op: "in" | "not_in";
  values: (string | number | boolean | null)[];
}

/** Nilai cocok dengan tipe dimensi (label mentah pivot); null selalu boleh. */
function localValueOk(type: ColumnSchema["type"], grained: boolean, v: unknown): boolean {
  if (v === null) return true;
  if (type === "text") return typeof v === "string";
  if (type === "boolean") return typeof v === "boolean";
  // Tanggal yang tidak ada (2026-02-30, 25:00) ditolak sebelum DuckDB (review T-f4a7 M1).
  if (type === "date" || type === "timestamp") return typeof v === "string" && isCalendarDate(v);
  if (grained) return false;
  return typeof v === "number" && Number.isFinite(v);
}

export type WidgetPlan =
  | {
      ok: true;
      kind: "agg";
      spec: QuerySpec;
      plan: Plan;
      /**
       * Grafik/KPI terikat pivot tersimpan (T-073): Saring pivot tersimpan sebagai klausa nilai kolom,
       * di-AND dengan filter dashboard oleh service. Tidak ada untuk widget mandiri.
       */
      saved?: DashClause[];
    }
  | { ok: true; kind: "pivot"; spec: QuerySpec; plan: Plan; pivot: PivotShape }
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
  body: Pick<WidgetQueryBody, "page" | "sort"> &
    Partial<Pick<WidgetQueryBody, "pivotFilters" | "pivotValues">>,
  /** Widget terikat (T-073): Saring pivot tersimpan untuk grafik/KPI (lihat widgets/bound.ts). */
  extra: { filters?: readonly PivotSavedFilter[] } = {},
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

  /**
   * Nilai spec widget → ukuran QuerySpec (kolom lewat nama). Field terhitung: daun rumus dipetakan
   * posisi → nama dengan aturan yang sama (tersembunyi/hilang → COLUMN_UNAVAILABLE), lalu resolveSpec
   * memvalidasi tipe agregasinya (T-068).
   */
  const measureOf = (m: MeasureValue): QuerySpec["measures"][number] =>
    isCalcValue(m)
      ? {
          kind: "calc",
          label: m.label,
          expr: mapCalcColumns(m.expr, name),
          ...(m.format ? { format: m.format } : {}),
        }
      : { agg: m.agg, ...(m.column ? { column: name(m.column) } : {}) };

  /**
   * Bagian Saring (pivot, atau pivot tersimpan sumber grafik/KPI): klausa nilai kolom; kolom
   * tersembunyi/hilang → COLUMN_UNAVAILABLE, nilai yang tidak cocok lagi dengan tipe kolom → pesan.
   */
  const savedClauses = (fs: readonly PivotSavedFilter[], notes?: PivotNote[]) =>
    fs.flatMap((f): DashClause[] => {
      if (!name(f.column)) return [];
      const c = byPos.get(f.column)!;
      const cl = valuesClause(f.op, f.values, c);
      unavailable ??= cl
        ? null
        : `Nilai di bagian Saring tidak cocok lagi dengan kolom "${c.name}". Atur ulang bagian Saring widget ini.`;
      if (cl) notes?.push({ label: c.name, type: c.type, op: f.op, values: f.values, saved: true });
      return cl ? [cl] : [];
    });
  let aggSaved: DashClause[] = [];
  const base = { sheetId: config.spec.sheetId };
  const filters: QuerySpec["filters"] = [];
  let spec: QuerySpec;
  let table: { sort: { index: number; dir: "asc" | "desc" } | null } | null = null;
  let pivot: PivotShape | null = null;
  switch (config.type) {
    case "pivot": {
      const p = config.spec;
      const dims = [...p.rows, ...(p.column ? [p.column] : [])];
      spec = {
        ...base,
        dimensions: dims.map((d) => ({
          column: name(d.column),
          ...(d.timeGrain ? { timeGrain: d.timeGrain } : {}),
        })),
        measures: p.values.map(measureOf),
        filters,
        sort: [],
        limit: 1,
      };
      // Saringan pembaca: field yang tidak ada di pivot ini (URL lama) atau nilainya tidak cocok tipe
      // dilewati, bukan gagal.
      const at = {
        row0: 0,
        row1: p.rows.length >= 2 ? 1 : -1,
        row2: p.rows.length >= 3 ? 2 : -1,
        row3: p.rows.length >= 4 ? 3 : -1,
        column: p.column ? p.rows.length : -1,
      };
      const notes: PivotNote[] = [];
      const saved = savedClauses(p.filters ?? [], notes);
      const list = body.pivotValues ? at[body.pivotValues] : undefined;
      if (list !== undefined && !dims[list]) {
        return {
          ok: false,
          code: "INVALID",
          message: "Bagian pivot ini sudah tidak ada. Muat ulang halaman.",
        };
      }
      const local = (body.pivotFilters ?? []).flatMap((f): PivotLocal[] => {
        if (f.field === body.pivotValues) return [];
        const dim = at[f.field];
        const d = dims[dim];
        const c = d ? byPos.get(d.column) : undefined;
        if (!d || !c || normName(c.name) !== normName(f.column) || d.timeGrain !== f.grain)
          return [];
        if (!f.values.every((v) => localValueOk(c.type, !!d.timeGrain, v))) return [];
        notes.push({
          label: c.name,
          type: c.type,
          ...(d.timeGrain ? { grain: d.timeGrain } : {}),
          op: f.op,
          values: f.values,
        });
        return [{ dim, op: f.op, values: f.values }];
      });
      const nested = p.rows.length > 2;
      const levels = pivotSubtotalLevels(p);
      const top = p.rows.flatMap((d, level) =>
        d.topN ? [{ level, n: d.topN.n, by: d.topN.by }] : [],
      );
      pivot = {
        rowFields: p.rows.length as PivotShape["rowFields"],
        column: !!p.column,
        sort: p.sort,
        totals: p.totals,
        // Level efektif sama dengan panel (pivotSubtotalLevels) untuk semua bentuk; spec 1.0.0 (tanpa
        // subtotalLevels) tetap `subtotals && 2 baris` → bentuk dan kunci cache tidak berubah.
        subtotals: levels.length > 0,
        ...(nested ? { levels } : {}),
        ...(top.length ? { top } : {}),
        ...(local.length ? { local } : {}),
        ...(saved.length ? { saved } : {}),
        ...(list !== undefined ? { list } : {}),
        ...(notes.length ? { notes } : {}),
      };
      break;
    }
    case "kpi": {
      aggSaved = savedClauses(extra.filters ?? []);
      const m = config.spec.measure;
      spec = {
        ...base,
        dimensions: [],
        measures: [measureOf(m)],
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
      aggSaved = savedClauses(extra.filters ?? []);
      // Kolom dulu (tersembunyi/hilang), baru tipenya: tipe kolom tersembunyi tidak boleh mengubah
      // jawaban (review T-016 SEC-1 — editor bisa mencoba posisi kolom apa pun saat menyimpan).
      const dimension = name(d.column);
      const measure = measureOf(m);
      if (unavailable) return { ok: false, code: "COLUMN_UNAVAILABLE", message: unavailable };
      const measureType = !isCalcValue(m) && m.column ? byPos.get(m.column)?.type : undefined;
      const dated = measureType === "date" || measureType === "timestamp";
      if (dated && !isCalcValue(m) && (m.agg === "min" || m.agg === "max")) {
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
        dimensions: [{ column: dimension, ...(d.timeGrain ? { timeGrain: d.timeGrain } : {}) }],
        measures: [measure],
        filters,
        sort: [SORT[config.spec.sort]],
        limit: config.spec.topN,
      };
    }
  }
  if (unavailable) return { ok: false, code: "COLUMN_UNAVAILABLE", message: unavailable };
  const resolved = resolveSpec(spec, schema);
  if (!resolved.ok) return { ok: false, code: "INVALID", message: resolved.message };
  const shows =
    config.type === "pivot"
      ? config.spec.values.map((v) => v.showAs)
      : config.type === "kpi" || config.type === "table"
        ? []
        : [config.spec.measure.showAs];
  const withShow = applyShowAs(resolved.plan, shows);
  if (!withShow.ok) return withShow;
  resolved.plan = withShow.plan;
  if (pivot) return { ok: true, kind: "pivot", spec, plan: resolved.plan, pivot };
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
  return {
    ok: true,
    kind: "agg",
    spec,
    plan: { ...resolved.plan, totals },
    ...(aggSaved.length ? { saved: aggSaved } : {}),
  };
}

/**
 * "Tampilkan nilai sebagai" (T-067) pada rencana: ukuran membawa showAs (dibaca pembangun SQL), kolom
 * keluarannya berjudul cara tampil ("% dari total kolom · Total Omzet") dan bertipe desimal untuk
 * persen. Hanya untuk nilai angka: Terkecil/Terbesar kolom tanggal → INVALID. Tanpa showAs rencana
 * tidak berubah (spec lama identik).
 */
function applyShowAs(
  plan: Plan,
  shows: (ShowAs | undefined)[],
): { ok: true; plan: Plan } | { ok: false; code: "INVALID"; message: string } {
  if (!shows.some(shown)) return { ok: true, plan };
  const nd = plan.dimensions.length;
  const measures = plan.measures.map((m, i) => (shown(shows[i]) ? { ...m, showAs: shows[i] } : m));
  const columns = [...plan.columns];
  for (const [i, s] of shows.entries()) {
    if (!shown(s)) continue;
    const c = columns[nd + i]!;
    if (c.type === "date" || c.type === "timestamp" || c.type === "text" || c.type === "boolean") {
      return {
        ok: false,
        code: "INVALID",
        message: `"Tampilkan nilai sebagai" hanya untuk nilai angka ("${c.label}"). Pilih "Nilai biasa" atau ukuran angka.`,
      };
    }
    columns[nd + i] = {
      ...c,
      label: showAsTitle(s, c.label),
      type: isPercentShowAs(s) ? "decimal" : c.type,
      showAs: s,
    };
  }
  return { ok: true, plan: { ...plan, measures, columns } };
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
