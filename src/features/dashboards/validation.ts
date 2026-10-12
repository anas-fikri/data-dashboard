/*
 * Validasi dashboard dan tata letak (T-010). Murni (tanpa DB) agar dipakai service dan diuji unit.
 * Grid 12 kolom: x + w ≤ 12; tinggi dan posisi vertikal dibatasi agar layout tidak bisa dibuat
 * raksasa lewat API.
 */
import { z } from "zod";

export const GRID_COLS = 12;
export const DASHBOARD_NAME_MAX = 80;
export const WIDGET_TITLE_MAX = 80;
export const DASHBOARDS_PER_DATASET = 10;
export const WIDGETS_PER_DASHBOARD = 50;
export const WIDGET_H_MAX = 40;
export const LAYOUT_Y_MAX = 2_000;
/** Ukuran widget baru (sepertiga lebar, tinggi 4 baris). */
export const DEFAULT_WIDGET_SIZE = { w: 4, h: 4 } as const;

export interface LayoutItem {
  i: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

const cuid = z.string().regex(/^[a-z0-9]{20,32}$/);
const int = (min: number, max: number) => z.number().int().min(min).max(max);

const coords = {
  x: int(0, GRID_COLS - 1),
  y: int(0, LAYOUT_Y_MAX),
  w: int(1, GRID_COLS),
  h: int(1, WIDGET_H_MAX),
};
const fitsGrid = (p: { x: number; w: number }) => p.x + p.w <= GRID_COLS;
const outside = { message: "widget melewati lebar grid" };

/** Posisi tanpa id (memulihkan widget di tempat semula). */
export const positionSchema = z.object(coords).strict().refine(fitsGrid, outside);
/** Satu item layout tersimpan/dikirim: id widget + posisi, tanpa kunci lain. */
const layoutItem = (id: z.ZodString) =>
  z
    .object({ i: id, ...coords })
    .strict()
    .refine(fitsGrid, outside);

export const layoutBodySchema = z
  .object({
    baseRevision: z.number().int().min(0),
    items: z
      .array(layoutItem(cuid))
      .max(WIDGETS_PER_DASHBOARD)
      .refine((xs) => new Set(xs.map((x) => x.i)).size === xs.length, {
        message: "id widget ganda",
      }),
  })
  .strict();

/** Nama tampil (dashboard/widget): trim, spasi dirapatkan, tanpa karakter kontrol/format. */
export function cleanName(
  raw: unknown,
  max: number,
  label: string,
): { ok: true; value: string } | { ok: false; message: string } {
  const value = typeof raw === "string" ? raw.trim().replace(/\s+/g, " ") : "";
  if (!value) return { ok: false, message: `Beri nama ${label}.` };
  // Karakter kontrol/format (mis. U+202E pembalik arah teks) bisa menipu tampilan saat dibagikan.
  if (/[\p{Cc}\p{Cf}]/u.test(value)) {
    return { ok: false, message: "Nama mengandung karakter yang tidak diizinkan." };
  }
  if (value.length > max) return { ok: false, message: `Nama maksimal ${max} karakter.` };
  return { ok: true, value };
}

/** Baris pertama yang kosong di bawah semua widget (tempat widget baru). */
export function bottomOf(layout: LayoutItem[]): number {
  return layout.reduce((m, it) => Math.max(m, it.y + it.h), 0);
}

/**
 * Layout tersimpan → layout yang cocok dengan widget yang ada: item tanpa widget dibuang, widget tanpa
 * item ditaruh di bawah. Melindungi tampilan dari data lama/rusak tanpa gagal total.
 */
export function reconcileLayout(stored: unknown, widgetIds: string[]): LayoutItem[] {
  const ids = new Set(widgetIds);
  // Per item: satu item rusak tidak membuang posisi widget lain.
  const one = layoutItem(z.string());
  const items: LayoutItem[] = [];
  const seen = new Set<string>();
  for (const raw of Array.isArray(stored) ? stored : []) {
    const p = one.safeParse(raw);
    if (p.success && ids.has(p.data.i) && !seen.has(p.data.i)) {
      items.push(p.data);
      seen.add(p.data.i);
    }
  }
  for (const id of widgetIds) {
    if (seen.has(id)) continue;
    items.push({ i: id, x: 0, y: bottomOf(items), ...DEFAULT_WIDGET_SIZE });
    seen.add(id);
  }
  return items;
}
