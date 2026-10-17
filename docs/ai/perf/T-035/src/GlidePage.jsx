/* eslint-disable */
// Arsip bukti spike T-035 (salinan dari prototipe di luar repo); bukan kode aplikasi.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CompactSelection, DataEditor, GridCellKind } from "@glideapps/glide-data-grid";
import "@glideapps/glide-data-grid/dist/index.css";
import letterCaseSvg from "@tabler/icons/outline/letter-case.svg?raw";
import hashSvg from "@tabler/icons/outline/hash.svg?raw";
import calendarSvg from "@tabler/icons/outline/calendar.svg?raw";
import toggleSvg from "@tabler/icons/outline/toggle-left.svg?raw";
import { COLUMNS, ROWS, cellCopy, cellText, colLetter, formatInt } from "./data.js";
import { GoToRow, StatusBar, announce } from "./Toolbar.jsx";
import { token } from "./theme.js";

const MAX_COPY_ROWS = 1000;
// ?opt=sentinel: satu baris kosong setelah baris terakhir (mitigasi baris terakhir terpotong di Firefox).
const SENTINEL = new URLSearchParams(location.search).get("opt")?.includes("sentinel") ? 1 : 0;
const TOTAL = ROWS + SENTINEL;

// Ikon header kanvas: SVG Tabler dengan warna dari tema Glide (bukan hex mentah).
const svgIcon = (svg) => (p) =>
  svg.replace(/currentColor/g, p.bgColor).replace(/width="24"/, 'width="20"').replace(/height="24"/, 'height="20"');
const headerIcons = {
  "t-text": svgIcon(letterCaseSvg),
  "t-number": svgIcon(hashSvg),
  "t-date": svgIcon(calendarSvg),
  "t-bool": svgIcon(toggleSvg),
};

// Kanvas tidak bisa membaca var(): baca token terkomputasi, ulang saat tema berganti.
function readTheme() {
  return {
    accentColor: token("primary"),
    accentFg: token("primary-foreground"),
    accentLight: token("primary") + "1f",
    textDark: token("card-foreground"),
    textMedium: token("muted-foreground"),
    textLight: token("muted-foreground"),
    textHeader: token("foreground"),
    textHeaderSelected: token("primary-foreground"),
    bgIconHeader: token("muted-foreground"),
    fgIconHeader: token("muted"),
    bgCell: token("card"),
    bgCellMedium: token("muted"),
    bgHeader: token("muted"),
    bgHeaderHasFocus: token("accent"),
    bgHeaderHovered: token("accent"),
    borderColor: token("border"),
    horizontalBorderColor: token("border"),
    headerBottomBorderColor: token("border"),
    linkColor: token("primary"),
    fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", sans-serif',
    baseFontStyle: "13px",
    headerFontStyle: "600 13px",
  };
}

export default function GlidePage() {
  const ref = useRef(null);
  const [theme, setTheme] = useState(readTheme);
  const [region, setRegion] = useState(null);
  const [selection, setSelection] = useState(undefined);

  useEffect(() => {
    const on = () => setTheme(readTheme());
    addEventListener("themechange", on);
    return () => removeEventListener("themechange", on);
  }, []);

  const columns = useMemo(
    () => [
      { id: "n", title: "No", width: 104 },
      ...COLUMNS.map((c, i) => ({
        id: "c" + i,
        title: c.title,
        width: c.width,
        icon: "t-" + c.type,
        group: undefined,
        overlayIcon: undefined,
        // Huruf kolom gaya Excel ditampilkan di tooltip/aria; Glide tidak punya header dua baris.
        menuIcon: undefined,
        themeOverride: undefined,
        letter: colLetter(i),
      })),
    ],
    [],
  );

  const getCellContent = useCallback(([col, row]) => {
    if (row >= ROWS) return { kind: GridCellKind.Text, data: "", displayData: "", allowOverlay: false, readonly: true };
    if (col === 0) {
      const s = formatInt(row + 1);
      return { kind: GridCellKind.Text, data: s, displayData: s, allowOverlay: false, readonly: true, copyData: String(row + 1), contentAlign: "right" };
    }
    const c = col - 1;
    const text = cellText(row, c);
    return {
      kind: GridCellKind.Text,
      data: text,
      displayData: text,
      allowOverlay: true,
      readonly: true,
      copyData: cellCopy(row, c),
      contentAlign: COLUMNS[c].type === "number" ? "right" : undefined,
    };
  }, []);

  // Batasi salin ≤ 1.000 baris; seleksi kolom penuh (10 jt baris) tidak boleh dimaterialisasi.
  const getCellsForSelection = useCallback(
    (rect) => {
      if (rect.height > MAX_COPY_ROWS) {
        announce(`Pilihan ${formatInt(rect.height)} baris terlalu besar untuk disalin; pakai Unduh tampilan.`);
        window.__copyRefused = rect.height;
        return [];
      }
      const out = [];
      for (let y = rect.y; y < rect.y + rect.height; y++) {
        const row = [];
        for (let x = rect.x; x < rect.x + rect.width; x++) row.push(getCellContent([x, y]));
        out.push(row);
      }
      return out;
    },
    [getCellContent],
  );

  const boxRef = useRef(null);

  // mode "native": ref.scrollTo() bawaan Glide. "fixed": hitung scrollTop fisik sendiri, karena
  // scrollTo bawaan menambahkan selisih piksel virtual ke scrollTop fisik (salah bila tinggi > ±33,5 jt px).
  const goTo = useCallback(async (n, mode = "fixed") => {
    const row = n - 1;
    if (mode === "native") {
      ref.current?.scrollTo(1, row, "vertical", 0, 0, { vAlign: "start" });
    } else {
      const sc = boxRef.current?.querySelector(".dvn-scroller");
      if (sc) await scrollToRowStretched(sc, row);
    }
    ref.current?.focus();
    await frame();
    setSelection({
      current: { cell: [1, row], range: { x: 1, y: row, width: 1, height: 1 }, rangeStack: [] },
      columns: undefined,
      rows: undefined,
    });
    window.__glideSel = { cell: [1, row], range: { x: 1, y: row, width: 1, height: 1 } };
    announce(`Ke baris ${formatInt(n)}`);
  }, []);

  useEffect(() => {
    window.__grid = { kind: "glide", ref, goTo, region: () => window.__glideRegion };
  }, [goTo]);

  const onVisibleRegionChanged = useCallback((r) => {
    window.__glideRegion = r;
    setRegion(r);
  }, []);

  const gridSelection = selection && {
    ...selection,
    columns: selection.columns ?? CompactSelection.empty(),
    rows: selection.rows ?? CompactSelection.empty(),
  };

  return (
    <>
      <GoToRow onGo={goTo} />
      <div className="grid-wrap">
        <div className="grid-box" data-testid="grid" ref={boxRef}>
          <DataEditor
            ref={ref}
            width="100%"
            height="100%"
            columns={columns}
            rows={TOTAL}
            rowHeight={32}
            headerHeight={44}
            freezeColumns={1}
            rowMarkers="none"
            getCellContent={getCellContent}
            getCellsForSelection={getCellsForSelection}
            gridSelection={gridSelection}
            onGridSelectionChange={(s) => {
              window.__glideSel = s.current ? { cell: s.current.cell, range: s.current.range } : null;
              setSelection(s);
            }}
            columnSelect="none"
            rangeSelect="rect"
            headerIcons={headerIcons}
            theme={theme}
            smoothScrollY
            smoothScrollX
            keybindings={{ search: false }}
            onVisibleRegionChanged={onVisibleRegionChanged}
          />
        </div>
      </div>
      <StatusBar first={region ? region.y + 1 : null} last={region ? Math.min(ROWS, region.y + region.height) : null} />
    </>
  );
}

const RH = 32;
const HEADER = 44;
const frame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

/**
 * Gulir agar baris `row` berada di tengah, memperhitungkan pemetaan InfiniteScroller Glide:
 * lompatan fisik > 2000 px atau di tepi → posisi virtual = persentase; lompatan kecil → 1:1.
 */
async function scrollToRowStretched(sc, row) {
  const ch = sc.clientHeight;
  const viewH = ch - HEADER;
  const vMax = TOTAL * RH + HEADER - ch;
  const pMax = sc.scrollHeight - ch;
  const vy = Math.max(0, Math.min(vMax, row * RH - (viewH - RH) / 2));
  const r = window.__glideRegion;
  const curV = r ? r.y * RH - (r.ty ?? 0) : 0;
  if (Math.abs(vy - curV) <= 2000) {
    sc.scrollTop = sc.scrollTop + Math.round(vy - curV);
    await frame();
    return;
  }
  const pPerc = Math.round((vy / vMax) * pMax);
  // Mulai dari tepi terjauh (tepi dipetakan tepat), lalu lompat ke target.
  const edge = pPerc > pMax / 2 ? 0 : pMax;
  sc.scrollTop = edge;
  await frame();
  const edgeV = edge === 0 ? 0 : vMax;
  sc.scrollTop = Math.abs(pPerc - edge) > 2000 ? pPerc : edge + Math.round(vy - edgeV);
  await frame();
}
