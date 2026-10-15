import { describe, expect, it } from "vitest";
import {
  bandPlacement,
  exportedAtText,
  FIRST_PAGE_ROWS,
  pageBands,
  PRINT_CARD_CHROME_PX,
  PRINT_HEADER_PX,
  PRINT_LINE_PX,
  PRINT_PAGE_PX,
  PRINT_TABLE_ROW_PX,
  ROWS_PER_PAGE,
  rowsPx,
  tableRowsFit,
  type PageBand,
} from "@/components/render/print-layout";
import type { LayoutItem } from "@/features/dashboards/validation";

/*
 * T-018 D6: tata letak cetak PDF. pageBands memotong hanya di batas yang tidak dilintasi widget,
 * halaman pertama lebih pendek (kepala), widget setinggi lebih dari satu halaman mendapat pita sendiri
 * yang diperkecil utuh. D8: baris tabel yang muat utuh di kartu.
 */
const item = (i: string, x: number, y: number, w: number, h: number): LayoutItem => ({
  i,
  x,
  y,
  w,
  h,
});

/** Tidak ada widget yang terbelah: setiap widget seluruhnya di dalam satu pita. */
function expectWhole(layout: LayoutItem[], bands: PageBand[]) {
  for (const it of layout) {
    const owners = bands.filter((b) => b.items.includes(it));
    expect(owners, it.i).toHaveLength(1);
    const b = owners[0]!;
    expect(it.y).toBeGreaterThanOrEqual(b.start);
    expect(it.y + it.h).toBeLessThanOrEqual(b.start + b.rows);
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

describe("pageBands", () => {
  it("tata letak kosong → tanpa pita", () => {
    expect(pageBands([], ROWS_PER_PAGE, FIRST_PAGE_ROWS)).toEqual([]);
  });

  it("dashboard 6 widget muat di dua halaman tanpa membelah widget", () => {
    const layout = [
      item("k1", 0, 0, 4, 2),
      item("k2", 4, 0, 4, 2),
      item("k3", 8, 0, 4, 2),
      item("bar", 0, 2, 6, 5),
      item("pie", 6, 2, 6, 5),
      item("tbl", 0, 7, 12, 6),
    ];
    const bands = pageBands(layout, ROWS_PER_PAGE, FIRST_PAGE_ROWS);
    expectWhole(layout, bands);
    expect(bands.map((b) => [b.start, b.rows, b.scale])).toEqual([
      [0, 7, 1],
      [7, 6, 1],
    ]);
    expect(bands[0]!.rows).toBeLessThanOrEqual(FIRST_PAGE_ROWS);
  });

  it("memotong di batas terjauh yang muat, bukan di tengah widget yang berdampingan", () => {
    // Widget kiri 0–6 dan kanan 3–9: batas 6 dilintasi kanan → pita pertama berhenti di 3.
    const layout = [
      item("a", 0, 0, 6, 3),
      item("b", 6, 0, 6, 3),
      item("c", 0, 3, 6, 3),
      item("d", 6, 3, 6, 6),
      item("e", 0, 6, 6, 3),
      item("f", 0, 9, 12, 2),
    ];
    const bands = pageBands(layout, ROWS_PER_PAGE, FIRST_PAGE_ROWS);
    expectWhole(layout, bands);
    expect(bands.map((b) => [b.start, b.rows])).toEqual([
      [0, 3],
      [3, 8],
    ]);
    for (const b of bands) expect(b.scale).toBe(1);
  });

  it("widget lebih tinggi dari satu halaman: pita sendiri, diperkecil utuh agar muat", () => {
    const layout = [item("kpi", 0, 0, 12, 2), item("tall", 0, 2, 8, 14), item("next", 0, 16, 6, 3)];
    const bands = pageBands(layout, ROWS_PER_PAGE, FIRST_PAGE_ROWS);
    expectWhole(layout, bands);
    expect(bands).toHaveLength(3);
    const tall = bands[1]!;
    expect(tall.items.map((it) => it.i)).toEqual(["tall"]);
    expect(tall.rows).toBe(14);
    expect(tall.scale).toBeLessThan(1);
    // Hasil perkecilan tidak lebih tinggi dari halaman (pita bukan halaman pertama: 10 baris).
    expect(rowsPx(tall.rows) * tall.scale).toBeLessThanOrEqual(rowsPx(ROWS_PER_PAGE));
    expect(rowsPx(tall.rows) * tall.scale).toBeGreaterThan(rowsPx(ROWS_PER_PAGE) - 1);
    expect(bands[2]!.scale).toBe(1);
  });

  it("widget tinggi sebagai pita pertama diperkecil ke tinggi halaman pertama (di bawah kepala)", () => {
    const bands = pageBands([item("tall", 0, 0, 12, 12)], ROWS_PER_PAGE, FIRST_PAGE_ROWS);
    expect(bands).toHaveLength(1);
    expect(rowsPx(12) * bands[0]!.scale).toBeLessThanOrEqual(rowsPx(FIRST_PAGE_ROWS));
  });

  it("tetangga yang berbagi baris dengan widget tinggi ikut di pitanya (tidak terbelah)", () => {
    const layout = [item("tall", 0, 0, 6, 12), item("s1", 6, 0, 6, 4), item("s2", 6, 4, 6, 4)];
    const bands = pageBands(layout, ROWS_PER_PAGE, FIRST_PAGE_ROWS);
    expectWhole(layout, bands);
    expect(bands).toHaveLength(1);
    expect(bands[0]!.items.map((it) => it.i).sort()).toEqual(["s1", "s2", "tall"]);
  });

  it("baris kosong di antara widget dilewati; widget berukuran 0 diabaikan", () => {
    const layout = [item("a", 0, 0, 12, 4), item("z", 0, 4, 0, 0), item("b", 0, 20, 12, 4)];
    const bands = pageBands(layout, ROWS_PER_PAGE, FIRST_PAGE_ROWS);
    expect(bands.map((b) => [b.start, b.rows, b.items.map((it) => it.i)])).toEqual([
      [0, 4, ["a"]],
      [20, 4, ["b"]],
    ]);
  });

  it("dashboard panjang: setiap pita ≤ kapasitas halamannya, semua widget tepat sekali", () => {
    const layout = Array.from({ length: 30 }, (_, k) =>
      item(`w${k}`, (k % 3) * 4, Math.floor(k / 3) * 3, 4, 3),
    );
    const bands = pageBands(layout, ROWS_PER_PAGE, FIRST_PAGE_ROWS);
    expectWhole(layout, bands);
    bands.forEach((b, k) => {
      expect(b.rows).toBeLessThanOrEqual(k === 0 ? FIRST_PAGE_ROWS : ROWS_PER_PAGE);
      expect(b.scale).toBe(1);
    });
    expect(bands.flatMap((b) => b.items)).toHaveLength(30);
  });

  it("bandPlacement: kolom dari x/w, baris dihitung dari awal pita", () => {
    expect(bandPlacement(item("a", 3, 12, 6, 4), { start: 10 })).toEqual({
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

  it("kartu sangat pendek → 0 baris (bukan negatif)", () => {
    expect(tableRowsFit(1, 2)).toBe(0);
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
