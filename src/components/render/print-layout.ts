/*
 * Tata letak cetak PDF dashboard (T-018 D6). Halaman A4 lanskap bermargin 10 mm → area isi 277 × 190
 * mm (1047 × 718 px pada 96 dpi; viewport renderer selebar ini — Chromium tidak menjalankan
 * ResizeObserver saat mencetak, jadi tata letak sudah final sebelum pdf()). Grid 12 kolom, baris 56 px
 * dan jarak 16 px seperti kanvas layar (dashboard-canvas ROW_HEIGHT/MARGIN): tinggi kartu sama dengan
 * layar, jadi isi yang menyesuaikan kotaknya (batang yang muat, bentuk KPI) sama juga.
 *
 * pageBands memotong tata letak hanya di batas y yang tidak dilintasi widget mana pun — satu pita = satu
 * halaman (break-before: page), tidak ada widget yang terbelah. Halaman pertama lebih pendek (kepala:
 * nama, dataset, filter, waktu ekspor). Pita yang tetap lebih tinggi dari halamannya (widget setinggi
 * lebih dari satu halaman, beserta widget di sampingnya) DIPERKECIL utuh agar muat — tidak dipotong.
 * Murni.
 */
import type { LayoutItem } from "@/features/dashboards/validation";

export const PRINT_ROW_PX = 56;
export const PRINT_GAP_PX = 16;
/** Tinggi isi 190 mm ≈ 718 px; 6 px cadangan agar pembulatan tidak mendorong pita ke halaman baru. */
export const PRINT_PAGE_PX = 712;
/** Kepala halaman pertama (tinggi tetap; filter maks. 3 baris) + jaraknya ke pita pertama. */
export const PRINT_HEADER_PX = 152;

/** Tinggi n baris grid (px), termasuk jarak antarbaris. */
export const rowsPx = (rows: number) =>
  rows <= 0 ? 0 : rows * PRINT_ROW_PX + (rows - 1) * PRINT_GAP_PX;
/** Baris grid utuh yang muat di tinggi `px` (paling sedikit 1). */
export const rowsIn = (px: number) =>
  Math.max(1, Math.floor((px + PRINT_GAP_PX) / (PRINT_ROW_PX + PRINT_GAP_PX)));

/** 10 baris per halaman; 8 di halaman pertama (di bawah kepala). */
export const ROWS_PER_PAGE = rowsIn(PRINT_PAGE_PX);
export const FIRST_PAGE_ROWS = rowsIn(PRINT_PAGE_PX - PRINT_HEADER_PX);

export interface PageBand {
  /** Baris grid pertama pita (y tata letak). */
  start: number;
  rows: number;
  /** Widget yang seluruhnya berada di pita ini (y dalam [start, start + rows)). */
  items: LayoutItem[];
  /** 1, atau < 1 bila pita lebih tinggi dari halamannya (diperkecil utuh). */
  scale: number;
}

export function pageBands(
  layout: readonly LayoutItem[],
  rowsPerPage: number,
  firstPageRows = rowsPerPage,
): PageBand[] {
  const items = layout.filter((it) => it.w > 0 && it.h > 0);
  if (!items.length) return [];
  const crossed = (c: number) => items.some((it) => it.y < c && c < it.y + it.h);
  // Batas potong yang sah: tepi bawah widget yang tidak dilintasi widget lain (akhir tata letak selalu).
  const cuts = [...new Set(items.map((it) => it.y + it.h))]
    .filter((c) => !crossed(c))
    .sort((a, b) => a - b);
  const end = cuts[cuts.length - 1]!;
  const bands: PageBand[] = [];
  let start = Math.min(...items.map((it) => it.y));
  while (start < end) {
    const cap = Math.max(1, bands.length === 0 ? firstPageRows : rowsPerPage);
    const after = cuts.filter((c) => c > start);
    const fitting = after.filter((c) => c - start <= cap);
    // Potongan terjauh yang muat; tidak ada → potongan sah pertama (pita lebih tinggi dari halaman).
    const cut = fitting.length ? fitting[fitting.length - 1]! : after[0]!;
    const rows = cut - start;
    bands.push({
      start,
      rows,
      items: items.filter((it) => it.y >= start && it.y < cut),
      scale: rows > cap ? Math.floor((rowsPx(cap) / rowsPx(rows)) * 1e4) / 1e4 : 1,
    });
    // Baris kosong sesudah potongan (tata letak tersimpan dipadatkan, jadi jarang) dilewati.
    const next = items.filter((it) => it.y >= cut).map((it) => it.y);
    start = next.length ? Math.min(...next) : end;
  }
  return bands;
}

/** Posisi widget di grid pitanya (baris dihitung dari awal pita). */
export function bandPlacement(item: LayoutItem, band: Pick<PageBand, "start">) {
  return {
    gridColumn: `${item.x + 1} / span ${item.w}`,
    gridRow: `${item.y - band.start + 1} / span ${item.h}`,
  };
}

/** Kartu cetak: tepi 2 × 1 px + kepala 40 px. Tabel: kepala kolom 25 px, baris 25 px. */
export const PRINT_CARD_CHROME_PX = 42;
export const PRINT_TABLE_ROW_PX = 25;
/** Satu baris catatan/keterangan di bawah isi kartu (h-6). */
export const PRINT_LINE_PX = 24;

/**
 * Baris data tabel yang muat utuh di kartu setinggi `h` baris grid: dikurangi kepala kartu, kepala
 * kolom, keterangan "Menampilkan X dari N baris", dan catatan kolom kosong/filter dilewati (D8).
 */
export function tableRowsFit(h: number, notes = 0): number {
  const room = rowsPx(h) - PRINT_CARD_CHROME_PX - PRINT_TABLE_ROW_PX - PRINT_LINE_PX * (1 + notes);
  return Math.max(0, Math.floor(room / PRINT_TABLE_ROW_PX));
}

const DAY = new Intl.DateTimeFormat("id-ID", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "Asia/Jakarta",
});
const CLOCK = new Intl.DateTimeFormat("id-ID", {
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Asia/Jakarta",
});

/** Waktu ekspor diminta → "16 Oktober 2026 14.05 WIB" (tanggal tidak terbaca → string kosong). */
export function exportedAtText(iso: string): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return "";
  return `${DAY.format(at)} ${CLOCK.format(at)} WIB`;
}
