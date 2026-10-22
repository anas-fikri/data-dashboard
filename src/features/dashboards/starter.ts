/*
 * Dashboard contoh (T-zm9k): rencana widget + kolom filter dari skema sheet pertama yang berisi kolom,
 * memakai isian bawaan pintar yang sama dengan widget baru di panel (T-12zs: defaultConfig,
 * smart-defaults) dan judul otomatis (autoTitle). Tata letak 12 kolom: baris angka (KPI), baris
 * grafik (garis per tanggal, batang per kategori), lalu tabel data selebar kanvas. Dataset tanpa kolom
 * angka/tanggal/kategori tetap mendapat KPI jumlah baris + tabel. Server tetap memvalidasi setiap
 * widget (checkConfig) dan kolom filter (checkFilterColumns) sebelum menyimpan. Murni.
 */
import { autoTitle } from "@/components/dashboards/auto-title";
import {
  CATEGORY_MAX,
  CATEGORY_MIN,
  categoryCandidates,
  dateCandidates,
} from "@/components/dashboards/smart-defaults";
import { defaultConfig } from "@/components/dashboards/widget-config-model";
import type { WidgetConfig } from "@/features/widgets/spec";
import type { FilterColumn } from "./filter-columns";
import type { SourceSheet } from "./service";
import { GRID_COLS, type LayoutItem } from "./validation";

export interface StarterWidget {
  type: Exclude<WidgetConfig["type"], "empty">;
  spec: unknown;
  title: string;
  /** Posisi tanpa id (id widget baru dibuat saat disimpan). */
  layout: Omit<LayoutItem, "i">;
}

export interface StarterPlan {
  widgets: StarterWidget[];
  filterColumns: FilterColumn[];
}

const KPI_H = 3;
const CHART_H = 6;
const TABLE_H = 7;
/** Kolom filter contoh: tanggal + kategori (≥ 2 bila datanya ada), paling banyak 3. */
const FILTERS_MAX = 3;

const EMPTY: WidgetConfig = { type: "empty", spec: {} };

/** Satu baris berisi `n` widget selebar sama (sisa kolom ke widget terakhir). */
function row(n: number, y: number, h: number): Omit<LayoutItem, "i">[] {
  const w = Math.floor(GRID_COLS / n);
  return Array.from({ length: n }, (_, k) => ({
    x: k * w,
    y,
    w: k === n - 1 ? GRID_COLS - k * w : w,
    h,
  }));
}

/** Kategori 2–50 nilai unik (tanpa statistik: dianggap cocok, perilaku skema lama). */
const goodCategories = (cols: SourceSheet["columns"]) =>
  categoryCandidates(cols).filter(
    (c) => c.distinct === undefined || (c.distinct >= CATEGORY_MIN && c.distinct <= CATEGORY_MAX),
  );

/**
 * Susun ulang lebar per baris (y sama) setelah sebagian widget dibuang validasi server: sisa widget
 * berbagi baris itu lagi, tanpa lubang mendatar.
 */
export function relayout(widgets: StarterWidget[]): StarterWidget[] {
  const ys = [...new Set(widgets.map((w) => w.layout.y))];
  return ys.flatMap((y) => {
    const inRow = widgets.filter((w) => w.layout.y === y);
    const slots = row(inRow.length, y, inRow[0]!.layout.h);
    return inRow.map((w, k) => ({ ...w, layout: slots[k]! }));
  });
}

export function starterPlan(sources: SourceSheet[]): StarterPlan {
  const sheet = sources.find((s) => s.columns.length);
  if (!sheet) return { widgets: [], filterColumns: [] };
  const only = [sheet];
  const cols = sheet.columns;
  const configs = (type: StarterWidget["type"]) => defaultConfig(type, only, EMPTY, sheet.id);

  const kpis: WidgetConfig[] = [];
  const total = configs("kpi");
  if (total) kpis.push(total);
  // Ada kolom besaran: KPI kedua = jumlah baris (KPI pertama sudah jumlah baris bila tidak ada).
  if (total?.type === "kpi" && "agg" in total.spec.measure && total.spec.measure.agg !== "count") {
    kpis.push({ ...total, spec: { ...total.spec, measure: { agg: "count" } } });
  }
  const charts: WidgetConfig[] = [];
  if (dateCandidates(cols).length) {
    const line = configs("line");
    if (line) charts.push(line);
  }
  // Batang hanya bila ada kategori yang enak dibaca (2–50 nilai unik); nomor resi dsb. tidak.
  if (goodCategories(cols).length) {
    const bar = configs("bar");
    if (bar) charts.push(bar);
  }
  const table = configs("table");

  const widgets: StarterWidget[] = [];
  const add = (list: WidgetConfig[], y: number, h: number) => {
    const slots = row(list.length, y, h);
    list.forEach((c, k) => {
      if (c.type === "empty") return;
      widgets.push({
        type: c.type,
        spec: c.spec,
        title: autoTitle({ type: c.type, spec: c.spec }, only),
        layout: slots[k]!,
      });
    });
  };
  let y = 0;
  if (kpis.length) {
    add(kpis, y, KPI_H);
    y += KPI_H;
  }
  if (charts.length) {
    add(charts, y, CHART_H);
    y += CHART_H;
  }
  if (table) add([table], y, TABLE_H);

  // Kolom filter: tanggal terbaik + kategori dengan 2–50 nilai unik (slicer yang enak dipakai).
  const date = dateCandidates(cols)[0];
  const cats = goodCategories(cols);
  const filterColumns = [...(date ? [date] : []), ...cats]
    .slice(0, FILTERS_MAX)
    .map((c) => ({ sheet: sheet.name, column: c.name }));
  return { widgets, filterColumns };
}
