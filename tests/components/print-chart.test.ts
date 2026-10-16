import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  chartOption,
  niceCeil,
  type ChartInput,
  type ChartTheme,
} from "@/components/widgets/chart-option";
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
  series: { label?: Label; labelLayout?: unknown }[];
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
    type Lay = (p: { dataIndex: number; labelRect: { x: number; width: number } }) => {
      hideOverlap: boolean;
      dx?: number;
    };
    const lay = o.series[0]!.labelLayout as Lay;
    expect(lay({ dataIndex: 0, labelRect: { x: 100, width: 60 } })).toEqual({ hideOverlap: true });
    // Kotak label sebenarnya yang melewati tepi kanan grafik digeser masuk (R10-INT-1/DS-1).
    expect(lay({ dataIndex: 0, labelRect: { x: 560, width: 60 } }).dx).toBe(-(560 + 60 - 599));
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

  it("garis cetak: label titik pertama digeser lewat labelLayout seperlunya (R1-DS-5), tanpa menutupi label berikutnya yang sebaris (R5-INT-1, R6-INT-1/DS-2)", () => {
    type Layout =
      | { hideOverlap: boolean }
      | ((p: { dataIndex: number; labelRect: { x: number; width: number } }) => {
          hideOverlap: boolean;
          dx?: number;
        });
    type Series = { labelLayout?: Layout; data: unknown[] };
    const series = (o: unknown) => (o as { series: Series[] }).series[0]!;
    const dxOf = (o: unknown, k = 0) => {
      const l = series(o).labelLayout;
      return typeof l === "function"
        ? (l({ dataIndex: k, labelRect: { x: 100, width: 20 } }).dx ?? 0)
        : 0;
    };
    const monthly = {
      type: "line" as const,
      labels: ["Jan 2026", "Feb 2026"],
      values: [3_768_000_000, 4_000_000_000],
      time: { iso: ["2026-01-01", "2026-02-01"], grain: "month" as const, empty: null },
    };
    // Sumbu kategori: titik pertama di tengah pita lebar — label rata tengah sudah muat, tidak digeser.
    expect(dxOf(option({ ...monthly, print: true }))).toBe(0);
    // Sumbu waktu (per hari): titik [ms, y] tepat di tepi plot → label pertama digeser setengah lebar
    // "Rp 5" (4 × 6,1 px) + 2 px lewat labelLayout (ECharts mengabaikan label.offset per titik bila ada labelLayout).
    const daily = (n: number, values?: number[]) => ({
      type: "line" as const,
      labels: Array.from({ length: n }, (_, k) => `${k + 1} Jan`),
      values: values ?? Array.from({ length: n }, () => 5),
      time: {
        iso: Array.from({ length: n }, (_, k) => `2026-01-${String(k + 1).padStart(2, "0")}`),
        grain: "day" as const,
      },
    });
    const two = option({ ...daily(2), print: true });
    expect(dxOf(two)).toBeCloseTo(14.2, 5);
    expect(dxOf(two, 1)).toBe(0);
    const layout = series(two).labelLayout as (p: {
      dataIndex: number;
      labelRect: { x: number; width: number };
    }) => { hideOverlap: boolean };
    expect(layout({ dataIndex: 0, labelRect: { x: 100, width: 20 } }).hideOverlap).toBe(true);
    expect(series(two).data[0]).toEqual([Date.UTC(2026, 0, 1), 5]);
    // Titik berikutnya sebaris dan rapat: geseran berhenti sebelum menutupi labelnya.
    const tight = dxOf(option({ ...daily(15), print: true }));
    expect(tight).toBeGreaterThan(0);
    expect(tight).toBeLessThan(14.2);
    // Label berikutnya jauh lebih tinggi (beda baris): tidak membatasi geseran.
    const rising = [5, 500, ...Array.from({ length: 13 }, () => 5)];
    expect(dxOf(option({ ...daily(15, rising), print: true }))).toBeCloseTo(14.2, 5);
    // Sangat rapat: label kedua sudah bertumpuk dengan label pertama walau rata tengah (dibuang
    // hideOverlap apa pun geserannya) → label pertama digeser penuh dari sumbu nilai.
    expect(dxOf(option({ ...daily(31), print: true }))).toBeCloseTo(14.2, 5);
    // Titik pertama terpilih (filter silang) tetap membawa gaya terpilihnya.
    expect(series(option({ ...daily(2), print: true, selected: 0 })).data[0]).toMatchObject({
      symbolSize: 10,
    });
    // Rapat dengan label panjang: label titik kedua yang rata tengahnya juga melewati tepi kiri plot
    // ikut digeser (ia yang tercetak bila label pertama dibuang, R9-INT-2); titik jauh tidak.
    const long = Array.from({ length: 31 }, () => 1_234_567);
    const dense = option({ ...daily(31, long), print: true });
    expect(dxOf(dense, 1)).toBeGreaterThan(0);
    expect(dxOf(dense, 20)).toBe(0);
    // Sumbu waktu cetak: ruang kanan grid memuat setengah label nilai terbaru "Rp 1.234.567" (R9-INT-1).
    const grid = (dense as unknown as { grid: { right: number } }).grid;
    expect(grid.right).toBeGreaterThanOrEqual(("Rp 1.234.567".length * 7) / 2 - 1);
    // Nama satuan sumbu nilai cetak di kiri garis sumbu (tidak menimpa label pertama, R7-DS-1).
    type Axis = { yAxis: { nameTextStyle: { align: string } } };
    expect(
      (option({ ...daily(2), print: true }) as unknown as Axis).yAxis.nameTextStyle.align,
    ).toBe("right");
    expect((option(daily(2)) as unknown as Axis).yAxis.nameTextStyle.align).toBe("center");
    // Layar tidak berubah: tanpa label/labelLayout.
    expect(series(option(daily(2))).labelLayout).toBeUndefined();
    expect(series(option(monthly)).data[0]).toBe(3_768_000_000);
  });

  it("garis cetak: label nilai terbaru menang saat bertumpuk — simbol makin baru sedikit lebih besar (R8-DS-2)", () => {
    type Size = (v: unknown, p: { dataIndex: number }) => number;
    const line = {
      type: "line" as const,
      labels: ["Cabang 1", "Cabang 2", "Cabang 3", "Cabang 4"],
      values: [10, 11, 12, 13],
    };
    const size = (o: unknown) => (o as { series: { symbolSize?: Size }[] }).series[0]!.symbolSize;
    const print = size(option({ ...line, print: true }))!;
    const sizes = [0, 1, 2, 3].map((k) => print(null, { dataIndex: k }));
    for (let k = 1; k < sizes.length; k++) expect(sizes[k]!).toBeGreaterThan(sizes[k - 1]!);
    // Ukuran dasar = bawaan ECharts 6 (6 px) seperti layar; tambahannya < 0,01 px (R9-DS-2).
    expect(sizes[0]).toBe(6);
    expect(sizes[3]! - 6).toBeLessThan(0.01);
    // Layar: ukuran bawaan.
    expect(size(option(line))).toBeUndefined();
  });

  it("batang cetak di kartu sempit: label ringkas bila label lengkap tidak muat di ruang kanan (R10-INT-1)", () => {
    const input = {
      type: "bar" as const,
      labels: ["Jakarta", "Bandung"],
      values: [1_701_234_567, 980_000_000],
      measureLabel: "Omzet",
      dimensionLabel: "Cabang",
      format: RP,
      reducedMotion: false,
      print: true,
    };
    const narrow = chartOption(input, theme, { width: 159, height: 200 }) as unknown as Opt;
    expect(narrow.series[0]!.label!.formatter({ value: 1_701_234_567, dataIndex: 0 })).toBe(
      "Rp 1,7\u00a0M",
    );
    // Ringkas pun belum muat di 30 %: ruang kanan boleh sampai 40 % (tidak ditarik ke atas batang, R13-DS-1).
    expect(narrow.grid.right).toBeLessThanOrEqual(Math.ceil(159 * 0.4));
    // Kartu w4 (338 px): label lengkap muat berkat sisa sumbu di kanan batang terpanjang (R11-INT-1).
    const w4 = chartOption(input, theme, { width: 338, height: 200 }) as unknown as Opt;
    expect(w4.series[0]!.label!.formatter({ value: 1_701_234_567, dataIndex: 0 })).toBe(
      "Rp 1.701.234.567",
    );
    // Ribuan: bentuk ringkas ("19,32 rb") lebih panjang dari lengkap ("19.323") → tidak diringkas.
    const thousands = chartOption(
      { ...input, values: [19_323, 18_657], format: { style: "auto", decimals: 0 } },
      theme,
      { width: 159, height: 200 },
    ) as unknown as Opt;
    expect(thousands.series[0]!.label!.formatter({ value: 19_323, dataIndex: 0 })).toBe("19.323");
    expect([niceCeil(1.7e9), niceCeil(19_323), niceCeil(2.4), niceCeil(0)]).toEqual([
      2e9, 20_000, 2.5, 1,
    ]);
    // Seri panjang ('Rp 675,86 rb' = 'Rp 3.504.384'): per batang, bentuk ringkas mengurangi kelebihan
    // label batang terpanjang → ringkas, tidak lagi lengkap lalu ditarik ke atas batangnya (R12-INT-1).
    const tie = chartOption({ ...input, values: [3_504_384, 675_860] }, theme, {
      width: 159,
      height: 200,
    }) as unknown as Opt;
    expect(tie.series[0]!.label!.formatter({ value: 3_504_384, dataIndex: 0 })).toBe("Rp 3,5 jt");
    // Label GARIS cetak berpadding 2 px (latar transparan) agar label yang menempel tidak terbaca satu
    // angka (R12-DS-2).
    const lineOpt = chartOption({ ...input, type: "line" }, theme, SIZE) as unknown as Opt;
    const style = lineOpt.series[0]!.label as unknown as {
      padding: number[];
      backgroundColor: string;
    };
    expect(style.padding).toEqual([0, 2]);
    expect(style.backgroundColor).toBe("rgba(0,0,0,0)");
    // Campuran positif-negatif di w4: label batang negatif di kanan garis nol (ruang bagian positif
    // sumbu) → nilai lengkap tetap tercetak (R13-INT-1).
    const mixed = chartOption({ ...input, values: [14_143_273_022, -1_200_000_000] }, theme, {
      width: 338,
      height: 200,
    }) as unknown as Opt;
    expect(mixed.series[0]!.label!.formatter({ value: 14_143_273_022, dataIndex: 0 })).toBe(
      "Rp 14.143.273.022",
    );
    // Label batang tanpa padding (hanya label garis yang berpadding, R13-DS-1).
    expect((mixed.series[0]!.label as unknown as { padding?: number[] }).padding).toBeUndefined();
    // Kartu lebar: nilai lengkap seperti sebelumnya.
    const wide = chartOption(input, theme, SIZE) as unknown as Opt;
    expect(wide.series[0]!.label!.formatter({ value: 1_701_234_567, dataIndex: 0 })).toBe(
      "Rp 1.701.234.567",
    );
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
