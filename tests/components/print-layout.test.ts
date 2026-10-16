import { describe, expect, it } from "vitest";
import {
  bandPlacement,
  exportedAtText,
  FIRST_PAGE_ROWS,
  pageBands,
  PRINT_CARD_CHROME_PX,
  PRINT_HEADER_PX,
  PRINT_LINE_PX,
  PRINT_MIN_SCALE,
  PRINT_PAGE_PX,
  PRINT_TABLE_ROW_PX,
  ROWS_PER_PAGE,
  rowsPx,
  shrinkToPage,
  tableRowsFit,
  tableRowsFitPx,
  type PageBand,
} from "@/components/render/print-layout";
import {
  compactLayout,
  GRID_COLS,
  WIDGET_H_MAX,
  type LayoutItem,
} from "@/features/dashboards/validation";

/*
 * T-018 D6: tata letak cetak PDF dengan alir ulang (review R1 INT-3/DS-2). Widget mengisi halaman dalam
 * urutan tata letak; yang melintasi batas halaman pindah utuh ke halaman berikutnya (kolomnya tetap,
 * urutan di kolom yang sama tetap) — dashboard biasa skala 1. Hanya satu widget yang lebih tinggi dari
 * halamannya diperkecil (≥ 0,75), lebih tinggi lagi dibatasi satu halaman. Halaman pertama lebih pendek
 * (kepala). D8: baris tabel yang muat utuh di kartu.
 */
const item = (i: string, x: number, y: number, w: number, h: number): LayoutItem => ({
  i,
  x,
  y,
  w,
  h,
});
const capOf = (page: number) => (page === 0 ? FIRST_PAGE_ROWS : ROWS_PER_PAGE);
const paged = (layout: LayoutItem[]) => pageBands(layout, ROWS_PER_PAGE, FIRST_PAGE_ROWS);
/** id → [halaman, baris, baris di kertas, skala]. */
const where = (bands: PageBand[]) =>
  Object.fromEntries(
    bands.flatMap((b, page) => b.items.map((p) => [p.item.i, [page, p.row, p.rows, p.scale]])),
  );

/**
 * Sifat wajib untuk tata letak apa pun: setiap widget tepat sekali dan utuh di satu halaman; tidak ada
 * yang bertumpuk; pita tidak lebih tinggi dari halamannya; skala 1 kecuali widget lebih tinggi dari
 * halamannya (≥ PRINT_MIN_SCALE, hasil perkecilan muat); urutan widget di kolom yang sama tetap.
 */
function expectValid(layout: LayoutItem[], bands: PageBand[]) {
  const seen = bands.flatMap((b) => b.items.map((p) => p.item.i));
  expect(seen.sort()).toEqual(layout.map((it) => it.i).sort());
  const at = new Map<string, { page: number; row: number }>();
  bands.forEach((band, page) => {
    const cap = capOf(page);
    expect(band.items.length, `halaman ${page + 1} tidak kosong`).toBeGreaterThan(0);
    expect(band.rows).toBeLessThanOrEqual(cap);
    expect(band.rows).toBe(Math.max(...band.items.map((p) => p.row + p.rows)));
    for (const p of band.items) {
      at.set(p.item.i, { page, row: p.row });
      expect(p.row + p.rows, p.item.i).toBeLessThanOrEqual(cap);
      if (p.scale === 1) {
        expect(p.rows).toBe(p.item.h);
        expect(p.heightPx).toBe(rowsPx(p.item.h));
      } else {
        expect(
          p.item.h,
          `${p.item.i}: diperkecil hanya bila lebih tinggi dari halamannya`,
        ).toBeGreaterThan(cap);
        expect(p.row).toBe(0);
        expect(p.rows).toBe(cap);
        expect(p.scale).toBeGreaterThanOrEqual(PRINT_MIN_SCALE);
        expect(p.heightPx * p.scale).toBeLessThanOrEqual(rowsPx(cap));
      }
      for (const q of band.items) {
        if (q === p) continue;
        const cols = p.item.x < q.item.x + q.item.w && q.item.x < p.item.x + p.item.w;
        const rows = p.row < q.row + q.rows && q.row < p.row + p.rows;
        expect(cols && rows, `${p.item.i} menimpa ${q.item.i}`).toBe(false);
      }
    }
  });
  for (const a of layout) {
    for (const b of layout) {
      const shareCol = a.x < b.x + b.w && b.x < a.x + a.w;
      if (!shareCol || a.y >= b.y) continue;
      const pa = at.get(a.i)!;
      const pb = at.get(b.i)!;
      expect(
        pa.page < pb.page || (pa.page === pb.page && pa.row < pb.row),
        `${a.i} sebelum ${b.i}`,
      ).toBe(true);
    }
  }
}

describe("geometri halaman", () => {
  it("A4 lanskap 190 mm: 10 baris per halaman, 8 di bawah kepala halaman pertama", () => {
    expect(ROWS_PER_PAGE).toBe(10);
    expect(FIRST_PAGE_ROWS).toBe(8);
    expect(rowsPx(ROWS_PER_PAGE)).toBeLessThanOrEqual(PRINT_PAGE_PX);
    expect(rowsPx(ROWS_PER_PAGE + 1)).toBeGreaterThan(PRINT_PAGE_PX);
    expect(PRINT_HEADER_PX + rowsPx(FIRST_PAGE_ROWS)).toBeLessThanOrEqual(PRINT_PAGE_PX);
    // 190 mm pada 96 dpi.
    expect(PRINT_PAGE_PX).toBeLessThan((190 / 25.4) * 96);
  });

  it("rowsPx: baris 56 px + jarak 16 px", () => {
    expect(rowsPx(0)).toBe(0);
    expect(rowsPx(1)).toBe(56);
    expect(rowsPx(4)).toBe(4 * 56 + 3 * 16);
  });
});

describe("pageBands (alir ulang)", () => {
  it("tata letak kosong → tanpa pita", () => {
    expect(paged([])).toEqual([]);
  });

  it("dashboard 6 widget: dua halaman, skala 1", () => {
    const layout = [
      item("k1", 0, 0, 4, 2),
      item("k2", 4, 0, 4, 2),
      item("k3", 8, 0, 4, 2),
      item("bar", 0, 2, 6, 5),
      item("pie", 6, 2, 6, 5),
      item("tbl", 0, 7, 12, 6),
    ];
    const bands = paged(layout);
    expectValid(layout, bands);
    expect(where(bands)).toEqual({
      k1: [0, 0, 2, 1],
      k2: [0, 0, 2, 1],
      k3: [0, 0, 2, 1],
      bar: [0, 2, 5, 1],
      pie: [0, 2, 5, 1],
      tbl: [1, 0, 6, 1],
    });
    expect(bands.map((b) => b.rows)).toEqual([7, 6]);
  });

  it("dua kolom bertingkat (kiri h5, kanan h4): tidak diperkecil, tiap widget utuh, 3 halaman", () => {
    // Review R1 INT-3: dulu satu pita 20 baris pada skala 0,39.
    const layout = [
      item("kiri1", 0, 0, 6, 5),
      item("kanan1", 6, 0, 6, 4),
      item("kanan2", 6, 4, 6, 4),
      item("kiri2", 0, 5, 6, 5),
      item("kanan3", 6, 8, 6, 4),
      item("kiri3", 0, 10, 6, 5),
      item("kanan4", 6, 12, 6, 4),
      item("kiri4", 0, 15, 6, 5),
      item("kanan5", 6, 16, 6, 4),
    ];
    const bands = paged(layout);
    expectValid(layout, bands);
    expect(bands).toHaveLength(3);
    for (const b of bands) for (const p of b.items) expect(p.scale).toBe(1);
    expect(where(bands)).toEqual({
      kiri1: [0, 0, 5, 1],
      kanan1: [0, 0, 4, 1],
      kanan2: [0, 4, 4, 1],
      // Akan melintasi baris 8 halaman pertama → pindah utuh, kolomnya tetap.
      kiri2: [1, 0, 5, 1],
      kanan3: [1, 0, 4, 1],
      kiri3: [1, 5, 5, 1],
      kanan4: [1, 4, 4, 1],
      kiri4: [2, 0, 5, 1],
      kanan5: [2, 0, 4, 1],
    });
  });

  it("widget yang melintasi batas pindah utuh; yang di bawahnya di kolom itu tetap sesudahnya", () => {
    const layout = [
      item("a", 0, 0, 6, 3),
      item("b", 6, 0, 6, 3),
      item("c", 0, 3, 6, 3),
      item("d", 6, 3, 6, 6),
      item("e", 0, 6, 6, 3),
      item("f", 0, 9, 12, 2),
    ];
    const bands = paged(layout);
    expectValid(layout, bands);
    expect(where(bands)).toEqual({
      a: [0, 0, 3, 1],
      b: [0, 0, 3, 1],
      c: [0, 3, 3, 1],
      d: [1, 0, 6, 1],
      e: [1, 0, 3, 1],
      // Selebar halaman: di bawah keduanya.
      f: [1, 6, 2, 1],
    });
  });

  it("halaman pertama memuat lebih sedikit baris (di bawah kepala)", () => {
    const layout = Array.from({ length: 10 }, (_, k) => item(`r${k}`, 0, k * 2, 12, 2));
    const bands = paged(layout);
    expectValid(layout, bands);
    expect(bands.map((b) => b.items.length)).toEqual([4, 5, 1]);
    expect(bands.map((b) => b.rows)).toEqual([8, 10, 2]);
  });

  it("satu widget lebih tinggi dari satu halaman: diperkecil ≥ 0,75 lalu dibatasi; tetangga skala 1", () => {
    const layout = [item("kpi", 0, 0, 12, 2), item("tall", 0, 2, 8, 14), item("next", 0, 16, 6, 3)];
    const bands = paged(layout);
    expectValid(layout, bands);
    expect(bands).toHaveLength(3);
    const tall = bands[1]!.items[0]!;
    expect(tall.item.i).toBe("tall");
    // 704 / 992 = 0,71 < 0,75 → skala minimum, tinggi kartu dibatasi satu halaman pada skala itu.
    expect(tall.scale).toBe(PRINT_MIN_SCALE);
    expect(tall.rows).toBe(ROWS_PER_PAGE);
    expect(tall.heightPx).toBe(Math.floor(rowsPx(ROWS_PER_PAGE) / PRINT_MIN_SCALE));
    expect(tall.heightPx).toBeLessThan(rowsPx(14));
    expect(where(bands).next).toEqual([2, 0, 3, 1]);
  });

  it("shrinkToPage: sedikit lebih tinggi → diperkecil utuh; jauh lebih tinggi → 0,75 dan dibatasi", () => {
    // 12 baris di halaman 10 baris: 704 / 848 = 0,83 — isi utuh.
    expect(shrinkToPage(12, ROWS_PER_PAGE)).toEqual({ scale: 0.8301, heightPx: rowsPx(12) });
    for (let h = ROWS_PER_PAGE + 1; h <= WIDGET_H_MAX; h++) {
      const s = shrinkToPage(h, ROWS_PER_PAGE);
      expect(s.scale, `h=${h}`).toBeGreaterThanOrEqual(PRINT_MIN_SCALE);
      expect(s.heightPx * s.scale).toBeLessThanOrEqual(rowsPx(ROWS_PER_PAGE));
      expect(s.heightPx).toBeLessThanOrEqual(rowsPx(h));
    }
    expect(shrinkToPage(WIDGET_H_MAX, ROWS_PER_PAGE)).toEqual({
      scale: PRINT_MIN_SCALE,
      heightPx: Math.floor(rowsPx(ROWS_PER_PAGE) / PRINT_MIN_SCALE),
    });
  });

  it("widget tinggi di awal halaman pertama diperkecil ke halaman itu (tidak meninggalkan halaman kosong)", () => {
    // Review R1 INT-1 (2): A 12×10 lalu B 12×4.
    const layout = [item("a", 0, 0, 12, 10), item("b", 0, 10, 12, 4)];
    const bands = paged(layout);
    expectValid(layout, bands);
    expect(where(bands)).toEqual({ a: [0, 0, 8, 0.7954], b: [1, 0, 4, 1] });
    expect(bands[0]!.items[0]!.heightPx).toBe(rowsPx(10));
  });

  it("tetangga widget tinggi tetap skala 1 dan berlanjut ke halaman berikutnya", () => {
    const layout = [
      item("tall", 0, 0, 6, 12),
      item("s1", 6, 0, 6, 4),
      item("s2", 6, 4, 6, 4),
      item("s3", 6, 8, 6, 4),
    ];
    const bands = paged(layout);
    expectValid(layout, bands);
    expect(where(bands)).toEqual({
      tall: [0, 0, 8, PRINT_MIN_SCALE],
      s1: [0, 0, 4, 1],
      s2: [0, 4, 4, 1],
      s3: [1, 0, 4, 1],
    });
  });

  it("baris kosong (widget yang hilang) dipadatkan; widget berukuran 0 diabaikan", () => {
    const layout = [item("a", 0, 0, 12, 4), item("z", 0, 4, 0, 0), item("b", 0, 20, 12, 4)];
    expect(where(paged(layout))).toEqual({ a: [0, 0, 4, 1], b: [0, 4, 4, 1] });
  });

  it("dashboard panjang: halaman diisi sebisanya, skala 1, semua widget tepat sekali", () => {
    const layout = Array.from({ length: 30 }, (_, k) =>
      item(`w${k}`, (k % 3) * 4, Math.floor(k / 3) * 3, 4, 3),
    );
    const bands = paged(layout);
    expectValid(layout, bands);
    // 10 baris widget: 2 (6 baris grid) di halaman pertama, 3 (9) di halaman berikutnya, sisa 2.
    expect(bands.map((b) => b.rows)).toEqual([6, 9, 9, 6]);
    for (const b of bands) for (const p of b.items) expect(p.scale).toBe(1);
  });

  it("tata letak acak yang dipadatkan (seperti tersimpan): sifat wajib selalu terpenuhi", () => {
    let seed = 7;
    const rand = (n: number) => {
      seed = (seed * 1_103_515_245 + 12_345) % 2 ** 31;
      return seed % n;
    };
    for (let run = 0; run < 200; run++) {
      const items = Array.from({ length: 1 + rand(14) }, (_, k) => {
        const w = 1 + rand(GRID_COLS);
        // Kebanyakan widget biasa; sesekali tinggi sampai batas.
        const h = rand(10) === 0 ? 1 + rand(WIDGET_H_MAX) : 1 + rand(8);
        return item(`w${k}`, rand(GRID_COLS - w + 1), rand(30), w, h);
      });
      const layout = compactLayout(items);
      const bands = paged(layout);
      expectValid(layout, bands);
    }
  });

  it("bandPlacement: kolom dari x/w, baris dari posisi di halaman", () => {
    expect(bandPlacement({ item: item("a", 3, 12, 6, 4), row: 2, rows: 4 })).toEqual({
      gridColumn: "4 / span 6",
      gridRow: "3 / span 4",
    });
  });
});

describe("tableRowsFit (D8)", () => {
  it("baris yang muat utuh: kartu − kepala − kepala kolom − keterangan − catatan", () => {
    const room = (h: number, notes: number) =>
      rowsPx(h) - PRINT_CARD_CHROME_PX - PRINT_TABLE_ROW_PX - PRINT_LINE_PX * (1 + notes);
    for (const h of [3, 4, 6, 10]) {
      for (const notes of [0, 1, 2]) {
        const fit = tableRowsFit(h, notes);
        expect(fit * PRINT_TABLE_ROW_PX).toBeLessThanOrEqual(room(h, notes));
        expect((fit + 1) * PRINT_TABLE_ROW_PX).toBeGreaterThan(room(h, notes));
      }
    }
    // Kartu 4 baris (272 px): 272 − 42 − 25 − 24 = 181 px → 7 baris.
    expect(tableRowsFit(4)).toBe(7);
    expect(tableRowsFit(4, 1)).toBeLessThan(tableRowsFit(4));
  });

  it("kartu sangat pendek → 0 baris (bukan negatif); versi px sama dengan versi baris grid", () => {
    expect(tableRowsFit(1, 2)).toBe(0);
    expect(tableRowsFitPx(rowsPx(6), 1)).toBe(tableRowsFit(6, 1));
  });
});

describe("exportedAtText", () => {
  it("WIB, bahasa Indonesia", () => {
    expect(exportedAtText("2026-10-16T07:05:00.000Z")).toBe("16 Oktober 2026 14.05 WIB");
  });

  it("tanggal tidak terbaca → kosong", () => {
    expect(exportedAtText("bukan tanggal")).toBe("");
  });
});
