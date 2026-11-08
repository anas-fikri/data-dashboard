import { describe, expect, it } from "vitest";
import {
  STATUSES,
  keepTableStatus,
  specStatus,
  tableStatus,
  contrast,
  pivotStatus,
  ruleText,
  targetScale,
  statusCssVars,
  statusOf,
  statusPalette,
  statusRange,
  statusSeries,
} from "@/features/widgets/status-color";
import { effectiveTone } from "@/features/widgets/tone";

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

describe("warna status: batas tetap (v1.8.0)", () => {
  it("makin tinggi makin baik: ≥ 95 baik, < 90 perlu perhatian, sisanya sedang", () => {
    const t = { good: 95, bad: 90 };
    expect(statusOf(96, "up", null, t)).toBe("good");
    expect(statusOf(95, "up", null, t)).toBe("good");
    expect(statusOf(92, "up", null, t)).toBe("mid");
    expect(statusOf(89.9, "up", null, t)).toBe("bad");
  });

  it("makin tinggi makin buruk: ≤ 2 baik, > 5 perlu perhatian", () => {
    const t = { good: 2, bad: 5 };
    expect(statusOf(1, "down", null, t)).toBe("good");
    expect(statusOf(3, "down", null, t)).toBe("mid");
    expect(statusOf(6, "down", null, t)).toBe("bad");
  });

  it("format persen: 0,96 tampil 96 % → dibandingkan dengan batas 95", () => {
    expect(statusOf(0.96, "up", null, { good: 95, bad: 90 }, targetScale("percent"))).toBe("good");
    expect(statusOf(0.85, "up", null, { good: 95, bad: 90 }, targetScale("percent"))).toBe("bad");
  });

  it("dengan batas, semua cabang buruk tetap merah (bukan sepertiga teratas hijau)", () => {
    expect(statusSeries([70, 75, 80], "up", { good: 95, bad: 90 })).toEqual(["bad", "bad", "bad"]);
  });

  it("teks aturan legenda", () => {
    expect(ruleText("up", { good: 95, bad: 90 })).toBe("Baik ≥ 95 · Perlu perhatian < 90");
    expect(ruleText("down")).toBe("makin tinggi makin buruk");
  });
});

describe("tabel + template dashboard (v1.9.0)", () => {
  it("tableStatus: hanya kolom berwarna, relatif per kolom, batas memakai skala persen", () => {
    const rows = [
      ["A", 100, 0.97],
      ["B", 350, 0.92],
      ["C", 600, 0.85],
    ];
    const of = tableStatus(
      rows,
      [1, 2, 3],
      [
        { column: 2, tone: "down" },
        { column: 3, tone: "up", target: { good: 95, bad: 90 } },
      ],
      (pos) => (pos === 3 ? 100 : 1),
    )!;
    expect(rows.map((r) => of(r[0], 0))).toEqual([null, null, null]);
    expect(rows.map((r) => of(r[1], 1))).toEqual(["good", "mid", "bad"]);
    expect(rows.map((r) => of(r[2], 2))).toEqual(["good", "mid", "bad"]);
    expect(tableStatus(rows, [1, 2, 3], undefined)).toBeNull();
    // Kolom berwarna tidak ditampilkan: tidak ada yang diwarnai.
    expect(tableStatus(rows, [1], [{ column: 2, tone: "up" }])).toBeNull();
  });

  it("keepTableStatus membuang kolom yang tidak ditampilkan; kosong = undefined", () => {
    const st = [
      { column: 2, tone: "up" as const },
      { column: 4, tone: "down" as const },
    ];
    expect(keepTableStatus(st, [1, 2])).toEqual([{ column: 2, tone: "up" }]);
    expect(keepTableStatus(st, [1])).toBeUndefined();
    expect(keepTableStatus(undefined, [1])).toBeUndefined();
  });

  it("specStatus: template widget menang, tanpa itu template dashboard", () => {
    const spec = { measure: { tone: "up" } };
    expect(specStatus(spec, { template: "bold" })?.colors).toEqual({ template: "bold" });
    expect(
      specStatus({ ...spec, colors: { template: "soft" } }, { template: "bold" })?.colors,
    ).toEqual({ template: "soft" });
    expect(specStatus(spec)?.colors).toBeUndefined();
  });
});

describe("penilaian bawaan dashboard (v1.11.0)", () => {
  it("nilai tanpa penilaian ikut bawaan; 'none' tetap tanpa warna; arah sendiri menang", () => {
    const spec = {
      values: [{ agg: "sum" }, { agg: "sum", tone: "none" }, { agg: "sum", tone: "down" }],
    };
    expect(specStatus(spec, undefined, "up")?.tones).toEqual(["up", undefined, "down"]);
    expect(specStatus({ values: [{ agg: "sum" }] })).toBeUndefined();
    expect(specStatus({ values: [{ agg: "sum", tone: "none" }] }, undefined, "up")).toBeUndefined();
    expect(effectiveTone(undefined, "down")).toBe("down");
    expect(effectiveTone("none", "down")).toBeUndefined();
  });
});
