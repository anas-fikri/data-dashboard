import type { CSSProperties } from "react";
import { moveElement, verticalCompactor, type Layout } from "react-grid-layout/core";
import {
  GRID_COLS,
  WIDGET_H_MAX,
  WIDGET_MIN_SIZE,
  fitMinSizes,
  type LayoutItem,
} from "@/features/dashboards/validation";

/*
 * Ubah tata letak tanpa menyeret (T-010, WCAG 2.5.7): geser satu sel dan ubah ukuran satu langkah lewat
 * tombol, memakai algoritma tabrakan + pemadatan vertikal yang sama dengan react-grid-layout sehingga
 * hasilnya identik dengan menyeret.
 */
/** Ukuran terkecil satu widget (per jenis, lihat minSizeOf; bawaan WIDGET_MIN_SIZE 2×2). */
export type MinSize = { w: number; h: number };

/** Tata letak dengan setiap widget ≥ minimum jenisnya (tabel lama 2×2 → 3×4), dipadatkan. */
export function fitToWidgets(
  layout: LayoutItem[],
  widgets: readonly { id: string; type: string }[],
): LayoutItem[] {
  return fitMinSizes(layout, new Map(widgets.map((w) => [w.id, w.type])));
}

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
    // Item terdekat di atas (bukan yang paling atas): satu langkah = melewati satu item.
    if (above.length) y = Math.max(...above.map((o) => o.y));
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

export function resizeItem(
  layout: LayoutItem[],
  id: string,
  dw: number,
  dh: number,
  min: MinSize = WIDGET_MIN_SIZE,
): LayoutItem[] {
  const item = layout.find((it) => it.i === id);
  if (!item) return layout;
  const w = Math.min(Math.max(min.w, item.w + dw), GRID_COLS);
  const h = Math.min(Math.max(min.h, item.h + dh), WIDGET_H_MAX);
  // Melebar di tepi kanan: geser ke kiri secukupnya agar tetap di dalam grid.
  const x = Math.min(item.x, GRID_COLS - w);
  if (w === item.w && h === item.h && x === item.x) return layout;
  return compact(layout.map((it) => (it.i === id ? { ...it, x, w, h } : { ...it })));
}

export type StepKey =
  "left" | "right" | "up" | "down" | "narrower" | "wider" | "shorter" | "taller";
export const STEP_KEYS: StepKey[] = [
  "left",
  "right",
  "up",
  "down",
  "narrower",
  "wider",
  "shorter",
  "taller",
];

/** Satu langkah tombol panel (geser satu sel / ubah ukuran satu satuan, tidak di bawah `min`). */
export function applyStep(
  layout: LayoutItem[],
  id: string,
  key: StepKey,
  min: MinSize = WIDGET_MIN_SIZE,
): LayoutItem[] {
  switch (key) {
    case "left":
      return moveItem(layout, id, -1, 0);
    case "right":
      return moveItem(layout, id, 1, 0);
    case "up":
      return moveItem(layout, id, 0, -1);
    case "down":
      return moveItem(layout, id, 0, 1);
    case "narrower":
      return resizeItem(layout, id, -1, 0, min);
    case "wider":
      return resizeItem(layout, id, 1, 0, min);
    case "shorter":
      return resizeItem(layout, id, 0, -1, min);
    case "taller":
      return resizeItem(layout, id, 0, 1, min);
  }
}

/** Langkah panel mana yang masih mengubah tata letak (tepi grid / pemadatan → tidak). */
export function stepAvailability(
  layout: LayoutItem[],
  id: string,
  min: MinSize = WIDGET_MIN_SIZE,
): Record<StepKey, boolean> {
  const out = {} as Record<StepKey, boolean>;
  for (const k of STEP_KEYS) out[k] = !sameLayout(applyStep(layout, id, k, min), layout);
  return out;
}

/** Posisi/ukuran semua widget sama (urutan item diabaikan). */
export function sameLayout(a: LayoutItem[], b: LayoutItem[]): boolean {
  if (a.length !== b.length) return false;
  const byId = new Map(b.map((it) => [it.i, it]));
  return a.every((it) => {
    const o = byId.get(it.i);
    return !!o && o.x === it.x && o.y === it.y && o.w === it.w && o.h === it.h;
  });
}

/** Urutan baca (atas → bawah, kiri → kanan): satu kolom di layar sempit dan urutan fokus. */
export function readingOrder(layout: LayoutItem[]): LayoutItem[] {
  return [...layout].sort((a, b) => a.y - b.y || a.x - b.x);
}

/** Tinggi kartu di tumpukan ponsel (< 768 px) per jenis widget (px). */
export const PHONE_HEIGHT: Record<string, number> = {
  table: 440,
  pivot: 440,
  bar: 320,
  line: 280,
  pie: 320,
  kpi: 150,
};

/**
 * Ukuran kartu di tumpukan ponsel. Tabel/grafik: tinggi tetap (bukan dari grid layar lebar) — isinya
 * menggulir di dalam kartu tanpa memanjangkan halaman. KPI: tinggi minimum (review L6: tidak memboroskan
 * layar), tetapi tumbuh saat blok galat butuh ruang — "Muat ulang"/"Coba lagi" selalu terlihat tanpa
 * menggulir di dalam kartu 150 px (review T-016 R2-UI-2). Isi KPI di sini hanya mengukur lebar (kpi-fit
 * tanpa batas tinggi — WidgetBody fixedHeight false; batas tinggi pada kartu yang tumbuh akan berputar).
 */
export const phoneCardStyle = (type: string): CSSProperties =>
  type === "kpi" ? { minHeight: PHONE_HEIGHT.kpi } : { height: PHONE_HEIGHT[type] ?? 160 };

/** Kolom grid tampilan 768–1023 px (T-031). */
export const TABLET_COLS = 6;

/**
 * Tata letak tampilan 768–1023 px (T-031): grid 12 kolom di kanvas ±480 px (sidebar tetap tampil)
 * membuat kartu 2 kolom hanya 66 px. Di sini 6 kolom: lebar = separuh lebar 12 kolom, paling sedikit
 * setengah kanvas (3 → ±232 px di 768 px). Kartu dialirkan per baris dalam urutan baca lalu dipadatkan
 * dengan compactor yang sama dengan grid, jadi posisi hasil = yang digambar (gulir ke widget dan urutan
 * Tab memakainya; review T-031 INT-2). Hanya tampilan — tidak pernah disimpan, jadi tata letak ≥ 1024 px
 * tetap; posisi/ukuran diatur lewat panel (satuan 12 kolom) seperti di ponsel.
 */
export function tabletLayout(layout: LayoutItem[]): LayoutItem[] {
  let x = 0;
  let y = 0;
  let rowH = 0;
  const flowed = readingOrder(layout).map((it) => {
    const w = Math.min(TABLET_COLS, Math.max(3, Math.round(it.w / 2)));
    if (x + w > TABLET_COLS) [x, y, rowH] = [0, y + rowH, 0];
    const out = { i: it.i, x, y, w, h: it.h };
    x += w;
    rowH = Math.max(rowH, it.h);
    return out;
  });
  return readingOrder(
    verticalCompactor.compact(flowed, TABLET_COLS).map(({ i, x, y, w, h }) => ({ i, x, y, w, h })),
  );
}
