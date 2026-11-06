import { describe, expect, it } from "vitest";
import {
  STATUSES,
  contrast,
  pivotStatus,
  statusCssVars,
  statusOf,
  statusPalette,
  statusRange,
  statusSeries,
} from "@/features/widgets/status-color";

describe("warna status: tingkat", () => {
  it("makin tinggi makin baik: sepertiga atas baik, tengah sedang, bawah perlu perhatian", () => {
    expect(statusSeries([0, 40, 50, 70, 100], "up")).toEqual(["bad", "mid", "mid", "good", "good"]);
  });

  it("makin tinggi makin buruk (klaim): kebalikannya", () => {
    expect(statusSeries([0, 50, 100], "down")).toEqual(["good", "mid", "bad"]);
  });

  it("bertangga, bukan gradien: hanya tiga status", () => {
    const s = statusSeries(
      Array.from({ length: 50 }, (_, i) => i * 3.7),
      "up",
    );
    expect(new Set(s)).toEqual(new Set(["good", "mid", "bad"]));
  });

  it("tanpa arah, rentang datar, atau bukan angka → tanpa warna", () => {
    expect(statusSeries([1, 2, 3], undefined)).toEqual([null, null, null]);
    expect(statusSeries([5, 5, 5], "up")).toEqual([null, null, null]);
    expect(statusSeries([null, "x", 7], "up")).toEqual([null, null, null]);
    expect(statusRange([NaN, Infinity, 3])).toBeNull();
  });

  it("nilai negatif (mis. selisih) ikut rentang", () => {
    const r = statusRange([-30, 0, 30]);
    expect(statusOf(-30, "up", r)).toBe("bad");
    expect(statusOf(0, "up", r)).toBe("mid");
    expect(statusOf(30, "up", r)).toBe("good");
  });
});

describe("warna status: palet", () => {
  const templates = ["soft", "bold", "cvd"] as const;
  it.each(templates)("teks sel template %s kontras ≥ 4,5:1 (WCAG AA) di terang dan gelap", (t) => {
    for (const dark of [false, true]) {
      const p = statusPalette({ template: t }, dark);
      for (const s of STATUSES) expect(contrast(p[s].bg, p[s].fg)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("custom: [buruk, sedang, baik], teks otomatis hitam/putih", () => {
    const p = statusPalette(
      { template: "custom", custom: ["#8B0000", "#FFFF00", "#006400"] },
      false,
    );
    expect(p.bad.bg).toBe("#8B0000");
    expect(p.bad.fg).toBe("#FFFFFF");
    expect(p.mid.fg).toBe("#1F1F1F");
    expect(p.good.bg).toBe("#006400");
  });

  it("tanpa pengaturan = template lembut; variabel CSS terang + gelap", () => {
    expect(statusPalette(undefined, false).good.bg).toBe("#C6EFCE");
    const v = statusCssVars(undefined);
    expect(v["--st-good-bg"]).toBe("#C6EFCE");
    expect(v["--st-bad-fg-d"]).toBeDefined();
  });
});

describe("warna status: pivot", () => {
  const model = {
    valueHeads: [
      { total: false },
      { total: false },
      { total: false },
      { total: false },
      { total: true },
      { total: true },
    ],
    rows: [
      { kind: "group", values: [999, 999, 999, 999, 999, 999] },
      { kind: "leaf", values: [10, 1, 20, 9, 30, 10] },
      { kind: "leaf", values: [30, 5, 40, 2, 70, 7] },
      { kind: "leaf", values: [50, 3, 45, 4, 95, 7] },
    ],
  };
  // Dua nilai × (2 periode + Total): checkpoint (naik baik) dan klaim (naik buruk).
  const at = pivotStatus(model, ["up", "down"])!;

  it("nilai dibandingkan dengan nilai yang sama di semua periode, Total & kelompok tidak diwarnai", () => {
    const leaf = { kind: "leaf" };
    expect(at(leaf, 10, 0)).toBe("bad"); // checkpoint terkecil (10..50)
    expect(at(leaf, 50, 0)).toBe("good");
    expect(at(leaf, 30, 2)).toBe("mid");
    expect(at(leaf, 9, 3)).toBe("bad"); // klaim terbesar (1..9)
    expect(at(leaf, 1, 1)).toBe("good");
    expect(at(leaf, 95, 4)).toBeNull(); // kolom Total
    expect(at({ kind: "group" }, 999, 0)).toBeNull();
    expect(at({ kind: "total" }, 999, 0)).toBeNull();
  });

  it("tanpa nilai berarah → tidak ada pewarnaan", () => {
    expect(pivotStatus(model, [undefined, undefined])).toBeNull();
  });
});
