"use client";

import {
  IconAlertTriangle,
  IconArrowsSort,
  IconCornerDownLeft,
  IconFilterOff,
  IconLayoutColumns,
  IconLoader2,
  IconRefresh,
  IconSearch,
  IconX,
} from "@tabler/icons-react";
import {
  CellStyleModule,
  ColumnApiModule,
  ColumnAutoSizeModule,
  EventApiModule,
  InfiniteRowModelModule,
  LocaleModule,
  ModuleRegistry,
  RenderApiModule,
  RowApiModule,
  ScrollApiModule,
  themeQuartz,
  TooltipModule,
  type BodyScrollEndEvent,
  type CellFocusedEvent,
  type ColDef,
  type GridApi,
  type GridReadyEvent,
  type IDatasource,
  type IGetRowsParams,
  type SortChangedEvent,
  type SuppressHeaderKeyboardEventParams,
  type SuppressKeyboardEventParams,
  type ValueFormatterParams,
} from "ag-grid-community";
import { AgGridReact } from "ag-grid-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import type { DashFilter } from "@/components/dashboards/filters/filter-model";
import { filterText } from "@/components/dashboards/filters/filter-text";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { NumberFormat } from "@/features/widgets/spec";
import { fetchBlock, type RowData } from "./grid-fetch";
import { GridFilterDialog, type FilterTarget } from "./grid-filter-dialog";
import {
  GridHeader,
  isHeaderMenuKey,
  type GridHeaderParams,
  type HeaderAction,
} from "./grid-header";
import { fixBottom, guardFocus, installWheelFix, visibleRowRange } from "./grid-mitigations";
import {
  BLOCK_SIZE,
  blockNearView,
  cellMatches,
  colIdOf,
  colLetter,
  displayCell,
  filteredCountText,
  fmtInt,
  loadSettings,
  MAX_FILTERS,
  MAX_FROZEN,
  MAX_SORT,
  normalizeSearchText,
  numericType,
  parseRowInput,
  posOf,
  saveSettings,
  SEARCH_TEXT_MAX,
  searchColumns,
  settingsKey,
  sortAnnouncement,
  sortFromModel,
  statusText,
  Store,
  type BodyFilter,
  type GridColumn,
  type GridSearch,
  type GridSettings,
  type SortDir,
} from "./grid-model";

/*
 * Grid "Lihat data" (T-043, rencana G-6 §3, ADR-0007): AG Grid Community 36.2.0 Infinite Row Model di
 * atas POST /api/sheets/:id/rows (blok 200 baris, ≤ 50 blok di memori, debounce 150 ms, 2 permintaan
 * bersamaan, blok yang sudah digulir lewat dibatalkan lewat AbortSignal). Baris sentinel "Akhir data"
 * setelah baris terakhir (aria-rowcount = total + 2, didokumentasikan di ADR-0007). Dimuat lazy tanpa
 * SSR (sheet-grid-loader.tsx); modul AG didaftarkan satu per satu (JANGAN AllCommunityModule).
 *
 * T-044: urut (klik/Shift+klik kepala kolom atau menu kolom, ≤ 3 kolom; model urut AG dipakai apa
 * adanya sehingga aria-sort dipasang AG), saring per kolom (Alt+↓ / menu → dialog, chip + "Hapus semua
 * saringan"), dan cari (Ctrl+F di dalam grid, ≤ 10 kolom teks terlihat, server membatasi 10 detik,
 * bisa dibatalkan). Semuanya dihitung server; perubahan urut/saring/cari membatalkan blok yang
 * berjalan dan memulai cache baru (nomor baris = posisi di tampilan baru).
 */
ModuleRegistry.registerModules([
  InfiniteRowModelModule,
  ScrollApiModule,
  RowApiModule,
  ColumnApiModule,
  ColumnAutoSizeModule,
  TooltipModule,
  CellStyleModule,
  LocaleModule,
  EventApiModule,
  RenderApiModule,
]);

// Nilai berupa var() token: ganti tema (.dark) langsung berlaku tanpa render ulang.
const theme = themeQuartz.withParams({
  backgroundColor: "hsl(var(--card))",
  foregroundColor: "hsl(var(--card-foreground))",
  textColor: "hsl(var(--card-foreground))",
  chromeBackgroundColor: "hsl(var(--muted))",
  headerBackgroundColor: "hsl(var(--muted))",
  headerTextColor: "hsl(var(--foreground))",
  borderColor: "hsl(var(--border))",
  accentColor: "hsl(var(--ring))",
  rowHoverColor: "hsl(var(--accent))",
  selectedRowBackgroundColor: "hsl(var(--primary) / 0.12)",
  browserColorScheme: "inherit",
  fontFamily: "inherit",
  fontSize: 14,
  rowHeight: 32,
  headerHeight: 56,
  wrapperBorderRadius: "var(--radius)",
});

const LOCALE = {
  loadingOoo: "Memuat…",
  noRowsToShow: "Tidak ada baris",
  ariaRowSelect: "Tekan Spasi untuk memilih baris ini",
  ariaSearch: "Cari",
  ariaSortableColumn: "Klik untuk mengurutkan. Enter membuka menu kolom, Alt+Panah bawah menyaring",
};

const ROWNUM = "n";

const defaultWidth = (c: GridColumn) =>
  c.type === "text"
    ? 200
    : c.type === "boolean"
      ? 110
      : c.type === "timestamp"
        ? 170
        : c.type === "date"
          ? 130
          : 140;

/** Ctrl/Cmd+Home/End ditangani sendiri (ADR-0007: AG macOS tidak bereaksi). */
const isJumpKey = (e: KeyboardEvent) =>
  (e.ctrlKey || e.metaKey) && (e.key === "Home" || e.key === "End");

// Stabil (di luar render): objek baru tiap render membuat AG menerapkan ulang definisi kolom dan
// menghapus perubahan pengguna (beku, lebar).
const DEFAULT_COL: ColDef<RowData> = {
  sortable: false,
  suppressKeyboardEvent: (p: SuppressKeyboardEventParams<RowData>) =>
    isJumpKey(p.event) || isFindKey(p.event) || (p.event.altKey && p.event.key === "ArrowDown"),
};

/** Ctrl/Cmd+F di dalam grid = Cari di data (bukan cari halaman browser). */
const isFindKey = (e: KeyboardEvent) =>
  (e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === "f";

/** Enter dan Alt+↓ di kepala kolom ditangani GridHeader (menu/saring), bukan urut bawaan AG. */
const suppressHeaderKey = (p: SuppressHeaderKeyboardEventParams<RowData>) =>
  isHeaderMenuKey(p.event);

const EMPTY_SET: ReadonlySet<string> = new Set();

type SortState = { colId: string; sort: SortDir };

/** Kolom yang sedang diurutkan, berurut sortIndex. */
function sortedState(api: GridApi<RowData>): SortState[] {
  return api
    .getColumnState()
    .filter((c) => c.sort === "asc" || c.sort === "desc")
    .sort((a, b) => (a.sortIndex ?? 0) - (b.sortIndex ?? 0))
    .map((c) => ({ colId: c.colId, sort: c.sort as SortDir }));
}

/** Terapkan daftar urut persis (kolom lain dilepas); AG memicu sortChanged → cache baru. */
function applySort(api: GridApi<RowData>, list: SortState[]) {
  api.applyColumnState({
    state: list.map((c, i) => ({ colId: c.colId, sort: c.sort, sortIndex: i })),
    defaultState: { sort: null, sortIndex: null },
  });
}

interface InFlight {
  start: number;
  end: number;
  ctrl: AbortController;
  /** Generasi cache saat permintaan dibuat; batal karena purge (generasi lama) tidak dicatat. */
  gen: number;
}

const storage = () => (typeof window === "undefined" ? null : window.localStorage);

export interface SheetGridProps {
  sheetId: string;
  sheetName: string;
  versionId: string;
  schemaRevision: number;
  columns: GridColumn[];
  nonce?: string;
}

export default function SheetGrid({
  sheetId,
  sheetName,
  versionId,
  schemaRevision,
  columns,
  nonce,
}: SheetGridProps) {
  const router = useRouter();
  const uid = useId();
  const boxRef = useRef<HTMLDivElement>(null);
  const apiRef = useRef<GridApi<RowData> | null>(null);
  const offWheel = useRef<(() => void) | null>(null);
  const inflight = useRef(new Set<InFlight>());
  const aborted = useRef(new Set<number>());
  const gen = useRef(0);
  const retryTimer = useRef<number | null>(null);
  const sweepRef = useRef<() => void>(() => {});
  const totalRef = useRef<number | null>(null);
  const saveTimer = useRef<number | null>(null);
  const rangeFrame = useRef<number | null>(null);

  const key = settingsKey(sheetId, schemaRevision);
  const byId = useMemo(() => new Map(columns.map((c) => [colIdOf(c.pos), c])), [columns]);
  const known = useMemo(() => columns.map((c) => colIdOf(c.pos)), [columns]);
  // Dibaca sekali saat mount (komponen hanya di klien); storage diblokir → kosong.
  const [initial] = useState<GridSettings>(() => loadSettings(storage, key, known));
  const formats = useRef<Record<string, NumberFormat>>({ ...initial.formats });

  /** Baris tampilan saat ini (setelah saring/cari); `all` = baris sheet. */
  const [total, setTotal] = useState<number | null>(null);
  const [all, setAll] = useState<number | null>(null);
  const [range, setRange] = useState<{ first: number; last: number } | null>(null);
  const [versionChanged, setVersionChanged] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [announce, setAnnounce] = useState("");
  const [goText, setGoText] = useState("");
  const [goError, setGoError] = useState<string | null>(null);
  const [hidden, setHidden] = useState<Set<string>>(
    () => new Set(initial.columns.filter((c) => c.hide).map((c) => c.colId)),
  );

  // T-044: saringan per kolom (DashFilter.column = colId), cari, dan status muat tampilan baru.
  const [filters, setFilters] = useState<Record<string, DashFilter>>({});
  const filtersRef = useRef<Record<string, DashFilter>>({});
  const [search, setSearch] = useState<GridSearch | null>(null);
  const [searchText, setSearchText] = useState("");
  const [searchError, setSearchError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [timeoutMsg, setTimeoutMsg] = useState<string | null>(null);
  const [sortCount, setSortCount] = useState(0);
  const [filterTarget, setFilterTarget] = useState<FilterTarget | null>(null);
  const [filteredStore] = useState(() => new Store<ReadonlySet<string>>(EMPTY_SET));
  const searchRef = useRef<GridSearch | null>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  /** Pengumuman setelah blok pertama tampilan baru dimuat (jumlah hasil). */
  const pendingAnnounce = useRef<"filter" | "search" | null>(null);

  /** Posisi kolom data yang diminta: semua kolom yang tidak disembunyikan pengguna. */
  const requestCols = useCallback(() => {
    const api = apiRef.current;
    const shown = columns.filter((c) => {
      const col = api?.getColumn(colIdOf(c.pos));
      return col ? col.isVisible() : !hidden.has(colIdOf(c.pos));
    });
    return (shown.length ? shown : columns.slice(0, 1)).map((c) => c.pos);
  }, [columns, hidden]);
  const requestColsRef = useRef(requestCols);
  useEffect(() => {
    requestColsRef.current = requestCols;
  }, [requestCols]);

  const persist = useCallback(() => {
    if (saveTimer.current !== null) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      const api = apiRef.current;
      if (!api || api.isDestroyed()) return;
      const state = api
        .getColumnState()
        .filter((s) => s.colId !== ROWNUM)
        .map((s) => ({
          colId: s.colId,
          ...(s.width != null ? { width: s.width } : {}),
          ...(s.hide ? { hide: true } : {}),
          ...(s.pinned === "left" ? { pinned: true } : {}),
        }));
      saveSettings(storage, key, { columns: state, formats: formats.current });
    }, 300);
  }, [key]);

  const bodyFilters = useMemo<BodyFilter[]>(
    () =>
      Object.entries(filters).flatMap(([id, f]) => {
        const pos = posOf(id);
        if (pos === null) return [];
        const { column: _c, ...rest } = f;
        return [{ pos, ...rest } as BodyFilter];
      }),
    [filters],
  );

  const datasource = useMemo<IDatasource>(
    () => ({
      getRows(p: IGetRowsParams) {
        const known = totalRef.current;
        // Blok yang hanya memuat sentinel (setelah baris terakhir): tanpa permintaan.
        if (known !== null && p.startRow >= known) {
          const rows: RowData[] =
            p.startRow === known ? [{ n: known + 1, _row: -1, end: true }] : [];
          p.successCallback(rows, known + 1);
          return;
        }
        const entry: InFlight = {
          start: p.startRow,
          end: p.endRow,
          ctrl: new AbortController(),
          gen: gen.current,
        };
        inflight.current.add(entry);
        void fetchBlock({
          sheetId,
          versionId,
          schemaRevision,
          rowStart: p.startRow,
          rowCount: p.endRow - p.startRow,
          cols: requestColsRef.current(),
          // Model urut AG berurut sortIndex; lebih dari 3 dipangkas (onSortChanged melepas sisanya).
          query: { sort: sortFromModel(p.sortModel), filters: bodyFilters, search },
          signal: entry.ctrl.signal,
        }).then((r) => {
          inflight.current.delete(entry);
          // Jawaban tampilan lama (urut/saring/cari sudah berganti): AG mengabaikan blok cache lama;
          // jumlah barisnya tidak boleh menimpa jumlah tampilan baru.
          if (entry.gen !== gen.current) {
            p.failCallback();
            return;
          }
          if (r.ok) {
            const n = r.filteredTotal;
            totalRef.current = n;
            setTotal(n);
            setAll(r.total);
            setLoadError(null);
            setTimeoutMsg(null);
            setLoading(false);
            const what = pendingAnnounce.current;
            if (what) {
              pendingAnnounce.current = null;
              setAnnounce(
                what === "search" ? `Ditemukan di ${fmtInt(n)} baris` : `${fmtInt(n)} baris cocok`,
              );
            }
            const rows = r.rows;
            if (p.startRow + rows.length === n && p.endRow > n) {
              rows.push({ n: n + 1, _row: -1, end: true });
            }
            p.successCallback(rows, n + 1);
            return;
          }
          if (r.kind === "aborted" || r.kind === "busy") {
            // Dibatalkan (digulir lewat) atau slot server masih penuh (review T-043 M1): bukan galat;
            // blok dimuat ulang saat terlihat. Batal karena purge (generasi lama) tidak dicatat.
            if (entry.gen === gen.current) aborted.current.add(p.startRow);
            if (r.kind === "busy" && retryTimer.current === null) {
              retryTimer.current = window.setTimeout(() => {
                retryTimer.current = null;
                sweepRef.current();
              }, 1000);
            }
          } else if (r.kind === "version") setVersionChanged(true);
          else if (r.kind === "timeout") {
            // AC4: urut/cari terlalu berat → pesan + jalan keluar; grid tetap bisa dipakai.
            setTimeoutMsg(r.message);
            setLoading(false);
            pendingAnnounce.current = null;
            setAnnounce(r.message);
          } else {
            setLoadError(r.message);
            setLoading(false);
          }
          p.failCallback();
        });
      },
    }),
    [sheetId, versionId, schemaRevision, bodyFilters, search],
  );

  /**
   * Tampilan berganti (urut/saring/cari): batalkan semua blok yang berjalan (slot server dilepas),
   * lupakan jumlah lama; AG membuat cache baru (datasource baru / event urut) dari baris 1.
   */
  const startView = useCallback((announce: "filter" | "search" | null) => {
    gen.current++;
    for (const f of inflight.current) f.ctrl.abort();
    aborted.current.clear();
    totalRef.current = null;
    pendingAnnounce.current = announce;
    // Jumlah tampilan lama tidak boleh tampil untuk tampilan baru (review T-044 #1).
    setTotal(null);
    setAll(null);
    setLoading(true);
    setLoadError(null);
    setTimeoutMsg(null);
  }, []);

  const setAllFilters = useCallback(
    (next: Record<string, DashFilter>) => {
      filtersRef.current = next;
      filteredStore.set(new Set(Object.keys(next)));
      setFilters(next);
      startView("filter");
    },
    [filteredStore, startView],
  );

  const applyFilter = useCallback(
    (colId: string, f: DashFilter | null) => {
      const prev = filtersRef.current;
      if (!f && !(colId in prev)) return;
      if (f && !(colId in prev) && Object.keys(prev).length >= MAX_FILTERS) {
        setAnnounce(`Paling banyak ${MAX_FILTERS} kolom bisa disaring sekaligus`);
        return;
      }
      const next = { ...prev };
      if (f) next[colId] = { ...f, column: colId };
      else delete next[colId];
      setAllFilters(next);
    },
    [setAllFilters],
  );

  const clearFilters = useCallback(() => setAllFilters({}), [setAllFilters]);

  const applySearch = useCallback(
    (next: GridSearch | null) => {
      searchRef.current = next;
      setSearch(next);
      startView(next ? "search" : null);
      if (!next) setAnnounce("Pencarian dihapus");
    },
    [startView],
  );

  /** Buang semua blok (dan batalkan yang berjalan); blok yang terlihat dimuat ulang. */
  const purge = useCallback(() => {
    const api = apiRef.current;
    if (!api || api.isDestroyed()) return;
    gen.current++;
    for (const f of inflight.current) f.ctrl.abort();
    aborted.current.clear();
    api.purgeInfiniteCache();
  }, []);

  /** Batalkan blok yang sudah jauh dari layar; blok gagal-batal yang kembali terlihat dimuat ulang. */
  const sweep = useCallback(() => {
    const api = apiRef.current;
    if (!api || api.isDestroyed()) return;
    const first = api.getFirstDisplayedRowIndex();
    const last = api.getLastDisplayedRowIndex();
    if (first < 0 || last < 0) return;
    for (const f of inflight.current) {
      if (!blockNearView(f.start, f.end, first, last)) f.ctrl.abort();
    }
    for (const start of aborted.current) {
      if (start <= last && start + BLOCK_SIZE > first) {
        purge();
        break;
      }
    }
  }, [purge]);
  useEffect(() => {
    sweepRef.current = sweep;
  }, [sweep]);

  const updateRange = useCallback(() => {
    if (rangeFrame.current !== null) return;
    rangeFrame.current = requestAnimationFrame(() => {
      rangeFrame.current = null;
      const r = visibleRowRange(boxRef.current);
      setRange(r ? { first: r.first + 1, last: r.last + 1 } : null);
      sweep();
    });
  }, [sweep]);

  const goTo = useCallback((n: number, colId?: string) => {
    const api = apiRef.current;
    const t = totalRef.current;
    if (!api || t === null || t < 1) return;
    const row = Math.min(Math.max(1, n), t);
    const focused = api.getFocusedCell();
    const col =
      colId ??
      (focused && focused.column.getColId() !== ROWNUM ? focused.column.getColId() : null) ??
      api
        .getAllDisplayedColumns()
        .find((c) => c.getColId() !== ROWNUM)
        ?.getColId() ??
      ROWNUM;
    // ADR-0007 mitigasi 4: 'middle', bukan 'top' (meleset 3–30 px saat stretching).
    api.ensureIndexVisible(row - 1, "middle");
    api.setFocusedCell(row - 1, col);
    // setFocusedCell tidak selalu memindahkan fokus DOM (mis. dari kotak "Ke baris"): fokuskan sel
    // setelah baris dirender agar panah/PageDown langsung bekerja dari baris tujuan.
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        const el = boxRef.current?.querySelector<HTMLElement>(
          `.ag-row[row-index="${row - 1}"] [col-id="${col}"]`,
        );
        if (el && !el.contains(document.activeElement)) el.focus();
      }),
    );
    setAnnounce(`Ke baris ${fmtInt(row)}`);
  }, []);

  // Kolom: urutan, lebar, sembunyi, dan beku dari pengaturan tersimpan (AC 3). Dibuat sekali per mount
  // (grid di-mount ulang per sheet + revisi skema): definisi baru membuat AG menerapkan ulang kolom dan
  // membuang perubahan pengguna yang belum tersimpan.
  const [columnDefs] = useState<ColDef<RowData>[]>(() => {
    const saved = new Map(initial.columns.map((c, i) => [c.colId, { ...c, order: i }]));
    const ordered = [...columns].sort((a, b) => {
      const sa = saved.get(colIdOf(a.pos))?.order ?? Infinity;
      const sb = saved.get(colIdOf(b.pos))?.order ?? Infinity;
      return sa === sb ? a.pos - b.pos : sa - sb;
    });
    const headerParams = (c: GridColumn): GridHeaderParams => ({
      letter: colLetter(c.pos),
      type: c.type,
      menuState: (id) => menuStateRef.current(id),
      onAction: (id, a) => actionRef.current(id, a),
      filtered: filteredStore,
    });
    return [
      {
        colId: ROWNUM,
        headerName: "Baris",
        pinned: "left",
        lockPosition: "left",
        lockPinned: true,
        suppressMovable: true,
        resizable: false,
        width: 96,
        cellClass: "dd-grid-rownum",
        headerClass: "dd-grid-rownum-header",
        valueGetter: (p) => (p.data?.end ? null : (p.data?.n ?? null)),
        valueFormatter: (p: ValueFormatterParams<RowData>) =>
          p.data?.end ? "Akhir data" : typeof p.value === "number" ? fmtInt(p.value) : "",
      },
      ...ordered.map<ColDef<RowData>>((c) => {
        const id = colIdOf(c.pos);
        const s = saved.get(id);
        return {
          colId: id,
          field: id,
          headerName: c.name,
          width: s?.width ?? defaultWidth(c),
          hide: Boolean(s?.hide),
          pinned: s?.pinned ? "left" : null,
          lockPinned: true,
          // Urut dihitung server (Infinite Row Model meneruskan sortModel); AG memasang aria-sort.
          sortable: true,
          suppressHeaderKeyboardEvent: suppressHeaderKey,
          resizable: true,
          headerComponent: GridHeader,
          headerComponentParams: headerParams(c),
          headerTooltip:
            c.original && c.original !== c.name
              ? `Kolom ${colLetter(c.pos)} di file asli: "${c.original}"`
              : `Kolom ${colLetter(c.pos)} di file asli`,
          cellClass: (p) => {
            const cls: string[] = numericType(c.type) ? ["dd-grid-num"] : [];
            const q = searchRef.current;
            // AC3: sel cocok di kolom yang dicari disorot (teks tampil, ≤ 500 karakter).
            if (q && q.cols.includes(c.pos) && cellMatches(p.value, q.text)) {
              cls.push("dd-grid-match");
            }
            return cls;
          },
          valueFormatter: (p: ValueFormatterParams<RowData>) =>
            displayCell(p.value, c.type, formats.current[id], Boolean(p.data?.cut?.includes(id))) ??
            "",
        };
      }),
    ];
  });

  const headerCell = (id: string) =>
    boxRef.current?.querySelector<HTMLElement>(`.ag-header-cell[col-id="${CSS.escape(id)}"]`) ??
    null;

  /**
   * Fokus kembali setelah dialog saring: dari kepala kolom → kepala kolom itu; dari sel → sel kolom
   * itu di baris pertama tampilan baru (baris lama sudah dibuang), menunggu baris dirender ≤ ~1 detik
   * dengan kepala kolom sebagai pegangan sementara agar fokus tidak jatuh ke <body>.
   */
  const focusAfterFilter = useCallback((id: string, from: HTMLElement | null, applied: boolean) => {
    const head = headerCell(id);
    const fromCell = Boolean(from?.closest(".ag-cell"));
    if (!fromCell || !applied) {
      // Batal (tanpa perubahan): kembali ke elemen asal bila masih ada.
      const el = from?.isConnected ? from : head;
      el?.focus();
      return Boolean(el);
    }
    const api = apiRef.current;
    if (!api || api.isDestroyed()) return false;
    head?.focus();
    let tries = 0;
    const attempt = () => {
      if (api.isDestroyed()) return;
      // Tunggu blok pertama tampilan baru (baris placeholder diganti baris berdata).
      if (!api.getDisplayedRowAtIndex(0)?.data) {
        if (tries++ < 120) requestAnimationFrame(attempt);
        return;
      }
      api.ensureIndexVisible(0);
      api.setFocusedCell(0, id);
      requestAnimationFrame(() =>
        boxRef.current
          ?.querySelector<HTMLElement>(`.ag-row[row-index="0"] [col-id="${CSS.escape(id)}"]`)
          ?.focus(),
      );
    };
    requestAnimationFrame(attempt);
    return true;
  }, []);

  const openFilter = useCallback(
    (id: string, from: HTMLElement | null) => {
      const column = byId.get(id);
      if (column) {
        setFilterTarget({
          column,
          returnFocus: (applied) => focusAfterFilter(id, from, applied),
        });
      }
    },
    [byId, focusAfterFilter],
  );
  // Dipanggil dari kepala kolom AG (definisi kolom stabil): selalu fungsi terbaru.
  const openFilterRef = useRef(openFilter);
  const applyFilterRef = useRef(applyFilter);
  useEffect(() => {
    openFilterRef.current = openFilter;
    applyFilterRef.current = applyFilter;
  }, [openFilter, applyFilter]);

  const onSortChanged = useCallback(
    (e: SortChangedEvent<RowData>) => {
      const list = sortedState(e.api);
      if (list.length > MAX_SORT) {
        // Shift+klik kolom ke-4: kolom terakhir dilepas lagi (event berikutnya memuat ulang).
        applySort(e.api, list.slice(0, MAX_SORT));
        setAnnounce(`Paling banyak ${MAX_SORT} kolom bisa diurutkan sekaligus`);
        return;
      }
      startView(null);
      setSortCount(list.length);
      setAnnounce(
        sortAnnouncement(
          sortFromModel(list),
          (pos) => byId.get(colIdOf(pos))?.name ?? colLetter(pos),
        ),
      );
    },
    [byId, startView],
  );

  const dataColsInOrder = useCallback(() => {
    const api = apiRef.current;
    if (!api) return [];
    return api
      .getAllDisplayedColumns()
      .map((c) => c.getColId())
      .filter((id) => id !== ROWNUM);
  }, []);

  const menuStateRef = useRef((id: string) => {
    const api = apiRef.current;
    const order = dataColsInOrder();
    const frozen = api ? order.filter((c) => api.getColumn(c)?.getPinned() === "left") : [];
    const sort = api?.getColumn(id)?.getSort();
    return {
      index: Math.max(0, order.indexOf(id)),
      frozen: frozen.includes(id),
      frozenCount: frozen.length,
      visibleCount: order.length,
      format: formats.current[id],
      sort: sort === "asc" || sort === "desc" ? sort : null,
      sortCount: api ? api.getColumnState().filter((c) => c.sort).length : 0,
    };
  });

  const actionRef = useRef((id: string, a: HeaderAction) => {
    const api = apiRef.current;
    if (!api) return;
    const col = byId.get(id);
    switch (a.kind) {
      case "autofit":
        api.autoSizeColumns([id]);
        break;
      case "freeze": {
        const order = dataColsInOrder();
        const upto = order.indexOf(id);
        if (upto < 0 || upto + 1 > MAX_FROZEN) return;
        const frozen = order.slice(0, upto + 1);
        const rest = api
          .getColumnState()
          .map((s) => s.colId)
          .filter((c) => c !== ROWNUM && !frozen.includes(c));
        api.applyColumnState({
          state: [
            { colId: ROWNUM, pinned: "left" },
            ...frozen.map((c) => ({ colId: c, pinned: "left" as const })),
            ...rest.map((c) => ({ colId: c, pinned: null })),
          ],
          applyOrder: true,
        });
        setAnnounce(`${frozen.length} kolom dibekukan`);
        break;
      }
      case "unfreeze": {
        const order = dataColsInOrder();
        const keep = order.slice(0, Math.max(0, order.indexOf(id)));
        api.applyColumnState({
          state: api
            .getColumnState()
            .filter((s) => s.colId !== ROWNUM)
            .map((s) => ({
              colId: s.colId,
              pinned: keep.includes(s.colId) && s.pinned === "left" ? ("left" as const) : null,
            })),
        });
        setAnnounce("Pembekuan kolom dilepas");
        break;
      }
      case "hide":
        if (dataColsInOrder().length <= 1) return;
        api.setColumnsVisible([id], false);
        setAnnounce(`Kolom ${col?.name ?? ""} disembunyikan`);
        break;
      case "format":
        formats.current = { ...formats.current, [id]: a.format };
        api.refreshCells({ columns: [id], force: true });
        persist();
        break;
      case "sort": {
        const current = sortedState(api).filter((c) => c.colId !== id);
        const base = a.add ? current : [];
        if (a.dir && base.length >= MAX_SORT) {
          setAnnounce(`Paling banyak ${MAX_SORT} kolom bisa diurutkan sekaligus`);
          return;
        }
        const next = a.dir ? [...base, { colId: id, sort: a.dir }] : base;
        applySort(api, next);
        break;
      }
      case "clearSorts":
        applySort(api, []);
        break;
      case "filter":
        openFilterRef.current(id, headerCell(id));
        break;
      case "clearFilter":
        applyFilterRef.current(id, null);
        break;
    }
  });

  const onGridReady = useCallback(
    (e: GridReadyEvent<RowData>) => {
      apiRef.current = e.api;
      let tries = 0;
      const install = () => {
        offWheel.current = installWheelFix(boxRef.current, e.api);
        if (!offWheel.current && tries++ < 10) requestAnimationFrame(install);
      };
      install();
      // Nama grid untuk pembaca layar (AG tidak punya opsi aria-label).
      boxRef.current
        ?.querySelector('[role="grid"]')
        ?.setAttribute("aria-label", `Data sheet ${sheetName}`);
      // Kait uji e2e (hanya dev): API grid untuk mengukur gulir/fokus.
      if (process.env.NODE_ENV !== "production") {
        (window as unknown as { __ddGrid?: unknown }).__ddGrid = { api: e.api, goTo };
      }
    },
    [goTo, sheetName],
  );

  useEffect(() => {
    const flight = inflight.current;
    return () => {
      offWheel.current?.();
      for (const f of flight) f.ctrl.abort();
      if (saveTimer.current !== null) window.clearTimeout(saveTimer.current);
      if (rangeFrame.current !== null) cancelAnimationFrame(rangeFrame.current);
      if (retryTimer.current !== null) window.clearTimeout(retryTimer.current);
    };
  }, []);

  // Ctrl/Cmd+Home/End dari sel mana pun di grid (tangkap sebelum AG; AG sendiri menekannya lewat
  // suppressKeyboardEvent di DEFAULT_COL).
  // T-044: Ctrl/Cmd+F di mana pun di dalam grid → kotak Cari; Alt+↓ di sel data → saring kolomnya.
  const onKeyDownCapture = useCallback(
    (ev: React.KeyboardEvent<HTMLDivElement>) => {
      const e = ev.nativeEvent;
      const target = ev.target as HTMLElement;
      if (isFindKey(e)) {
        ev.preventDefault();
        ev.stopPropagation();
        searchInput.current?.focus();
        searchInput.current?.select();
        return;
      }
      const cell = target.closest<HTMLElement>(".ag-cell");
      if (!cell) return;
      if (e.altKey && e.key === "ArrowDown") {
        const id = cell.getAttribute("col-id");
        if (!id || id === ROWNUM) return;
        ev.preventDefault();
        ev.stopPropagation();
        openFilter(id, cell);
        return;
      }
      if (!isJumpKey(e)) return;
      ev.preventDefault();
      ev.stopPropagation();
      goTo(ev.key === "Home" ? 1 : (totalRef.current ?? 1));
    },
    [goTo, openFilter],
  );

  const submitSearch = (ev: React.FormEvent) => {
    ev.preventDefault();
    const text = normalizeSearchText(searchText);
    if (!text) {
      setSearchError(null);
      if (search) applySearch(null);
      return;
    }
    const api = apiRef.current;
    const cols = searchColumns(dataColsInOrder(), (id) => byId.get(id)?.type);
    if (!api || cols.length === 0) {
      setSearchError("Tidak ada kolom teks yang terlihat untuk dicari.");
      return;
    }
    setSearchError(null);
    applySearch({ text, cols });
  };

  const cancelSearch = () => {
    setSearchText("");
    setSearchError(null);
    applySearch(null);
  };

  const onCellFocused = useCallback((e: CellFocusedEvent<RowData>) => {
    if (e.rowIndex == null || !apiRef.current) return;
    guardFocus(boxRef.current, apiRef.current, e.rowIndex);
  }, []);

  const onBodyScrollEnd = useCallback(
    (e: BodyScrollEndEvent<RowData>) => {
      if (e.direction !== "vertical" || !apiRef.current) return;
      fixBottom(boxRef.current, apiRef.current, apiRef.current.getDisplayedRowCount() - 1);
      updateRange();
    },
    [updateRange],
  );

  const onVisibility = useCallback(() => {
    const api = apiRef.current;
    if (!api) return;
    const next = new Set(
      api
        .getColumnState()
        .filter((s) => s.hide && s.colId !== ROWNUM)
        .map((s) => s.colId),
    );
    // Kolom yang muncul lagi belum punya data di blok yang dimuat → muat ulang blok.
    const shownAgain = [...hidden].some((id) => !next.has(id));
    setHidden(next);
    persist();
    // Cari hanya di kolom teks yang terlihat (AC3): kolom berubah → cari diulang dengan kolom baru.
    const q = searchRef.current;
    if (q) {
      const cols = searchColumns(dataColsInOrder(), (id) => byId.get(id)?.type);
      if (cols.join() !== q.cols.join()) {
        if (cols.length === 0) {
          setSearchError("Tidak ada kolom teks yang terlihat untuk dicari.");
          applySearch(null);
        } else applySearch({ text: q.text, cols });
        return;
      }
    }
    if (shownAgain) purge();
  }, [hidden, persist, purge, dataColsInOrder, byId, applySearch]);

  const submitGo = (ev: React.FormEvent) => {
    ev.preventDefault();
    const t = totalRef.current;
    if (t === null) return;
    const n = parseRowInput(goText, t);
    if (n === null) {
      setGoError(`Masukkan nomor baris 1–${fmtInt(t)}.`);
      return;
    }
    setGoError(null);
    goTo(n);
  };

  const setColumnShown = (id: string, shown: boolean) => {
    const api = apiRef.current;
    if (!api) return;
    if (!shown && dataColsInOrder().length <= 1) return;
    api.setColumnsVisible([id], shown);
  };

  const resetColumns = () => {
    const api = apiRef.current;
    if (!api) return;
    formats.current = {};
    api.applyColumnState({
      state: [
        { colId: ROWNUM, pinned: "left" },
        ...columns.map((c) => ({
          colId: colIdOf(c.pos),
          width: defaultWidth(c),
          hide: false,
          pinned: null,
        })),
      ],
      applyOrder: true,
    });
    api.refreshCells({ force: true });
    persist();
    setAnnounce("Tampilan kolom dikembalikan ke bawaan");
  };

  const goId = `${uid}-go`;
  const goErrId = `${uid}-go-err`;
  const searchId = `${uid}-search`;
  const searchStatusId = `${uid}-search-status`;
  const filterList = Object.entries(filters);
  const filteredView = filterList.length > 0 || search !== null;
  const searching = search !== null && loading;

  return (
    <div className="flex min-w-0 flex-col gap-3">
      {versionChanged ? (
        <div
          role="alert"
          data-testid="grid-version-banner"
          className="flex flex-col gap-3 rounded-md border border-warning/50 bg-warning/15 px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between"
        >
          <span className="flex items-start gap-2">
            <IconAlertTriangle size={20} stroke={1.5} aria-hidden className="mt-px shrink-0" />
            Data sudah diperbarui — muat ulang untuk melihat versi terbaru.
          </span>
          <Button
            variant="outline"
            size="sm"
            className="h-(--control-h-lg) w-full sm:h-(--control-h-sm) sm:w-auto"
            onClick={() => router.refresh()}
          >
            <IconRefresh aria-hidden />
            Muat ulang
          </Button>
        </div>
      ) : null}
      {loadError && !versionChanged ? (
        <div
          role="alert"
          data-testid="grid-load-error"
          className="flex flex-col gap-3 rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between"
        >
          <span className="flex items-start gap-2">
            <IconAlertTriangle size={20} stroke={1.5} aria-hidden className="mt-px shrink-0" />
            {loadError}
          </span>
          <Button
            variant="outline"
            size="sm"
            className="h-(--control-h-lg) w-full sm:h-(--control-h-sm) sm:w-auto"
            onClick={() => {
              setLoadError(null);
              purge();
            }}
          >
            <IconRefresh aria-hidden />
            Coba lagi
          </Button>
        </div>
      ) : null}

      {timeoutMsg && !versionChanged ? (
        <div
          role="alert"
          data-testid="grid-timeout"
          className="flex flex-col gap-3 rounded-md border border-warning/50 bg-warning/15 px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between"
        >
          <span className="flex items-start gap-2">
            <IconAlertTriangle size={20} stroke={1.5} aria-hidden className="mt-px shrink-0" />
            {timeoutMsg}
          </span>
          <div className="flex flex-col gap-2 sm:flex-row">
            {search ? (
              <Button
                variant="outline"
                size="sm"
                className="h-(--control-h-lg) w-full sm:h-(--control-h-sm) sm:w-auto"
                onClick={cancelSearch}
              >
                <IconX aria-hidden />
                Hapus pencarian
              </Button>
            ) : null}
            {sortCount > 0 ? (
              <Button
                variant="outline"
                size="sm"
                className="h-(--control-h-lg) w-full sm:h-(--control-h-sm) sm:w-auto"
                data-testid="grid-clear-sort"
                onClick={() => apiRef.current && applySort(apiRef.current, [])}
              >
                <IconArrowsSort aria-hidden />
                Hapus urutan
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between">
        <form onSubmit={submitGo} className="flex flex-col gap-1" noValidate>
          <div className="flex items-center gap-2">
            <label htmlFor={goId} className="shrink-0 text-sm font-medium">
              Ke baris
            </label>
            <Input
              id={goId}
              inputMode="numeric"
              autoComplete="off"
              value={goText}
              onChange={(e) => setGoText(e.target.value)}
              aria-invalid={goError ? true : undefined}
              aria-describedby={goError ? goErrId : undefined}
              placeholder={total ? `1–${fmtInt(total)}` : undefined}
              className="h-(--control-h-lg) w-40 md:h-(--control-h)"
              data-testid="grid-goto-input"
            />
            <Button
              type="submit"
              variant="outline"
              className="h-(--control-h-lg) md:h-(--control-h)"
              disabled={total === null}
            >
              <IconCornerDownLeft aria-hidden />
              Buka
            </Button>
          </div>
          {goError ? (
            <p id={goErrId} className="text-sm text-destructive">
              {goError}
            </p>
          ) : null}
        </form>
        <form
          role="search"
          onSubmit={submitSearch}
          className="flex flex-col gap-1"
          noValidate
          data-testid="grid-search"
        >
          <div className="flex items-center gap-2">
            <label htmlFor={searchId} className="shrink-0 text-sm font-medium">
              Cari
            </label>
            <div className="relative">
              <IconSearch
                size={20}
                stroke={1.5}
                aria-hidden
                className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground"
              />
              <Input
                ref={searchInput}
                id={searchId}
                type="search"
                autoComplete="off"
                maxLength={SEARCH_TEXT_MAX}
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape" && search) {
                    e.preventDefault();
                    cancelSearch();
                  }
                }}
                placeholder="Teks di kolom terlihat"
                aria-invalid={searchError ? true : undefined}
                aria-describedby={searchStatusId}
                aria-keyshortcuts="Control+F"
                className="h-(--control-h-lg) w-56 pl-10 md:h-(--control-h)"
                data-testid="grid-search-input"
              />
            </div>
            <Button
              type="submit"
              variant="outline"
              className="h-(--control-h-lg) md:h-(--control-h)"
              disabled={searching}
            >
              Cari
            </Button>
            {searching ? (
              <Button
                type="button"
                variant="outline"
                className="h-(--control-h-lg) md:h-(--control-h)"
                data-testid="grid-search-cancel"
                onClick={cancelSearch}
              >
                <IconX aria-hidden />
                Batalkan
              </Button>
            ) : search ? (
              <Button
                type="button"
                variant="ghost"
                className="h-(--control-h-lg) md:h-(--control-h)"
                data-testid="grid-search-clear"
                onClick={cancelSearch}
              >
                <IconX aria-hidden />
                Hapus pencarian
              </Button>
            ) : null}
          </div>
          <p
            id={searchStatusId}
            className={searchError ? "text-sm text-destructive" : "text-sm text-muted-foreground"}
            data-testid="grid-search-status"
          >
            {searchError ??
              (searching ? (
                <span className="inline-flex items-center gap-1">
                  <IconLoader2
                    size={16}
                    stroke={1.5}
                    aria-hidden
                    className="motion-safe:animate-spin"
                  />
                  Mencari “{search.text}”… (paling lama 10 detik)
                </span>
              ) : search && total !== null && !loading && !timeoutMsg && !loadError ? (
                <span data-testid="grid-search-count">Ditemukan di {fmtInt(total)} baris</span>
              ) : (
                "Ctrl+F di dalam grid. Mencari di ≤ 10 kolom teks yang terlihat."
              ))}
          </p>
        </form>
        <div className="flex items-center gap-2">
          <span className="rounded-sm border px-2 py-1 text-xs text-muted-foreground">
            Baca-saja
          </span>
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className="h-(--control-h-lg) md:h-(--control-h)"
                data-testid="grid-columns-button"
              >
                <IconLayoutColumns aria-hidden />
                Kolom
                {hidden.size > 0 ? (
                  <span className="text-muted-foreground">
                    ({fmtInt(hidden.size)} disembunyikan)
                  </span>
                ) : null}
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-72">
              <fieldset className="flex flex-col gap-1">
                <legend className="mb-1 text-sm font-medium">Kolom yang ditampilkan</legend>
                {columns.map((c) => {
                  const id = colIdOf(c.pos);
                  const shown = !hidden.has(id);
                  return (
                    <label
                      key={id}
                      className="flex min-h-9 cursor-pointer items-center gap-2 rounded-sm px-1 text-sm hover:bg-accent"
                    >
                      <input
                        type="checkbox"
                        className="size-4 accent-[hsl(var(--primary))]"
                        checked={shown}
                        disabled={shown && columns.length - hidden.size <= 1}
                        onChange={(e) => setColumnShown(id, e.target.checked)}
                      />
                      <span className="w-8 shrink-0 text-xs text-muted-foreground">
                        {colLetter(c.pos)}
                      </span>
                      <span className="truncate">{c.name}</span>
                    </label>
                  );
                })}
              </fieldset>
              <Button variant="ghost" size="sm" onClick={resetColumns} className="self-start">
                Kembalikan tampilan bawaan
              </Button>
            </PopoverContent>
          </Popover>
        </div>
      </div>

      {filterList.length > 0 ? (
        <div
          className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center"
          data-testid="grid-filters"
        >
          <ul aria-label="Saringan aktif" className="flex min-w-0 flex-wrap gap-2">
            {filterList.map(([id, f]) => {
              const col = byId.get(id);
              const name = col?.name ?? id;
              const value = filterText(f, col?.type);
              return (
                <li
                  key={id}
                  className="inline-flex min-h-8 max-w-full items-center gap-1 rounded-full border bg-muted pl-3 text-sm"
                  data-testid="grid-filter-chip"
                  data-col={id}
                >
                  <span className="min-w-0 truncate" title={`${name}: ${value}`}>
                    {name}: <span className="font-medium">{value}</span>
                  </span>
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    className="size-11 shrink-0 rounded-full text-muted-foreground hover:text-foreground md:size-8 [&_svg]:size-4"
                    aria-label={`Hapus saringan ${name}`}
                    onClick={() => applyFilter(id, null)}
                  >
                    <IconX aria-hidden />
                  </Button>
                </li>
              );
            })}
          </ul>
          <Button
            variant="ghost"
            size="sm"
            className="h-(--control-h-lg) self-start md:h-(--control-h-sm)"
            data-testid="grid-filter-clear-all"
            onClick={clearFilters}
          >
            <IconFilterOff aria-hidden />
            Hapus semua saringan
          </Button>
          <span
            className="text-sm text-muted-foreground tabular-nums"
            data-testid="grid-filter-count"
          >
            {timeoutMsg || loadError
              ? "Jumlah baris belum diketahui"
              : total !== null && all !== null && !loading
                ? filteredCountText(total, all, true)
                : "Menghitung baris…"}
          </span>
        </div>
      ) : null}

      <div
        ref={boxRef}
        className="dd-grid h-[calc(100dvh-var(--topbar-h)-17rem)] min-h-96 w-full"
        data-testid="sheet-grid"
        onKeyDownCapture={onKeyDownCapture}
      >
        <AgGridReact<RowData>
          theme={theme}
          styleNonce={nonce}
          columnDefs={columnDefs}
          defaultColDef={DEFAULT_COL}
          rowModelType="infinite"
          datasource={datasource}
          cacheBlockSize={BLOCK_SIZE}
          maxBlocksInCache={50}
          infiniteInitialRowCount={1}
          maxConcurrentDatasourceRequests={2}
          blockLoadDebounceMillis={150}
          rowBuffer={10}
          localeText={LOCALE}
          tooltipShowDelay={400}
          suppressDragLeaveHidesColumns
          onGridReady={onGridReady}
          onCellFocused={onCellFocused}
          onBodyScroll={updateRange}
          onBodyScrollEnd={onBodyScrollEnd}
          onModelUpdated={updateRange}
          onColumnResized={(e) => e.finished && persist()}
          onColumnMoved={(e) => e.finished && persist()}
          onColumnPinned={persist}
          onColumnVisible={onVisibility}
          onSortChanged={onSortChanged}
        />
      </div>

      <div
        className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground"
        data-testid="grid-status"
      >
        <span className="tabular-nums" data-testid="grid-status-rows">
          {timeoutMsg || loadError
            ? "Baris belum dimuat"
            : statusText(
                range?.first ?? null,
                range?.last ?? null,
                loading ? null : total,
                filteredView ? all : null,
              )}
        </span>
      </div>
      <p className="sr-only" aria-live="polite" aria-atomic="true">
        {announce}
      </p>
      <GridFilterDialog
        target={filterTarget}
        sheetId={sheetId}
        versionId={versionId}
        value={filterTarget ? filters[colIdOf(filterTarget.column.pos)] : undefined}
        onApply={applyFilter}
        onClose={() => setFilterTarget(null)}
      />
    </div>
  );
}
