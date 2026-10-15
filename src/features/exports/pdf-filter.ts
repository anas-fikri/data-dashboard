/*
 * Status filter PDF dashboard (T-018, D9). `f` dari tombol header = encodeFilterParam(status yang
 * berlaku di layar). Divalidasi dengan skema server (filterStateSchema, sama dengan dashboardFilters
 * /api/query) lalu disaring terhadap kolom filter + cross-filter dashboard SAAT INI dengan aturan yang
 * sama dengan DashboardFiltersProvider (oneControlPerName + sanitize): filter kolom yang tidak diizinkan
 * dibuang, persis seperti di layar. Dipakai saat buat ekspor dan lagi saat render. Murni.
 */
import {
  normName,
  oneControlPerName,
  sanitize,
  type FilterColumnView,
  type FilterState,
} from "@/components/dashboards/filters/filter-model";
import { filterText } from "@/components/dashboards/filters/filter-text";
import { filterStateSchema } from "@/features/query/filters";
import { parseWidgetConfig } from "@/features/widgets/spec";
import { PDF_FILTER_MAX } from "./schema";

export type { FilterState } from "@/components/dashboards/filters/filter-model";

/** Bagian dashboard yang menentukan filter mana yang berlaku (DashboardView memenuhinya). */
export interface FilterTarget {
  filterColumns: FilterColumnView[];
  crossFilterColumns: readonly string[];
  widgets: { id: string; title: string; type: string; spec: unknown }[];
}

/**
 * `f` → status filter. Tanpa `f` = tanpa filter; null = rusak/tidak valid — ditolak, bukan diam-diam
 * menjadi PDF tanpa filter (nilainya akan berbeda dengan layar).
 */
export function parsePdfFilter(f: string | null | undefined): FilterState | null {
  if (!f) return { filters: [] };
  if (f.length > PDF_FILTER_MAX) return null;
  try {
    const p = filterStateSchema.safeParse(JSON.parse(f));
    return p.success ? (p.data as FilterState) : null;
  } catch {
    return null;
  }
}

/** Saring status terhadap dashboard sekarang (sama dengan DashboardFiltersProvider). */
export function sanitizePdfFilter(state: FilterState, d: FilterTarget): FilterState {
  return sanitize(state, {
    columns: oneControlPerName(d.filterColumns),
    crossColumns: d.crossFilterColumns,
    widgetIds: d.widgets.map((w) => w.id),
  });
}

/** Status → nilai yang disimpan (Export.params / token render); undefined = tanpa filter. */
export function encodePdfFilter(state: FilterState): string | undefined {
  if (!state.filters.length && !state.cross) return undefined;
  return JSON.stringify(state.cross ? state : { filters: state.filters });
}

/** Periode kategori tanggal grafik sumber filter silang (teks "Jan 2026", sama dengan chip). */
function grainOf(w: FilterTarget["widgets"][number] | undefined): string | undefined {
  const p = w ? parseWidgetConfig(w.type, w.spec) : null;
  return p?.ok && "dimension" in p.config.spec ? p.config.spec.dimension.timeGrain : undefined;
}

/**
 * Ringkasan filter untuk kepala PDF, teks sama dengan chip filter di layar: "Kolom: isi; …" dan
 * "Disaring dari <widget>: <nilai>". Tanpa filter → "Tanpa filter".
 */
export function filterSummary(state: FilterState, d: FilterTarget): string {
  const columns = oneControlPerName(d.filterColumns);
  const parts = state.filters.map((f) => {
    const col = columns.find((c) => normName(c.column) === normName(f.column));
    return `${f.column}: ${filterText(f, col?.type)}`;
  });
  const cross = state.cross;
  if (cross) {
    const w = d.widgets.find((x) => x.id === cross.widgetId);
    const title = w?.title || "Widget tanpa judul";
    parts.push(`Disaring dari ${title}: ${filterText(cross.filter, undefined, grainOf(w))}`);
  }
  return parts.length ? parts.join("; ") : "Tanpa filter";
}
