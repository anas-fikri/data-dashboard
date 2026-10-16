import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { chartOption, type ChartInput, type ChartTheme } from "@/components/widgets/chart-option";
import { ChartWidget } from "@/components/widgets/chart-widget";
import type { WidgetData } from "@/components/widgets/widget-query";
import type { ChartSpec } from "@/features/widgets/spec";

/*
 * T-018 D8: varian cetak grafik. Nilai batang/titik garis jadi label teks (tersalin dari PDF), tanpa
 * animasi walau gerak tidak dikurangi, ruang grid untuk labelnya; periode kosong yang diisi tanpa
 * label. Pai: nilai di legenda HTML. Layar tidak berubah (tanpa label, animasi mengikuti gerak).
 */
const theme: ChartTheme = {
  colors: ["c1", "c2", "c3", "c4", "c5", "c6"],
  text: "#000",
  muted: "#555",
  border: "#ddd",
  card: "#fff",
  font: "sans-serif",
};
const SIZE = { width: 600, height: 300 };
const RP = { style: "rupiah", decimals: 0 } as const;

type Label = {
  show: boolean;
  position: string;
  formatter: (p: { value: unknown; dataIndex: number }) => string;
};
type Opt = {
  animation: boolean;
  grid: { right: number; top: number };
  series: { label?: Label; labelLayout?: { hideOverlap: boolean } }[];
};
const option = (input: Partial<ChartInput>) =>
  chartOption(
    {
      type: "bar",
      labels: ["Jakarta", "Bandung"],
      values: [1_250_000, 980_000],
      measureLabel: "Omzet",
      dimensionLabel: "Cabang",
      format: RP,
      reducedMotion: false,
      ...input,
    },
    theme,
    SIZE,
  ) as unknown as Opt;

describe("chartOption cetak (print)", () => {
  it("batang: label nilai di kanan batang, teks sama dengan format layar, tanpa animasi", () => {
    const o = option({ print: true });
    expect(o.animation).toBe(false);
    const label = o.series[0]!.label!;
    expect(label).toMatchObject({ show: true, position: "right" });
    expect(label.formatter({ value: 1_250_000, dataIndex: 0 })).toBe("Rp 1.250.000");
    // Data terpilih (filter silang) berbentuk { value }: ECharts tetap memberi `value`.
    expect(label.formatter({ value: 980_000, dataIndex: 1 })).toBe("Rp 980.000");
    expect(o.series[0]!.labelLayout).toEqual({ hideOverlap: true });
    // Ruang kanan untuk label terpanjang ("Rp 1.250.000"), paling banyak 30 % lebar.
    expect(o.grid.right).toBeGreaterThan(16);
    expect(o.grid.right).toBeLessThanOrEqual(SIZE.width * 0.3);
  });

  it("layar tidak berubah: tanpa label; animasi mengikuti gerak yang dikurangi", () => {
    const screen = option({});
    expect(screen.animation).toBe(true);
    expect(screen.series[0]!.label).toBeUndefined();
    expect(screen.grid.right).toBe(16);
    expect(option({ reducedMotion: true }).animation).toBe(false);
  });

  it("garis per bulan: label di atas titik, ruang atas; periode kosong yang diisi tanpa label", () => {
    const o = option({
      type: "line",
      labels: ["Jan 2026", "Mar 2026"],
      values: [10, 30],
      format: { style: "auto", decimals: 0 },
      time: { iso: ["2026-01-01", "2026-03-01"], grain: "month", empty: null },
      print: true,
    });
    const label = o.series[0]!.label!;
    expect(label.position).toBe("top");
    expect(o.grid.top).toBeGreaterThan(16);
    // Jan, Feb (diisi), Mar.
    expect(label.formatter({ value: 10, dataIndex: 0 })).toBe("10");
    expect(label.formatter({ value: null, dataIndex: 1 })).toBe("");
    expect(label.formatter({ value: 30, dataIndex: 2 })).toBe("30");
  });

  it("garis per hari (sumbu waktu): nilai dari titik [ms, y]", () => {
    const o = option({
      type: "line",
      labels: ["1 Jan", "2 Jan"],
      values: [5, 7],
      format: { style: "auto", decimals: 0 },
      time: { iso: ["2026-01-01", "2026-01-02"], grain: "day" },
      print: true,
    });
    const label = o.series[0]!.label!;
    expect(label.formatter({ value: [Date.UTC(2026, 0, 2), 7], dataIndex: 1 })).toBe("7");
    expect(o.animation).toBe(false);
  });

  it("garis: label titik pertama rata kiri di cetak (tidak menimpa label sumbu nilai, R1-DS-5)", () => {
    type Datum = { value: unknown; label?: { align: string } };
    const first = (o: unknown) => (o as { series: { data: Datum[] }[] }).series[0]!.data[0]!;
    const monthly = {
      type: "line" as const,
      labels: ["Jan 2026", "Feb 2026"],
      values: [3_768_000_000, 4_000_000_000],
      time: { iso: ["2026-01-01", "2026-02-01"], grain: "month" as const, empty: null },
    };
    expect(first(option({ ...monthly, print: true }))).toEqual({
      value: 3_768_000_000,
      label: { align: "left" },
    });
    // Sumbu waktu (per hari): titik [ms, y].
    const daily = {
      type: "line" as const,
      labels: ["1 Jan", "2 Jan"],
      values: [5, 7],
      time: { iso: ["2026-01-01", "2026-01-02"], grain: "day" as const },
    };
    expect(first(option({ ...daily, print: true }))).toEqual({
      value: [Date.UTC(2026, 0, 1), 5],
      label: { align: "left" },
    });
    // Titik pertama terpilih (filter silang) tetap membawa gaya terpilihnya.
    expect(first(option({ ...monthly, print: true, selected: 0 }))).toMatchObject({
      symbolSize: 10,
      label: { align: "left" },
    });
    // Layar tidak berubah.
    expect(first(option(monthly))).toBe(3_768_000_000);
    expect(first(option(daily))).toEqual([Date.UTC(2026, 0, 1), 5]);
  });

  it("pai cetak: tanpa animasi; label grafik tetap mati (nilai di legenda)", () => {
    const o = option({ type: "pie", print: true });
    expect(o.animation).toBe(false);
    expect(o.series[0]!.label).toMatchObject({ show: false });
  });
});

describe("ChartWidget cetak: legenda pai memuat nilai", () => {
  const data: WidgetData = {
    columns: [
      { key: "c", label: "Cabang", type: "text" },
      { key: "m", label: "Omzet", type: "decimal" },
    ],
    rows: [
      ["Jakarta", 1_250_000],
      ["Bandung", 980_000],
    ],
    categories: 2,
    grandTotal: 2_230_000,
  };
  const spec = {
    dimension: { column: 0 },
    measure: { column: 1, agg: "sum" },
    sort: "value_desc",
    topN: 5,
    format: RP,
  } as unknown as ChartSpec;
  const html = (print: boolean) =>
    renderToStaticMarkup(
      createElement(ChartWidget, {
        type: "pie",
        data,
        spec,
        showData: false,
        title: "Omzet",
        print,
      }),
    );

  it("nilai setiap irisan ada sebagai teks di legenda", () => {
    const out = html(true);
    expect(out).toContain('data-testid="pie-legend-value"');
    expect(out).toContain("Rp 1.250.000");
    expect(out).toContain("Rp 980.000");
  });

  it("layar: legenda hanya nama + persen (tidak berubah)", () => {
    expect(html(false)).not.toContain('data-testid="pie-legend-value"');
  });

  it("R1-DS-3: nama irisan lengkap dan membungkus di cetak — awalan sama tetap terbedakan", () => {
    const long: WidgetData = {
      ...data,
      rows: [
        ["Paket Reguler Antar Kota Jawa Barat", 19_065_000],
        ["Paket Reguler Antar Kota Jawa Timur", 18_695_000],
        ["Paket Reguler Antar Kota Luar Jawa", 18_325_000],
      ],
      categories: 3,
      grandTotal: 56_085_000,
    };
    const out = renderToStaticMarkup(
      createElement(ChartWidget, {
        type: "pie",
        data: long,
        spec,
        showData: false,
        title: "Omzet",
        print: true,
      }),
    );
    const names = [
      ...out.matchAll(
        /<span class="min-w-0 flex-1 \[overflow-wrap:anywhere\][^"]*">([^<]*)<\/span>/g,
      ),
    ].map((m) => m[1]);
    expect(names).toEqual([
      "Paket Reguler Antar Kota Jawa Barat",
      "Paket Reguler Antar Kota Jawa Timur",
      "Paket Reguler Antar Kota Luar Jawa",
    ]);
    expect(out).not.toContain("…");
  });

  it("R3-DS-2: baris legenda cetak boleh membungkus (nilai turun ke bawah nama); legenda tanpa batas 45%", () => {
    const out = html(true);
    expect(
      out.match(/<li class="flex min-h-5 min-w-0 items-center flex-wrap gap-x-1\.5">/g),
    ).toHaveLength(2);
    // Bertumpuk atau tidak diputuskan printLegend setelah kotak diukur (render awal: belum).
    expect(out).not.toContain("basis-[calc(100%-1rem)]");
    expect(out).toContain("max-h-[calc(100%-4.5rem)]");
    expect(out).not.toContain("max-h-[45%]");
    // Layar tidak berubah.
    const screen = html(false);
    expect(screen).toContain("max-h-[45%]");
    expect(screen).not.toContain("flex-wrap");
  });
});
