/*
 * Mitigasi stretching AG Grid (ADR-0007, wajib di T-043). Saat tinggi model (baris × tinggi baris)
 * melewati batas tinggi elemen browser, AG "meregangkan": 1 px gulir fisik = rasio px model. Tanpa
 * mitigasi: wheel melompati puluhan/ratusan baris, baris terakhir terpotong, dan baris terfokus bisa
 * di luar layar. Bergantung pada DOM AG v36 (.ag-grid-viewport, .ag-body-vertical-scroll-viewport):
 * setiap upgrade AG wajib menjalankan ulang e2e 3 engine.
 */
import type { GridApi } from "ag-grid-community";

type Api = Pick<GridApi, "getDisplayedRowAtIndex" | "getDisplayedRowCount" | "ensureIndexVisible">;

/**
 * 1. Wheel/trackpad 1:1 piksel model saat stretching. Target scrollTop disimpan float (Chromium/WebKit
 * membulatkan, Firefox menyimpan pecahan). Ctrl (zoom), Shift, dan gerak dominan horizontal dibiarkan
 * bawaan. Mengembalikan fungsi pelepas, atau null bila DOM belum ada.
 */
export function installWheelFix(root: HTMLElement | null, api: Api): (() => void) | null {
  const vp = root?.querySelector<HTMLElement>(".ag-grid-viewport");
  const fake = root?.querySelector<HTMLElement>(".ag-body-vertical-scroll-viewport");
  if (!vp || !fake) return null;
  let target: number | null = null;
  const onWheel = (e: WheelEvent) => {
    if (e.ctrlKey || e.shiftKey) return;
    if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
    const rowH = api.getDisplayedRowAtIndex(0)?.rowHeight;
    if (!rowH) return;
    const physMax = fake.scrollHeight - fake.clientHeight;
    if (physMax <= 0) return;
    const ratio = (api.getDisplayedRowCount() * rowH - fake.clientHeight) / physMax;
    if (!(ratio > 1.01)) return;
    e.preventDefault();
    const unit = e.deltaMode === 1 ? rowH : e.deltaMode === 2 ? fake.clientHeight : 1;
    if (e.deltaX) vp.scrollLeft += e.deltaX * unit;
    // Digulir di luar handler (seret thumb, keyboard): mulai dari posisi sekarang.
    if (target === null || Math.abs(target - vp.scrollTop) > 2) target = vp.scrollTop;
    target = Math.max(0, Math.min(physMax, target + (e.deltaY * unit) / ratio));
    vp.scrollTop = target;
  };
  vp.addEventListener("wheel", onWheel, { passive: false });
  return () => vp.removeEventListener("wheel", onWheel);
}

/** 2. Setelah gulir berhenti di dasar, pastikan baris terakhir (sentinel) terlihat penuh. */
export function fixBottom(root: HTMLElement | null, api: Api, lastIndex: number) {
  const el = root?.querySelector<HTMLElement>(".ag-body-vertical-scroll-viewport");
  if (el && lastIndex >= 0 && el.scrollTop >= el.scrollHeight - el.clientHeight - 2) {
    api.ensureIndexVisible(lastIndex, "bottom");
  }
}

const twoFrames = (fn: () => void) => requestAnimationFrame(() => requestAnimationFrame(fn));

/** Baris `rowIndex` terlihat penuh di antara kepala dan tepi bawah viewport? */
export function rowFullyVisible(root: HTMLElement | null, rowIndex: number): boolean {
  const vp = root?.querySelector<HTMLElement>(".ag-grid-viewport");
  const header = root?.querySelector<HTMLElement>(".ag-header");
  if (!vp || !header) return false;
  const top = header.getBoundingClientRect().bottom;
  const bottom = vp.getBoundingClientRect().top + vp.clientHeight;
  const r = vp.querySelector(`.ag-row[row-index="${rowIndex}"]`)?.getBoundingClientRect();
  return Boolean(r && r.top >= top - 1 && r.bottom <= bottom + 1);
}

/**
 * 3. Fokus keyboard: bila baris terfokus tidak terlihat penuh setelah dua frame, gulir ke tepi
 * terdekat; masih meleset (pembulatan stretching) → tengahkan.
 */
export function guardFocus(root: HTMLElement | null, api: Api, rowIndex: number) {
  const check = (attempt: number) => {
    const vp = root?.querySelector<HTMLElement>(".ag-grid-viewport");
    const header = root?.querySelector<HTMLElement>(".ag-header");
    if (!vp || !header) return;
    if (rowFullyVisible(root, rowIndex)) return;
    const r = vp.querySelector(`.ag-row[row-index="${rowIndex}"]`)?.getBoundingClientRect();
    const top = header.getBoundingClientRect().bottom;
    const pos = attempt > 0 ? "middle" : !r || r.top < top ? "top" : "bottom";
    api.ensureIndexVisible(rowIndex, pos);
    if (attempt < 1) twoFrames(() => check(attempt + 1));
  };
  twoFrames(() => check(0));
}

/**
 * Rentang baris (indeks 0-based) yang lebih dari separuhnya terlihat di viewport, dari DOM baris (AG v36:
 * satu elemen .ag-row per baris berisi sel beku dan sel gulir). null bila belum ada baris.
 */
export function visibleRowRange(root: HTMLElement | null): { first: number; last: number } | null {
  const vp = root?.querySelector<HTMLElement>(".ag-grid-viewport");
  const header = root?.querySelector<HTMLElement>(".ag-header");
  if (!vp || !header) return null;
  const top = header.getBoundingClientRect().bottom;
  const bottom = vp.getBoundingClientRect().top + vp.clientHeight;
  let first = Infinity;
  let last = -Infinity;
  for (const row of vp.querySelectorAll<HTMLElement>(
    ".ag-grid-scrolling-rows .ag-row[row-index]",
  )) {
    const idx = Number(row.getAttribute("row-index"));
    if (!Number.isInteger(idx)) continue;
    const r = row.getBoundingClientRect();
    // Terlihat bila lebih dari separuh tinggi baris ada di viewport.
    const mid = (r.top + r.bottom) / 2;
    if (mid < top || mid > bottom) continue;
    first = Math.min(first, idx);
    last = Math.max(last, idx);
  }
  return Number.isFinite(first) ? { first, last } : null;
}
