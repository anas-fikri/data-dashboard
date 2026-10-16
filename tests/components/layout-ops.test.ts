import { describe, expect, it } from "vitest";
import {
  applyStep,
  fitToWidgets,
  moveItem,
  readingOrder,
  resizeItem,
  sameLayout,
  stepAvailability,
  TABLET_COLS,
  tabletLayout,
} from "@/components/dashboards/layout-ops";
import {
  DEFAULT_WIDGET_SIZE,
  fitMinSizes,
  minSizeOf,
  reconcileLayout,
  type LayoutItem,
} from "@/features/dashboards/validation";

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

describe("putaran 5 (T-011): ukuran minimum per jenis widget", () => {
  // Tabel lama 2×2 (0 baris data terlihat) di kiri atas, grafik di sebelahnya, KPI di bawahnya.
  const T = { i: "t", x: 0, y: 0, w: 2, h: 2 };
  const K = { i: "k", x: 2, y: 0, w: 4, h: 4 };
  const P = { i: "p", x: 0, y: 2, w: 2, h: 2 };
  const types = new Map([
    ["t", "table"],
    ["k", "bar"],
    ["p", "kpi"],
  ]);
  const TABLE_MIN = minSizeOf("table");

  it("tabel minimal 3×4; jenis lain, widget kosong, dan jenis tak dikenal 2×2", () => {
    expect(TABLE_MIN).toEqual({ w: 3, h: 4 });
    for (const t of ["bar", "line", "pie", "kpi", "empty", "radar", "constructor", undefined]) {
      expect(minSizeOf(t)).toEqual({ w: 2, h: 2 });
    }
    // Widget baru (4×4) sudah cukup besar untuk tabel.
    expect(DEFAULT_WIDGET_SIZE.w).toBeGreaterThanOrEqual(TABLE_MIN.w);
    expect(DEFAULT_WIDGET_SIZE.h).toBeGreaterThanOrEqual(TABLE_MIN.h);
  });

  it("tabel 2×2 lama diperbesar; widget lain tetap ukurannya dan tidak tumpang tindih", () => {
    const fitted = fitMinSizes([T, K, P], types);
    expect(byId(fitted, "t")).toMatchObject({ w: 3, h: 4 });
    expect(byId(fitted, "k")).toMatchObject({ w: 4, h: 4 });
    expect(byId(fitted, "p")).toMatchObject({ w: 2, h: 2 });
    expect(fitted.map((it) => it.i)).toEqual(["t", "k", "p"]);
    expect(overlaps(fitted)).toBe(false);
    expect(fitted.every((it) => it.x >= 0 && it.x + it.w <= 12)).toBe(true);
    // Idempoten: tata letak yang sudah cukup besar tidak berubah (array yang sama).
    expect(fitMinSizes(fitted, types)).toBe(fitted);
    expect(fitMinSizes([K, P], types)).toEqual([K, P]);
  });

  it("tabel sempit di tepi kanan bergeser ke kiri agar tetap di dalam grid", () => {
    const fitted = fitMinSizes([{ i: "t", x: 10, y: 0, w: 2, h: 3 }], types);
    expect(byId(fitted, "t")).toEqual({ i: "t", x: 9, y: 0, w: 3, h: 4 });
  });

  it("jadi tabel di kartu kecil (ganti jenis): fitToWidgets memakai jenis terbaru", () => {
    const layout = [{ ...P, y: 0 }];
    expect(fitToWidgets(layout, [{ id: "p", type: "kpi" }])).toBe(layout);
    expect(byId(fitToWidgets(layout, [{ id: "p", type: "table" }]), "p")).toMatchObject({
      w: 3,
      h: 4,
    });
  });

  it("muat dari server: reconcileLayout dengan jenis memperbesar tabel; tanpa jenis seperti dulu", () => {
    const stored = [T, K, P];
    const ids = ["t", "k", "p"];
    expect(byId(reconcileLayout(stored, ids), "t")).toMatchObject({ w: 2, h: 2 });
    const fitted = reconcileLayout(stored, ids, types);
    expect(byId(fitted, "t")).toMatchObject({ w: 3, h: 4 });
    expect(overlaps(fitted)).toBe(false);
  });

  it("tombol panel dan resize tidak mengecilkan tabel di bawah 3×4", () => {
    const table = { i: "t", x: 0, y: 0, w: 3, h: 4 };
    expect(resizeItem([table], "t", -1, 0, TABLE_MIN)).toEqual([table]);
    expect(resizeItem([table], "t", 0, -1, TABLE_MIN)).toEqual([table]);
    expect(applyStep([table], "t", "shorter", TABLE_MIN)).toEqual([table]);
    expect(stepAvailability([table], "t", TABLE_MIN)).toMatchObject({
      narrower: false,
      shorter: false,
      wider: true,
      taller: true,
    });
    // Tanpa minimum tabel (jenis lain) langkah yang sama masih mengecilkan.
    expect(stepAvailability([table], "t")).toMatchObject({ narrower: true, shorter: true });
    // Lebih besar dari minimum: masih bisa dikecilkan sampai batasnya.
    expect(byId(resizeItem([{ ...table, h: 6 }], "t", 0, -1, TABLE_MIN), "t").h).toBe(5);
  });
});

describe("tabletLayout (T-031, 768–1023 px)", () => {
  it("lebar separuh (paling sedikit setengah kanvas), posisi diskalakan, tidak melewati 6 kolom", () => {
    const out = tabletLayout([
      { i: "a", x: 0, y: 0, w: 2, h: 4 },
      { i: "b", x: 10, y: 0, w: 2, h: 4 },
      { i: "c", x: 0, y: 4, w: 8, h: 3 },
      { i: "d", x: 8, y: 4, w: 4, h: 3 },
      { i: "e", x: 0, y: 7, w: 12, h: 2 },
      { i: "f", x: 3, y: 9, w: 9, h: 2 },
    ]);
    expect(out.map(({ i, x, w }) => `${i}:${x},${w}`)).toEqual([
      "a:0,3",
      "b:3,3",
      "c:0,4",
      "d:3,3",
      "e:0,6",
      "f:1,5",
    ]);
    for (const it of out) expect(it.x + it.w).toBeLessThanOrEqual(TABLET_COLS);
    // y/h tidak berubah: tumpang tindih diselesaikan pemadatan react-grid-layout.
    expect(out.map((it) => [it.y, it.h])).toEqual([
      [0, 4],
      [0, 4],
      [4, 3],
      [4, 3],
      [7, 2],
      [9, 2],
    ]);
  });
});
