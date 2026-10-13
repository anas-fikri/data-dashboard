"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { parseWidgetConfig } from "@/features/widgets/spec";
import {
  encodeFilterParam,
  filterKey,
  filtersFor,
  normName,
  sanitize,
  URL_PARAM_MAX,
  type DashFilter,
  type FilterColumnView,
  type FilterState,
} from "./filter-model";

/*
 * Status filter dashboard (T-012) untuk bilah filter dan semua widget. Perubahan langsung tampil di
 * kontrol/chip; widget baru memuat ulang setelah jeda singkat (beberapa klik beruntun = satu query per
 * widget). Status ditulis ke ?f= dengan history.replaceState — tanpa perjalanan ke server; Next
 * menyinkronkannya ke useSearchParams (tautan ganti mode membawanya).
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

export function DashboardFiltersProvider({
  dashboardId,
  initial,
  columns,
  crossColumns,
  widgets,
  children,
}: {
  dashboardId: string;
  initial: FilterState;
  columns: FilterColumnView[];
  crossColumns: readonly string[];
  widgets: { id: string; title: string; type: string; spec: unknown }[];
  children: React.ReactNode;
}) {
  const [raw, setRaw] = useState(initial);
  const ids = widgets.map((w) => w.id).join(",");
  const state = useMemo(
    () => sanitize(raw, { columns, crossColumns, widgetIds: ids.split(",") }),
    [raw, columns, crossColumns, ids],
  );
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

  const encoded = encodeFilterParam(state);
  const urlTooLong = !!encoded && encoded.length > URL_PARAM_MAX;
  useEffect(() => {
    const url = new URL(window.location.href);
    if (encoded && !urlTooLong) url.searchParams.set("f", encoded);
    else url.searchParams.delete("f");
    if (url.href !== window.location.href) window.history.replaceState(null, "", url.href);
  }, [encoded, urlTooLong]);

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
      setRaw((s) => ({
        ...s,
        filters: [
          ...s.filters.filter((x) => normName(x.column) !== normName(column)),
          ...(f ? [f] : []),
        ],
      })),
    toggleCross: (widgetId, f) =>
      setRaw((s) =>
        s.cross?.widgetId === widgetId && filterKey(s.cross.filter) === filterKey(f)
          ? { filters: s.filters }
          : { filters: s.filters, cross: { widgetId, filter: f } },
      ),
    clearCross: () => setRaw((s) => ({ filters: s.filters })),
    clearAll: () => setRaw({ filters: [] }),
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
