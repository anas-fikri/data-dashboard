"use client";

import { useSearchParams } from "next/navigation";
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { parseWidgetConfig } from "@/features/widgets/spec";
import { usePublishApplied } from "./applied-store";
import {
  defaultState,
  encodeFilterParam,
  filterKey,
  filterUrlValue,
  isDefaultState,
  filtersFor,
  normName,
  oneControlPerName,
  parseFilterParam,
  sanitize,
  URL_PARAM_MAX,
  type CrossFilter,
  type DashFilter,
  type FilterColumnView,
  type FilterState,
  type PivotFieldRole,
  type PivotFilter,
} from "./filter-model";
import { createStaleStore, type StaleStore } from "./stale-store";

/*
 * Status filter dashboard (T-012) untuk bilah filter dan semua widget. Perubahan langsung tampil di
 * kontrol/chip; widget baru memuat ulang setelah jeda singkat (beberapa klik beruntun = satu query per
 * widget). Sumbernya URL (?f=, dibaca lewat useSearchParams — bukan prop server yang bisa basi dari
 * cache router): perubahan pengguna ditulis dengan history.replaceState (tanpa perjalanan ke server,
 * riwayat tidak dibanjiri tiap centang), dan URL yang berubah dari luar — Back/Forward, tautan ganti
 * mode — diikuti. Pindah halaman lalu Back memulihkan filter dari URL entri itu.
 * Filter bawaan (T-vb7q): tanpa ?f= status = bawaan kolom filter; status yang sama dengan bawaan tidak
 * menulis ?f=, status kosong padahal ada bawaan menulis f={} ("Hapus semua" tetap kosong saat dimuat
 * ulang). Widget tetap menerima filter lewat dashboardFilters — server tidak mengenal bawaan.
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
  /** Filter bawaan kolom filter (T-vb7q); filters kosong = tanpa bawaan. */
  defaults: FilterState;
  /** Status filter dashboard sama dengan bawaan (tanpa filter silang/pivot). */
  atDefaults: boolean;
  /** Kembali ke filter bawaan (filter silang dilepas; saringan pivot tetap). */
  restoreDefaults: () => void;
  /** Filter terlalu panjang untuk URL: berlaku, tetapi hilang bila halaman dimuat ulang. */
  urlTooLong: boolean;
  widgetTitle: (id: string) => string;
  /** Periode kategori tanggal grafik (filter silang "Jan 2026", bukan rentang tanggal). */
  widgetGrain: (id: string) => string | undefined;
  setFilter: (column: string, f: DashFilter | null) => void;
  /** Slicer "Pilih semua" tanpa filter (semua tercentang): diingat per kolom selama halaman terbuka. */
  allMode: (column: string) => boolean;
  setAllMode: (column: string, on: boolean) => void;
  toggleCross: (widgetId: string, f: DashFilter) => void;
  clearCross: () => void;
  /** Hapus filter dashboard + filter silang; saringan pivot (milik tiap pivot) tetap. */
  clearAll: () => void;
  /** Ganti seluruh saringan satu pivot (T-f4a7); [] = lepas semua. */
  setPivot: (widgetId: string, list: PivotFilter[]) => void;
  /** Kartu yang menampilkan angka basi ("Memperbarui…"): satu pengumuman di bilah filter. */
  stale: StaleStore;
}

const FiltersContext = createContext<FiltersApi | null>(null);

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
  const defaults = useMemo(() => defaultState(columns), [columns]);
  const urlF = useSearchParams().get("f") ?? "";
  const fromUrl = (f: string) => (f ? parseFilterParam(f) : defaults);
  const [raw, setRaw] = useState(() => fromUrl(urlF));
  const ids = widgets.map((w) => w.id).join(",");
  const state = useMemo(
    () => sanitize(raw, { columns, crossColumns, widgetIds: ids.split(",") }),
    [raw, columns, crossColumns, ids],
  );
  // URL berubah: ikuti, kecuali URL itu memang tulisan status sekarang (replaceState kita sendiri).
  const [seenUrl, setSeenUrl] = useState(urlF);
  if (seenUrl !== urlF) {
    setSeenUrl(urlF);
    if (urlF !== filterUrlValue(state, defaults)) setRaw(fromUrl(urlF));
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
  usePublishApplied(dashboardId, applied.state); // tombol PDF di kepala halaman (T-018 D9)

  const urlTooLong = (encodeFilterParam(state)?.length ?? 0) > URL_PARAM_MAX;
  const atDefaults = isDefaultState(state, defaults);
  const [allMode, setAllMode] = useState<ReadonlySet<string>>(() => new Set());
  const [stale] = useState(createStaleStore);
  /** Perubahan pengguna: status baru + URL (di handler, bukan effect — status basi tidak ditulis). */
  const update = (next: FilterState) => {
    setRaw(next);
    const f = filterUrlValue(
      sanitize(next, { columns, crossColumns, widgetIds: ids.split(",") }),
      defaults,
    );
    const url = new URL(window.location.href);
    if (f) url.searchParams.set("f", f);
    else url.searchParams.delete("f");
    if (url.href !== window.location.href) window.history.replaceState(null, "", url.href);
  };

  // Ganti filter dashboard/silang tanpa menyentuh saringan pivot.
  const keep = (filters: DashFilter[], cross?: CrossFilter): FilterState => ({
    filters,
    ...(cross ? { cross } : {}),
    ...(state.pivot ? { pivot: state.pivot } : {}),
  });

  const api: FiltersApi = {
    dashboardId,
    columns,
    crossColumns,
    state,
    applied: applied.state,
    defaults,
    atDefaults,
    restoreDefaults: () => update(keep(defaults.filters)),
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
    allMode: (column) => allMode.has(normName(column)),
    setAllMode: (column, on) =>
      setAllMode((s) => {
        const k = normName(column);
        if (s.has(k) === on) return s;
        const next = new Set(s);
        if (on) next.add(k);
        else next.delete(k);
        return next;
      }),
    toggleCross: (widgetId, f) =>
      update(
        state.cross?.widgetId === widgetId && filterKey(state.cross.filter) === filterKey(f)
          ? keep(state.filters)
          : keep(state.filters, { widgetId, filter: f }),
      ),
    clearCross: () => update(keep(state.filters)),
    clearAll: () => update(keep([])),
    setPivot: (widgetId, list) => update({ ...state, pivot: { ...state.pivot, [widgetId]: list } }),
    stale,
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
  /** Pivot (T-f4a7): saringan yang dikirim (sudah diterapkan). */
  pivot: PivotFilter[];
  /** Pivot: saringan terkini (menu saring) + pengubahnya; null di luar dashboard. */
  pivotEdit: {
    current: PivotFilter[];
    /** Saringan satu field; null = lepas. */
    set: (field: PivotFieldRole, f: PivotFilter | null) => void;
    clear: () => void;
  } | null;
}

const NONE: WidgetFilters = {
  filters: [],
  selected: null,
  pick: null,
  canPick: () => false,
  pivot: [],
  pivotEdit: null,
};

/** Kartu melaporkan angka basi ke bilah filter (satu pengumuman untuk semua kartu, bukan per kartu). */
export function useReportStale(widgetId: string, stale: boolean) {
  const store = useContext(FiltersContext)?.stale;
  useEffect(() => {
    if (!store || !stale) return;
    store.set(widgetId, true);
    return () => store.set(widgetId, false);
  }, [store, widgetId, stale]);
}

/** Filter untuk satu widget; di luar dashboard (tanpa provider) tidak ada filter. */
export function useWidgetFilters(widgetId: string): WidgetFilters {
  const ctx = useContext(FiltersContext);
  if (!ctx) return NONE;
  const current = ctx.state.pivot?.[widgetId] ?? [];
  return {
    filters: filtersFor(ctx.applied, widgetId),
    selected: ctx.state.cross?.widgetId === widgetId ? ctx.state.cross.filter : null,
    pick: (f) => ctx.toggleCross(widgetId, f),
    canPick: (column) => ctx.crossColumns.some((n) => normName(n) === normName(column)),
    pivot: ctx.applied.pivot?.[widgetId] ?? [],
    pivotEdit: {
      current,
      set: (field, f) =>
        ctx.setPivot(widgetId, [...current.filter((x) => x.field !== field), ...(f ? [f] : [])]),
      clear: () => ctx.setPivot(widgetId, []),
    },
  };
}
