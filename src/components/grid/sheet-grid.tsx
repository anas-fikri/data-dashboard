"use client";

import {
  IconAlertTriangle,
  IconCornerDownLeft,
  IconLayoutColumns,
  IconRefresh,
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
  type SuppressKeyboardEventParams,
  type ValueFormatterParams,
} from "ag-grid-community";
import { AgGridReact } from "ag-grid-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { NumberFormat } from "@/features/widgets/spec";
import { fetchBlock, type RowData } from "./grid-fetch";
import { GridHeader, type GridHeaderParams, type HeaderAction } from "./grid-header";
import { fixBottom, guardFocus, installWheelFix, visibleRowRange } from "./grid-mitigations";
import {
  BLOCK_SIZE,
  blockNearView,
  colIdOf,
  colLetter,
  displayCell,
  fmtInt,
  loadSettings,
  MAX_FROZEN,
  numericType,
  parseRowInput,
  saveSettings,
  settingsKey,
  statusText,
  type GridColumn,
  type GridSettings,
} from "./grid-model";

/*
 * Grid "Lihat data" (T-043, rencana G-6 §3, ADR-0007): AG Grid Community 36.2.0 Infinite Row Model di
 * atas POST /api/sheets/:id/rows (blok 200 baris, ≤ 50 blok di memori, debounce 150 ms, 2 permintaan
 * bersamaan, blok yang sudah digulir lewat dibatalkan lewat AbortSignal). Baris sentinel "Akhir data"
 * setelah baris terakhir (aria-rowcount = total + 2, didokumentasikan di ADR-0007). Dimuat lazy tanpa
 * SSR (sheet-grid-loader.tsx); modul AG didaftarkan satu per satu (JANGAN AllCommunityModule).
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
  suppressKeyboardEvent: (p: SuppressKeyboardEventParams<RowData>) => isJumpKey(p.event),
};

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

  const [total, setTotal] = useState<number | null>(null);
  const [range, setRange] = useState<{ first: number; last: number } | null>(null);
  const [versionChanged, setVersionChanged] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [announce, setAnnounce] = useState("");
  const [goText, setGoText] = useState("");
  const [goError, setGoError] = useState<string | null>(null);
  const [hidden, setHidden] = useState<Set<string>>(
    () => new Set(initial.columns.filter((c) => c.hide).map((c) => c.colId)),
  );

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
          signal: entry.ctrl.signal,
        }).then((r) => {
          inflight.current.delete(entry);
          if (r.ok) {
            totalRef.current = r.total;
            setTotal(r.total);
            setLoadError(null);
            const rows = r.rows;
            if (p.startRow + rows.length === r.total && p.endRow > r.total) {
              rows.push({ n: r.total + 1, _row: -1, end: true });
            }
            p.successCallback(rows, r.total + 1);
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
          else setLoadError(r.message);
          p.failCallback();
        });
      },
    }),
    [sheetId, versionId, schemaRevision],
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
          sortable: false,
          resizable: true,
          headerComponent: GridHeader,
          headerComponentParams: headerParams(c),
          headerTooltip:
            c.original && c.original !== c.name
              ? `Kolom ${colLetter(c.pos)} di file asli: "${c.original}"`
              : `Kolom ${colLetter(c.pos)} di file asli`,
          cellClass: numericType(c.type) ? "dd-grid-num" : undefined,
          valueFormatter: (p: ValueFormatterParams<RowData>) =>
            displayCell(p.value, c.type, formats.current[id], Boolean(p.data?.cut?.includes(id))) ??
            "",
        };
      }),
    ];
  });

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
    return {
      index: Math.max(0, order.indexOf(id)),
      frozen: frozen.includes(id),
      frozenCount: frozen.length,
      visibleCount: order.length,
      format: formats.current[id],
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
  const onKeyDownCapture = useCallback(
    (ev: React.KeyboardEvent<HTMLDivElement>) => {
      if (!isJumpKey(ev.nativeEvent)) return;
      const target = ev.target as HTMLElement;
      if (!target.closest(".ag-cell")) return;
      ev.preventDefault();
      ev.stopPropagation();
      goTo(ev.key === "Home" ? 1 : (totalRef.current ?? 1));
    },
    [goTo],
  );

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
    if (shownAgain) purge();
    persist();
  }, [hidden, persist, purge]);

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
        />
      </div>

      <div
        className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground"
        data-testid="grid-status"
      >
        <span className="tabular-nums" data-testid="grid-status-rows">
          {statusText(range?.first ?? null, range?.last ?? null, total)}
        </span>
      </div>
      <p className="sr-only" aria-live="polite" aria-atomic="true">
        {announce}
      </p>
    </div>
  );
}
