"use client";

import { useSearchParams } from "next/navigation";
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { parseWidgetConfig } from "@/features/widgets/spec";
import {
  encodeFilterParam,
  filterKey,
  filtersFor,
  normName,
  oneControlPerName,
  parseFilterParam,
  sanitize,
  URL_PARAM_MAX,
  type DashFilter,
  type FilterColumnView,
  type FilterState,
} from "./filter-model";

/*
 * Status filter dashboard (T-012) untuk bilah filter dan semua widget. Perubahan langsung tampil di
 * kontrol/chip; widget baru memuat ulang setelah jeda singkat (beberapa klik beruntun = satu query per
 * widget). Sumbernya URL (?f=, dibaca lewat useSearchParams — bukan prop server yang bisa basi dari
 * cache router): perubahan pengguna ditulis dengan history.replaceState (tanpa perjalanan ke server,
 * riwayat tidak dibanjiri tiap centang), dan URL yang berubah dari luar — Back/Forward, tautan ganti
 * mode — diikuti. Pindah halaman lalu Back memulihkan filter dari URL entri itu.
 */
const APPLY_DELAY_MS = 150;

interface FiltersApi {
  dashboardId: string;
  columns: FilterColumnView[];
  crossColumns: readonly string[];
  /** Status terkini (kontrol, chip). */
  state: FilterState;
  /** Status yang sudah diterapkan ke widget (setelah jeda). */
  applied: FilterState;
  /** Filter terlalu panjang untuk URL: berlaku, tetapi hilang bila halaman dimuat ulang. */
  urlTooLong: boolean;
  widgetTitle: (id: string) => string;
  /** Periode kategori tanggal grafik (filter silang "Jan 2026", bukan rentang tanggal). */
  widgetGrain: (id: string) => string | undefined;
  setFilter: (column: string, f: DashFilter | null) => void;
  toggleCross: (widgetId: string, f: DashFilter) => void;
  clearCross: () => void;
  clearAll: () => void;
}

const FiltersContext = createContext<FiltersApi | null>(null);

/** Nilai ?f= yang ditulis untuk status ini ("" = tanpa f: kosong, atau terlalu panjang untuk URL). */
function urlValue(state: FilterState): string {
  const encoded = encodeFilterParam(state);
  return encoded && encoded.length <= URL_PARAM_MAX ? encoded : "";
}

export function DashboardFiltersProvider({
  dashboardId,
  columns: allColumns,
  crossColumns,
  widgets,
  children,
}: {
  dashboardId: string;
  columns: FilterColumnView[];
  crossColumns: readonly string[];
  widgets: { id: string; title: string; type: string; spec: unknown }[];
  children: React.ReactNode;
}) {
  const columns = useMemo(() => oneControlPerName(allColumns), [allColumns]);
  const urlF = useSearchParams().get("f") ?? "";
  const [raw, setRaw] = useState(() => parseFilterParam(urlF));
  const ids = widgets.map((w) => w.id).join(",");
  const state = useMemo(
    () => sanitize(raw, { columns, crossColumns, widgetIds: ids.split(",") }),
    [raw, columns, crossColumns, ids],
  );
  // URL berubah: ikuti, kecuali URL itu memang tulisan status sekarang (replaceState kita sendiri).
  const [seenUrl, setSeenUrl] = useState(urlF);
  if (seenUrl !== urlF) {
    setSeenUrl(urlF);
    if (urlF !== urlValue(state)) setRaw(parseFilterParam(urlF));
  }
  const key = JSON.stringify(state);
  const [applied, setApplied] = useState({ key, state });
  useEffect(() => {
    if (applied.key === key) return;
    const t = setTimeout(
      () => setApplied({ key, state: JSON.parse(key) as FilterState }),
      APPLY_DELAY_MS,
    );
    return () => clearTimeout(t);
  }, [key, applied.key]);

  const urlTooLong = !!encodeFilterParam(state) && !urlValue(state);
  /** Perubahan pengguna: status baru + URL (di handler, bukan effect — status basi tidak ditulis). */
  const update = (next: FilterState) => {
    setRaw(next);
    const f = urlValue(sanitize(next, { columns, crossColumns, widgetIds: ids.split(",") }));
    const url = new URL(window.location.href);
    if (f) url.searchParams.set("f", f);
    else url.searchParams.delete("f");
    if (url.href !== window.location.href) window.history.replaceState(null, "", url.href);
  };

  const api: FiltersApi = {
    dashboardId,
    columns,
    crossColumns,
    state,
    applied: applied.state,
    urlTooLong,
    widgetTitle: (id) => widgets.find((w) => w.id === id)?.title || "Widget tanpa judul",
    widgetGrain: (id) => {
      const w = widgets.find((x) => x.id === id);
      const p = w ? parseWidgetConfig(w.type, w.spec) : null;
      return p?.ok && "dimension" in p.config.spec ? p.config.spec.dimension.timeGrain : undefined;
    },
    setFilter: (column, f) =>
      update({
        ...state,
        filters: [
          ...state.filters.filter((x) => normName(x.column) !== normName(column)),
          ...(f ? [f] : []),
        ],
      }),
    toggleCross: (widgetId, f) =>
      update(
        state.cross?.widgetId === widgetId && filterKey(state.cross.filter) === filterKey(f)
          ? { filters: state.filters }
          : { filters: state.filters, cross: { widgetId, filter: f } },
      ),
    clearCross: () => update({ filters: state.filters }),
    clearAll: () => update({ filters: [] }),
  };
  return <FiltersContext.Provider value={api}>{children}</FiltersContext.Provider>;
}

/** Untuk bilah filter (di dalam provider). */
export function useDashboardFilters(): FiltersApi {
  const ctx = useContext(FiltersContext);
  if (!ctx) throw new Error("useDashboardFilters di luar DashboardFiltersProvider");
  return ctx;
}

export interface WidgetFilters {
  /** Filter yang dikirim widget ini (sudah diterapkan). */
  filters: DashFilter[];
  /** Filter silang yang berasal dari widget ini (disorot, tidak menyaring dirinya). */
  selected: DashFilter | null;
  /** Kategori kolom ini boleh menyaring widget lain (null = tidak bisa sama sekali). */
  pick: ((f: DashFilter) => void) | null;
  canPick: (column: string) => boolean;
}

const NONE: WidgetFilters = { filters: [], selected: null, pick: null, canPick: () => false };

/** Filter untuk satu widget; di luar dashboard (tanpa provider) tidak ada filter. */
export function useWidgetFilters(widgetId: string): WidgetFilters {
  const ctx = useContext(FiltersContext);
  if (!ctx) return NONE;
  return {
    filters: filtersFor(ctx.applied, widgetId),
    selected: ctx.state.cross?.widgetId === widgetId ? ctx.state.cross.filter : null,
    pick: (f) => ctx.toggleCross(widgetId, f),
    canPick: (column) => ctx.crossColumns.some((n) => normName(n) === normName(column)),
  };
}
