import { describe, expect, it } from "vitest";
import {
  moveItem,
  readingOrder,
  resizeItem,
  sameLayout,
  stepAvailability,
} from "@/components/dashboards/layout-ops";
import type { LayoutItem } from "@/features/dashboards/validation";

/* T-010: geser/ubah ukuran lewat tombol (alternatif menyeret, WCAG 2.5.7) — tanpa tumpang tindih. */
const A = { i: "a", x: 0, y: 0, w: 6, h: 4 };
const B = { i: "b", x: 6, y: 0, w: 6, h: 4 };
const C = { i: "c", x: 0, y: 4, w: 12, h: 3 };

const overlaps = (l: { x: number; y: number; w: number; h: number }[]) =>
  l.some((p, i) =>
    l.some(
      (q, j) => i < j && p.x < q.x + q.w && q.x < p.x + p.w && p.y < q.y + q.h && q.y < p.y + p.h,
    ),
  );
const byId = (l: LayoutItem[], id: string) => l.find((it) => it.i === id)!;

describe("geser lewat tombol", () => {
  it("ke kanan/kiri tetap di dalam 12 kolom", () => {
    const l = moveItem([{ ...A, w: 4 }], "a", 1, 0);
    expect(byId(l, "a")).toMatchObject({ x: 1 });
    expect(moveItem([B], "b", 1, 0)).toEqual([B]); // sudah di tepi kanan
    expect(moveItem([A], "a", -1, 0)).toEqual([A]); // sudah di tepi kiri
  });

  it("naik/turun satu langkah melewati tepat satu item di tumpukan panjang", () => {
    const stack = ["a", "b", "c", "d"].map((i, n) => ({ i, x: 0, y: n * 4, w: 12, h: 4 }));
    const order = (l: LayoutItem[]) => readingOrder(l).map((it) => it.i);
    expect(order(moveItem(stack, "d", 0, -1))).toEqual(["a", "b", "d", "c"]);
    expect(order(moveItem(stack, "a", 0, 1))).toEqual(["b", "a", "c", "d"]);
    expect(order(moveItem(stack, "c", 0, -1))).toEqual(["a", "c", "b", "d"]);
  });

  it("turun melewati item di bawahnya dan naik kembali; tidak pernah tumpang tindih", () => {
    const down = moveItem([A, B, C], "a", 0, 1);
    expect(byId(down, "a").y).toBeGreaterThan(byId(down, "c").y);
    expect(overlaps(down)).toBe(false);
    const up = moveItem(down, "a", 0, -1);
    expect(byId(up, "a").y).toBeLessThan(byId(up, "c").y);
    expect(overlaps(up)).toBe(false);
  });
});

describe("ubah ukuran lewat tombol", () => {
  it("lebar/tinggi dibatasi (min 2, maks 12 kolom) dan tetangga terdorong tanpa tumpang tindih", () => {
    const wider = resizeItem([A, B, C], "a", 1, 0);
    expect(byId(wider, "a").w).toBe(7);
    expect(overlaps(wider)).toBe(false);
    expect(byId(resizeItem([{ ...A, w: 2 }], "a", -1, 0), "a").w).toBe(2);
    const taller = resizeItem([A, B, C], "a", 0, 2);
    expect(byId(taller, "a").h).toBe(6);
    expect(overlaps(taller)).toBe(false);
  });

  it("melebar di tepi kanan menggeser item ke kiri agar tetap di dalam grid", () => {
    const l = resizeItem([{ i: "b", x: 8, y: 0, w: 4, h: 4 }], "b", 1, 0);
    expect(byId(l, "b")).toMatchObject({ x: 7, w: 5 });
  });
});

it("urutan baca: atas ke bawah lalu kiri ke kanan (satu kolom di layar sempit)", () => {
  expect(readingOrder([C, B, A]).map((it) => it.i)).toEqual(["a", "b", "c"]);
});

describe("tepi grid di panel (aria-disabled + pengumuman)", () => {
  it("langkah yang tidak mengubah apa pun ditandai tidak tersedia", () => {
    // A di pojok kiri atas, B di kanan atas, C selebar grid di bawah.
    expect(stepAvailability([A, B, C], "a")).toEqual({
      left: false,
      right: true,
      up: false,
      down: true,
      narrower: true,
      wider: true,
      shorter: true,
      taller: true,
    });
    // C paling bawah dan selebar grid: tidak bisa turun (pemadatan mengembalikannya) atau melebar.
    expect(stepAvailability([A, B, C], "c")).toMatchObject({
      left: false,
      right: false,
      down: false,
      wider: false,
    });
    expect(stepAvailability([{ ...A, w: 2, h: 2 }], "a")).toMatchObject({
      narrower: false,
      shorter: false,
    });
  });

  it("sameLayout membandingkan posisi per id, bukan urutan atau referensi", () => {
    expect(sameLayout([A, B], [{ ...B }, { ...A }])).toBe(true);
    expect(sameLayout([A, B], [A, { ...B, y: 1 }])).toBe(false);
    expect(sameLayout([A], [A, B])).toBe(false);
  });
});
