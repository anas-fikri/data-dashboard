import { describe, expect, it } from "vitest";
import { chartOption, type ChartTheme } from "@/components/widgets/chart-option";
import {
  columnsForAgg,
  defaultConfig,
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
      spec: { dimension: { column: 1 }, measure: { agg: "sum", column: 3 }, topN: 8 },
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
      const o = chartOption({ ...input, type }, theme) as {
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

  it("nilai kosong → '(kosong)'; batang horizontal dengan kategori dari atas", () => {
    const o = chartOption({ ...input, type: "bar" }, theme) as {
      yAxis: { type: string; inverse: boolean; data: string[] };
      tooltip: { formatter: (p: unknown) => string };
    };
    expect(o.yAxis).toMatchObject({ type: "category", inverse: true, data: [XSS, "Bandung"] });
    expect(o.tooltip.formatter([{ name: "Bandung", value: null }])).toContain("(kosong)");
  });
});
