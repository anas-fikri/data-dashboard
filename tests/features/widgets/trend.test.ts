import { describe, expect, it } from "vitest";
import {
  linearFit,
  movingAverage,
  trendPoints,
  trendText,
  trendValues,
  trendX,
} from "@/features/widgets/trend";

describe("garis tren (v1.10.0)", () => {
  it("regresi linear melewati titik kosong; < 2 titik = null", () => {
    const fit = linearFit([0, 1, 2, 3], [10, null, 30, 40])!;
    expect(fit.slope).toBeCloseTo(10, 6);
    expect(fit.intercept).toBeCloseTo(10, 6);
    expect(linearFit([0, 1], [5, null])).toBeNull();
    expect(linearFit([2, 2], [1, 3])).toBeNull();
  });

  it("rata-rata bergerak seperti Excel: k−1 titik awal kosong, kurang dari separuh jendela kosong", () => {
    expect(movingAverage([1, 2, 3, 4, 5], 3)).toEqual([null, null, 2, 3, 4]);
    expect(movingAverage([1, null, null, 4], 3)).toEqual([null, null, null, null]);
    expect(movingAverage([2, null, 4, 6], 3)).toEqual([null, null, 3, 5]);
  });

  it("nilai tren sejajar titik; garis lurus di setiap x", () => {
    expect(trendValues("linear", [0, 1, 2], [1, 2, 3])).toEqual([1, 2, 3]);
    expect(trendValues("ma3", [0, 1, 2], [1, 2, 3])).toEqual([null, null, 2]);
  });

  it("x per bulan kalender: Jan–Mar naik 100 per bulan tepat walau Feb 28 hari", () => {
    const ms = [0, 1, 2].map((m) => Date.UTC(2026, m, 1));
    const fit = linearFit(
      ms.map((x) => trendX(x, "month")),
      [100, 200, 300],
    )!;
    expect(fit.slope).toBeCloseTo(100, 9);
    expect(trendX(Date.UTC(2026, 3, 1), "quarter") - trendX(Date.UTC(2026, 0, 1), "quarter")).toBe(
      1,
    );
    expect(trendX(Date.UTC(2026, 0, 8), "week") - trendX(Date.UTC(2026, 0, 1), "week")).toBe(1);
  });

  it("kalimat legenda: naik/turun per satuan periode, datar, data kurang", () => {
    const fmt = (v: number) => v.toLocaleString("id-ID", { maximumFractionDigits: 1 });
    expect(trendText("linear", { slope: 120 }, "month", fmt)).toBe(
      "Tren: naik 120 per bulan (garis putus-putus)",
    );
    expect(trendText("linear", { slope: -2.5 }, "point", fmt)).toBe(
      "Tren: turun 2,5 per titik (garis putus-putus)",
    );
    expect(trendText("linear", { slope: 0 }, "month", fmt)).toBe("Tren: datar");
    expect(trendText("linear", null, "month", fmt)).toMatch(/minimal 2 titik/);
    expect(trendText("ma7", null, undefined, fmt)).toBe("Rata-rata 7 periode (garis putus-putus)");
  });
});

describe("titik tren bersama garis dan legenda (review v1.10.0 #3)", () => {
  it("baris tanpa tanggal tidak ikut; kemiringan tetap per bulan", () => {
    const ms = [0, 1, 2, 3].map((m) => Date.UTC(2026, m, 1));
    const pts = trendPoints([...ms, null], [10, 20, 30, 40, 1000], "month");
    expect(pts.ys).toEqual([10, 20, 30, 40, null]);
    expect(linearFit(pts.xs, pts.ys)!.slope).toBeCloseTo(10, 9);
    const line = trendValues("linear", pts.xs, pts.ys);
    expect(line[4]).toBeNull();
    expect(line[3]! - line[2]!).toBeCloseTo(10, 9);
  });
});
