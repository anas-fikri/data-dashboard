import { moveElement, verticalCompactor, type Layout } from "react-grid-layout/core";
import { GRID_COLS, WIDGET_H_MAX, type LayoutItem } from "@/features/dashboards/validation";

/*
 * Ubah tata letak tanpa menyeret (T-010, WCAG 2.5.7): geser satu sel dan ubah ukuran satu langkah lewat
 * tombol, memakai algoritma tabrakan + pemadatan vertikal yang sama dengan react-grid-layout sehingga
 * hasilnya identik dengan menyeret.
 */
export const MIN_W = 2;
export const MIN_H = 2;

const toPlain = (layout: Layout): LayoutItem[] =>
  layout.map(({ i, x, y, w, h }) => ({ i, x, y, w, h }));
const compact = (layout: Layout) => toPlain(verticalCompactor.compact(layout, GRID_COLS));

export function moveItem(layout: LayoutItem[], id: string, dx: number, dy: number): LayoutItem[] {
  const item = layout.find((it) => it.i === id);
  if (!item) return layout;
  const x = Math.min(Math.max(0, item.x + dx), GRID_COLS - item.w);
  // Naik satu baris di atas item lain: lompati item itu (tanpa ini pemadatan mengembalikannya).
  let y = Math.max(0, item.y + dy);
  if (dy < 0) {
    const above = layout.filter(
      (o) => o.i !== id && o.y < item.y && o.x < x + item.w && x < o.x + o.w,
    );
    if (above.length) y = Math.min(...above.map((o) => o.y));
  }
  if (dy > 0) {
    const below = layout.filter(
      (o) => o.i !== id && o.y >= item.y + item.h && o.x < x + item.w && x < o.x + o.w,
    );
    // Turun satu langkah = pindah tepat di bawah baris item terdekat di bawahnya.
    if (below.length) {
      const nearest = Math.min(...below.map((o) => o.y));
      y = Math.max(...below.filter((o) => o.y === nearest).map((o) => o.y + o.h));
    }
  }
  if (x === item.x && y === item.y) return layout;
  // moveElement mencari item lewat referensi di dalam layout yang diberikan.
  const copy = layout.map((it) => ({ ...it }));
  const target = copy.find((it) => it.i === id)!;
  return compact(moveElement(copy, target, x, y, true, false, "vertical", GRID_COLS));
}

export function resizeItem(layout: LayoutItem[], id: string, dw: number, dh: number): LayoutItem[] {
  const item = layout.find((it) => it.i === id);
  if (!item) return layout;
  const w = Math.min(Math.max(MIN_W, item.w + dw), GRID_COLS);
  const h = Math.min(Math.max(MIN_H, item.h + dh), WIDGET_H_MAX);
  // Melebar di tepi kanan: geser ke kiri secukupnya agar tetap di dalam grid.
  const x = Math.min(item.x, GRID_COLS - w);
  if (w === item.w && h === item.h && x === item.x) return layout;
  return compact(layout.map((it) => (it.i === id ? { ...it, x, w, h } : { ...it })));
}

/** Urutan baca (atas → bawah, kiri → kanan): satu kolom di layar sempit dan urutan fokus. */
export function readingOrder(layout: LayoutItem[]): LayoutItem[] {
  return [...layout].sort((a, b) => a.y - b.y || a.x - b.x);
}
