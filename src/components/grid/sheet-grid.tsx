"use client";

import {
  IconAlertTriangle,
  IconArrowsSort,
  IconCopy,
  IconCornerDownLeft,
  IconDots,
  IconDownload,
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
  type CellClassParams,
  type CellClickedEvent,
  type CellFocusedEvent,
  type ColDef,
  type GridApi,
  type GridReadyEvent,
  type IDatasource,
  type IGetRowsParams,
  type ProcessRowParams,
  type SortChangedEvent,
  type SuppressHeaderKeyboardEventParams,
  type SuppressKeyboardEventParams,
  type ValueFormatterParams,
} from "ag-grid-community";
import { AgGridReact } from "ag-grid-react";
import { useRouter } from "next/navigation";
import { Dialog } from "radix-ui";
import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import type { DashFilter } from "@/components/dashboards/filters/filter-model";
import { filterText } from "@/components/dashboards/filters/filter-text";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { NumberFormat } from "@/features/widgets/spec";
import { searchOptions } from "@/lib/search";
import type { CellTarget } from "./grid-cell-panel";
import {
  clipCell,
  clipCellInfo,
  COPY_MAX_ROWS,
  defaultDecimal,
  rowsToTsv,
  writeClipboard,
  type DecimalSep,
} from "./grid-copy";
import {
  fetchBlock,
  fetchCell,
  fetchStats,
  type ColumnStats,
  type Fetch,
  type RowData,
} from "./grid-fetch";
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
 *
 * T-045: F2/Enter/klik ganda → panel Isi sel (lazy); Ctrl/Cmd+C salin sel atau baris terpilih (klik/
 * Shift+klik nomor baris, Shift+Spasi; ≤ 1.000) ke Excel; kolom angka terfokus → ringkasan di bilah
 * status (POST …/stats). Pilihan dan ringkasan tampilan lama dibuang saat tampilan berganti.
 */
// T-045: panel Isi sel di chunk terpisah (diunduh saat pertama dibuka, tidak menambah chunk grid).
const GridCellPanel = lazy(() => import("./grid-cell-panel"));
// T-046: dialog "Unduh tampilan" di chunk sendiri (chunk grid sudah di dekat batas 293 KiB).
const GridExport = lazy(() => import("./grid-export"));

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

/**
 * Home/End tanpa pengubah = sel pertama/terakhir di baris yang sama (pola grid WAI-ARIA, seperti
 * Excel). Bawaan AG melompat ke baris pertama/terakhir (End mendarat di sentinel) → ditangani sendiri.
 */
const isRowEdgeKey = (e: KeyboardEvent) =>
  !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey && (e.key === "Home" || e.key === "End");

// Stabil (di luar render): objek baru tiap render membuat AG menerapkan ulang definisi kolom dan
// menghapus perubahan pengguna (beku, lebar).
const DEFAULT_COL: ColDef<RowData> = {
  sortable: false,
  suppressKeyboardEvent: (p: SuppressKeyboardEventParams<RowData>) =>
    isJumpKey(p.event) ||
    isRowEdgeKey(p.event) ||
    isFindKey(p.event) ||
    (p.event.altKey && p.event.key === "ArrowDown"),
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
  /** Penunda pengumuman "Memuat baris …" (T-048); `said` = sudah diumumkan (selesai juga diumumkan). */
  timer?: number;
  said?: string;
}

const storage = () => (typeof window === "undefined" ? null : window.localStorage);

/** Pilihan "Excel saya pakai koma/titik" (per pengguna di peramban ini). */
const DECIMAL_KEY = "dd.grid.copyDecimal";
function loadDecimal(): DecimalSep {
  try {
    const v = storage()?.getItem(DECIMAL_KEY);
    if (v === "," || v === ".") return v;
  } catch {
    // storage diblokir → bawaan bahasa peramban
  }
  return defaultDecimal(typeof navigator === "undefined" ? undefined : navigator.language);
}

/** Pilihan baris lewat nomor baris: indeks tampilan 0-based [from, to], anchor = awal Shift+klik. */
type Selection = { anchor: number; from: number; to: number };
const inSel = (s: Selection | null, i: number | null | undefined) =>
  s !== null && i != null && i >= s.from && i <= s.to;

const isCopyKey = (e: KeyboardEvent) =>
  (e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === "c";

/** Baris per permintaan saat salin baris yang belum dimuat (batas server GRID_ROWS_MAX). */
const COPY_FETCH_ROWS = 500;

/*
 * T-048 ponsel (< 768 px, rencana §3.8): hanya nomor baris beku (pembekuan desktop disimpan, tidak
 * ditimpa), geser kolom mati, baris 45 px (target sentuh), toolbar dilipat ke "Lainnya", ketuk sel →
 * Isi sel. Keadaan lebar dibaca lewat matchMedia (bukan render server: grid hanya di klien).
 */
const NARROW_QUERY = "(max-width: 767.98px)";
const subscribeNarrow = (cb: () => void) => {
  const m = window.matchMedia(NARROW_QUERY);
  m.addEventListener("change", cb);
  return () => m.removeEventListener("change", cb);
};
const readNarrow = () => window.matchMedia(NARROW_QUERY).matches;
const ROW_H = 32;
// Sel = tinggi baris − 1 px garis baris → 45 agar sel sendiri ≥ 44 px.
const ROW_H_TOUCH = 45;

/** Blok yang belum kembali setelah ini (dan terlihat) diumumkan "Memuat baris …" (T-048 AC3). */
const LOAD_ANNOUNCE_MS = 500;

/**
 * aria-selected pada baris (T-048, bawaan review T-045): AG Community hanya memasangnya untuk pilihan
 * baris AG sendiri, sedangkan pilihan di sini lewat nomor baris → dipasang sendiri pada elemen baris
 * (bagian beku + tengah) saat baris dibuat (processRowPostCreate) dan saat pilihan berubah.
 */
const markSelected = (el: Element | null | undefined, on: boolean) =>
  el?.setAttribute("aria-selected", on ? "true" : "false");

export interface SheetGridProps {
  sheetId: string;
  sheetName: string;
  versionId: string;
  schemaRevision: number;
  columns: GridColumn[];
  /** Batas baris ekspor (EXPORT_MAX_ROWS server) untuk dialog "Unduh tampilan" (T-046). */
  exportMaxRows?: number;
  /**
   * Pemilih periode (T-058): kunci periode yang dibatasi; null = semua. Ikut setiap permintaan grid
   * (blok, salin, ringkasan, daftar nilai, ekspor); berganti = grid baru (key di halaman).
   */
  period?: string | null;
  nonce?: string;
}

export default function SheetGrid({
  sheetId,
  sheetName,
  versionId,
  schemaRevision,
  columns,
  exportMaxRows = 1_000_000,
  period = null,
  nonce,
}: SheetGridProps) {
  const periods = useMemo(() => (period ? [period] : []), [period]);
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

  const narrow = useSyncExternalStore(subscribeNarrow, readNarrow, () => false);
  const narrowRef = useRef(narrow);
  const [moreOpen, setMoreOpen] = useState(false);
  // Kotak cari daftar "Kolom yang ditampilkan" (T-pxnn: semua daftar pilihan berkotak cari).
  const [colQuery, setColQuery] = useState("");
  const jumped = useRef(false);

  const key = settingsKey(sheetId, schemaRevision);
  const byId = useMemo(() => new Map(columns.map((c) => [colIdOf(c.pos), c])), [columns]);
  const known = useMemo(() => columns.map((c) => colIdOf(c.pos)), [columns]);
  // Dibaca sekali saat mount (komponen hanya di klien); storage diblokir → kosong.
  const [initial] = useState<GridSettings>(() => loadSettings(storage, key, known));
  const formats = useRef<Record<string, NumberFormat>>({ ...initial.formats });
  /** Kolom beku versi desktop: di ponsel dilepas di grid, tetapi tetap ini yang disimpan/dipulihkan. */
  const desktopPins = useRef<string[]>(initial.columns.filter((c) => c.pinned).map((c) => c.colId));

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

  // T-045: pilihan baris, salin, panel Isi sel, ringkasan kolom angka.
  const [decimal, setDecimal] = useState<DecimalSep>(loadDecimal);
  const [sel, setSel] = useState<Selection | null>(null);
  const selRef = useRef<Selection | null>(null);
  const [cellTarget, setCellTarget] = useState<CellTarget | null>(null);
  const [panelOn, setPanelOn] = useState(false);
  // T-046: dialog dipasang saat pertama dibuka lalu tetap (polling ekspor jalan walau ditutup).
  const [exportOn, setExportOn] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [focusCol, setFocusCol] = useState<string | null>(null);
  const [stats, setStats] = useState<{
    key: string;
    r: Fetch<ColumnStats>;
    format?: NumberFormat;
  } | null>(null);

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
          ...((narrowRef.current ? desktopPins.current.includes(s.colId) : s.pinned === "left")
            ? { pinned: true }
            : {}),
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
        // Status memuat untuk pembaca layar: hanya blok lambat yang terlihat (bukan setiap prefetch).
        entry.timer = window.setTimeout(() => {
          const api = apiRef.current;
          if (!inflight.current.has(entry) || !api || api.isDestroyed()) return;
          const first = api.getFirstDisplayedRowIndex();
          const last = api.getLastDisplayedRowIndex();
          if (p.startRow > last || p.endRow <= first) return;
          const t = totalRef.current;
          const end = t === null ? p.endRow : Math.min(p.endRow, t);
          entry.said = `${fmtInt(p.startRow + 1)}–${fmtInt(end)}`;
          setAnnounce(`Memuat baris ${entry.said}…`);
        }, LOAD_ANNOUNCE_MS);
        void fetchBlock({
          sheetId,
          versionId,
          schemaRevision,
          rowStart: p.startRow,
          rowCount: p.endRow - p.startRow,
          cols: requestColsRef.current(),
          // Model urut AG berurut sortIndex; lebih dari 3 dipangkas (onSortChanged melepas sisanya).
          query: {
            sort: sortFromModel(p.sortModel),
            filters: bodyFilters,
            search,
            period: periods,
          },
          signal: entry.ctrl.signal,
        }).then((r) => {
          inflight.current.delete(entry);
          window.clearTimeout(entry.timer);
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
            } else if (entry.said) setAnnounce(`Baris ${entry.said} dimuat`);
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
    [sheetId, versionId, schemaRevision, bodyFilters, search, periods],
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
    // Jumlah tampilan lama tidak boleh tampil untuk tampilan baru (review T-044 #1); pilihan baris
    // menunjuk nomor tampilan lama → dilepas (T-045).
    selRef.current = null;
    setSel(null);
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

  /**
   * setFocusedCell tidak selalu memindahkan fokus DOM (mis. dari kotak "Ke baris", atau sel yang belum
   * dirender): fokuskan sel setelah baris/kolom dirender agar panah/PageDown langsung bekerja di sana.
   */
  const focusCellDom = useCallback((i: number, col: string) => {
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        const el = boxRef.current?.querySelector<HTMLElement>(
          `.ag-row[row-index="${i}"] [col-id="${CSS.escape(col)}"]`,
        );
        if (el && !el.contains(document.activeElement)) el.focus();
      }),
    );
  }, []);

  const goTo = useCallback(
    (n: number, colId?: string) => {
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
      focusCellDom(row - 1, col);
      setAnnounce(`Ke baris ${fmtInt(row)}`);
    },
    [focusCellDom],
  );

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
        cellClass: (p: CellClassParams<RowData>) =>
          inSel(selRef.current, p.rowIndex) ? "dd-grid-rownum dd-grid-selected" : "dd-grid-rownum",
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
          pinned: s?.pinned && !narrow ? "left" : null,
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
            if (inSel(selRef.current, p.rowIndex)) cls.push("dd-grid-selected");
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
      narrow: narrowRef.current,
    };
  });

  // Ponsel ↔ desktop: lepas/pulihkan pembekuan kolom data (nomor baris tetap beku).
  useEffect(() => {
    const api = apiRef.current;
    const was = narrowRef.current;
    narrowRef.current = narrow;
    if (!api || api.isDestroyed() || was === narrow) return;
    if (narrow) {
      desktopPins.current = api
        .getColumnState()
        .filter((c) => c.colId !== ROWNUM && c.pinned === "left")
        .map((c) => c.colId);
    }
    api.applyColumnState({
      state: desktopPins.current.map((colId) => ({ colId, pinned: narrow ? null : "left" })),
    });
  }, [narrow]);
  // Lembar Lainnya hanya ada di ponsel: tutup saat melebar agar tidak terbuka lagi saat diputar balik.
  if (!narrow && moreOpen) setMoreOpen(false);

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

  /* ---------- T-045: pilih baris, salin ke Excel, panel Isi sel ---------- */

  const select = useCallback((next: Selection | null) => {
    selRef.current = next;
    setSel(next);
    const api = apiRef.current;
    if (api && !api.isDestroyed()) api.refreshCells({ force: true });
    boxRef.current?.querySelectorAll(".ag-row[row-index]").forEach((el) => {
      markSelected(el, inSel(next, Number(el.getAttribute("row-index"))));
    });
    if (next) {
      const n = next.to - next.from + 1;
      setAnnounce(
        n === 1
          ? `Baris ${fmtInt(next.from + 1)} dipilih. Ctrl+C untuk menyalin`
          : `${fmtInt(n)} baris dipilih (baris ${fmtInt(next.from + 1)}–${fmtInt(next.to + 1)})`,
      );
    }
  }, []);

  /** Klik/Shift+klik nomor baris (Shift+Spasi dari keyboard): pilih atau perluas dari anchor. */
  const pickRow = useCallback(
    (i: number, extend: boolean) => {
      const t = totalRef.current;
      if (t === null || i < 0 || i >= t) return;
      const cur = selRef.current;
      if (extend && cur) {
        select({ anchor: cur.anchor, from: Math.min(cur.anchor, i), to: Math.max(cur.anchor, i) });
      } else if (cur && cur.from === i && cur.to === i) select(null);
      else select({ anchor: i, from: i, to: i });
    },
    [select],
  );

  const copied = useCallback((p: Promise<void>, done: string) => {
    p.then(
      () => setAnnounce(done),
      () => setAnnounce("Gagal menyalin. Izinkan akses papan klip lalu coba lagi."),
    );
  }, []);

  /** Ctrl/Cmd+C pada satu sel: nilai terbaca Excel; teks terpotong diambil penuh dari server. */
  const copyCell = useCallback(
    (i: number, id: string) => {
      const data = apiRef.current?.getDisplayedRowAtIndex(i)?.data;
      const col = byId.get(id);
      if (!data || data.end || !col) return;
      const v = data[id];
      // Teks terpotong → isi penuh; sel kosong bertipe non-teks bisa gagal cast → nilai asli (L5).
      const text =
        data.cut?.includes(id) || (v == null && col.type !== "text")
          ? fetchCell(sheetId, { versionId, row: data._row, pos: col.pos }).then((r) => {
              if (!r?.ok) throw new Error("cell");
              return clipCellInfo(r.data, col.type, decimal);
            })
          : clipCell(v, col.type, decimal);
      copied(writeClipboard(text), "Sel disalin");
    },
    [byId, sheetId, versionId, decimal, copied],
  );

  /**
   * Salin baris terpilih (≤ COPY_MAX_ROWS) sebagai TSV + judul, kolom terlihat urut tampil. Baris dari
   * cache grid bila semuanya sudah dimuat; selain itu diambil ulang per ≤ 500 baris lewat jatah grid
   * yang sama (urut/saring/cari yang sama). Tampilan berganti di tengah jalan → dibatalkan.
   */
  const copyRows = useCallback(
    (s: Selection) => {
      const api = apiRef.current;
      const t = totalRef.current;
      if (!api || t === null) return;
      const from = s.from;
      const to = Math.min(s.to, t - 1);
      const count = to - from + 1;
      if (count < 1) return;
      if (count > COPY_MAX_ROWS) {
        setAnnounce(
          `Salin paling banyak ${fmtInt(COPY_MAX_ROWS)} baris. Pakai Unduh tampilan untuk ${fmtInt(count)} baris`,
        );
        return;
      }
      const cols = dataColsInOrder().flatMap((id) => {
        const c = byId.get(id);
        return c ? [{ id, name: c.name, type: c.type }] : [];
      });
      const cached: RowData[] = [];
      for (let i = from; i <= to; i++) {
        const d = api.getDisplayedRowAtIndex(i)?.data;
        if (!d || d.end || cols.some((c) => !(c.id in d))) break;
        cached.push(d);
      }
      const myGen = gen.current;
      const load = async (): Promise<RowData[]> => {
        if (cached.length === count) return cached;
        const out: RowData[] = [];
        for (let start = from; start <= to; start += COPY_FETCH_ROWS) {
          const r = await fetchBlock({
            sheetId,
            versionId,
            schemaRevision,
            rowStart: start,
            rowCount: Math.min(COPY_FETCH_ROWS, to - start + 1),
            cols: requestColsRef.current(),
            query: {
              sort: sortFromModel(sortedState(api)),
              filters: bodyFilters,
              search,
              period: periods,
            },
          });
          if (!r.ok || myGen !== gen.current) throw new Error("rows");
          out.push(...r.rows);
        }
        return out;
      };
      const rows = cached.length === count ? cached : null;
      const cut = (list: RowData[]) =>
        list.reduce(
          (a, r) => a + (r.cut?.filter((id) => cols.some((c) => c.id === id)).length ?? 0),
          0,
        );
      const done = (list: RowData[]) =>
        `${fmtInt(list.length)} baris disalin${
          cut(list) ? `; ${fmtInt(cut(list))} sel teks lebih dari 500 karakter terpotong` : ""
        }`;
      if (rows) {
        copied(writeClipboard(rowsToTsv(cols, rows, decimal)), done(rows));
        return;
      }
      setAnnounce(`Menyiapkan ${fmtInt(count)} baris…`);
      let got: RowData[] = [];
      const text = load().then((list) => {
        got = list;
        return rowsToTsv(cols, list, decimal);
      });
      writeClipboard(text).then(
        () => setAnnounce(done(got)),
        () =>
          setAnnounce(
            myGen !== gen.current
              ? "Tampilan berubah; salin dibatalkan"
              : "Gagal menyalin baris. Coba lagi.",
          ),
      );
    },
    [
      byId,
      dataColsInOrder,
      sheetId,
      versionId,
      schemaRevision,
      bodyFilters,
      search,
      periods,
      decimal,
      copied,
    ],
  );

  const openCell = useCallback(
    (i: number, id: string, from: HTMLElement | null) => {
      const data = apiRef.current?.getDisplayedRowAtIndex(i)?.data;
      const column = byId.get(id);
      if (!data || data.end || !column) return;
      setPanelOn(true);
      setCellTarget({
        sheetId,
        versionId,
        column,
        row: data._row,
        n: data.n,
        format: formats.current[id],
        returnFocus: () => {
          if (from?.isConnected) {
            from.focus();
            return true;
          }
          apiRef.current?.setFocusedCell(i, id);
          return false;
        },
      });
    },
    [byId, sheetId, versionId],
  );

  /** Baris baru di DOM: aria-selected sesuai pilihan (baris dirender ulang saat digulir). */
  const onRowCreated = useCallback((p: ProcessRowParams<RowData>) => {
    const on = inSel(selRef.current, p.rowIndex);
    for (const el of [p.eRow, p.ePinnedLeftRow, p.ePinnedRightRow]) markSelected(el, on);
  }, []);

  const onCellClicked = useCallback(
    (e: CellClickedEvent<RowData>) => {
      if (e.rowIndex == null || e.data?.end) return;
      if (e.column.getColId() !== ROWNUM) {
        // Ponsel: ketuk sel = Isi sel (tanpa F2/klik ganda); salin ada di panel.
        if (narrowRef.current) {
          const from = (e.event?.target as HTMLElement | null)?.closest<HTMLElement>(".ag-cell");
          openCell(e.rowIndex, e.column.getColId(), from ?? null);
        }
        return;
      }
      const ev = e.event as MouseEvent | null;
      // Klik kedua dari klik ganda tidak membatalkan pilihan klik pertama (review L2).
      if (ev && ev.detail > 1) return;
      pickRow(e.rowIndex, Boolean(ev?.shiftKey));
    },
    [pickRow, openCell],
  );

  const setDecimalPref = (d: DecimalSep) => {
    setDecimal(d);
    try {
      storage()?.setItem(DECIMAL_KEY, d);
    } catch {
      // tidak tersimpan: tetap berlaku sampai halaman ditutup
    }
  };

  // Ringkasan kolom angka terfokus atas seluruh baris tersaring (AC4); ditunda 300 ms, permintaan
  // lama dibatalkan. Kunci memuat versi + saringan + cari: tampilan berganti → angka lama tidak tampil.
  const statsCol = focusCol ? byId.get(focusCol) : undefined;
  const statsKey =
    statsCol && numericType(statsCol.type)
      ? JSON.stringify([versionId, statsCol.pos, bodyFilters, search])
      : null;
  useEffect(() => {
    if (!statsKey || !statsCol) return;
    const ctl = new AbortController();
    const t = window.setTimeout(() => {
      void fetchStats(
        sheetId,
        {
          versionId,
          pos: statsCol.pos,
          query: { sort: [], filters: bodyFilters, search, period: periods },
        },
        ctl.signal,
      ).then((r) => {
        if (r && !ctl.signal.aborted) {
          setStats({ key: statsKey, r, format: formats.current[colIdOf(statsCol.pos)] });
        }
      });
    }, 300);
    return () => {
      window.clearTimeout(t);
      ctl.abort();
    };
  }, [statsKey, statsCol, sheetId, versionId, bodyFilters, search, periods]);
  const statsNow = statsKey && stats?.key === statsKey ? stats : null;

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
      const root = boxRef.current?.querySelector('[role="grid"]');
      root?.setAttribute("aria-label", `Data sheet ${sheetName}`);
      // Pilihan baris lewat nomor baris (bukan pilihan AG): rentang baris → multiselectable.
      root?.setAttribute("aria-multiselectable", "true");
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
      for (const f of flight) {
        window.clearTimeout(f.timer);
        f.ctrl.abort();
      }
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
      // T-045: Ctrl/Cmd+C salin, F2/Enter Isi sel, Shift+Spasi pilih baris, Escape lepas pilihan.
      const cellId = cell.getAttribute("col-id");
      const rowIdx = Number(cell.closest(".ag-row")?.getAttribute("row-index") ?? NaN);
      if (cellId && Number.isInteger(rowIdx)) {
        const key = (fn: () => void) => {
          ev.preventDefault();
          ev.stopPropagation();
          fn();
        };
        if (isCopyKey(e)) {
          const s = selRef.current;
          return key(() =>
            s
              ? copyRows(s)
              : cellId === ROWNUM
                ? copyRows({ anchor: rowIdx, from: rowIdx, to: rowIdx })
                : copyCell(rowIdx, cellId),
          );
        }
        if ((e.key === "F2" || e.key === "Enter") && !e.altKey && cellId !== ROWNUM) {
          return key(() => openCell(rowIdx, cellId, cell));
        }
        if (e.key === " " && e.shiftKey) return key(() => pickRow(rowIdx, selRef.current !== null));
        if (e.key === "Escape" && selRef.current) return key(() => select(null));
      }
      if (e.altKey && e.key === "ArrowDown") {
        const id = cellId;
        if (!id || id === ROWNUM) return;
        ev.preventDefault();
        ev.stopPropagation();
        openFilter(id, cell);
        return;
      }
      if (isRowEdgeKey(e) && cellId && Number.isInteger(rowIdx)) {
        ev.preventDefault();
        ev.stopPropagation();
        const api = apiRef.current;
        const cols = api?.getAllDisplayedColumns() ?? [];
        const col = (e.key === "Home" ? cols[0] : cols[cols.length - 1])?.getColId();
        if (!api || !col) return;
        api.ensureColumnVisible(col);
        api.setFocusedCell(rowIdx, col);
        focusCellDom(rowIdx, col);
        return;
      }
      if (!isJumpKey(e)) return;
      ev.preventDefault();
      ev.stopPropagation();
      goTo(ev.key === "Home" ? 1 : (totalRef.current ?? 1));
    },
    [goTo, openFilter, copyRows, copyCell, openCell, pickRow, select, focusCellDom],
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
    const id = e.column && typeof e.column !== "string" ? e.column.getColId() : null;
    if (id && id !== ROWNUM) setFocusCol(id);
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
    // Kolom ringkasan disembunyikan → ringkasannya tidak tampil lagi (review L4).
    setFocusCol((f) => (f && next.has(f) ? null : f));
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
    if (moreOpen) {
      jumped.current = true;
      setMoreOpen(false);
    }
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
    desktopPins.current = [];
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

  /** Tampilan sekarang untuk "Unduh tampilan": kolom terlihat urut tampil, urut, saringan, cari. */
  const exportView = () => {
    const api = apiRef.current;
    const cols = dataColsInOrder().flatMap((id) => {
      const p = posOf(id);
      return p === null ? [] : [p];
    });
    return {
      cols: cols.length ? cols : requestCols(),
      sort: api ? sortFromModel(sortedState(api)) : [],
      filters: bodyFilters,
      search: search ?? undefined,
      ...(periods.length ? { period: periods } : {}),
    };
  };
  const openExport = () => {
    setExportOn(true);
    setExportOpen(true);
  };

  const goId = `${uid}-go`;
  const goErrId = `${uid}-go-err`;
  const searchId = `${uid}-search`;
  const searchStatusId = `${uid}-search-status`;
  const filterList = Object.entries(filters);
  const filteredView = filterList.length > 0 || search !== null;
  const searching = search !== null && loading;

  const goForm = (
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
  );
  const exportButton = (
    <Button
      variant="outline"
      className="h-(--control-h-lg) w-full md:h-(--control-h) md:w-auto"
      data-testid="grid-export-button"
      onClick={() => {
        setMoreOpen(false);
        openExport();
      }}
    >
      <IconDownload aria-hidden />
      Unduh tampilan
    </Button>
  );
  const shownColumns = colQuery.trim()
    ? searchOptions(
        columns.map((c) => ({ ...c, label: c.name })),
        colQuery,
      ).map((h) => h.option)
    : columns;
  const columnList = (
    <>
      <fieldset className="flex flex-col gap-1">
        <legend className="mb-1 text-sm font-medium">Kolom yang ditampilkan</legend>
        <div className="mb-1 flex items-center gap-2 rounded-md border px-2">
          <IconSearch
            size={18}
            stroke={1.5}
            aria-hidden
            className="shrink-0 text-muted-foreground"
          />
          <input
            type="search"
            aria-label="Cari kolom"
            placeholder="Ketik untuk mencari kolom…"
            autoComplete="off"
            spellCheck={false}
            value={colQuery}
            onChange={(e) => setColQuery(e.target.value)}
            data-testid="grid-columns-search"
            className="h-(--control-h-lg) w-full min-w-0 bg-transparent text-base outline-none placeholder:text-muted-foreground md:h-(--control-h) md:text-sm"
          />
        </div>
        {shownColumns.length === 0 ? (
          <p className="px-1 py-2 text-sm text-muted-foreground">
            Tidak ada kolom yang cocok dengan “{colQuery.trim()}”.
          </p>
        ) : null}
        {shownColumns.map((c) => {
          const id = colIdOf(c.pos);
          const shown = !hidden.has(id);
          return (
            <label
              key={id}
              className="flex min-h-11 cursor-pointer items-center gap-2 rounded-sm px-1 text-sm hover:bg-accent md:min-h-9"
            >
              <input
                type="checkbox"
                className="size-4 accent-[hsl(var(--primary))]"
                checked={shown}
                disabled={shown && columns.length - hidden.size <= 1}
                onChange={(e) => setColumnShown(id, e.target.checked)}
              />
              <span className="w-8 shrink-0 text-xs text-muted-foreground">{colLetter(c.pos)}</span>
              <span className="truncate">{c.name}</span>
            </label>
          );
        })}
      </fieldset>
      <Button
        variant="ghost"
        size="sm"
        onClick={resetColumns}
        className="h-(--control-h-lg) self-start md:h-(--control-h-sm)"
      >
        Kembalikan tampilan bawaan
      </Button>
    </>
  );
  const decimalGroup = (
    <div
      role="group"
      aria-label="Pemisah desimal saat menyalin ke Excel"
      className="flex flex-wrap items-center gap-1"
    >
      <span>Desimal salinan:</span>
      {(
        [
          [",", "Koma"],
          [".", "Titik"],
        ] as const
      ).map(([d, label]) => (
        <Button
          key={d}
          size="sm"
          variant={decimal === d ? "secondary" : "ghost"}
          aria-pressed={decimal === d}
          className="h-(--control-h-lg) md:h-(--control-h-sm)"
          data-testid={`grid-decimal-${label.toLowerCase()}`}
          onClick={() => setDecimalPref(d)}
        >
          {label} ({d})
        </Button>
      ))}
    </div>
  );

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
        {narrow ? null : goForm}
        <form
          role="search"
          onSubmit={submitSearch}
          className="flex min-w-0 flex-col gap-1"
          noValidate
          data-testid="grid-search"
        >
          <div className="flex flex-wrap items-center gap-2">
            <label htmlFor={searchId} className="shrink-0 text-sm font-medium">
              Cari
            </label>
            <div className="relative min-w-0 flex-1 md:flex-none">
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
                className="h-(--control-h-lg) w-full pl-10 md:h-(--control-h) md:w-56"
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
        {narrow ? (
          <Button
            variant="outline"
            className="h-(--control-h-lg) w-full"
            aria-haspopup="dialog"
            data-testid="grid-more-button"
            onClick={() => setMoreOpen(true)}
          >
            <IconDots aria-hidden />
            Lainnya
          </Button>
        ) : (
          <div className="flex items-center gap-2">
            <span className="rounded-sm border px-2 py-1 text-xs text-muted-foreground">
              Baca-saja
            </span>
            {exportButton}
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
                {columnList}
              </PopoverContent>
            </Popover>
          </div>
        )}
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

      {sel ? (
        <SelectionBar
          sel={sel}
          onCopy={() => copyRows(sel)}
          onExport={openExport}
          onClear={() => select(null)}
        />
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
          onCellClicked={onCellClicked}
          processRowPostCreate={onRowCreated}
          rowHeight={narrow ? ROW_H_TOUCH : ROW_H}
          suppressMovableColumns={narrow}
          onCellDoubleClicked={(e) =>
            e.rowIndex != null &&
            openCell(
              e.rowIndex,
              e.column.getColId(),
              (e.event?.target as HTMLElement | null)?.closest<HTMLElement>(".ag-cell") ?? null,
            )
          }
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
        {statsCol && statsKey ? (
          <StatsText
            name={statsCol.name}
            type={statsCol.type}
            format={statsNow?.format}
            r={statsNow?.r ?? null}
          />
        ) : null}
        {narrow ? null : decimalGroup}
      </div>
      {exportOn ? (
        <Suspense fallback={null}>
          <GridExport
            open={exportOpen}
            onOpenChange={setExportOpen}
            sheetId={sheetId}
            versionId={versionId}
            rows={loading || timeoutMsg || loadError ? null : total}
            maxRows={exportMaxRows}
            getView={exportView}
            onAccessLost={() => router.refresh()}
          />
        </Suspense>
      ) : null}
      {panelOn ? (
        <Suspense fallback={null}>
          <GridCellPanel
            target={cellTarget}
            decimal={decimal}
            onClose={() => setCellTarget(null)}
            onAnnounce={setAnnounce}
          />
        </Suspense>
      ) : null}
      <p className="sr-only" aria-live="polite" aria-atomic="true" data-testid="grid-announce">
        {announce}
      </p>
      <Dialog.Root open={narrow && moreOpen} onOpenChange={setMoreOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-40 bg-overlay/40" />
          <Dialog.Content
            aria-describedby={undefined}
            data-testid="grid-more-sheet"
            onCloseAutoFocus={(e) => {
              // "Ke baris" memindahkan fokus ke sel tujuan; jangan ditarik kembali ke tombol Lainnya.
              if (jumped.current) e.preventDefault();
              jumped.current = false;
            }}
            className="fixed inset-x-0 bottom-0 z-50 flex max-h-[85dvh] w-full flex-col rounded-t-lg border bg-card shadow-lg"
          >
            <div className="flex items-center justify-between gap-2 border-b px-4 py-2">
              <Dialog.Title className="text-base font-semibold">Lainnya</Dialog.Title>
              <Dialog.Close asChild>
                <Button size="icon-lg" variant="ghost" aria-label="Tutup Lainnya">
                  <IconX aria-hidden />
                </Button>
              </Dialog.Close>
            </div>
            <div className="flex min-h-0 flex-col gap-4 overflow-y-auto px-4 py-3">
              {goForm}
              {exportButton}
              <div className="flex flex-col gap-1">{columnList}</div>
              {decimalGroup}
              <p className="text-sm text-muted-foreground">
                Baca-saja. Urut dan saring lewat menu di kepala kolom. Tampilan terbaik di layar ≥
                1024 px.
              </p>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
      <GridFilterDialog
        target={filterTarget}
        sheetId={sheetId}
        versionId={versionId}
        period={period}
        value={filterTarget ? filters[colIdOf(filterTarget.column.pos)] : undefined}
        onApply={applyFilter}
        onClose={() => setFilterTarget(null)}
      />
    </div>
  );
}

/** Bilah pilihan baris (T-045 AC3): jumlah, Salin (≤ 1.000), atau tawaran "Unduh tampilan". */
function SelectionBar({
  sel,
  onCopy,
  onExport,
  onClear,
}: {
  sel: Selection;
  onCopy: () => void;
  onExport: () => void;
  onClear: () => void;
}) {
  const n = sel.to - sel.from + 1;
  const over = n > COPY_MAX_ROWS;
  return (
    <div
      className="flex flex-col gap-2 rounded-md border bg-muted/50 px-3 py-2 text-sm sm:flex-row sm:flex-wrap sm:items-center"
      data-testid="grid-selection"
    >
      <span className="tabular-nums">
        {fmtInt(n)} baris dipilih
        {n > 1 ? ` (baris ${fmtInt(sel.from + 1)}–${fmtInt(sel.to + 1)})` : ""}
      </span>
      {over ? (
        <>
          <span role="alert" className="flex items-start gap-2" data-testid="grid-copy-offer">
            <IconAlertTriangle size={20} stroke={1.5} aria-hidden className="mt-px shrink-0" />
            Salin ke Excel paling banyak {fmtInt(COPY_MAX_ROWS)} baris. Untuk {fmtInt(n)} baris,
            pakai Unduh tampilan (CSV/XLSX) — atau saring data lebih dulu.
          </span>
          <Button
            size="sm"
            variant="outline"
            className="h-(--control-h-lg) md:h-(--control-h-sm)"
            data-testid="grid-selection-export"
            onClick={onExport}
          >
            <IconDownload aria-hidden />
            Unduh tampilan
          </Button>
        </>
      ) : (
        <Button
          size="sm"
          variant="outline"
          className="h-(--control-h-lg) md:h-(--control-h-sm)"
          data-testid="grid-selection-copy"
          onClick={onCopy}
        >
          <IconCopy aria-hidden />
          Salin (Ctrl+C)
        </Button>
      )}
      <Button
        size="sm"
        variant="ghost"
        className="h-(--control-h-lg) md:h-(--control-h-sm)"
        onClick={onClear}
      >
        <IconX aria-hidden />
        Batal pilih
      </Button>
    </div>
  );
}

/** Ringkasan kolom angka terfokus (T-045 AC4) di bilah status. */
function StatsText({
  name,
  type,
  format,
  r,
}: {
  name: string;
  type: GridColumn["type"];
  format: NumberFormat | undefined;
  r: Fetch<ColumnStats> | null;
}) {
  if (!r) return <span>Menghitung ringkasan {name}…</span>;
  if (!r.ok) return <span data-testid="grid-stats">{r.message}</span>;
  const v = (x: number | null, t = type) => (x === null ? "–" : (displayCell(x, t, format) ?? "–"));
  const d = r.data;
  return (
    <span className="tabular-nums" data-testid="grid-stats">
      {name}: Jumlah {v(d.sum)} · Rata-rata {v(d.avg, type === "integer" ? "decimal" : type)} · Min{" "}
      {v(d.min)} · Maks {v(d.max)} · Hitung {fmtInt(d.count)}
    </span>
  );
}
