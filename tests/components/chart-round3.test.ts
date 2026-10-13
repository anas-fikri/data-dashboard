import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import * as echarts from "echarts";
import { chartOption, type ChartInput, type ChartTheme } from "@/components/widgets/chart-option";
import {
  durationScale,
  emptyBucketValue,
  legendOrder,
  lineOrder,
  pieRest,
  rankedItems,
  tableLayout,
  timeBuckets,
} from "@/components/widgets/chart-series";
import { ChartWidget } from "@/components/widgets/chart-widget";
import type { WidgetData } from "@/components/widgets/widget-query";
import { formatAxis, formatCompact, formatMeasure, formatNumber } from "@/features/widgets/format";
import type { ChartSpec, ChartType } from "@/features/widgets/spec";

/*
 * T-011 verifikasi putaran 3 (grafik): sumbu garis per periode, urutan titik garis, durasi, legenda
 * dan peringatan pai yang bisa difokus, sisa "Lainnya" dengan toleransi pembulatan, tabel data,
 * daftar peringkat "+N lainnya", nama satuan sumbu, angka kecil di sumbu/ringkas.
 */
const theme: ChartTheme = {
  colors: ["c1", "c2", "c3", "c4", "c5", "c6"],
  text: "#000",
  muted: "#555",
  border: "#ddd",
  card: "#fff",
  font: "sans-serif",
};
const AUTO = { style: "auto", decimals: 0 } as const;
const RP = { style: "rupiah", decimals: 0 } as const;
const SIZE = { width: 600, height: 300 };

type Opt = {
  xAxis: { type: string; data?: string[]; name?: string; nameLocation?: string };
  yAxis: { type: string; name?: string; axisLabel: { formatter: (v: number) => string } };
  series: { data: unknown[]; showSymbol?: boolean }[];
  tooltip: { formatter: (p: unknown) => string };
  grid: Record<string, unknown>;
};
const line = (
  time: ChartInput["time"],
  values: (number | null)[],
  extra: Partial<ChartInput> = {},
) =>
  chartOption(
    {
      type: "line",
      labels: values.map((_, k) => `t${k}`),
      values,
      measureLabel: "Omzet",
      dimensionLabel: "Tanggal",
      format: AUTO,
      time,
      reducedMotion: true,
      ...extra,
    },
    theme,
    SIZE,
  ) as unknown as Opt;

describe("garis per minggu/bulan/kuartal/tahun: sumbu kategori periode kontinu", () => {
  it("2 titik bulanan → 2 label berbeda; urut naik walau data datang terbaru dulu", () => {
    const o = line({ iso: ["2025-10-01", "2025-09-01"], grain: "month", empty: 0 }, [4751, 4358]);
    expect(o.xAxis.type).toBe("category");
    expect(o.xAxis.data).toEqual(["Sep 2025", "Okt 2025"]);
    expect(o.series[0]!.data).toEqual([4358, 4751]);
    expect(o.tooltip.formatter([{ name: "Okt 2025", value: 4751 }])).toBe("Okt 2025\nOmzet: 4.751");
  });

  it("1 titik tahunan tidak pernah menampilkan tahun sebelumnya", () => {
    const o = line({ iso: ["2026-01-01"], grain: "year", empty: 0 }, [9]);
    expect(o.xAxis.data).toEqual(["2026"]);
    const q = line({ iso: ["2025-10-01", "2025-07-01"], grain: "quarter" }, [2, 1]);
    expect(q.xAxis.data).toEqual(["K3 2025", "K4 2025"]);
  });

  it("bulan yang kosong diisi: 0 untuk total, null (garis putus) untuk rata-rata", () => {
    const iso = ["2025-08-01", "2025-10-01"];
    const sum = line({ iso, grain: "month", empty: 0 }, [5, 7]);
    expect(sum.xAxis.data).toEqual(["Agu 2025", "Sep 2025", "Okt 2025"]);
    expect(sum.series[0]!.data).toEqual([5, 0, 7]);
    const avg = line({ iso, grain: "month", empty: null }, [5, 7]);
    expect(avg.series[0]!.data).toEqual([5, null, 7]);
    // Titik tunggal di antara celah tetap terlihat.
    expect(avg.series[0]!.showSymbol).toBe(true);
    expect(emptyBucketValue("sum", "label_desc", true)).toBe(0);
    expect(emptyBucketValue("avg", "label_desc", false)).toBeNull();
    // N titik menurut nilai yang terpotong: periode di luar N belum tentu kosong.
    expect(emptyBucketValue("sum", "value_desc", true)).toBeNull();
    expect(emptyBucketValue("count", "value_desc", false)).toBe(0);
  });

  it("minggu mulai Senin; lebih dari batas → tanpa pengisian; tanggal kosong tidak diplot", () => {
    const w = timeBuckets(["2025-10-13", "2025-10-27", null], [1, 3, 9], "week", 0, 1000);
    expect(w.keys.map((k) => new Date(k).toISOString().slice(0, 10))).toEqual([
      "2025-10-13",
      "2025-10-20",
      "2025-10-27",
    ]);
    expect(w.values).toEqual([1, 0, 3]);
    const capped = timeBuckets(["2000-01-01", "2025-01-01"], [1, 2], "month", 0, 100);
    expect(capped.values).toEqual([1, 2]);
    expect(capped.keys).toHaveLength(2);
  });

  it("per hari tetap sumbu waktu UTC, tick paling rapat sehari, hari kosong diisi", () => {
    const o = line({ iso: ["2026-10-10", "2026-10-08"], grain: "day", empty: 0 }, [2, 1]) as Opt & {
      useUTC: boolean;
      xAxis: { minInterval: number; min: string; max: string };
    };
    expect(o.useUTC).toBe(true);
    expect(o.xAxis).toMatchObject({ type: "time", minInterval: 86_400_000, min: "dataMin" });
    expect(o.series[0]!.data).toEqual([
      [Date.UTC(2026, 9, 8), 1],
      [Date.UTC(2026, 9, 9), 0],
      [Date.UTC(2026, 9, 10), 2],
    ]);
  });
});

describe("urutan titik garis", () => {
  const rows = (keys: unknown[]) => keys.map((k) => [k, 1] as const);
  it("dimensi angka: 1..12 sebagai angka, bukan 1,10,11,12,2", () => {
    const shuffled = rows([12, 1, 10, 2, 11, 3, 9, 4, 8, 5, 7, 6]);
    expect(lineOrder(shuffled, "integer", "label_desc").map((r) => r[0])).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12,
    ]);
  });
  it("teks: collation id tanpa beda huruf besar/aksen; kosong di akhir", () => {
    const out = lineOrder(rows(["Zebra", null, "apel", "Ábaco", "APEL"]), "text", "label_asc");
    expect(out.map((r) => r[0])).toEqual(["Ábaco", "apel", "APEL", "Zebra", null]);
  });
  it("tanggal selalu kronologis; urutan nilai mempertahankan urutan server", () => {
    const dates = rows(["2025-10-01", "2025-08-01", "2025-09-01"]);
    expect(lineOrder(dates, "date", "value_desc").map((r) => r[0])).toEqual([
      "2025-08-01",
      "2025-09-01",
      "2025-10-01",
    ]);
    const byValue = rows(["b", "a", "c"]);
    expect(lineOrder(byValue, "text", "value_desc").map((r) => r[0])).toEqual(["b", "a", "c"]);
  });
});

describe("durasi (detik) di grafik", () => {
  const bar = (values: number[], format: ChartInput["format"] = AUTO) =>
    chartOption(
      {
        type: "bar",
        labels: values.map((_, k) => `Pegawai ${k + 1}`),
        values,
        measureLabel: "Durasi",
        dimensionLabel: "Pegawai",
        format,
        valueType: "duration",
        reducedMotion: true,
      },
      theme,
      SIZE,
    ) as unknown as Opt & { xAxis: Opt["yAxis"] };

  it("tooltip dan tabel data j:mm:dd / 'N hari j:mm', bukan 362.700", () => {
    const o = bar([34200, 362700]);
    const scaled = (o.series[0]!.data as number[])[1]!;
    expect(o.tooltip.formatter([{ name: "Pegawai 2", value: scaled }])).toBe(
      "Pegawai 2\nDurasi: 4 hari 4:45",
    );
    expect(o.tooltip.formatter([{ name: "Pegawai 1", value: 34200 / 3600 }])).toContain("9:30:00");
    expect(formatMeasure(34200, "duration", AUTO)).toBe("9:30:00");
    expect(formatMeasure(34200, "duration", AUTO, true)).toBe("9:30:00");
    expect(formatMeasure(null, "duration", AUTO)).toBe("(kosong)");
    // Format angka pilihan user tetap dihormati.
    expect(formatMeasure(34200, "duration", { style: "number", decimals: 0 })).toBe("34.200");
  });

  it("sumbu dalam jam (atau menit bila < 1 jam), satuan di nama sumbu", () => {
    const o = bar([34200, 362700]);
    expect(o.xAxis.name).toBe("jam");
    expect(o.series[0]!.data).toEqual([9.5, 100.75]);
    expect(o.xAxis.axisLabel.formatter(100)).toBe("100");
    expect(o.xAxis.axisLabel.formatter(1.5)).toBe("1,5");
    expect(durationScale([600, 1800])).toEqual({ div: 60, unit: "menit" });
    expect(bar([600, 1800]).xAxis.name).toBe("menit");
    const pie = chartOption(
      {
        type: "pie",
        labels: ["A"],
        values: [5400],
        measureLabel: "Durasi",
        dimensionLabel: "Pegawai",
        format: AUTO,
        valueType: "duration",
        reducedMotion: true,
      },
      theme,
      SIZE,
    ) as unknown as Opt;
    expect(pie.tooltip.formatter({ name: "A", value: 5400, dataIndex: 0 })).toBe(
      "A\n1:30:00 (100%)",
    );
  });
});

describe("sisa 'Lainnya' pai", () => {
  it("sisa pembulatan desimal Rupiah miliaran = 0 (tanpa Lainnya semu / peringatan palsu)", () => {
    const shown = [11059629162.19, 10170512345.67, 9600123456.78, 8912556350.32, 7176920438.82];
    const sum = shown.reduce((a, b) => a + b, 0);
    expect(pieRest(shown, sum - 7.6e-6, true)).toBe(0);
    expect(pieRest(shown, sum + 3.8e-6, true)).toBe(0);
    expect(pieRest([100, 90, 80, 70, 60], -90, true)).toBe(-490);
    expect(pieRest([3, 2], 10, true)).toBe(5);
    expect(pieRest([3, 2], 10, false)).toBe(0);
    expect(pieRest([3, 2], null, true)).toBe(0);
  });

  it("legenda urut nilai terbesar dulu; 'Lainnya' menurut nilainya", () => {
    expect(legendOrder([5, 4, 3, 2, 1, 85])).toEqual([5, 0, 1, 2, 3, 4]);
    expect(legendOrder([1, 3, null, 2])).toEqual([1, 3, 0, 2]);
  });
});

const spec = (over: Partial<ChartSpec> = {}): ChartSpec => ({
  sheetId: "cmv4kljx40009oczvdmpurrs1",
  dimension: { column: 1 },
  measure: { agg: "sum", column: 2 },
  sort: "value_desc",
  topN: 5,
  format: AUTO,
  ...over,
});
const data = (rows: unknown[][], over: Partial<WidgetData> = {}): WidgetData => ({
  columns: [
    { key: "d", label: "Jenis", type: "text" },
    { key: "m", label: "Nilai", type: "decimal" },
  ],
  rows,
  ...over,
});
const html = (type: ChartType, d: WidgetData, showData = false, s = spec()) =>
  renderToStaticMarkup(
    createElement(ChartWidget, { type, data: d, spec: s, showData, title: "Porsi" }),
  );

describe("pai: legenda, peringatan, tabel data", () => {
  const top5 = [
    ["A", 5],
    ["B", 4],
    ["C", 3],
    ["D", 2],
    ["E", 1],
  ];

  it("legenda dan peringatan negatif = wilayah gulir yang bisa difokus dan bernama", () => {
    const legend = html("pie", data(top5, { categories: 40, grandTotal: 100 }));
    expect(legend).toMatch(/role="region"[^>]*aria-label="Legenda Porsi"[^>]*tabindex="0"/);
    // Terbesar dulu: Lainnya (85) di baris pertama.
    const order = [...legend.matchAll(/title="([^"]+)"/g)].map((m) => m[1]);
    expect(order.slice(0, 3)).toEqual(["Lainnya", "A", "B"]);
    const neg = html("pie", data([...top5.slice(0, 4), ["E", -1]]));
    expect(neg).toMatch(/role="region"[^>]*aria-label="Keterangan Porsi"[^>]*tabindex="0"/);
    expect(neg).toContain('data-testid="pie-negative"');
  });

  it("tabel data yang ditunjuk peringatan memuat 'Lainnya' bertanda", () => {
    const rows = [
      ["A", 100],
      ["B", 90],
      ["C", 80],
      ["D", 70],
      ["E", 60],
    ];
    const d = data(rows, { categories: 7, grandTotal: -90 });
    expect(html("pie", d)).toContain('data-testid="pie-negative"');
    const table = html("pie", d, true);
    expect(table).toContain("Lainnya");
    expect(table).toContain('data-value="-490"');
    expect(table).toContain("-490");
  });

  it("sisa pembulatan tidak memunculkan peringatan atau baris Lainnya", () => {
    const rows = [
      ["A", 0.1],
      ["B", 0.2],
    ];
    const d = data(rows, { categories: 3, grandTotal: 0.1 + 0.2 + 1e-12 });
    const out = html("pie", d, true);
    expect(out).not.toContain("Lainnya");
    expect(html("pie", d)).not.toContain("pie-negative");
  });

  it("garis per Bulan (angka) di tabel data urut 1..12", () => {
    const d: WidgetData = {
      columns: [
        { key: "d", label: "Bulan", type: "integer" },
        { key: "m", label: "Jumlah", type: "count" },
      ],
      rows: [12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1].map((b) => [b, b * 10]),
    };
    const out = html("line", d, true, spec({ sort: "label_desc", topN: 12 }));
    const months = [...out.matchAll(/<th scope="row"[^>]*>(\d+)<\/th>/g)].map((m) => Number(m[1]));
    expect(months).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  });
});

describe("tabel data grafik dan daftar peringkat", () => {
  it("kartu lebar: nilai lengkap; kartu sempit: ringkas; label mendapat sisa lebar", () => {
    const full = ["Rp 169.028.600", "Rp 168.320.100"];
    const compact = ["Rp 169,03 jt", "Rp 168,32 jt"];
    const wide = tableLayout(373, full, compact);
    expect(wide.compact).toBe(false);
    expect(wide.labelChars).toBeGreaterThanOrEqual(25);
    const narrow = tableLayout(179, full, compact);
    expect(narrow.compact).toBe(true);
    expect(narrow.valuePx).toBeLessThanOrEqual(Math.round(179 * 0.6));
    expect(tableLayout(null, full, compact).compact).toBe(false);
  });

  it("baris yang tidak muat diganti '+N lainnya' (N kategori, nilai baris tersembunyi)", () => {
    const rows = [
      { label: "Lainnya", value: 50, others: true },
      { label: "A", value: 20 },
      { label: "B", value: 15 },
      { label: "C", value: 10 },
      { label: "D", value: 5 },
    ];
    expect(rankedItems(rows, 3, 40)).toMatchObject({ more: 3, moreValue: 30 });
    expect(rankedItems(rows, 3, 40).items.map((r) => r.label)).toEqual(["Lainnya", "A"]);
    const bars = rows.slice(1).map((r) => ({ ...r }));
    // 12 batang dari 40 kategori, muat 2 baris: 1 baris + "+39 lainnya".
    expect(rankedItems(bars, 2, 40)).toMatchObject({ more: 39, moreValue: null });
    expect(rankedItems(bars, 9, 4)).toMatchObject({ more: 0 });
    // Semua baris muat tetapi server sudah memotong (4 dari 40): tetap ada "+36 lainnya".
    const cut = rankedItems(bars, 9, 40);
    expect(cut.items).toHaveLength(4);
    expect(cut).toMatchObject({ more: 36, moreValue: null });
    // Pai yang semua baris + Lainnya muat: tanpa baris tambahan.
    expect(rankedItems(rows, 9, 40)).toMatchObject({ more: 0 });
  });
});

describe("sumbu nilai dan angka kecil", () => {
  it("batang horizontal: satuan Rp di tengah bawah sumbu, tidak menimpa angka terakhir", () => {
    const o = chartOption(
      {
        type: "bar",
        labels: ["Kantor A", "Kantor B", "Kantor C"],
        values: [1_250_000_000, 800_000_000, 400_000_000],
        measureLabel: "Omzet",
        dimensionLabel: "Kantor",
        format: RP,
        textLabels: true,
        reducedMotion: true,
      },
      theme,
      { width: 230, height: 200 },
    );
    expect(o).toMatchObject({
      xAxis: { name: "Rp", nameLocation: "middle", axisLabel: { showMaxLabel: true } },
      grid: { outerBoundsContain: "all" },
    });
    const c = echarts.init(null, null, { renderer: "svg", ssr: true, width: 230, height: 200 });
    c.setOption(o as echarts.EChartsCoreOption);
    const svg = c.renderToSVGString();
    c.dispose();
    const y = (t: string) =>
      Number(new RegExp(`translate\\([\\d.]+ ([\\d.]+)\\)"[^>]*>${t}<`).exec(svg)?.[1]);
    expect(y("Rp")).toBeGreaterThan(y("0") + 8);
    expect(y("Rp")).toBeLessThanOrEqual(200);
  });

  it("sumbu: 0,02 / 0,05 / 0,1 tidak dibulatkan jadi 0 atau label kembar; tanpa -0", () => {
    expect([0, 0.02, 0.04, 0.06, 0.08, 0.1].map((v) => formatAxis(v, AUTO))).toEqual([
      "0",
      "0,02",
      "0,04",
      "0,06",
      "0,08",
      "0,1",
    ]);
    expect(formatAxis(-0, AUTO)).toBe("0");
    expect(formatAxis(0.30000000000000004, AUTO)).toBe("0,3");
    expect(formatAxis(1_250_000, RP)).toBe("1,25 jt");
    expect(formatAxis(0.025, { style: "percent", decimals: 0 })).toBe("2,5%");
  });

  it("ringkas: nilai kecil tetap terbaca, tidak ada '-0' / '-Rp 0' / '-0%'", () => {
    expect(formatCompact(0.004, AUTO)).toBe("0,004");
    expect(formatCompact(-0.004, AUTO)).toBe("-0,004");
    expect(formatCompact(-0.004, RP)).toBe("Rp 0");
    expect(formatCompact(-0.00001, { style: "percent", decimals: 0 })).toBe("0%");
    expect(formatNumber(-0.00001, { style: "percent", decimals: 0 })).toBe("0%");
    expect(formatCompact(-3969625, RP)).toBe("-Rp 3,97 jt");
  });
});
