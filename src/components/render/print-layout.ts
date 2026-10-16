/*
 * Tata letak cetak PDF dashboard (T-018 D6). Halaman A4 lanskap bermargin 10 mm → area isi 277 × 190
 * mm (1047 × 718 px pada 96 dpi; viewport renderer selebar ini — Chromium tidak menjalankan
 * ResizeObserver saat mencetak, jadi tata letak sudah final sebelum pdf()). Grid 12 kolom, baris 56 px
 * dan jarak 16 px seperti kanvas layar (dashboard-canvas ROW_HEIGHT/MARGIN): tinggi kartu sama dengan
 * layar, jadi isi yang menyesuaikan kotaknya (batang yang muat, bentuk KPI) sama juga.
 *
 * pageBands menomori halaman dengan ALIR ULANG (review T-018 R1 INT-3/DS-2): widget diisi ke halaman
 * dalam urutan tata letak (y, lalu x), tetap di kolomnya (x/w); widget yang akan melintasi batas halaman
 * pindah UTUH ke awal halaman berikutnya, dan widget di bawahnya di kolom yang sama tetap sesudahnya.
 * Satu pita = satu halaman (break-before: page); dashboard biasa tercetak skala 1. Halaman pertama lebih
 * pendek (kepala: nama, dataset, filter, waktu ekspor). Hanya SATU widget yang lebih tinggi dari
 * halamannya yang diperkecil (paling kecil PRINT_MIN_SCALE — tetangganya tidak); tidak muat juga pada
 * skala itu → tingginya dibatasi satu halaman (tabel memuat lebih sedikit baris, grafik digambar di
 * kotak yang dibatasi). Murni.
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

/** Skala terkecil widget yang lebih tinggi dari halamannya (teks 12 px → 9 px, masih terbaca). */
export const PRINT_MIN_SCALE = 0.75;

export interface PrintPlacement {
  item: LayoutItem;
  /** Baris grid pertama di halamannya (0 = atas pita). */
  row: number;
  /** Baris grid yang ditempati di kertas: h, atau kapasitas halaman bila diperkecil. */
  rows: number;
  /** 1, atau [PRINT_MIN_SCALE, 1) untuk widget yang lebih tinggi dari halamannya. */
  scale: number;
  /** Tinggi tata letak kartu sebelum diperkecil (px): rowsPx(h), atau dibatasi agar muat satu halaman. */
  heightPx: number;
}

export interface PageBand {
  /** Baris grid terpakai: tinggi kotak pita = rowsPx(rows), tidak pernah lebih dari halamannya. */
  rows: number;
  items: PrintPlacement[];
}

/**
 * Widget setinggi `h` baris di halaman berkapasitas `cap` baris (h > cap): diperkecil agar muat, paling
 * kecil PRINT_MIN_SCALE; pada skala itu pun tidak muat → tinggi kartunya dibatasi (cap / skala minimum).
 */
export function shrinkToPage(h: number, cap: number): Pick<PrintPlacement, "scale" | "heightPx"> {
  const fit = rowsPx(cap) / rowsPx(h);
  if (fit >= PRINT_MIN_SCALE) return { scale: Math.floor(fit * 1e4) / 1e4, heightPx: rowsPx(h) };
  return { scale: PRINT_MIN_SCALE, heightPx: Math.floor(rowsPx(cap) / PRINT_MIN_SCALE) };
}

export function pageBands(
  layout: readonly LayoutItem[],
  rowsPerPage: number,
  firstPageRows = rowsPerPage,
): PageBand[] {
  const items = layout.filter((it) => it.w > 0 && it.h > 0).sort((a, b) => a.y - b.y || a.x - b.x);
  const capOf = (page: number) => Math.max(1, page === 0 ? firstPageRows : rowsPerPage);
  // Per kolom grid: halaman + baris tempat widget berikutnya di kolom itu paling cepat boleh mulai.
  // Tata letak tersimpan dipadatkan vertikal, jadi tanpa batas halaman posisinya sama dengan layar
  // (baris kosong bekas widget yang hilang ikut dipadatkan).
  const cursor = new Map<number, { page: number; row: number }>();
  const bands: PageBand[] = [];
  for (const item of items) {
    let page = 0;
    let row = 0;
    for (let c = item.x; c < item.x + item.w; c++) {
      const at = cursor.get(c);
      if (at && (at.page > page || (at.page === page && at.row > row))) ({ page, row } = at);
    }
    // Melintasi batas halaman → pindah utuh ke awal halaman berikutnya (bukan diperkecil).
    if (row > 0 && row + item.h > capOf(page)) {
      page++;
      row = 0;
    }
    // Di awal halaman pun lebih tinggi dari halamannya → satu-satunya kasus yang diperkecil.
    const cap = capOf(page);
    const placed =
      item.h <= cap
        ? { rows: item.h, scale: 1, heightPx: rowsPx(item.h) }
        : { rows: cap, ...shrinkToPage(item.h, cap) };
    const band = bands[page] ?? { rows: 0, items: [] };
    bands[page] = band;
    band.items.push({ item, row, ...placed });
    band.rows = Math.max(band.rows, row + placed.rows);
    for (let c = item.x; c < item.x + item.w; c++) cursor.set(c, { page, row: row + placed.rows });
  }
  return bands;
}

/** Posisi kartu di grid pitanya. */
export function bandPlacement(p: Pick<PrintPlacement, "item" | "row" | "rows">) {
  return {
    gridColumn: `${p.item.x + 1} / span ${p.item.w}`,
    gridRow: `${p.row + 1} / span ${p.rows}`,
  };
}

/** Kartu cetak: tepi 2 × 1 px + kepala 40 px. Tabel: kepala kolom 25 px, baris 25 px. */
export const PRINT_CARD_CHROME_PX = 42;
export const PRINT_TABLE_ROW_PX = 25;
/** Satu baris catatan/keterangan di bawah isi kartu (h-6). */
export const PRINT_LINE_PX = 24;

/**
 * Perkiraan baris data tabel yang muat utuh di kartu setinggi `px` (judul satu baris): dikurangi kepala
 * kartu, kepala kolom, keterangan "Menampilkan X dari N baris", dan catatan kolom kosong/filter
 * dilewati (D8). Tabel cetak mengukur ulang di kotak sebenarnya (judul bisa membungkus 3 baris).
 */
export function tableRowsFitPx(px: number, notes = 0): number {
  const room = px - PRINT_CARD_CHROME_PX - PRINT_TABLE_ROW_PX - PRINT_LINE_PX * (1 + notes);
  return Math.max(0, Math.floor(room / PRINT_TABLE_ROW_PX));
}

/** tableRowsFitPx untuk kartu setinggi `h` baris grid. */
export const tableRowsFit = (h: number, notes = 0) => tableRowsFitPx(rowsPx(h), notes);

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
