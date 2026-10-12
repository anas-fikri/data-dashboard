import { describe, expect, it } from "vitest";
import {
  OTHERS_LABEL,
  barsThatFit,
  chartOption,
  middleTruncate,
  type ChartTheme,
} from "@/components/widgets/chart-option";
import {
  aggOptions,
  columnsForAgg,
  defaultConfig,
  missingColumns,
  sortLabel,
  type Source,
} from "@/components/dashboards/widget-config-model";
import { parseWidgetConfig, type WidgetConfig } from "@/features/widgets/spec";

/*
 * T-011: pilihan awal panel konfigurasi (langsung menghasilkan widget valid) dan opsi grafik yang
 * tidak pernah menafsirkan teks data sebagai HTML.
 */
const S1 = "cmv4kljx40009oczvdmpurrs1";
const S2 = "cmv4kljx40009oczvdmpurrs2";
const sources: Source[] = [
  {
    id: S1,
    name: "Penjualan",
    columns: [
      { pos: 1, name: "Cabang", type: "text" },
      { pos: 2, name: "Tanggal", type: "date" },
      { pos: 3, name: "Omzet", type: "decimal" },
      { pos: 4, name: "Lunas", type: "boolean" },
    ],
  },
  { id: S2, name: "Kurir", columns: [{ pos: 1, name: "Nama", type: "text" }] },
];
const empty: WidgetConfig = { type: "empty", spec: {} };
const valid = (c: WidgetConfig | null) => !!c && parseWidgetConfig(c.type, c.spec).ok;

describe("pilihan awal panel konfigurasi", () => {
  it("setiap jenis langsung valid: teks × total angka, garis per bulan, tabel 6 kolom pertama", () => {
    const bar = defaultConfig("bar", sources, empty);
    expect(bar).toMatchObject({
      type: "bar",
      spec: {
        sheetId: S1,
        dimension: { column: 1 },
        measure: { agg: "sum", column: 3 },
        sort: "value_desc",
        topN: 12,
      },
    });
    expect(defaultConfig("line", sources, empty)).toMatchObject({
      spec: { dimension: { column: 2, timeGrain: "month" }, sort: "label_asc" },
    });
    expect(defaultConfig("table", sources, empty)).toMatchObject({
      spec: { columns: [1, 2, 3, 4] },
    });
    for (const t of ["kpi", "bar", "line", "pie", "table"] as const) {
      expect(valid(defaultConfig(t, sources, empty))).toBe(true);
    }
  });

  it("ganti jenis mempertahankan pilihan yang masih berlaku; ganti sheet tanpa kolom angka → jumlah baris", () => {
    const bar = defaultConfig("bar", sources, empty)!;
    const pie = defaultConfig("pie", sources, bar)!;
    expect(pie).toMatchObject({
      spec: { dimension: { column: 1 }, measure: { agg: "sum", column: 3 }, topN: 5 },
    });
    const kurir = defaultConfig("bar", sources, bar, S2)!;
    expect(kurir).toMatchObject({
      spec: { sheetId: S2, dimension: { column: 1 }, measure: { agg: "count" } },
    });
    expect(valid(kurir)).toBe(true);
    expect(defaultConfig("bar", [], empty)).toBeNull();
  });

  it("agregasi hanya menawarkan kolom yang cocok", () => {
    const cols = sources[0]!.columns;
    expect(columnsForAgg("sum", cols).map((c) => c.name)).toEqual(["Omzet"]);
    expect(columnsForAgg("max", cols).map((c) => c.name)).toEqual(["Tanggal", "Omzet"]);
    expect(columnsForAgg("count_distinct", cols)).toHaveLength(4);
  });
});

describe("opsi grafik aman dari HTML (AC 7)", () => {
  const theme: ChartTheme = {
    colors: ["hsl(221, 83%, 53%)"],
    text: "#000",
    muted: "#555",
    border: "#ddd",
    card: "#fff",
    font: "Inter",
  };
  const XSS = "<img src=x onerror=alert(1)>";
  const input = {
    labels: [XSS, "Bandung"],
    values: [10, null],
    measureLabel: `Total ${XSS}`,
    dimensionLabel: XSS,
    format: { style: "rupiah", decimals: 0 } as const,
    reducedMotion: true,
  };

  it("tooltip richText (bukan HTML) dan formatter mengembalikan teks apa adanya", () => {
    for (const type of ["bar", "line", "pie"] as const) {
      const o = chartOption({ ...input, type }, theme, { width: 600, height: 300 }) as {
        tooltip: { renderMode: string; formatter: (p: unknown) => string };
        animation: boolean;
      };
      expect(o.tooltip.renderMode).toBe("richText");
      expect(o.animation).toBe(false);
      const text =
        type === "pie"
          ? o.tooltip.formatter({ name: XSS, value: 10, percent: 100 })
          : o.tooltip.formatter([{ name: XSS, value: 10 }]);
      expect(text).toContain(XSS);
      expect(text).toContain("Rp 10");
    }
  });

  it("sintaks gaya richText ECharts ({a|b}) di nama kategori tidak ditafsirkan", () => {
    const o = chartOption({ ...input, type: "bar" }, theme, { width: 600, height: 300 }) as {
      tooltip: { formatter: (p: unknown) => string };
    };
    const text = o.tooltip.formatter([{ name: "{a|x}y", value: 1 }]);
    expect(text).not.toMatch(/\{[a-zA-Z0-9_]+\|/);
    expect(text.replace(/\u200b/g, "")).toContain("{a|x}y");
  });

  it("nilai kosong → '(kosong)'; batang horizontal dengan kategori dari atas", () => {
    const o = chartOption({ ...input, type: "bar" }, theme, { width: 600, height: 300 }) as {
      yAxis: { type: string; inverse: boolean; data: string[] };
      tooltip: { formatter: (p: unknown) => string };
    };
    expect(o.yAxis).toMatchObject({ type: "category", inverse: true, data: [XSS, "Bandung"] });
    expect(o.tooltip.formatter([{ name: "Bandung", value: null }])).toContain("(kosong)");
  });
});

describe("review desain T-011", () => {
  const theme: ChartTheme = {
    colors: ["c1", "c2", "c3", "c4", "c5", "c6"],
    text: "#000",
    muted: "#555",
    border: "#ddd",
    card: "#fff",
    font: "Inter",
  };
  const pieInput = {
    type: "pie" as const,
    labels: ["A", "B", "C", "D", "E"],
    values: [5, 4, 3, 2, 1],
    measureLabel: "Total",
    dimensionLabel: "Kantor",
    format: { style: "auto", decimals: 0 } as const,
    reducedMotion: true,
  };

  it("H1: pai — 'Lainnya' memakai warna terakhir; hanya Total/Jumlah baris; maks. 5 irisan", () => {
    const o = chartOption({ ...pieInput, others: 85 }, theme, { width: 600, height: 300 }) as {
      series: { data: { name: string; value: number; itemStyle?: { color: string } }[] }[];
    };
    const last = o.series[0]!.data.at(-1)!;
    expect(last).toMatchObject({ name: OTHERS_LABEL, value: 85, itemStyle: { color: "c6" } });
    expect(aggOptions("pie", sources[0]!.columns)).toEqual(["sum", "count"]);
    const fromAvg = defaultConfig("pie", sources, {
      type: "bar",
      spec: {
        ...(defaultConfig("bar", sources, empty)!.spec as object),
        measure: { agg: "avg", column: 3 },
      },
    } as WidgetConfig);
    expect(fromAvg).toMatchObject({ spec: { measure: { agg: "sum", column: 3 }, topN: 5 } });
    expect(
      parseWidgetConfig("pie", {
        ...(fromAvg!.spec as object),
        measure: { agg: "avg", column: 3 },
      }),
    ).toMatchObject({ ok: false });
    expect(parseWidgetConfig("pie", { ...(fromAvg!.spec as object), topN: 6 })).toMatchObject({
      ok: false,
    });
  });

  it("H2/H3: label dipendekkan di tengah; pai sempit tanpa label luar; batang sesuai tinggi", () => {
    expect(middleTruncate("Kantor PCP Express Gambir Unit 11", 20)).toBe("Kantor P…bir Unit 11");
    expect(middleTruncate("Kantor PCP Express Gambir Unit 11", 20)).toHaveLength(20);
    expect(middleTruncate("Bandung", 20)).toBe("Bandung");
    const narrow = chartOption(pieInput, theme, { width: 240, height: 240 }) as {
      series: { label: { show: boolean } }[];
    };
    expect(narrow.series[0]!.label.show).toBe(false);
    const wide = chartOption(pieInput, theme, { width: 640, height: 320 }) as {
      series: { label: { show: boolean } }[];
    };
    expect(wide.series[0]!.label.show).toBe(true);
    expect(barsThatFit(272)).toBe(13);
    const bar = chartOption(
      { ...pieInput, type: "bar", format: { style: "rupiah", decimals: 0 } },
      theme,
      {
        width: 200,
        height: 300,
      },
    ) as {
      xAxis: { name: string; splitNumber: number };
      yAxis: { axisLabel: { interval: number } };
    };
    expect(bar.xAxis).toMatchObject({ name: "Rp", splitNumber: 2 });
    expect(bar.yAxis.axisLabel.interval).toBe(0);
  });

  it("M2: kolom yang tidak lagi tersedia terdeteksi; L5: label urutan sesuai jenis kolom", () => {
    const bar = defaultConfig("bar", sources, empty)!;
    expect(missingColumns(bar, sources)).toEqual([]);
    const gone = {
      ...bar,
      spec: { ...bar.spec, measure: { agg: "sum", column: 9 } },
    } as WidgetConfig;
    expect(missingColumns(gone, sources)).toEqual([9]);
    expect(sortLabel("label_asc", "date")).toBe("Terlama dulu");
    expect(sortLabel("label_desc", "text")).toBe("Z–A");
  });
});
