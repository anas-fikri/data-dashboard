/*
 * Validasi dashboard dan tata letak (T-010). Murni (tanpa DB) agar dipakai service dan diuji unit.
 * Grid 12 kolom: x + w ≤ 12; tinggi dan posisi vertikal dibatasi agar layout tidak bisa dibuat
 * raksasa lewat API. Layout yang disimpan selalu dipadatkan vertikal dengan algoritma react-grid-layout
 * (review T-010 M2): mode lihat dan mode edit menampilkan susunan yang sama, tanpa lubang/tumpang tindih.
 */
import { verticalCompactor } from "react-grid-layout/core";
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
/** Ukuran terkecil widget (satuan grid). */
export const WIDGET_MIN_SIZE = { w: 2, h: 2 } as const;
/**
 * Minimum per jenis (review desain T-011 putaran 4): tabel 2×2 (128 px) habis untuk kepala kartu, judul
 * kolom, dan pager — 0 baris data. 3×4 menampilkan ≥ 2 baris walau pager terlipat dan tombolnya 44 px
 * (layar sentuh), dan pager ‹ 1/4 › muat di 1024 px.
 */
const MIN_BY_TYPE: ReadonlyMap<string, { w: number; h: number }> = new Map([
  ["table", { w: 3, h: 4 }],
]);

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
/** Satu item layout yang dikirim klien: id widget + posisi, tanpa kunci lain. */
const layoutItem = (id: z.ZodString) =>
  z
    .object({ i: id, ...coords })
    .strict()
    .refine(fitsGrid, outside);
/** Item tersimpan: kunci tambahan (versi mendatang) diabaikan, bukan membuang posisinya. */
const storedItem = z.object({ i: z.string(), ...coords }).refine(fitsGrid, outside);

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

/** Rapikan nama untuk dibandingkan/disimpan: NFC (é tersusun = é terurai), trim, spasi dirapatkan. */
export const normalizeName = (raw: string) => raw.normalize("NFC").trim().replace(/\s+/g, " ");

// Kontrol/format (mis. U+202E pembalik arah teks) bisa menipu tampilan; ZWJ/ZWNJ tetap boleh (emoji,
// aksara tertentu). Pengisi Hangul dan braille kosong tampak kosong, jadi tidak dihitung terlihat.
const FORBIDDEN = /(?![\u200C\u200D])[\p{Cc}\p{Cf}]/u;
const FILLERS = /[\u115F\u1160\u2800\u3164\uFFA0]/gu;
const VISIBLE = /[\p{L}\p{N}\p{P}\p{S}]/u;

/** Nama tampil (dashboard/widget): wajib, ≤ max, tanpa karakter kontrol/format, ada yang terlihat. */
export function cleanName(
  raw: unknown,
  max: number,
  label: string,
): { ok: true; value: string } | { ok: false; message: string } {
  const value = typeof raw === "string" ? normalizeName(raw) : "";
  if (!value) return { ok: false, message: `Beri nama ${label}.` };
  if (FORBIDDEN.test(value)) {
    return { ok: false, message: "Nama mengandung karakter yang tidak diizinkan." };
  }
  if (!VISIBLE.test(value.replace(FILLERS, ""))) {
    return { ok: false, message: `Beri nama ${label} yang bisa dibaca.` };
  }
  if (value.length > max) return { ok: false, message: `Nama maksimal ${max} karakter.` };
  return { ok: true, value };
}

/** Ukuran terkecil untuk jenis widget ini (jenis tak dikenal/kosong = minimum umum). */
export function minSizeOf(type: string | undefined): { w: number; h: number } {
  return (type !== undefined && MIN_BY_TYPE.get(type)) || WIDGET_MIN_SIZE;
}

/**
 * Widget yang lebih kecil dari minimum jenisnya diperbesar (tetap di dalam 12 kolom), lalu dipadatkan
 * tanpa tumpang tindih — tata letak lama (mis. tabel 2×2) dan widget yang baru diganti jenisnya. Tidak
 * ada yang perlu diperbesar → array yang sama dikembalikan (tanpa pemadatan ulang).
 */
export function fitMinSizes(items: LayoutItem[], types: ReadonlyMap<string, string>): LayoutItem[] {
  let grown = false;
  const next = items.map((it) => {
    const min = minSizeOf(types.get(it.i));
    if (it.w >= min.w && it.h >= min.h) return it;
    grown = true;
    const w = Math.min(Math.max(it.w, min.w), GRID_COLS);
    return { ...it, w, h: Math.max(it.h, min.h), x: Math.min(it.x, GRID_COLS - w) };
  });
  return grown ? compactLayout(next) : items;
}

/** Baris pertama yang kosong di bawah semua widget (tempat widget baru). */
export function bottomOf(layout: LayoutItem[]): number {
  return layout.reduce((m, it) => Math.max(m, it.y + it.h), 0);
}

/**
 * Padatkan vertikal (algoritma react-grid-layout): tanpa lubang dan tanpa tumpang tindih; urutan item
 * dipertahankan. Tinggi total ≤ jumlah tinggi widget (≤ 50 × 40 = LAYOUT_Y_MAX), jadi y tetap valid.
 */
export function compactLayout(items: LayoutItem[]): LayoutItem[] {
  const compacted = verticalCompactor.compact(
    items.map((it) => ({ ...it })),
    GRID_COLS,
  );
  const byId = new Map(compacted.map((it) => [it.i, it]));
  return items.map((it) => {
    const c = byId.get(it.i)!;
    return { i: it.i, x: c.x, y: c.y, w: c.w, h: c.h };
  });
}

/**
 * Layout tersimpan → layout yang cocok dengan widget yang ada: item tanpa widget dibuang, widget tanpa
 * item ditaruh di bawah, lalu dipadatkan. Melindungi tampilan dari data lama/rusak tanpa gagal total.
 * Dengan `types` (id → jenis widget), item di bawah minimum jenisnya ikut diperbesar (fitMinSizes).
 */
export function reconcileLayout(
  stored: unknown,
  widgetIds: string[],
  types?: ReadonlyMap<string, string>,
): LayoutItem[] {
  const ids = new Set(widgetIds);
  // Per item: satu item rusak tidak membuang posisi widget lain.
  const one = storedItem;
  const items: LayoutItem[] = [];
  const seen = new Set<string>();
  for (const raw of Array.isArray(stored) ? stored : []) {
    const p = one.safeParse(raw);
    if (p.success && ids.has(p.data.i) && !seen.has(p.data.i)) {
      const { i, x, y, w, h } = p.data;
      items.push({ i, x, y, w, h });
      seen.add(i);
    }
  }
  for (const id of widgetIds) {
    if (seen.has(id)) continue;
    items.push({ i: id, x: 0, y: bottomOf(items), ...DEFAULT_WIDGET_SIZE });
    seen.add(id);
  }
  const compacted = compactLayout(items);
  return types ? fitMinSizes(compacted, types) : compacted;
}
