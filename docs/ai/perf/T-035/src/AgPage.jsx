/* eslint-disable */
// Arsip bukti spike T-035 (salinan dari prototipe di luar repo); bukan kode aplikasi.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AgGridReact } from "ag-grid-react";
import {
  AllCommunityModule,
  ColumnApiModule,
  ColumnAutoSizeModule,
  CellApiModule,
  CellStyleModule,
  CustomFilterModule,
  DragAndDropModule,
  EventApiModule,
  ExternalFilterModule,
  InfiniteRowModelModule,
  PinnedRowModule,
  RenderApiModule,
  RowSelectionModule,
  LocaleModule,
  ModuleRegistry,
  RowApiModule,
  ScrollApiModule,
  TooltipModule,
  themeQuartz,
} from "ag-grid-community";
import { IconArrowDown, IconArrowUp, IconCalendar, IconHash, IconLetterCase, IconToggleLeft } from "@tabler/icons-react";
import arrowUpSvg from "@tabler/icons/outline/arrow-up.svg?raw";
import arrowDownSvg from "@tabler/icons/outline/arrow-down.svg?raw";
import menuSvg from "@tabler/icons/outline/dots-vertical.svg?raw";
import filterSvg from "@tabler/icons/outline/filter.svg?raw";
import { COLUMNS, ROWS, cellCopy, cellText, colLetter, formatInt, toTsv } from "./data.js";
import { GoToRow, StatusBar, announce } from "./Toolbar.jsx";

// ?opt=sentinel: satu baris kosong setelah baris terakhir (uji mitigasi baris terakhir terpotong).
const OPT = new URLSearchParams(location.search).get("opt");
const SENTINEL = OPT?.includes("sentinel") ? 1 : 0;
// ?opt=fixbottom: setelah gulir berhenti di dasar, paksa baris terakhir terlihat (workaround offset
// stretching yang basi setelah seret thumb).
const FIX_BOTTOM = !!OPT?.includes("fixbottom");
// ?opt=wheelfix: wheel/trackpad digulir 1:1 piksel model. Saat stretching, 1 px scroll fisik = rasio
// (tinggi model / tinggi div) px model (Chrome ±10×, Firefox ±80×), jadi wheel bawaan melompati baris.
const WHEEL_FIX = !!OPT?.includes("wheelfix");
// ?opt=focusguard: setelah fokus sel pindah (keyboard), pastikan baris terfokus terlihat penuh. Saat stretching
// AG kadang menggulir baris terfokus keluar layar (Firefox: ± 26.000 px) atau setengah di tepi bawah.
const FOCUS_GUARD = !!OPT?.includes("focusguard");

/**
 * Wheel/trackpad 1:1 piksel model saat stretching (rasio tinggi model / tinggi wadah > 1). Dipasang dari
 * onGridReady. Target scroll disimpan sebagai float: Chrome/WebKit membulatkan scrollTop ke piksel bulat,
 * Firefox menyimpan pecahan; tanpa target sendiri pembulatan menumpuk (langkah 2–6 baris di Firefox).
 * Tinggi baris dan jumlah baris dibaca dari API (tanpa angka 32 px tetap). Gerak horizontal dipertahankan.
 */
function installWheelFix(root, api) {
  const vp = root?.querySelector(".ag-grid-viewport");
  const fake = root?.querySelector(".ag-body-vertical-scroll-viewport");
  if (!vp || !fake) return null;
  let target = null;
  const onWheel = (e) => {
    if (e.ctrlKey || e.shiftKey) return; // zoom pinch / shift+wheel horizontal: bawaan
    if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return; // dominan horizontal: bawaan
    const rowH = api.getDisplayedRowAtIndex(0)?.rowHeight;
    if (!rowH) return;
    const physMax = fake.scrollHeight - fake.clientHeight;
    const ratio = (api.getDisplayedRowCount() * rowH - fake.clientHeight) / physMax;
    if (!(ratio > 1.01)) return; // tanpa stretching: biarkan bawaan
    e.preventDefault();
    const unit = e.deltaMode === 1 ? rowH : e.deltaMode === 2 ? fake.clientHeight : 1;
    if (e.deltaX) vp.scrollLeft += e.deltaX * unit;
    if (target === null || Math.abs(target - vp.scrollTop) > 2) target = vp.scrollTop; // diseret/keyboard di luar handler
    target = Math.max(0, Math.min(physMax, target + (e.deltaY * unit) / ratio));
    vp.scrollTop = target;
  };
  vp.addEventListener("wheel", onWheel, { passive: false });
  return () => vp.removeEventListener("wheel", onWheel);
}
const TOTAL = ROWS + SENTINEL;

// Daftarkan hanya modul yang dipakai (rencana §3.3). VITE_AG_ALL=1 → batas atas AllCommunityModule.
ModuleRegistry.registerModules(
  import.meta.env.VITE_AG_ALL === "1"
    ? [AllCommunityModule]
    : [
        InfiniteRowModelModule,
        ScrollApiModule,
        RowApiModule,
        ColumnApiModule,
        ColumnAutoSizeModule,
        TooltipModule,
        CellStyleModule,
        LocaleModule,
        // VITE_AG_FULL=1: set modul yang diperkirakan dipakai T-043 (ukur ruang sisa bundel).
        ...(import.meta.env.VITE_AG_FULL === "1"
          ? [RowSelectionModule, CustomFilterModule, ExternalFilterModule, CellApiModule, RenderApiModule, EventApiModule, DragAndDropModule, PinnedRowModule]
          : []),
      ],
);

// Tema dari token project: nilai berupa var() sehingga ganti .dark langsung berlaku tanpa render ulang.
const theme = themeQuartz.withParams({
  backgroundColor: "hsl(var(--card))",
  foregroundColor: "hsl(var(--card-foreground))",
  textColor: "hsl(var(--card-foreground))",
  chromeBackgroundColor: "hsl(var(--muted))",
  headerBackgroundColor: "hsl(var(--muted))",
  headerTextColor: "hsl(var(--foreground))",
  borderColor: "hsl(var(--border))",
  accentColor: "hsl(var(--primary))",
  rowHoverColor: "hsl(var(--accent))",
  selectedRowBackgroundColor: "hsl(var(--primary) / 0.12)",
  rangeSelectionBorderColor: "hsl(var(--ring))",
  browserColorScheme: "inherit",
  fontFamily: "inherit",
  fontSize: 13,
  rowHeight: 32,
  headerHeight: 44,
  wrapperBorderRadius: "var(--radius)",
});

const TYPE_ICON = { text: IconLetterCase, number: IconHash, date: IconCalendar, bool: IconToggleLeft };

function Header(props) {
  const { displayName, column, progressSort, enableSorting, letter, type } = props;
  const [sort, setSort] = useState(column.getSort());
  useEffect(() => {
    const on = () => setSort(column.getSort());
    column.addEventListener("sortChanged", on);
    return () => column.removeEventListener("sortChanged", on);
  }, [column]);
  const Icon = TYPE_ICON[type];
  return (
    <div className="hdr" onClick={(e) => enableSorting && progressSort(e.shiftKey)}>
      <span className="hdr-letter">{letter}</span>
      <span className="hdr-name">
        {Icon && <Icon size={16} stroke={1.5} aria-hidden="true" />}
        {displayName}
        {sort === "asc" && <IconArrowUp size={16} stroke={1.5} aria-hidden="true" />}
        {sort === "desc" && <IconArrowDown size={16} stroke={1.5} aria-hidden="true" />}
      </span>
    </div>
  );
}

function makeRow(r) {
  const o = { n: r + 1 };
  for (let c = 0; c < COLUMNS.length; c++) o["c" + c] = cellText(r, c);
  return o;
}

// Ikon bawaan AG Grid diganti SVG Tabler (string), ukuran 16, warna currentColor.
const tabler = (svg) => svg.replace(/width="24"/, 'width="16"').replace(/height="24"/, 'height="16"');
const icons = {
  sortAscending: tabler(arrowUpSvg),
  sortDescending: tabler(arrowDownSvg),
  menu: tabler(menuSvg),
  menuAlt: tabler(menuSvg),
  filter: tabler(filterSvg),
};

export default function AgPage() {
  const apiRef = useRef(null);
  const [range, setRange] = useState({});

  const columnDefs = useMemo(
    () => [
      {
        colId: "n",
        field: "n",
        headerName: "No",
        pinned: "left",
        width: 104,
        sortable: false,
        resizable: false,
        suppressMovable: true,
        cellClass: "rownum",
        valueFormatter: (p) => (p.value == null ? "" : formatInt(p.value)),
      },
      ...COLUMNS.map((c, i) => ({
        colId: "c" + i,
        field: "c" + i,
        headerName: c.title,
        width: c.width,
        sortable: true,
        resizable: true,
        headerComponent: Header,
        headerComponentParams: { letter: colLetter(i), type: c.type },
        headerTooltip: `Kolom ${colLetter(i)} di file asli`,
        cellClass: c.type === "number" ? "num" : undefined,
      })),
    ],
    [],
  );

  const datasource = useMemo(
    () => ({
      rowCount: undefined,
      getRows(p) {
        // Simulasi jaringan 20 ms; server sungguhan memotong blok 200 baris (rencana §3.4).
        setTimeout(() => {
          const rows = [];
          for (let r = p.startRow; r < Math.min(p.endRow, TOTAL); r++) rows.push(r < ROWS ? makeRow(r) : { n: null });
          p.successCallback(rows, TOTAL);
        }, 20);
      },
    }),
    [],
  );

  const boxRef = useRef(null);
  const offWheel = useRef(null);
  useEffect(() => () => offWheel.current?.(), []);

  // Salin lewat event `copy` bawaan (clipboardData): tidak butuh izin/secure context seperti
  // navigator.clipboard. ?opt=writetext: jalur lama navigator.clipboard.writeText (dibandingkan di T-035).
  useEffect(() => {
    if (OPT?.includes("writetext")) return;
    const box = boxRef.current;
    const onCopy = (e) => {
      const fc = apiRef.current?.getFocusedCell();
      if (!fc || fc.rowIndex == null || fc.rowIndex >= ROWS || !box.contains(document.activeElement)) return;
      if (window.getSelection()?.toString()) return; // teks yang dipilih pengguna: salin bawaan
      const col = fc.column.getColId();
      const text = col === "n" ? String(fc.rowIndex + 1) : toTsv([[cellCopy(fc.rowIndex, Number(col.slice(1)))]]);
      window.__lastCopy = text;
      e.clipboardData.setData("text/plain", text);
      e.preventDefault();
    };
    // Di document, bukan di wadah grid: tanpa seleksi teks Firefox mengirim `copy` ke body, bukan ke sel fokus.
    document.addEventListener("copy", onCopy);
    return () => document.removeEventListener("copy", onCopy);
  }, []);

  const onGridReady = useCallback((e) => {
    apiRef.current = e.api;
    if (WHEEL_FIX) {
      // DOM grid sudah ada saat gridReady; ulangi beberapa frame bila belum.
      let tries = 0;
      const tryInstall = () => {
        offWheel.current = installWheelFix(boxRef.current, e.api);
        if (!offWheel.current && tries++ < 10) requestAnimationFrame(tryInstall);
      };
      tryInstall();
    }
    window.__grid = {
      kind: "ag",
      api: e.api,
      goTo,
    };
  }, []);

  // mode "native": ensureIndexVisible(top) apa adanya; "fixed": posisi tengah, karena saat stretching
  // 1 px scroll = (tinggi model / tinggi div) px model sehingga perataan "top" meleset beberapa px.
  const goTo = useCallback((n, mode = "fixed") => {
    const api = apiRef.current;
    if (!api) return;
    const idx = n - 1;
    api.ensureIndexVisible(idx, mode === "native" ? "top" : "middle");
    api.setFocusedCell(idx, "c0");
    announce(`Ke baris ${formatInt(n)}`);
  }, []);

  // Salin sel (Community tidak punya ClipboardModule): TSV yang terbaca Excel.
  const onCellKeyDown = useCallback((e) => {
    if (!OPT?.includes("writetext")) return;
    const ev = e.event;
    if (!ev || !(ev.ctrlKey || ev.metaKey) || ev.key.toLowerCase() !== "c") return;
    const col = e.column.getColId();
    if (e.rowIndex == null) return;
    const text =
      col === "n" ? String(e.rowIndex + 1) : toTsv([[cellCopy(e.rowIndex, Number(col.slice(1)))]]);
    window.__lastCopy = text;
    navigator.clipboard?.writeText(text).catch(() => {});
  }, []);

  const onCellFocused = useCallback((e) => {
    if (!FOCUS_GUARD || e.rowIndex == null) return;
    const api = apiRef.current;
    const check = (attempt) => {
      const vp = boxRef.current?.querySelector(".ag-grid-viewport");
      const header = boxRef.current?.querySelector(".ag-header");
      const row = vp?.querySelector(`.ag-row[row-index="${e.rowIndex}"]`);
      if (!vp || !header) return;
      const top = header.getBoundingClientRect().bottom;
      const bottom = vp.getBoundingClientRect().top + vp.clientHeight;
      const r = row?.getBoundingClientRect();
      if (r && r.top >= top - 1 && r.bottom <= bottom + 1) return;
      // Tepi terdekat dulu; bila masih meleset (pembulatan stretching), tengahkan.
      const pos = attempt > 0 ? "middle" : !r || r.top < top ? "top" : "bottom";
      api.ensureIndexVisible(e.rowIndex, pos);
      if (attempt < 1) requestAnimationFrame(() => requestAnimationFrame(() => check(attempt + 1)));
    };
    requestAnimationFrame(() => requestAnimationFrame(() => check(0)));
  }, []);

  const onBodyScrollEnd = useCallback((e) => {
    if (e.direction !== "vertical") return;
    const el = document.querySelector(".ag-body-vertical-scroll-viewport");
    if (el && el.scrollTop >= el.scrollHeight - el.clientHeight - 2) apiRef.current?.ensureIndexVisible(TOTAL - 1, "bottom");
  }, []);

  const onBodyScroll = useCallback(() => {
    const api = apiRef.current;
    if (!api) return;
    setRange({ first: api.getFirstDisplayedRowIndex() + 1, last: api.getLastDisplayedRowIndex() + 1 });
  }, []);

  return (
    <>
      <GoToRow onGo={goTo} />
      <div className="grid-wrap">
        <div className="grid-box" data-testid="grid" ref={boxRef}>
          <AgGridReact
            theme={theme}
            icons={icons}
            columnDefs={columnDefs}
            rowModelType="infinite"
            styleNonce={OPT?.includes("nostylenonce") ? undefined : document.querySelector('meta[property="csp-nonce"]')?.nonce || undefined}
            datasource={datasource}
            cacheBlockSize={200}
            maxBlocksInCache={50}
            infiniteInitialRowCount={TOTAL}
            maxConcurrentDatasourceRequests={2}
            blockLoadDebounceMillis={150}
            rowBuffer={10}
            suppressHorizontalScroll={new URLSearchParams(location.search).get("opt") === "nohs"}
            onGridReady={onGridReady}
            onCellKeyDown={onCellKeyDown}
            onCellFocused={onCellFocused}
            onBodyScroll={onBodyScroll}
            onBodyScrollEnd={FIX_BOTTOM ? onBodyScrollEnd : undefined}
            onModelUpdated={onBodyScroll}
            localeText={{ loadingOoo: "Memuat…", noRowsToShow: "Tidak ada baris" }}
          />
        </div>
      </div>
      <StatusBar first={range.first} last={range.last} />
    </>
  );
}
