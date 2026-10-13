import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import * as echarts from "echarts";
import {
  chartOption,
  chartSummary,
  periodFill,
  type ChartInput,
  type ChartTheme,
} from "@/components/widgets/chart-option";
import {
  PLOT_MIN,
  barsThatFit,
  chartFit,
  durationScale,
  emptyBucketValue,
  legendOrder,
  lineOrder,
  noteLines,
  pieChartHeight,
  pieRest,
  fitTwoLines,
  rankedItems,
  rankedLabels,
  tableLayout,
  timeBuckets,
  type FitInput,
} from "@/components/widgets/chart-series";
import { ChartWidget } from "@/components/widgets/chart-widget";
import type { WidgetData } from "@/components/widgets/widget-query";
import {
  dateLabelForms,
  formatAxis,
  formatDate,
  formatCompact,
  formatMeasure,
  formatNumber,
} from "@/features/widgets/format";
import type { ChartSpec, ChartType } from "@/features/widgets/spec";

/*
 * T-011 verifikasi putaran 3 (grafik): sumbu garis per periode, urutan titik garis, durasi, legenda
 * dan peringatan pai yang bisa difokus, sisa "Lainnya" dengan toleransi pembulatan, tabel data,
 * daftar peringkat "+N lainnya", nama satuan sumbu, angka kecil di sumbu/ringkas. Putaran 4: keterangan
 * yang menyesuaikan tinggi kartu, label periode terbaru, tick, periode kosong, kolom waktu, tabel data
 * bertumpuk, pai tanpa total.
 */

// Ukuran kotak terukur (ResizeObserver tidak ada di SSR): null = belum diukur, seperti sebelumnya.
const box = vi.hoisted(() => ({ size: null as { width: number; height: number } | null }));
vi.mock("@/components/widgets/use-box-size", () => ({ useBoxSize: () => box.size }));
// Ukuran canvas tiruan untuk daftar peringkat (putaran 7); null = tanpa canvas, seperti SSR.
const canvas = vi.hoisted(() => ({
  measure: null as null | ((t: string, bold: boolean) => number),
}));
vi.mock("@/components/widgets/chart-table", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/components/widgets/chart-table")>();
  return { ...actual, canvasMeasure: (px?: number) => canvas.measure ?? actual.canvasMeasure(px) };
});
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
  // Putaran 5: urutan label server (SQL nocase.noaccent / angka sebagai angka) dipakai apa adanya.
  it("dimensi angka Z→A dari server (12..1) digambar naik 1..12", () => {
    const desc = rows([12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1]);
    expect(lineOrder(desc, "integer", "label_desc").map((r) => r[0])).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12,
    ]);
  });
  it("teks: urutan server dipertahankan; kosong di akhir", () => {
    const server = rows(["Ábaco", "apel", "APEL", null, "Zebra"]);
    expect(lineOrder(server, "text", "label_asc").map((r) => r[0])).toEqual([
      "Ábaco",
      "apel",
      "APEL",
      "Zebra",
      null,
    ]);
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
    // Putaran 4: kartu sedang → nilai ringkas, label tetap ≥ 12 karakter.
    const narrow = tableLayout(260, full, compact);
    expect(narrow).toMatchObject({ compact: true, stacked: false });
    expect(narrow.labelChars).toBeGreaterThanOrEqual(12);
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

describe("putaran 4", () => {
  const fit = (over: Partial<FitInput> & Pick<FitInput, "type" | "room">) =>
    chartFit({ rows: 5, categories: 5, legendRows: 5, others: false, partial: false, ...over });
  const withBox = (size: { width: number; height: number }, run: () => void) => {
    box.size = size;
    try {
      run();
    } finally {
      box.size = null;
    }
  };
  const ts = (h: number, m = 0, d = 31, mo = 11, y = 2025) => Date.UTC(y, mo, d, h, m);
  const svgOf = (o: unknown, width: number, height: number) => {
    const c = echarts.init(null, null, { renderer: "svg", ssr: true, width, height });
    c.setOption(o as echarts.EChartsCoreOption);
    const svg = c.renderToSVGString();
    c.dispose();
    return svg;
  };
  const pieFit = (room: { width: number; height: number }) =>
    fit({ type: "pie", room, categories: 40, legendRows: 6, others: true });

  describe("keterangan menyesuaikan tinggi kartu; grafik tidak pernah di bawah tinggi minimum", () => {
    it("batang mini (177×82): keterangan tidak tampil, 2 batang (bukan 1 batang 45 px)", () => {
      expect(fit({ type: "bar", room: { width: 177, height: 82 } })).toMatchObject({
        note: "none",
        visible: 2,
        ranked: false,
        full: "Menampilkan 2 dari 5 kategori",
      });
    });

    it("pai mini (176×82): donat tidak muat → daftar peringkat", () => {
      expect(pieFit({ width: 176, height: 82 })).toMatchObject({ note: "none", ranked: true });
    });

    it("pai pendek/sempit: keterangan ringkas satu baris, teks lengkap tetap tersedia", () => {
      expect(pieFit({ width: 274, height: 154 })).toMatchObject({
        note: "compact",
        shown: "5 dari 40 kategori",
        full: "Menampilkan 5 dari 40 kategori · sisanya di Lainnya",
        ranked: false,
      });
      // 176 px: teks lengkap butuh 3 baris (terpotong "…sisanya di…") → ringkas.
      expect(pieFit({ width: 176, height: 225 })).toMatchObject({
        note: "compact",
        shown: "5 dari 40 kategori",
      });
    });

    it("batang: lengkap satu baris bila muat, dua baris hanya di kartu ≥ 200 px", () => {
      expect(
        fit({ type: "bar", room: { width: 274, height: 154 }, rows: 12, categories: 40 }),
      ).toMatchObject({ note: "full", visible: 5, shown: "Menampilkan 5 dari 40 kategori" });
      expect(
        fit({ type: "bar", room: { width: 177, height: 225 }, rows: 12, categories: 40 }),
      ).toMatchObject({ note: "full", visible: 8, shown: "Menampilkan 8 dari 40 kategori" });
    });

    it("garis: jumlah titik nyata; periode kosong yang diisi disebut; kartu sempit → peringkat", () => {
      const room = { width: 568, height: 225 };
      expect(fit({ type: "line", room, rows: 33, categories: 33 })).toMatchObject({
        note: "full",
        shown: "33 titik",
      });
      // Baris bertanggal kosong ikut dihitung server (5) tetapi tidak diplot: yang disebut 4 minggu.
      const fill = { buckets: 24, present: 4, noun: "minggu" };
      expect(fit({ type: "line", room, rows: 5, categories: 5, fill })).toMatchObject({
        shown: "4 dari 24 minggu berisi data",
      });
      expect(
        periodFill({
          type: "line",
          values: [5, 7],
          time: { iso: ["2025-08-01", "2025-10-01", null], grain: "month", empty: 0 },
        }),
      ).toEqual({ buckets: 3, present: 2, noun: "bulan" });
      expect(
        periodFill({
          type: "line",
          values: [5, 7],
          time: { iso: ["2025-08-01", "2025-09-01"], grain: "month" },
        }),
      ).toBeUndefined();
      // Jumlah biasa (tidak terpotong) hanya di kartu lega.
      expect(fit({ type: "line", room: { width: 568, height: 200 } })).toMatchObject({
        note: "none",
        ranked: false,
      });
      expect(fit({ type: "line", room: { width: 109, height: 272 } })).toMatchObject({
        note: "none",
        ranked: true,
      });
    });

    it("pai tanpa total keseluruhan: keterangan persen dari yang tampil (lengkap/ringkas)", () => {
      expect(fit({ type: "pie", room: { width: 343, height: 270 }, partial: true })).toMatchObject({
        note: "full",
        shown: "Persentase dari 5 kategori yang tampil (total keseluruhan tidak tersedia)",
      });
      expect(fit({ type: "pie", room: { width: 200, height: 160 }, partial: true })).toMatchObject({
        note: "compact",
        shown: "Persen dari 5 yang tampil saja",
      });
    });

    it("invarian: keterangan yang tampil tidak pernah membuat grafik < PLOT_MIN", () => {
      for (const type of ["bar", "line", "pie"] as const) {
        for (let width = 140; width <= 640; width += 23) {
          for (let height = 60; height <= 420; height += 11) {
            const f = fit({
              type,
              room: { width, height },
              rows: 12,
              categories: 40,
              legendRows: 6,
              others: true,
            });
            if (f.note === "none") continue;
            const lines = f.note === "compact" ? 1 : noteLines(f.shown, width);
            expect(lines).toBeLessThanOrEqual(f.note === "compact" ? 1 : 2);
            if (lines === 2) expect(height).toBeGreaterThanOrEqual(200);
            const h = height - lines * 16 - 4;
            const plot = type === "pie" ? pieChartHeight(width, h, 6) : h;
            expect(plot).toBeGreaterThanOrEqual(PLOT_MIN[type]);
            if (type === "bar") expect(f.visible).toBe(Math.min(barsThatFit(h), 12));
          }
        }
      }
    });

    it("DOM: ringkas = satu baris (teks lengkap di title + pembaca layar); padding di pembungkus", () => {
      withBox({ width: 274, height: 154 }, () => {
        const out = html("pie", data(top5(), { categories: 40, grandTotal: 100 }));
        const note =
          /<div class="([^"]*)"><p class="([^"]*)" title="([^"]*)" data-testid="chart-note">(.*?)<\/p><\/div>/.exec(
            out,
          );
        expect(note).not.toBeNull();
        expect(note![1]).toContain("pb-1");
        expect(note![2]).toContain("line-clamp-1");
        expect(note![2]).not.toContain("pb-1");
        expect(note![3]).toBe("Menampilkan 5 dari 40 kategori · sisanya di Lainnya");
        expect(note![4]).toContain('<span aria-hidden="true">5 dari 40 kategori</span>');
        expect(note![4]).toContain(
          '<span class="sr-only">Menampilkan 5 dari 40 kategori · sisanya di Lainnya</span>',
        );
      });
      withBox({ width: 176, height: 82 }, () => {
        const out = html("pie", data(top5(), { categories: 40, grandTotal: 100 }));
        expect(out).toContain('data-testid="chart-ranked"');
        expect(out).not.toContain('data-testid="pie-legend"');
        expect(out).not.toContain('data-testid="chart-note"');
      });
    });
  });

  describe("sumbu periode garis", () => {
    const weeks = Array.from({ length: 26 }, (_, k) =>
      new Date(Date.UTC(2026, 0, 5) + k * 7 * 86_400_000).toISOString().slice(0, 10),
    );
    type Weekly = {
      xAxis: {
        axisLabel: {
          interval: (k: number) => boolean;
          alignMaxLabel: string;
          showMaxLabel: boolean;
        };
        axisTick: { show: boolean; alignWithLabel: boolean; interval: unknown };
      };
    };
    const weekly = (width: number) =>
      chartOption(
        {
          type: "line",
          labels: weeks,
          values: weeks.map((_, k) => 1e6 * (k + 1)),
          measureLabel: "Omzet",
          dimensionLabel: "Tanggal",
          format: RP,
          time: { iso: weeks, grain: "week", empty: 0 },
          reducedMotion: true,
        },
        theme,
        { width, height: 200 },
      ) as unknown as Weekly;

    it("periode terbaru selalu berlabel, rata kanan di dalam SVG (150/343/400 px)", () => {
      for (const width of [150, 343, 400]) {
        const o = weekly(width);
        expect(o.xAxis.axisLabel).toMatchObject({ alignMaxLabel: "right", showMaxLabel: true });
        expect(o.xAxis.axisLabel.interval(25)).toBe(true);
        const svg = svgOf(o, width, 200);
        const last =
          /<text[^>]*text-anchor="end"[^>]*translate\(([\d.]+) [\d.]+\)[^>]*>Mg 29 Jun 2026</.exec(
            svg,
          );
        expect(last, `lebar ${width}`).not.toBeNull();
        expect(Number(last![1])).toBeLessThanOrEqual(width);
      }
    });

    it("tick di bawah titik: per periode bila renggang, selain itu di label yang tampil", () => {
      const wide = weekly(400);
      expect(wide.xAxis.axisTick).toMatchObject({ show: true, alignWithLabel: true, interval: 0 });
      const narrow = weekly(150);
      expect(narrow.xAxis.axisTick.interval).toBe(narrow.xAxis.axisLabel.interval);
    });

    it("label teks pendek (≤ 10 karakter) tidak dipotong di sumbu garis", () => {
      const names = ["apel", "Zebra", "Ábaco", "banana", "cempedak", "Kantor PCP Express Gambir"];
      const o = chartOption(
        {
          type: "line",
          labels: names,
          values: names.map((_, k) => k),
          measureLabel: "Omzet",
          dimensionLabel: "Nama",
          format: AUTO,
          textLabels: true,
          reducedMotion: true,
        },
        theme,
        { width: 276, height: 205 },
      ) as unknown as { xAxis: { axisLabel: { formatter: (v: string) => string } } };
      expect(o.xAxis.axisLabel.formatter("cempedak")).toBe("cempedak");
      expect(o.xAxis.axisLabel.formatter("Kantor PCP Express Gambir")).toContain("…");
    });
  });

  describe("periode tanpa data", () => {
    const iso = ["2025-08-01", "2025-10-01"];
    type Line = Opt & {
      series: { symbolSize?: (v: unknown, p: { dataIndex: number }) => number }[];
    };

    it("tanpa simbol titik; tooltip 'tidak ada data' (bukan nilai terukur)", () => {
      const sum = line({ iso, grain: "month", empty: 0 }, [5, 7], { format: RP }) as Line;
      expect(sum.series[0]!.data).toEqual([5, 0, 7]);
      const size = sum.series[0]!.symbolSize!;
      expect([0, 1, 2].map((dataIndex) => size(null, { dataIndex }))).toEqual([4, 0, 4]);
      expect(sum.tooltip.formatter([{ name: "Sep 2025", value: 0, dataIndex: 1 }])).toBe(
        "Sep 2025\nOmzet: Rp 0 (tidak ada data)",
      );
      expect(sum.tooltip.formatter([{ name: "Okt 2025", value: 7, dataIndex: 2 }])).toBe(
        "Okt 2025\nOmzet: Rp 7",
      );
      const avg = line({ iso, grain: "month", empty: null }, [5, 7]);
      expect(avg.tooltip.formatter([{ name: "Sep 2025", value: null, dataIndex: 1 }])).toBe(
        "Sep 2025\nOmzet: (tidak ada data)",
      );
      // N titik bernilai terbesar: periode di luar N belum tentu kosong.
      const cut = line({ iso, grain: "month", empty: null, cut: "top" }, [5, 7]);
      expect(cut.tooltip.formatter([{ name: "Sep 2025", value: null, dataIndex: 1 }])).toBe(
        "Sep 2025\nOmzet: (di luar 2 terbesar)",
      );
      // Tanpa periode yang diisi: tanpa callback simbol.
      const full = line({ iso: ["2025-09-01", "2025-10-01"], grain: "month", empty: 0 }, [1, 2]);
      expect((full as Line).series[0]!.symbolSize).toBeUndefined();
    });

    it("ringkasan pembaca layar menyebut periode yang diisi", () => {
      const base = {
        type: "line" as const,
        labels: ["Agu 2025", "Okt 2025"],
        values: [5, 7],
        measureLabel: "Omzet",
        dimensionLabel: "Tanggal",
      };
      expect(chartSummary({ ...base, time: { iso, grain: "month", empty: 0 } })).toBe(
        "Grafik garis: Omzet per Tanggal, 2 titik. 1 bulan tanpa data digambar sebagai 0.",
      );
      expect(chartSummary({ ...base, time: { iso, grain: "month", empty: null } })).toContain(
        "1 bulan tanpa data tidak digambar (garis terputus).",
      );
      expect(
        chartSummary({ ...base, time: { iso, grain: "month", empty: null, cut: "top" } }, 33),
      ).toContain("2 dari 33 titik. 1 bulan di luar 2 terbesar tidak digambar.");
    });

    it("kolom tanggal tanpa grain = per hari: hari kosong diisi, bukan garis lurus", () => {
      const o = line({ iso: ["2026-10-04", "2026-10-01"], dimType: "date", empty: 0 }, [5, 3]);
      expect(o.series[0]!.data).toEqual([
        [Date.UTC(2026, 9, 1), 3],
        [Date.UTC(2026, 9, 2), 0],
        [Date.UTC(2026, 9, 3), 0],
        [Date.UTC(2026, 9, 4), 5],
      ]);
    });

    it("total dengan semua nilai kosong = 0 (SUMIF), bukan celah atau '(kosong)'", () => {
      const d: WidgetData = {
        columns: [
          { key: "d", label: "Tanggal", type: "date" },
          { key: "m", label: "Total Omzet", type: "decimal" },
        ],
        rows: [
          ["2025-11-01", 5],
          ["2025-09-01", null],
        ],
      };
      const s = spec({
        sort: "label_desc",
        topN: 365,
        dimension: { column: 1, timeGrain: "month" },
      });
      const out = html("line", d, true, s);
      expect(out).toMatch(/data-value="0"/);
      expect(out).not.toContain("(kosong)");
      // Rata-rata dari nilai kosong tetap kosong (tidak terdefinisi).
      const avg = html("line", d, true, spec({ ...s, measure: { agg: "avg", column: 2 } }));
      expect(avg).toContain("(kosong)");
    });
  });

  describe("kolom waktu tanpa grain", () => {
    type TimeOpt = Opt & {
      xAxis: {
        name?: string;
        minInterval?: number;
        axisLabel: { formatter: (ms: number) => string };
      };
    };

    it("satu hari: label jam berbeda, tanggal di nama sumbu, tooltip dengan jam", () => {
      const times = ["06:00", "09:30", "12:00", "17:15", "21:00"].map((t) => `2025-12-31T${t}:00`);
      const o = line({ iso: times, dimType: "timestamp" }, [5, 8, 3, 9, 4], {
        valueType: "count",
      }) as TimeOpt;
      expect(o.xAxis.minInterval).toBeUndefined();
      expect(o.xAxis.name).toBe("31 Des 2025");
      expect(o.xAxis.axisLabel.formatter(ts(9))).toBe("09:00");
      const tips = [ts(6), ts(9, 30), ts(12), ts(17, 15), ts(21)].map(
        (ms, dataIndex) => o.tooltip.formatter([{ value: [ms, 1], dataIndex }]).split("\n")[0],
      );
      expect(tips).toEqual([
        "31 Des 2025 06:00",
        "31 Des 2025 09:30",
        "31 Des 2025 12:00",
        "31 Des 2025 17:15",
        "31 Des 2025 21:00",
      ]);
      const svg = svgOf(o, 600, 200);
      const labels = [...svg.matchAll(/>(\d\d:\d\d)</g)].map((m) => m[1]);
      expect(labels.length).toBeGreaterThan(2);
      expect(new Set(labels).size).toBe(labels.length);
    });

    it("2–3 hari: tanggal + jam di tiap label; ≥ 3 hari: tick paling rapat sehari", () => {
      const two = line(
        { iso: ["2025-12-31T06:00:00", "2026-01-02T12:00:00"], dimType: "timestamp" },
        [1, 2],
      ) as TimeOpt;
      expect(two.xAxis.axisLabel.formatter(ts(18))).toBe("31 Des 18:00");
      expect(two.xAxis.name).toBeUndefined();
      const week = line(
        { iso: ["2025-12-01T06:00:00", "2025-12-09T08:00:00"], dimType: "timestamp" },
        [1, 2],
      ) as TimeOpt;
      expect(week.xAxis.minInterval).toBe(86_400_000);
      expect(week.xAxis.axisLabel.formatter(Date.UTC(2025, 11, 5))).toBe("5 Des 2025");
      expect(week.tooltip.formatter([{ value: [ts(21, 0, 5), 1], dataIndex: 0 }])).toContain(
        "5 Des 2025 21:00",
      );
    });
  });

  describe("sumbu nilai", () => {
    type Axis = {
      name: string;
      minInterval?: number;
      axisLabel: { formatter: (v: number) => string };
    };
    const bar = (values: number[], extra: Partial<ChartInput> = {}, height = 300) =>
      chartOption(
        {
          type: "bar",
          labels: values.map((_, k) => `K${k}`),
          values,
          measureLabel: "Nilai",
          dimensionLabel: "Kategori",
          format: AUTO,
          reducedMotion: true,
          ...extra,
        },
        theme,
        { width: 400, height },
      ) as unknown as { xAxis: Axis };

    it("jumlah baris/bilangan bulat: garis sumbu tidak pernah pecahan", () => {
      expect(bar([1, 1], { valueType: "count" }).xAxis.minInterval).toBe(1);
      expect(bar([1, 3], { valueType: "integer" }).xAxis.minInterval).toBe(1);
      expect(bar([1.5, 3], { valueType: "integer" }).xAxis.minInterval).toBeUndefined();
      expect(bar([1, 3], { valueType: "decimal" }).xAxis.minInterval).toBeUndefined();
      const pct = bar([1, 3], { valueType: "count", format: { style: "percent", decimals: 0 } });
      expect(pct.xAxis.minInterval).toBeUndefined();
    });

    it("kotak pendek: satuan pindah ke label sumbu (nama sumbu tidak jatuh di luar SVG)", () => {
      // Intl ringkas memakai spasi tak putus sebelum "jt".
      const text = (s: string) => s.replace(/\s/g, " ");
      const tiny = bar([5e8, 4e8], { format: RP }, 82).xAxis;
      expect(tiny.name).toBe("");
      expect(text(tiny.axisLabel.formatter(5e8))).toBe("Rp 500 jt");
      expect(text(tiny.axisLabel.formatter(-5e8))).toBe("-Rp 500 jt");
      const roomy = bar([5e8, 4e8], { format: RP }, 200).xAxis;
      expect(roomy.name).toBe("Rp");
      expect(text(roomy.axisLabel.formatter(5e8))).toBe("500 jt");
      expect(bar([36000], { valueType: "duration" }, 82).xAxis.axisLabel.formatter(10)).toBe(
        "10 jam",
      );
      expect(svgOf(bar([5e8, 4e8], { format: RP }, 82), 400, 82)).not.toMatch(/>Rp</);
    });
  });

  describe("pai: Lainnya dan total yang tidak tersedia", () => {
    const pie = {
      type: "pie" as const,
      labels: ["A", "B", "C", "D", "E"],
      values: [5, 4, 3, 2, 1],
      measureLabel: "Total",
      dimensionLabel: "Kantor",
    };

    it("ringkasan menyebut Lainnya hanya bila irisannya ada", () => {
      expect(chartSummary(pie, 7)).toBe("Grafik pai: Total per Kantor, 5 dari 7 kategori.");
      expect(chartSummary({ ...pie, others: 50 }, 7)).toContain(
        "5 dari 7 kategori, sisanya digabung sebagai Lainnya.",
      );
    });

    it("total gagal (categories tidak ada) dan baris = batas N: persen dari yang tampil", () => {
      withBox({ width: 343, height: 270 }, () => {
        const out = html("pie", data(top5()));
        expect(out).toContain(
          "Persentase dari 5 kategori yang tampil (total keseluruhan tidak tersedia).</caption>",
        );
        expect(out).toContain(
          'data-testid="chart-note">Persentase dari 5 kategori yang tampil (total keseluruhan tidak tersedia)<',
        );
      });
      // Baris lebih sedikit dari batas N: semua kategori tampil, persen memang dari keseluruhan.
      expect(html("pie", data(top5().slice(0, 3)))).not.toContain("Persentase dari");
      // Total tersedia: tanpa pemberitahuan.
      expect(html("pie", data(top5(), { categories: 5, grandTotal: 15 }))).not.toContain(
        "Persentase dari",
      );
    });
  });

  describe("daftar peringkat, urutan teks, tabel bertumpuk", () => {
    it("garis bertanggal di kartu sempit: terbaru dulu, sisanya '+N sebelumnya'", () => {
      const d: WidgetData = {
        columns: [
          { key: "d", label: "Bulan", type: "date" },
          { key: "m", label: "Jumlah baris", type: "count" },
        ],
        rows: Array.from({ length: 12 }, (_, k) => [
          `2025-${String(12 - k).padStart(2, "0")}-01`,
          k + 1,
        ]),
      };
      const s = spec({
        sort: "label_desc",
        topN: 365,
        measure: { agg: "count" },
        dimension: { column: 1, timeGrain: "month" },
      });
      withBox({ width: 109, height: 272 }, () => {
        const out = html("line", d, false, s);
        const items = [...out.matchAll(/title="([^"]+)"/g)].map((m) => m[1]);
        expect(items.slice(0, 2)).toEqual(["Des 2025", "Nov 2025"]);
        expect(out).toContain("+6 sebelumnya");
      });
    });

    it("teks pada garis: urutan server (seperti SQL, batang, tabel); angka tetap angka", () => {
      const rows = (keys: unknown[]) => keys.map((k) => [k, 1] as const);
      // Urutan /api/query untuk A→Z (nocase.noaccent): "Unit 10" sebelum "Unit 2".
      const units = rows(["Unit 1", "Unit 10", "Unit 11", "Unit 2", "unit 3"]);
      expect(lineOrder(units, "text", "label_asc").map((r) => r[0])).toEqual([
        "Unit 1",
        "Unit 10",
        "Unit 11",
        "Unit 2",
        "unit 3",
      ]);
      expect(lineOrder(rows([2, 10]), "integer", "label_asc").map((r) => r[0])).toEqual([2, 10]);
    });

    it("tabel data di kartu 177 px: label ≥ 12 karakter atau baris ditumpuk (bukan 'Ka…01')", () => {
      const full = ["Rp 169.028.600", "Rp 168.320.100"];
      const compact = ["Rp 169,03 jt", "Rp 168,32 jt"];
      const t = tableLayout(177, full, compact);
      expect(t).toMatchObject({ stacked: true, compact: false, valuePx: null });
      expect(t.labelChars).toBeGreaterThanOrEqual(24);
      for (let width = 120; width <= 600; width += 7) {
        const l = tableLayout(width, full, compact);
        if (!l.stacked) expect(l.labelChars).toBeGreaterThanOrEqual(12);
      }
      const label = "Kantor PCP Express Bekasi Barat Kalimalang Unit 01";
      const d = data([[label, 169028600]], {
        columns: [
          { key: "d", label: "Kantor", type: "text" },
          { key: "m", label: "Total Omzet", type: "decimal" },
        ],
      });
      withBox({ width: 177, height: 300 }, () => {
        const out = html("bar", d, true, spec({ format: RP }));
        expect(out).toContain("data-stacked");
        expect(out).toMatch(/<table class="[^"]*block[^"]*" role="table">/);
        expect(out).toContain('role="rowheader"');
        expect(out).toContain('role="cell"');
        expect(out).toContain(`<span class="sr-only">${label}</span>`);
        expect(out).toContain(">Rp 169.028.600<");
      });
    });
  });
});

function top5() {
  return [
    ["A", 5],
    ["B", 4],
    ["C", 3],
    ["D", 2],
    ["E", 1],
  ];
}

describe("putaran 5", () => {
  const withBox = (size: { width: number; height: number }, run: () => void) => {
    box.size = size;
    try {
      run();
    } finally {
      box.size = null;
    }
  };
  const svgOf = (o: unknown, width: number, height: number) => {
    const c = echarts.init(null, null, { renderer: "svg", ssr: true, width, height });
    c.setOption(o as echarts.EChartsCoreOption);
    const svg = c.renderToSVGString();
    c.dispose();
    return svg;
  };

  describe("tabel data: kolom nilai selebar teks terukur, kepala kolom tidak 'J…'", () => {
    // Lebar tiruan font sistem 14 px (angka tabular ±8,7 px; kepala kolom font-medium ±7,2 px).
    const charPx = (ch: string) =>
      /\d/.test(ch) ? 8.7 : /[.,\s]/.test(ch) ? 4 : ch === "%" ? 12 : 8;
    const font = (t: string, header: boolean) =>
      [...t].reduce((w, ch) => w + (header ? 7.2 : charPx(ch)), 0);
    const widest = (t: readonly string[]) => Math.max(...t.map((s) => font(s, false)));
    const cases: { header: string; full: string[]; compact?: string[] }[] = [
      { header: "Jumlah baris", full: ["80", "75", "8"] },
      { header: "Jumlah baris", full: ["350", "240", "160"] },
      { header: "Rata-rata Gap", full: ["47,0%", "38,5%"] },
      {
        header: "Total Omzet",
        full: ["Rp 169.028.600", "Rp 8.320.100"],
        compact: ["Rp 169,03 jt", "Rp 8,32 jt"],
      },
    ];

    it("['80'], ['350'], ['47,0%'], Rupiah di 177/373/568 px: nilai dan kepala kolom tidak terpotong", () => {
      for (const c of cases) {
        for (const width of [177, 373, 568]) {
          for (const measure of [font, undefined]) {
            const l = tableLayout(width, c.full, c.compact ?? c.full, {
              header: c.header,
              labelLength: 20,
              measure,
            });
            const shown = l.compact ? c.compact! : c.full;
            const at = `${c.full[0]} @${width}${measure ? "" : " (perkiraan)"}`;
            if (l.stacked) {
              expect(widest(shown), at).toBeLessThanOrEqual(width - 24);
              continue;
            }
            const room = l.valuePx! - 24;
            expect(widest(shown), at).toBeLessThanOrEqual(room);
            // Kepala kolom muat paling banyak dua baris ("Jumlah / baris").
            const words = c.header.split(" ").map((w) => font(w, true));
            expect(Math.max(...words), at).toBeLessThanOrEqual(room);
            expect(l.labelChars, at).toBeGreaterThanOrEqual(12);
          }
        }
      }
      // Kartu lebar: kepala kolom satu baris, nilai lengkap.
      const wide = tableLayout(568, ["80"], ["80"], { header: "Jumlah baris", measure: font });
      expect(wide).toMatchObject({ stacked: false, compact: false });
      expect(wide.valuePx! - 24).toBeGreaterThanOrEqual(font("Jumlah baris", true));
      expect(tableLayout(373, ["47,0%"], ["47%"], { header: "Rata-rata Gap" })).toMatchObject({
        stacked: false,
        compact: false,
      });
    });

    it("label pendek (bulan) tidak perlu ditumpuk di kartu 177 px", () => {
      const l = tableLayout(177, ["80"], ["80"], {
        header: "Jumlah baris",
        labelLength: "Jan 2026".length,
        measure: font,
      });
      expect(l.stacked).toBe(false);
      expect(l.labelChars).toBeGreaterThanOrEqual(8);
    });

    it("tabel: kepala kolom dua baris (line-clamp), bukan truncate; kolom nilai selebar kepala", () => {
      withBox({ width: 568, height: 300 }, () => {
        const d = data([["Kantor A", 80]], {
          columns: [
            { key: "d", label: "Kantor", type: "text" },
            { key: "m", label: "Jumlah baris", type: "count" },
          ],
        });
        const out = html("bar", d, true, spec({ measure: { agg: "count" } }));
        expect(out).toMatch(
          /<th scope="col" class="[^"]*text-right[^"]*" title="Jumlah baris"><span class="line-clamp-2 break-words">Jumlah baris<\/span><\/th>/,
        );
        expect(out).not.toMatch(/<th scope="col" class="[^"]*truncate/);
        // Kolom nilai selebar kepala kolom (bukan 40 px untuk "80").
        const col = /<col style="width:(\d+)px"\/>/.exec(out);
        expect(Number(col![1])).toBeGreaterThanOrEqual(24 + "Jumlah baris".length * 7);
      });
    });
  });

  describe("total gagal: N teratas, bukan nol karangan", () => {
    const weeks = (ks: number[]) =>
      ks.map((k) => new Date(Date.UTC(2026, 0, 5) + k * 7 * 86_400_000).toISOString().slice(0, 10));
    const lineData = (keys: string[], values: number[], categories?: number): WidgetData => ({
      columns: [
        { key: "d", label: "Tanggal", type: "date" },
        { key: "m", label: "Total Omzet", type: "decimal" },
      ],
      rows: keys.map((k, i) => [k, values[i]!]),
      ...(categories === undefined ? {} : { categories }),
    });
    const weekly = (sort: ChartSpec["sort"]) =>
      spec({ sort, topN: 3, dimension: { column: 1, timeGrain: "week" } });

    it("garis N terbesar tanpa total: celah '(di luar 3 terbesar)', bukan '0 (tidak ada data)'", () => {
      // Server: 3 minggu bernilai terbesar dari 13 (minggu lain BERISI data).
      const d = lineData(weeks([0, 3, 12]), [405950, 296900, 284750]);
      withBox({ width: 568, height: 270 }, () => {
        const out = html("line", d, false, weekly("value_desc"));
        expect(out).toContain("3 titik terbesar (jumlah keseluruhan tidak tersedia)");
        expect(out).toContain("minggu di luar 3 terbesar tidak digambar.");
        expect(out).not.toContain("tanpa data digambar sebagai 0");
        expect(out).toMatch(
          /data-testid="chart-note">Menampilkan 3 titik terbesar \(jumlah keseluruhan tidak tersedia\)</,
        );
      });
      // Opsi yang digambar dari masukan yang sama: celah null, tooltip "di luar".
      const empty = emptyBucketValue("sum", "value_desc", true);
      const o = line({ iso: weeks([0, 3, 12]), grain: "week", empty, cut: "top" }, [3, 2, 1]);
      expect(o.series[0]!.data).toContain(null);
      expect(o.series[0]!.data).not.toContain(0);
      expect(o.tooltip.formatter([{ name: "x", value: null, dataIndex: 1 }])).toBe(
        "x\nOmzet: (di luar 3 terbesar)",
      );
      // Total diketahui dan tidak terpotong: minggu kosong tetap 0.
      withBox({ width: 568, height: 270 }, () => {
        const known = lineData(weeks([0, 3, 12]), [1, 2, 3], 3);
        expect(html("line", known, false, weekly("value_desc"))).toContain(
          "tanpa data digambar sebagai 0",
        );
      });
    });

    it("garis N terakhir (urut label) tanpa total: periode kosong tetap 0, keterangan 'N titik terakhir'", () => {
      const d = lineData(weeks([0, 3, 12]), [1, 2, 3]);
      withBox({ width: 568, height: 270 }, () => {
        const out = html("line", d, false, weekly("label_desc"));
        expect(out).toContain("tanpa data digambar sebagai 0");
        expect(out).toContain("3 titik terakhir (jumlah keseluruhan tidak tersedia)");
      });
    });

    it("batang tanpa total dan baris = batas N: tidak mengaku 'N kategori' lengkap", () => {
      withBox({ width: 400, height: 270 }, () => {
        const out = html("bar", data(top5()));
        expect(out).toContain(
          "Grafik batang: Nilai per Jenis, 5 kategori terbesar (jumlah keseluruhan tidak tersedia).",
        );
        expect(out).toContain(
          'data-testid="chart-note">Menampilkan 5 kategori terbesar (jumlah keseluruhan tidak tersedia)<',
        );
      });
      // Baris lebih sedikit dari batas N: semua kategori tampil.
      expect(html("bar", data(top5().slice(0, 3)))).toContain("Nilai per Jenis, 3 kategori.");
      expect(html("bar", data(top5()), false, spec({ sort: "value_asc" }))).toContain(
        "5 kategori terkecil (jumlah keseluruhan tidak tersedia)",
      );
    });
  });

  describe("garis dan sumbu", () => {
    type Sym = { showSymbol: boolean; showAllSymbol?: boolean };

    it("ada periode yang diisi: semua simbol titik berisi data tampil (tidak dijarangkan)", () => {
      const iso = ["2026-01-05", "2026-03-02", "2026-04-27", "2026-06-15"];
      const o = line({ iso, grain: "week", empty: 0 }, [3, 2, 4, 1], { format: RP });
      expect(o.series[0] as unknown as Sym).toMatchObject({
        showSymbol: true,
        showAllSymbol: true,
      });
      // Tanpa periode yang diisi: perilaku ECharts biasa.
      const full = line({ iso: ["2026-01-05", "2026-01-12"], grain: "week", empty: 0 }, [1, 2]);
      expect((full.series[0] as unknown as Sym).showAllSymbol).toBeUndefined();
      // > 60 periode, ≤ 60 yang berisi data: simbol tetap tampil.
      const sparse = line({ iso: ["2024-01-01", "2026-01-01"], grain: "month", empty: 0 }, [1, 2]);
      expect(sparse.series[0] as unknown as Sym).toMatchObject({
        showSymbol: true,
        showAllSymbol: true,
      });
    });

    it("sumbu waktu (hari/cap waktu): ruang kanan untuk label terakhir; teks tidak keluar SVG 150–210 px", () => {
      const days = [0, 3, 9, 20, 29].map((k) =>
        new Date(Date.UTC(2026, 4, 3) + k * 86_400_000).toISOString().slice(0, 10),
      );
      const stamps = ["2025-12-31T06:00:00", "2026-01-01T12:00:00", "2026-01-02T12:00:00"];
      const times: NonNullable<ChartInput["time"]>[] = [
        { iso: days, grain: "day", empty: 0 },
        { iso: stamps, dimType: "timestamp" },
      ];
      for (const time of times) {
        for (const width of [150, 178, 208]) {
          const o = chartOption(
            {
              type: "line",
              labels: time.iso.map(String),
              values: time.iso.map((_, k) => 1e5 * (k + 1)),
              measureLabel: "Omzet",
              dimensionLabel: "Tanggal",
              format: RP,
              time,
              reducedMotion: true,
            },
            theme,
            { width, height: 81 },
          ) as unknown as { grid: { right: number } };
          expect(o.grid.right).toBeGreaterThan(16);
          expect(o.grid.right).toBeLessThanOrEqual(width * 0.2);
          const svg = svgOf(o, width, 81);
          for (const m of svg.matchAll(
            /text-anchor="(middle|end)"[^>]*translate\(([\d.]+) [\d.]+\)[^>]*>([^<]+)</g,
          )) {
            const half = m[3]!.length * 3.3;
            const right = Number(m[2]) + (m[1] === "middle" ? half : 0);
            expect(right, `${m[3]} @${width}`).toBeLessThanOrEqual(width);
          }
        }
      }
    });

    it("satu hari di kotak pendek: tanggal ikut di label ('31 Des 10:00'), tidak hilang", () => {
      const times = ["06:00", "10:00", "18:00", "21:00"].map((t) => `2025-12-31T${t}:00`);
      type T = { xAxis: { name?: string; axisLabel: { formatter: (ms: number) => string } } };
      const short = chartOption(
        {
          type: "line",
          labels: times,
          values: [1, 2, 3, 4],
          measureLabel: "Jumlah",
          dimensionLabel: "Waktu",
          format: AUTO,
          time: { iso: times, dimType: "timestamp" },
          reducedMotion: true,
        },
        theme,
        { width: 178, height: 81 },
      ) as unknown as T;
      expect(short.xAxis.name).toBeUndefined();
      expect(short.xAxis.axisLabel.formatter(Date.UTC(2025, 11, 31, 10))).toBe("31 Des 10:00");
    });

    it("sumbu periode: jarak label rata (tanpa celah ganda sebelum label terbaru)", () => {
      type Cat = {
        xAxis: { axisLabel: { interval: (k: number) => boolean; alignMaxLabel?: string } };
      };
      const shown = (n: number, width: number) => {
        const iso = Array.from({ length: n }, (_, k) =>
          new Date(Date.UTC(2025, k, 1)).toISOString().slice(0, 10),
        );
        const o = chartOption(
          {
            type: "line",
            labels: iso,
            values: iso.map((_, k) => 1e6 * (k + 1)),
            measureLabel: "Omzet",
            dimensionLabel: "Bulan",
            format: RP,
            time: { iso, grain: "month", empty: 0 },
            reducedMotion: true,
          },
          theme,
          { width, height: 200 },
        ) as unknown as Cat;
        return {
          ks: iso.map((_, k) => k).filter((k) => o.xAxis.axisLabel.interval(k)),
          align: o.xAxis.axisLabel.alignMaxLabel,
        };
      };
      // 6 bulan di kartu lebar: semua label, label terakhir rata tengah (muat).
      expect(shown(6, 568)).toEqual({ ks: [0, 1, 2, 3, 4, 5], align: undefined });
      for (const [n, width] of [
        [21, 568],
        [21, 450],
        [26, 400],
      ] as const) {
        const { ks, align } = shown(n, width);
        expect(ks.at(-1)).toBe(n - 1);
        expect(align).toBe("right");
        // Jarak antarlabel sama (label pertama boleh lebih dekat bila ditambahkan).
        const gaps = ks.slice(1).map((k, i) => k - ks[i]!);
        expect(new Set(gaps.slice(1)).size, `${n}@${width}: ${ks.join(",")}`).toBeLessThanOrEqual(
          1,
        );
      }
    });
  });

  describe("daftar peringkat dan urutan", () => {
    it("pai: '+N kategori lain' (bukan 'lainnya' kedua di samping irisan Lainnya)", () => {
      withBox({ width: 176, height: 82 }, () => {
        const out = html("pie", data(top5(), { categories: 40, grandTotal: 100 }));
        expect(out).toContain('data-testid="chart-ranked"');
        expect(out).toMatch(/\+\d+ kategori lain</);
        expect(out).not.toMatch(/\+\d+ lainnya/);
        expect(out).toContain('title="Lainnya"');
      });
    });

    it("kartu < 110 px: label bertumpuk dipendekkan sesuai lebar, tidak melewati kartu", () => {
      const d: WidgetData = {
        columns: [
          { key: "d", label: "Waktu", type: "timestamp" },
          { key: "m", label: "Jumlah baris", type: "count" },
        ],
        rows: ["2025-12-31T21:00:00", "2025-12-31T18:00:00", "2025-12-31T10:00:00"].map((t, k) => [
          t,
          k + 1,
        ]),
      };
      const s = spec({ sort: "label_desc", topN: 365, measure: { agg: "count" } });
      for (const width of [66, 96, 109]) {
        withBox({ width, height: 272 }, () => {
          const out = html("line", d, false, s);
          // Teks yang tampil (label yang dipendekkan: span aria-hidden, lengkap untuk pembaca layar).
          const labels = [
            ...out.matchAll(
              /<span class="truncate text-muted-foreground" title="[^"]+">(?:<span aria-hidden="true">)?([^<]+)</g,
            ),
          ].map((m) => m[1]!);
          expect(labels.length).toBeGreaterThan(0);
          // ±7 px per karakter teks 12 px; isi daftar = lebar − px-2.
          for (const l of labels) {
            expect(l.length * 7, `${l} @${width}`).toBeLessThanOrEqual(Math.max(width - 16, 42));
          }
        });
      }
    });

    it("teks pada garis: urutan server ('Unit-5' sebelum 'Unit_4'); Z→A dibalik, kosong di akhir", () => {
      const rows = (keys: unknown[]) => keys.map((k) => [k, 1] as const);
      // ORDER BY v COLLATE nocase.noaccent, v (DuckDB) — bukan urutan ICU ('_' sebelum '-').
      const asc = rows(["unit 3", "Unit-5", "Unit_4", "KODE 01", "KODE-01", "KODE.01"]);
      expect(lineOrder(asc, "text", "label_asc").map((r) => r[0])).toEqual(asc.map((r) => r[0]));
      const desc = rows(["Unit_4", "Unit-5", "unit 3", null]);
      expect(lineOrder(desc, "text", "label_desc").map((r) => r[0])).toEqual([
        "unit 3",
        "Unit-5",
        "Unit_4",
        null,
      ]);
    });
  });

  it("ringkas mengikuti desimal pilihan untuk nilai yang tidak disingkat (sama dengan title)", () => {
    const pairs: [number, ChartSpec["format"]][] = [
      [12.345, RP],
      [0.125, RP],
      [0.004, { style: "number", decimals: 0 }],
      [0.468, { style: "percent", decimals: 0 }],
      [0.468, { style: "percent", decimals: 1 }],
    ];
    for (const [v, f] of pairs) {
      expect(formatMeasure(v, "decimal", f, true), `${v} ${f.style}`).toBe(
        formatMeasure(v, "decimal", f),
      );
    }
    expect(formatCompact(12.345, RP)).toBe("Rp 12");
    // Otomatis dan nilai besar tetap seperti sebelumnya.
    expect(formatCompact(0.004, AUTO)).toBe("0,004");
    expect(formatCompact(12.345, AUTO)).toBe("12,35");
    expect(formatCompact(405950, RP)).toBe("Rp 405,95 rb");
  });
});

describe("putaran 6", () => {
  const withBox = (size: { width: number; height: number }, run: () => void) => {
    box.size = size;
    try {
      run();
    } finally {
      box.size = null;
    }
  };
  /** Teks yang tampil di daftar peringkat (span aria-hidden bila dipendekkan). */
  const rankedShown = (out: string) =>
    [
      ...out.matchAll(
        /<span class="truncate text-muted-foreground" title="[^"]+">(?:<span aria-hidden="true">)?([^<]+)</g,
      ),
    ].map((m) => m[1]!);
  const LONG = "Kantor Perwakilan Wilayah Operasional Jabodetabek dan Sekitarnya";
  // Lebar tiruan font sistem 14 px (kepala kolom font-medium ±7,2 px, spasi 4 px).
  const font = (t: string) => [...t].reduce((w, ch) => w + (/\s/.test(ch) ? 4 : 7.2), 0);
  /** Baris yang dibutuhkan teks bila dibungkus kata demi kata (seperti peramban). */
  const lines = (text: string, room: number) => {
    let n = 1;
    let cur = "";
    for (const word of text.split(" ")) {
      const next = cur ? `${cur} ${word}` : word;
      if (font(next) <= room) cur = next;
      else {
        n++;
        cur = word;
      }
    }
    return n;
  };

  describe("tabel data bertumpuk: kepala kolom satu baris yang ikut tergulir", () => {
    it("kartu 178x128: thead tidak lengket, satu baris ringkas; semantik kolom tetap", () => {
      const d = data(
        [
          ["Kantor PCP Express Jakarta Pusat Gambir Unit 11", 350],
          ["Kantor PCP Express Bekasi Barat Kalimalang Unit 01", 10],
        ],
        {
          columns: [
            { key: "d", label: LONG, type: "text" },
            { key: "m", label: "Jumlah baris", type: "count" },
          ],
        },
      );
      withBox({ width: 178, height: 128 }, () => {
        const out = html("pie", d, true, spec({ measure: { agg: "count" } }));
        expect(out).toContain("data-stacked");
        const head = /<thead[^>]*>.*?<\/thead>/.exec(out)![0];
        // Tidak lengket dan tidak bertumpuk dua baris (53–93 px menutup wilayah 69–81 px).
        expect(head).not.toContain("sticky");
        expect(head).not.toContain("flex-col");
        expect(head).not.toContain("line-clamp-2");
        // Satu baris teks 12 px (py-1 + 16 px + garis = 25 px): wilayah 81 px masih memuat satu
        // baris bertumpuk utuh (±52 px) di bawahnya; setelah digulir kepala kolom ikut hilang.
        expect(head).toMatch(/<tr class="flex [^"]*py-1 text-xs[^"]*" role="row">/);
        // Dua kepala kolom tetap ada dan lengkap (title + isi untuk pembaca layar).
        expect([...head.matchAll(/role="columnheader"/g)]).toHaveLength(2);
        expect(head).toContain(`title="${LONG}" role="columnheader">${LONG}</th>`);
        expect(head).toContain('title="Jumlah baris" role="columnheader">Jumlah baris</th>');
        // Nama ukuran didahulukan (≤ 60 %); dimensi memakai sisa lebar.
        expect(head).toMatch(/class="min-w-0 flex-1 truncate[^"]*" title="Kantor/);
        expect(head).not.toContain("sr-only");
        expect(head).toMatch(/class="[^"]*max-w-\[60%\] shrink-0[^"]*" title="Jumlah baris"/);
      });
      // Kartu 109 px: "Ka… Jumla…" tidak terbaca — hanya nama ukuran yang tampil (selebar baris);
      // nama dimensi tetap kepala kolom untuk pembaca layar (label tiap baris sudah menunjukkannya).
      withBox({ width: 107, height: 128 }, () => {
        const head = /<thead[^>]*>.*?<\/thead>/.exec(
          html("pie", d, true, spec({ measure: { agg: "count" } })),
        )![0];
        expect(head).toMatch(
          /<th scope="col" class="[^"]*sr-only[^"]*" title="Kantor[^"]*" role="columnheader">/,
        );
        expect(head).toMatch(/<th scope="col" class="[^"]*truncate[^"]*" title="Jumlah baris"/);
        expect(head).not.toContain("max-w-[60%]");
        expect([...head.matchAll(/role="columnheader"/g)]).toHaveLength(2);
      });
      // Dua kolom berdampingan: kepala lengket dua baris tetap seperti sebelumnya.
      withBox({ width: 568, height: 300 }, () => {
        const out = html("pie", d, true, spec({ measure: { agg: "count" } }));
        expect(out).not.toContain("data-stacked");
        expect(out).toContain('<thead class="sticky top-0 bg-card">');
        expect(out).toContain('<span class="line-clamp-2 break-words">Jumlah baris</span>');
      });
    });

    it("kartu setinggi 2 baris grid (wilayah 81 px), dua kolom: kepala dua baris ikut tergulir", () => {
      const d = data(
        [
          ["Kantor PCP Express Jakarta Pusat Gambir Unit 01", 169028600],
          ["Kantor PCP Express Jakarta Barat Kebon Jeruk Unit 40", 168330000],
        ],
        {
          columns: [
            { key: "d", label: LONG, type: "text" },
            { key: "m", label: "Total Omzet", type: "decimal" },
          ],
        },
      );
      withBox({ width: 274, height: 81 }, () => {
        const out = html("bar", d, true, spec({ format: RP }));
        expect(out).not.toContain("data-stacked");
        expect(out).not.toContain("sticky");
        // Kepala lengket 53 px di wilayah 81 px menyisakan 28 px — tidak pernah satu baris utuh.
        expect(out).toContain('<span class="line-clamp-2 break-words">');
      });
      withBox({ width: 274, height: 225 }, () => {
        expect(html("bar", d, true, spec({ format: RP }))).toContain(
          '<thead class="sticky top-0 bg-card">',
        );
      });
    });
  });

  describe("kepala kolom nilai yang tidak muat dua baris: '…' eksplisit", () => {
    const H = "Total Pendapatan Bersih Setelah Potongan Diskon Cabang";
    const full = ["Rp 1.234.567", "Rp 987.654"];
    const compact = ["Rp 1,23 jt", "Rp 987,65 rb"];

    it("tableLayout 276/375 px: kepala dipendekkan dengan '…' dan muat dua baris", () => {
      for (const width of [276, 375]) {
        for (const measure of [(t: string) => font(t), undefined]) {
          const l = tableLayout(width, full, compact, { header: H, labelLength: 12, measure });
          const at = `@${width}${measure ? "" : " (perkiraan)"}`;
          expect(l.stacked, at).toBe(false);
          expect(l.header, at).toMatch(/…$/);
          expect(H.startsWith(l.header.slice(0, -1).trimEnd()), at).toBe(true);
          if (measure) expect(lines(l.header, l.valuePx! - 24), at).toBeLessThanOrEqual(2);
        }
      }
      // Kepala yang muat tidak diubah.
      expect(
        tableLayout(568, ["80"], ["80"], { header: "Jumlah baris", measure: font }).header,
      ).toBe("Jumlah baris");
      expect(fitTwoLines("Jumlah baris", 60, font)).toBe("Jumlah baris");
      expect(fitTwoLines(H, 100, font)).toMatch(/^Total Pendapatan.*…$/);
    });

    it("tabel 375 px: teks pendek untuk mata, nama lengkap di title dan untuk pembaca layar", () => {
      const d = data(
        [
          ["Bandung", 1234567],
          ["Medan", 987654],
        ],
        {
          columns: [
            { key: "d", label: "Cabang", type: "text" },
            { key: "m", label: H, type: "decimal" },
          ],
        },
      );
      withBox({ width: 375, height: 300 }, () => {
        const out = html("bar", d, true, spec({ format: RP }));
        expect(out).not.toContain("data-stacked");
        const th = new RegExp(
          `<th scope="col" class="[^"]*text-right[^"]*" title="${H}"><span class="line-clamp-2 break-words"><span aria-hidden="true">([^<]+…)</span><span class="sr-only">${H}</span></span></th>`,
        ).exec(out);
        expect(th).not.toBeNull();
        expect(H.startsWith(th![1]!.slice(0, -1).trimEnd())).toBe(true);
      });
    });
  });

  describe("daftar peringkat sempit: label diukur, periode tetap bisa dibedakan", () => {
    const weekRows = (isos: string[]): WidgetData => ({
      columns: [
        { key: "d", label: "Tanggal", type: "date" },
        { key: "m", label: "Total Omzet", type: "decimal" },
      ],
      rows: isos.map((iso, k) => [iso, 284750 - k * 1000]),
    });
    const weekly = spec({
      sort: "label_desc",
      topN: 365,
      dimension: { column: 1, timeGrain: "week" },
      format: RP,
    });

    it("minggu 2/23 Mar dan 12/19 Jan/15 Jun di kartu 96/109 px: tidak kembar, tidak dipotong di tengah", () => {
      const d = weekRows(["2026-06-15", "2026-03-23", "2026-03-02", "2026-01-19", "2026-01-12"]);
      for (const width of [96, 109]) {
        withBox({ width, height: 300 }, () => {
          const out = html("line", d, false, weekly);
          const shown = rankedShown(out);
          expect(shown, `@${width}`).toHaveLength(5);
          expect(new Set(shown).size, `@${width}`).toBe(5);
          for (const t of shown) expect(t, `@${width}`).not.toContain("…");
          // Tahun sama untuk semua baris: dibuang, bagian pembeda tetap utuh.
          expect(shown, `@${width}`).toContain("Mg 2 Mar");
          expect(shown, `@${width}`).toContain("Mg 23 Mar");
          // Label lengkap tetap untuk pembaca layar dan title.
          expect(out).toContain('<span class="sr-only">Mg 2 Mar 2026</span>');
          expect(out).toContain('title="Mg 23 Mar 2026"');
        });
      }
    });

    it("label yang muat menurut lebar terukur tidak dipotong; yang tidak muat dipendekkan seperlunya", () => {
      // Lebar terukur 12 px (canvas): 'Mg 2 Mar 2026' 87 px dalam 91 px, 'Jakarta Pusat' 77/92,
      // 'Lainnya' 43/66 — semuanya utuh (dulu 'Mg 2…ar 2026', 'Jaka…a Pusat', 'La…nya').
      const px = new Map([
        ["Mg 2 Mar 2026", 87],
        ["Mg 5 Jan 2026", 85],
        ["Jakarta Pusat", 77],
        ["Lainnya", 43],
      ]);
      const width = (t: string) => px.get(t) ?? [...t].length * 6.6;
      expect(rankedLabels([["Mg 2 Mar 2026", "Mg 5 Jan 2026"]], [91, 91], width, true)).toEqual([
        "Mg 2 Mar 2026",
        "Mg 5 Jan 2026",
      ]);
      expect(rankedLabels([["Jakarta Pusat", "Lainnya"]], [92, 66], width, false)).toEqual([
        "Jakarta Pusat",
        "Lainnya",
      ]);
      // Teks yang memang terlalu panjang: dipendekkan di tengah, tetap muat.
      const [kantor] = rankedLabels([["Kantor PCP Express Gambir Unit 11"]], [91], width, false);
      expect(kantor).toMatch(/^Kant.*…Unit 11$/);
      expect(width(kantor!)).toBeLessThanOrEqual(91);
      // Tanggal yang tetap tidak muat dalam bentuk terpendek (putaran 7): dipotong di tengah, tidak
      // kembar, muat — tidak pernah dipotong di akhir (bagian pembeda bisa hilang).
      const forms = dateLabelForms(["2025-12-29", "2026-01-05"], "week") as string[][];
      const tight = rankedLabels(forms, [40, 40], (t) => [...t].length * 7, true);
      expect(new Set(tight).size).toBe(2);
      for (const t of tight) {
        expect(t).not.toMatch(/…$/);
        expect([...t].length * 7).toBeLessThanOrEqual(40);
      }
    });

    it("bentuk tanggal pendek: tanpa tahun hanya bila tetap unik, angka bertahun selalu, jam saja bila sehari", () => {
      expect(dateLabelForms(["2026-03-02", "2026-03-23"], "week")).toEqual([
        ["Mg 2 Mar 2026", "Mg 23 Mar 2026"],
        ["Mg 2 Mar", "Mg 23 Mar"],
        ["Mg 2/3/26", "Mg 23/3/26"],
        ["Mg 2/3", "Mg 23/3"],
        ["2/3/26", "23/3/26"],
        ["2/3", "23/3"],
      ]);
      // Putaran 8: lintas tahun tetap boleh tanpa tahun selama tanggal/bulannya unik, tetapi angka
      // bertahun dicoba lebih dulu (tahun tetap terlihat selama muat).
      expect(dateLabelForms(["2025-12-29", "2026-01-05"], "day")).toEqual([
        ["29 Des 2025", "5 Jan 2026"],
        ["29/12/25", "5/1/26"],
        ["29 Des", "5 Jan"],
        ["29/12", "5/1"],
      ]);
      expect(dateLabelForms(["2025-12-29", "2024-12-29"], "day")).toEqual([
        ["29 Des 2025", "29 Des 2024"],
        ["29/12/25", "29/12/24"],
      ]);
      expect(
        dateLabelForms(["2025-12-31T21:00:00", "2025-12-31T18:00:00", null], undefined, true),
      ).toEqual([
        ["31 Des 2025 21:00", "31 Des 2025 18:00", null],
        ["31 Des 21:00", "31 Des 18:00", null],
        ["31/12/25 21:00", "31/12/25 18:00", null],
        ["31/12 21:00", "31/12 18:00", null],
        ["21:00", "18:00", null],
      ]);
      expect(dateLabelForms(["2026-01-01", "2026-04-01"], "quarter")).toEqual([
        ["K1 2026", "K2 2026"],
        ["K1", "K2"],
        ["K1/26", "K2/26"],
      ]);
    });

    it("garis per cap waktu di kartu 96 px: tanggal dan jam yang membedakan tetap terlihat", () => {
      const d: WidgetData = {
        columns: [
          { key: "d", label: "Waktu", type: "timestamp" },
          { key: "m", label: "Jumlah baris", type: "count" },
        ],
        rows: ["2025-12-31T21:00:00", "2025-12-31T18:00:00", "2025-12-31T10:00:00"].map((t, k) => [
          t,
          k + 1,
        ]),
      };
      withBox({ width: 96, height: 272 }, () => {
        const s = spec({ sort: "label_desc", topN: 365, measure: { agg: "count" } });
        expect(rankedShown(html("line", d, false, s))).toEqual([
          "31/12 21:00",
          "31/12 18:00",
          "31/12 10:00",
        ]);
      });
    });

    it("baris '+N' sebaris: '+N lagi' bila '+N kategori lain' tidak muat di samping nilai", () => {
      const rows = Array.from({ length: 5 }, (_, k) => [`Kantor ${k + 1}`, 669110000 - k * 1000]);
      withBox({ width: 152, height: 82 }, () => {
        const d = data(rows, { categories: 40, grandTotal: 4e9 });
        const out = html("pie", d, false, spec({ format: RP }));
        expect(out).toContain('data-testid="chart-ranked"');
        const more = /data-testid="chart-ranked-more">(.*?)<\/li>/.exec(out);
        expect(more).not.toBeNull();
        expect(more![1]).toMatch(/<span aria-hidden="true">\+\d+ lagi<\/span>/);
        expect(more![1]).toMatch(/<span class="sr-only">\+\d+ kategori lain<\/span>/);
      });
    });

    it("bertumpuk, '+N' tidak muat sebaris dan tak ada tempat di bawah label: nilai hanya di title/sr", () => {
      const rows = Array.from({ length: 5 }, (_, k) => [`Kantor ${k + 1}`, 669110000 - k * 1000]);
      withBox({ width: 109, height: 69 }, () => {
        const d = data(rows, { categories: 40, grandTotal: 4e9 });
        const out = html("pie", d, false, spec({ format: RP }));
        const more = /data-testid="chart-ranked-more">(.*?)<\/li>/.exec(out);
        expect(more).not.toBeNull();
        expect(more![1]).not.toContain("tabular-nums");
        expect(more![1]).toMatch(/title="[^"]*· Rp [^"]*"/);
        expect(more![1]).toMatch(/<span class="sr-only">[^<]*· Rp [^<]*<\/span>/);
      });
    });

    it("bertumpuk: nilai '+N' lebih lebar dari daftar (Rp ribuan triliun) hanya di title/sr", () => {
      const rows = Array.from({ length: 5 }, (_, k) => [`Kantor ${k + 1}`, 3.7e14 - k * 1e9]);
      withBox({ width: 94, height: 81 }, () => {
        const d = data(rows, { categories: 40, grandTotal: 4e15 });
        const out = html("pie", d, false, spec({ format: RP }));
        const more = /data-testid="chart-ranked-more">(.*?)<\/li>/.exec(out);
        expect(more).not.toBeNull();
        expect(more![1]).not.toContain("tabular-nums");
        expect(more![1]).toMatch(/<span class="sr-only">[^<]*· Rp [^<]*T<\/span>/);
      });
    });

    it("daftar lengkap yang baris terakhirnya tidak muat → '+N' wajib (bukan semua baris terpotong)", () => {
      const rows = Array.from({ length: 6 }, (_, k) => [`Cab ${k + 1}`, 60 - k]);
      withBox({ width: 109, height: 213 }, () => {
        // 4 + 6 × 36 = 220 > 213 → 5 baris (184) + '+N' 20 px = 204 ≤ 213.
        const out = html("bar", data(rows, { categories: 6 }), false, spec());
        expect((out.match(/<li /g) ?? []).length).toBe(6);
        expect(out).toContain('data-testid="chart-ranked-more"');
      });
      // rankedItems: force = '+N' walau semua baris "muat" menurut jumlah slot; Lainnya dihitung.
      const pie = [
        { value: 5, label: "A" },
        { value: 4, label: "B" },
        { value: 3, label: "C" },
        { value: 9, label: "Lainnya", others: true },
      ];
      const r = rankedItems(pie, 4, 10, true);
      expect(r.items.map((x) => x.label)).toEqual(["A", "B", "C"]);
      expect(r).toMatchObject({ more: 7, moreValue: 9 });
    });

    it("bertumpuk: nilai raksasa di luar kapasitas tidak mengurangi baris di atasnya", () => {
      const rows = [
        ["Cab 1", 77_700_000],
        ["Cab 2", 76_600_000],
        ["Cab 3", 75_500_000],
        ["Cab 4", 5.38788e15],
        ["Cab 5", 74_400_000],
      ];
      withBox({ width: 96, height: 153 }, () => {
        const out = html("bar", data(rows, { categories: 40 }), false, spec({ format: RP }));
        // 4 + 3 × 36 + 20 ('+N') = 132 ≤ 153 → 3 baris data + '+N' (bukan 1 baris seperti 52 px seragam).
        expect((out.match(/<li /g) ?? []).length).toBe(4);
      });
    });

    it("bertumpuk: baris yang nilainya lebih lebar dari daftar dihitung 52 px", () => {
      const rows = Array.from({ length: 6 }, (_, k) => [`Cab ${k + 1}`, 5.38788e15 - k * 1e12]);
      withBox({ width: 96, height: 153 }, () => {
        const d = data(rows, { categories: 40, grandTotal: 4e16 });
        const out = html("pie", d, false, spec({ format: RP }));
        const li = out.match(/<li /g) ?? [];
        // 4 + 52 + 52 + 20 ('+N') = 128 ≤ 153 → 2 baris data + '+N'; 3 baris data (180) tidak muat.
        expect(li.length).toBe(3);
      });
    });

    it("daftar bertumpuk: baris '+N' pai tetap sebaris bila muat (tidak keluar dari kartu pendek)", () => {
      const rows = Array.from({ length: 5 }, (_, k) => [`Kantor ${k + 1}`, 10 - k]);
      withBox({ width: 139, height: 82 }, () => {
        const d = data(rows, { categories: 40, grandTotal: 400 });
        const out = html("pie", d, false, spec());
        const li = /<li class="([^"]*)" data-testid="chart-ranked-more">/.exec(out);
        expect(li).not.toBeNull();
        expect(li![1]).toContain("items-baseline");
        expect(li![1]).not.toContain("flex-col");
      });
    });
  });

  describe("total gagal: daftar peringkat tidak tampak lengkap", () => {
    const rows = [
      ["Cabang Baru", 0],
      ["Medan", 270990],
      ["Surabaya", 307638],
    ];
    const asc3 = spec({ sort: "value_asc", topN: 3 });

    it("batang 3 terkecil tanpa total di kartu 100 px: '+? lagi', keterangan lengkap untuk pembaca layar", () => {
      withBox({ width: 100, height: 300 }, () => {
        const out = html("bar", data(rows), false, asc3);
        expect(out).toContain('data-testid="chart-ranked"');
        // Semua 3 baris yang dimuat tetap tampil + satu penanda.
        expect(rankedShown(out)).toEqual(["Cabang Baru", "Medan", "Surabaya"]);
        expect(out).toContain('<span aria-hidden="true">+? lagi</span>');
        expect(out).toContain(
          "Mungkin ada kategori lain — 3 kategori terkecil dimuat, jumlah keseluruhan tidak tersedia",
        );
      });
      // Total diketahui (3 dari 6): '+3' biasa, tanpa 'atau lebih'.
      withBox({ width: 100, height: 300 }, () => {
        const out = html("bar", data(rows, { categories: 6 }), false, asc3);
        expect(out).toMatch(/\+3 (lagi|kategori lain)/);
        expect(out).not.toContain("atau lebih");
        expect(out).not.toContain("tidak tersedia");
      });
      // Lebih sedikit dari batas N: memang lengkap, tanpa penanda.
      withBox({ width: 100, height: 300 }, () => {
        const out = html("bar", data(rows.slice(0, 2)), false, asc3);
        expect(out).not.toContain('data-testid="chart-ranked-more"');
      });
    });

    it("pai mini tanpa total: '+N atau lebih', tanpa nilai gabungan yang seolah lengkap", () => {
      withBox({ width: 177, height: 82 }, () => {
        const out = html("pie", data(top5()));
        expect(out).toContain('data-testid="chart-ranked"');
        const more = /data-testid="chart-ranked-more">(.*?)<\/li>/.exec(out)![1]!;
        expect(more).toContain('<span aria-hidden="true">+3 atau lebih</span>');
        expect(more).toContain(
          "+3 kategori lain atau lebih — 5 kategori terbesar dimuat, jumlah keseluruhan tidak tersedia",
        );
        expect(more).not.toContain("tabular-nums");
      });
    });
  });
});

// Lebar canvas font sistem 12 px (diukur di peramban; angka = "0" tabular) + 1 px seperti widget.
const GLYPH: Record<string, number> = {
  "0": 7.56,
  "/": 3.66,
  ":": 3.56,
  " ": 3.38,
  "…": 9.66,
  K: 7.9,
  M: 10.49,
  g: 7.31,
  J: 6.46,
  a: 6.62,
  n: 7,
  D: 8.72,
  e: 6.86,
  s: 6.28,
};
const sf = (t: string) => [...t.replace(/\d/g, "0")].reduce((w, ch) => w + (GLYPH[ch] ?? 7), 0) + 1;

describe("putaran 7", () => {
  const withBox = (size: { width: number; height: number }, run: () => void) => {
    box.size = size;
    try {
      run();
    } finally {
      box.size = null;
    }
  };
  const rankedShown = (out: string) =>
    [
      ...out.matchAll(
        /<span class="truncate text-muted-foreground[^"]*" title="[^"]+">(?:<span aria-hidden="true">)?([^<]+)</g,
      ),
    ].map((m) => m[1]!);
  const est = (t: string) => [...t].length * 6.6 + 1;
  const stamps = (isos: string[], values: number[]): WidgetData => ({
    columns: [
      { key: "d", label: "Waktu", type: "timestamp" },
      { key: "m", label: "Total Omzet", type: "decimal" },
    ],
    rows: isos.map((t, k) => [t, values[k] ?? 0]),
  });
  const byTime = spec({ sort: "label_desc", topN: 365, format: RP });

  describe("label tanggal daftar peringkat: tetap berbeda bila label lengkapnya berbeda", () => {
    const month = dateLabelForms(["2025-12-01", "2026-01-01", "2025-01-01"], "month") as string[][];
    const quarter = dateLabelForms(
      ["2025-10-01", "2026-01-01", "2025-01-01"],
      "quarter",
    ) as string[][];

    it("Jan 2025/Jan 2026 dan K1 2025/K1 2026 tidak kembar di ruang yang dulu bertabrakan", () => {
      // Dulu: 'Des 20…, Jan 20…, Jan 20…' (49 px) dan 'K4 20…, K1 20…, K1 20…' (45 px).
      expect(rankedLabels(month, [49, 49, 49], est, true)).toEqual(["12/25", "1/26", "1/25"]);
      expect(rankedLabels(quarter, [45, 45, 45], est, true)).toEqual(["K4/25", "K1/26", "K1/25"]);
      for (const forms of [month, quarter]) {
        for (const width of [est, sf]) {
          for (let room = 40; room <= 60; room++) {
            const out = rankedLabels(forms, [room, room, room], width, true);
            expect(new Set(out).size, `${out.join(",")} @${room}`).toBe(3);
            for (const t of out) {
              expect(t, `@${room}`).not.toContain("…");
              expect(width(t), `@${room}`).toBeLessThanOrEqual(room);
            }
          }
        }
      }
      // Tahun tidak pernah dibuang bila periodenya lintas tahun.
      expect(month.flat()).not.toContain("Jan");
      expect(quarter.flat()).not.toContain("K1");
    });

    it("label yang muat tidak dipendekkan", () => {
      expect(rankedLabels(quarter, [54, 54, 54], sf, true)).toEqual([
        "K4 2025",
        "K1 2026",
        "K1 2025",
      ]);
      expect(rankedLabels(month, [58, 58, 58], sf, true)).toEqual([
        "Des 2025",
        "Jan 2026",
        "Jan 2025",
      ]);
      // Satu bentuk untuk seluruh daftar: satu baris tidak muat → bentuk pendek untuk semua baris.
      expect(rankedLabels(month, [58, 50, 58], sf, true)).toEqual(["12/25", "1/26", "1/25"]);
      // Kartu 139 px (daftar bertumpuk 123 px): cap waktu lengkap.
      const d = stamps(["2025-12-31T18:00:00", "2026-01-01T03:15:00"], [5e6, 7e6]);
      withBox({ width: 139, height: 272 }, () => {
        expect(rankedShown(html("line", d, false, byTime))).toEqual([
          "1 Jan 2026 03:15",
          "31 Des 2025 18:00",
        ]);
      });
    });

    it("1 Jan 2026 03:15 + 31 Des 2025 18:00/15:15/12:30/10:00 di 78 px: 5 label berbeda", () => {
      const isos = [
        "2026-01-01T03:15:00",
        "2025-12-31T18:00:00",
        "2025-12-31T15:15:00",
        "2025-12-31T12:30:00",
        "2025-12-31T10:00:00",
      ];
      const forms = dateLabelForms(isos, undefined, true) as string[][];
      const rooms = isos.map(() => 78);
      // Dulu: '31/12/25 1…' untuk keempat jam 31 Des, lalu '31/1…18:00' (terbaca 31 Jan). Putaran 8:
      // bentuk tanpa tahun yang tetap unik, utuh.
      expect(rankedLabels(forms, rooms, sf, true)).toEqual([
        "1/1 03:15",
        "31/12 18:00",
        "31/12 15:15",
        "31/12 12:30",
        "31/12 10:00",
      ]);
      for (const width of [sf, est, (t: string) => [...t].length * 7]) {
        const out = rankedLabels(forms, rooms, width, true);
        expect(new Set(out).size).toBe(5);
        out.forEach((t, k) => {
          expect(width(t)).toBeLessThanOrEqual(78);
          // Tidak dipotong di akhir: jam yang membedakan tetap terlihat.
          expect(t.endsWith(isos[k]!.slice(11, 16))).toBe(true);
        });
      }
      // Daftar bertumpuk di kartu 96 px (ruang 80 px), lewat widget.
      withBox({ width: 96, height: 300 }, () => {
        const shown = rankedShown(html("line", stamps(isos, [1, 2, 3, 4, 5]), false, byTime));
        expect(shown).toHaveLength(5);
        expect(new Set(shown).size).toBe(5);
        for (const t of shown) expect(t).not.toMatch(/…$/);
      });
    });

    it("bila potongan tengah masih kembar, bagian akhir diperbanyak", () => {
      // Hanya menit yang berbeda: potongan biasa ('31/…:00') kembar; akhir yang lebih panjang tidak.
      const forms = [
        ["31 Des 2025 18:00", "31 Des 2025 19:00"],
        ["31/12/25 18:00", "31/12/25 19:00"],
      ];
      for (let room = 50; room <= 80; room += 2) {
        const out = rankedLabels(forms, [room, room], (t) => [...t].length * 7, true);
        expect(new Set(out).size, `${out.join(",")} @${room}`).toBe(2);
        for (const t of out) expect([...t].length * 7).toBeLessThanOrEqual(room);
      }
    });

    it("satu cap waktu yang tampil dari deret beberapa hari tidak pernah menjadi jam saja", () => {
      const all = [
        "2026-03-23T13:30:00",
        "2026-03-23T08:00:00",
        "2026-03-12T21:00:00",
        "2026-03-02T13:30:00",
        "2026-03-02T08:00:00",
      ];
      const one = dateLabelForms([all[0]!], undefined, true, all);
      expect(one.flat()).not.toContain("13:30");
      for (const [t] of one) expect(t).toMatch(/23/);
      // Dua baris yang tampil di hari yang sama: tetap bertanggal.
      expect(dateLabelForms(all.slice(0, 2), undefined, true, all).at(-1)).toEqual([
        "23/3 13:30",
        "23/3 08:00",
      ]);
      // Kartu sebaris 152 px (nilai rupiah), 2 baris + '+3 sebelumnya' (dulu '13:30', '08:00').
      withBox({ width: 152, height: 66 }, () => {
        const shown = rankedShown(
          html(
            "line",
            stamps(
              all,
              all.map(() => 1.24e9),
            ),
            false,
            byTime,
          ),
        );
        expect(shown).toHaveLength(2);
        for (const t of shown) expect(t).toMatch(/^23\//);
        expect(new Set(shown).size).toBe(2);
      });
    });

    it("deret yang memang sehari tetap '21:00'", () => {
      const all = ["2025-12-31T21:00:00", "2025-12-31T18:00:00", "2025-12-31T10:00:00"];
      expect(dateLabelForms(all, undefined, true).at(-1)).toEqual(["21:00", "18:00", "10:00"]);
      expect(dateLabelForms([all[0]!], undefined, true, all).at(-1)).toEqual(["21:00"]);
      withBox({ width: 80, height: 272 }, () => {
        const s = spec({ sort: "label_desc", topN: 365, measure: { agg: "count" } });
        const d = stamps(all, [1, 2, 3]);
        d.columns[1] = { key: "m", label: "Jumlah baris", type: "count" };
        expect(rankedShown(html("line", d, false, s))).toEqual(["21:00", "18:00", "10:00"]);
      });
    });

    it("nilai yang hanya beda angka memberi ruang label yang sama (angka diukur sebagai '0')", () => {
      // Canvas tanpa angka tabular: '1' jauh lebih sempit dari '8'. Halaman memakai angka tabular.
      const font = (t: string) =>
        [...t].reduce(
          (w, ch) => w + (ch === "1" ? 3 : /\d/.test(ch) ? 8 : /[\s.,:/]/.test(ch) ? 3.5 : 7),
          0,
        );
      canvas.measure = font;
      try {
        const isos = ["2026-03-23T13:30:00", "2026-03-18T21:00:00", "2026-03-12T08:00:00"];
        withBox({ width: 150, height: 68 }, () => {
          const d = stamps(isos, [1.11e9, 8.88e9, 1.11e9]);
          const shown = rankedShown(html("line", d, false, byTime));
          expect(shown).toHaveLength(3);
          expect(new Set(shown).size).toBe(3);
          // Bentuk dan panjang potongan sama untuk semua baris.
          expect(new Set(shown.map((t) => t.replace(/\d/g, "0"))).size).toBe(1);
        });
      } finally {
        canvas.measure = null;
      }
    });
  });
});

describe("putaran 8", () => {
  const withBox = (size: { width: number; height: number }, run: () => void) => {
    box.size = size;
    try {
      run();
    } finally {
      box.size = null;
    }
  };
  const rankedShown = (out: string) =>
    [
      ...out.matchAll(
        /<span class="truncate text-muted-foreground[^"]*" title="[^"]+">(?:<span aria-hidden="true">)?([^<]+)</g,
      ),
    ].map((m) => m[1]!);
  const at = (forms: (string | null)[][], room: number | number[]) =>
    rankedLabels(
      forms as string[][],
      forms[0]!.map((_, k) => (typeof room === "number" ? room : room[k]!)),
      sf,
      true,
    );
  const SERIES = [
    "2025-12-15",
    "2025-12-22",
    "2025-12-29",
    "2026-01-05",
    "2026-01-12",
    "2026-01-19",
  ];
  const STAMPS = [
    "2026-01-01T03:15:00",
    "2025-12-31T18:00:00",
    "2025-12-31T15:15:00",
    "2025-12-31T12:30:00",
    "2025-12-31T10:00:00",
  ];

  describe("label tanggal dipendekkan per bagian utuh, tidak pernah per huruf", () => {
    it("minggu 22/12/25, 15/12/25, 16/12/24 di 53,9 px: 3 label berbeda, masing-masing dengan harinya", () => {
      const isos = ["2025-12-22", "2025-12-15", "2024-12-16"];
      const forms = dateLabelForms(isos, "week");
      // Dulu 'Mg…/25 | Mg…/25 | Mg…/24' (kembar, tanpa hari dan bulan).
      expect(at(forms, 53.9)).toEqual(["22/12/25", "15/12/25", "16/12/24"]);
      for (let room = 30; room <= 170; room += 0.5) {
        const out = at(forms, room);
        expect(new Set(out).size, `${out.join(" | ")} @${room}`).toBe(3);
        out.forEach((t, k) =>
          expect(t, `@${room}`).toMatch(new RegExp(`^(Mg )?${Number(isos[k]!.slice(8))}(\\D|$)`)),
        );
      }
    });

    it("deret lintas tahun: tahun tetap terlihat selama bentuk bertahun muat", () => {
      const isos = ["2025-12-22", "2025-12-15", "2024-12-16"];
      // Daftar bertumpuk 96 px (ruang ±80 px): bukan 'Mg 22 Des | Mg 15 Des | Mg 16 Des' (2024 tak terlihat).
      expect(at(dateLabelForms(isos, "week"), 80)).toEqual([
        "Mg 22/12/25",
        "Mg 15/12/25",
        "Mg 16/12/24",
      ]);
      expect(at(dateLabelForms(isos, "day"), 53.9)).toEqual(["22/12/25", "15/12/25", "16/12/24"]);
      const months = ["2025-11-01", "2026-02-01", "2025-05-01", "2025-08-01"];
      expect(at(dateLabelForms(months.slice(2), "month", false, months), 53.9)).toEqual([
        "5/25",
        "8/25",
      ]);
      // Setahun: tahun tidak membedakan apa pun, teks tanpa tahun tetap lebih dulu.
      expect(at(dateLabelForms(["2026-03-02", "2026-03-23"], "week"), 80)).toEqual([
        "Mg 2 Mar",
        "Mg 23 Mar",
      ]);
    });

    it("Mg 19 Jan dan 12 Jan 2026 dari deret Des 2025–Jan 2026 di 53,9 px: 'Mg 19/1', 'Mg 12/1'", () => {
      const forms = dateLabelForms(["2026-01-19", "2026-01-12"], "week", false, SERIES);
      // Tanpa tahun tetap unik di seluruh deret walau lintas tahun. Dulu '…9/1/26 | …2/1/26'.
      expect(forms).toContainEqual(["Mg 19/1", "Mg 12/1"]);
      expect(at(forms, 53.9)).toEqual(["Mg 19/1", "Mg 12/1"]);
      // Satu minggu bertanggal/bulan sama di tahun lain: bentuk tanpa tahun tidak ditawarkan.
      const twice = dateLabelForms(["2026-01-12"], "week", false, ["2026-01-12", "2015-01-12"]);
      expect(twice.flat()).not.toContain("Mg 12/1");
      expect(twice.flat()).not.toContain("12/1");
      expect(twice.flat()).toContain("12/1/26");
    });

    it("satu baris bertanggal 12/1/26 (setelah 'Lainnya') tidak pernah kehilangan tanggal dan bulan", () => {
      const forms = dateLabelForms([null, "2026-01-12"], "week", false, [null, ...SERIES]).map(
        (f) => f.map((t) => t ?? "Lainnya"),
      );
      expect(at(forms, 53.9)).toEqual(["Lainnya", "Mg 12/1"]); // dulu 'Mg…/26'
      for (let room = 28; room <= 170; room += 0.5) {
        const [, t] = at(forms, room);
        expect(t, `@${room}`).toMatch(/^(Mg )?12( Jan|\/1)(\/26| 2026)?$/);
      }
    });

    it("31 Des 2025 / 1 Jan 2026 di 78 px dan lebih sempit: baris Desember tidak pernah '31/1'", () => {
      const forms = dateLabelForms(STAMPS, undefined, true);
      expect(at(forms, 78)).toEqual([
        "1/1 03:15",
        "31/12 18:00",
        "31/12 15:15",
        "31/12 12:30",
        "31/12 10:00",
      ]);
      for (let room = 30; room <= 170; room += 0.5) {
        const out = at(forms, room);
        expect(new Set(out).size, `${out.join(" | ")} @${room}`).toBe(5);
        out.forEach((t, k) => {
          expect(t, `@${room}`).not.toMatch(/\d…\d/);
          if (STAMPS[k]!.startsWith("2025-12"))
            expect(t, `@${room}`).not.toMatch(/(^|\D)31\/1(\D|$)/);
        });
      }
      // Daftar sebaris 152 px (ruang 53,9 px), dua baris yang tampil: hari dan bulan utuh.
      expect(at(dateLabelForms(STAMPS.slice(0, 2), undefined, true, STAMPS), 53.9)).toEqual([
        "1 Jan…",
        "31 Des…",
      ]);
    });

    it("cap waktu di hari yang sama dalam deret beberapa hari: jam utuh ('…13:30'), bukan '23…3:30'", () => {
      const all = [
        "2026-03-23T13:30:00",
        "2026-03-23T08:00:00",
        "2026-03-12T21:00:00",
        "2026-03-02T13:30:00",
        "2026-03-02T08:00:00",
      ];
      const forms = dateLabelForms(all.slice(0, 2), undefined, true, all);
      expect(forms.flat()).not.toContain("13:30");
      expect(at(forms, 53.9)).toEqual(["…13:30", "…08:00"]);
      // Cukup ruang: tanggal + jam utuh.
      expect(at(forms, 66)).toEqual(["23/3 13:30", "23/3 08:00"]);
    });

    it("sama banyak bagian: yang membuang lebih sedikit menang ('30/12 22…', bukan '30/12/25…')", () => {
      const all = [
        "2025-12-30T22:00:00",
        "2025-12-31T06:00:00",
        "2025-12-31T14:30:00",
        "2026-01-01T03:15:00",
        "2026-01-01T18:00:00",
      ];
      const forms = dateLabelForms([all[0]!, all[3]!], undefined, true, all);
      // Pai sebaris 152 px di 1280 (ruang 66,4 px): tanpa tahun unik di deret → jam lebih berguna.
      expect(at(forms, 66.4)).toEqual(["30/12 22…", "1/1 03…"]);
    });

    it("tanggal kembar di dua baris dan jam kembar di dua baris lain: tiap baris bagian pembedanya sendiri", () => {
      const isos = [
        "2025-12-18T12:15:00",
        "2025-12-18T20:45:00",
        "2026-02-18T14:30:00",
        "2025-12-17T14:30:00",
      ];
      const forms = dateLabelForms(isos, undefined, true);
      // Seragam '18/12…' kembar, seragam '…14:30' kembar: per baris, tetap utuh per bagian dan muat.
      expect(at(forms, 50)).toEqual(["…12:15", "…20:45", "18/2…", "17/12…"]);
    });

    it("daftar sebaris 152 px lewat widget: minggu lintas tahun 'Mg 19/1', bukan potongan per huruf", () => {
      // Lebar canvas 12 px (diukur di peramban), font-medium ±2,9 % lebih lebar.
      const VALUE: Record<string, number> = {
        R: 7.84,
        p: 7.32,
        j: 2.96,
        t: 4.36,
        ",": 3.56,
        ".": 3.56,
      };
      canvas.measure = (t, bold) =>
        [...t].reduce((w, ch) => w + (VALUE[ch] ?? GLYPH[ch] ?? 7), 0) * (bold ? 1.029 : 1);
      try {
        const d: WidgetData = {
          columns: [
            { key: "d", label: "Minggu", type: "date" },
            { key: "m", label: "Total Omzet", type: "decimal" },
          ],
          rows: [...SERIES].reverse().map((iso, k) => [iso, 711_340_000 - k * 4_920_000]),
        };
        const s = spec({
          sort: "label_desc",
          topN: 365,
          dimension: { column: 1, timeGrain: "week" },
          format: { style: "rupiah", decimals: 2 },
        });
        withBox({ width: 152, height: 66 }, () => {
          const out = html("line", d, false, s);
          const shown = rankedShown(out);
          expect(shown).toEqual(["Mg 19/1", "Mg 12/1"]);
          expect(out).toContain('title="Mg 19 Jan 2026"');
          expect(out).toContain('<span class="sr-only">Mg 12 Jan 2026</span>');
        });
      } finally {
        canvas.measure = null;
      }
    });
  });

  describe("sapuan acak berbenih: label tanggal selalu utuh per bagian, berbeda, dan benar", () => {
    const MON = [
      "Jan",
      "Feb",
      "Mar",
      "Apr",
      "Mei",
      "Jun",
      "Jul",
      "Agu",
      "Sep",
      "Okt",
      "Nov",
      "Des",
    ];
    type Grain = "week" | "day" | "month" | "quarter" | "stamp";
    // Bentuk yang benar untuk satu tanggal, disusun ulang di uji ini dari angkanya (bukan dari kode).
    const truth = (iso: string, grain: Grain): string[] => {
      const [, y, mo, d, hh, mm] = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/.exec(iso)!;
      const [D, M, yy] = [Number(d), Number(mo), y!.slice(2)];
      const mon = MON[M - 1]!;
      const q = `K${Math.floor((M - 1) / 3) + 1}`;
      const t = `${hh}:${mm}`;
      switch (grain) {
        case "week":
          return [
            `Mg ${D} ${mon} ${y}`,
            `Mg ${D} ${mon}`,
            `Mg ${D}/${M}/${yy}`,
            `Mg ${D}/${M}`,
            `${D}/${M}/${yy}`,
            `${D}/${M}`,
          ];
        case "month":
          return [`${mon} ${y}`, mon, `${M}/${yy}`];
        case "quarter":
          return [`${q} ${y}`, q, `${q}/${yy}`];
        case "stamp":
          return [
            `${D} ${mon} ${y} ${t}`,
            `${D} ${mon} ${t}`,
            `${D}/${M}/${yy} ${t}`,
            `${D}/${M} ${t}`,
            t,
          ];
        default:
          return [`${D} ${mon} ${y}`, `${D} ${mon}`, `${D}/${M}/${yy}`, `${D}/${M}`];
      }
    };
    /** Bentuk benar utuh, bagian awalnya yang utuh + "…", atau "…" + jam utuh (cap waktu). */
    const consistent = (label: string, iso: string, grain: Grain) => {
      const ok = truth(iso, grain);
      if (label.startsWith("…")) return grain === "stamp" && label.slice(1) === iso.slice(11, 16);
      if (!label.endsWith("…")) return ok.includes(label);
      const head = label.slice(0, -1);
      return ok.some((t) => t.startsWith(head) && /^[ /:]/.test(t.slice(head.length)));
    };
    // mulberry32: deret acak yang sama di setiap jalan.
    const prng = (seed: number) => () => {
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const DAY = 86_400_000;
    const pad = (n: number) => String(n).padStart(2, "0");
    const GRAINS: Grain[] = ["week", "day", "month", "quarter", "stamp"];
    // Satu hari, satu tahun, lintas tahun (Nov 2025–Feb 2026), beberapa tahun (2020–2026).
    const SPANS: [number, number][] = [
      [Date.UTC(2025, 11, 31), 1],
      [Date.UTC(2026, 0, 1), 365],
      [Date.UTC(2025, 10, 1), 120],
      [Date.UTC(2020, 0, 1), 7 * 365],
    ];

    /** Bentuk bertahun selain yang lengkap ('Mg 19/1/26', '19/1/26', '1/26', 'K1/26', '19/1/26 13:30'). */
    const withYear = (iso: string, grain: Grain) =>
      truth(iso, grain).filter((t) => /\/\d{2}( |$)/.test(t));

    it("2.000 daftar × ruang 30–170 px: utuh per bagian, berbeda, sesuai tanggalnya", () => {
      const rnd = prng(20261013);
      const pick = <T>(xs: readonly T[]) => xs[Math.floor(rnd() * xs.length)]!;
      const seen = { lists: 0, cut: 0, timeTail: 0, lastResort: 0, yearless: 0 };
      for (let run = 0; run < 2000; run++) {
        const grain = pick(GRAINS);
        const [from, days] = pick(SPANS);
        const n = 1 + Math.floor(rnd() * 50);
        const loaded = new Set<string>();
        for (let i = 0; i < n * 4 && loaded.size < n; i++) {
          let ms = from + Math.floor(rnd() * days) * DAY;
          const d = new Date(ms);
          if (grain === "week") ms -= ((d.getUTCDay() + 6) % 7) * DAY;
          if (grain === "month") ms = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
          if (grain === "quarter")
            ms = Date.UTC(d.getUTCFullYear(), Math.floor(d.getUTCMonth() / 3) * 3, 1);
          const iso = new Date(ms).toISOString().slice(0, 10);
          loaded.add(
            grain === "stamp"
              ? `${iso}T${pad(Math.floor(rnd() * 24))}:${pad(Math.floor(rnd() * 4) * 15)}:00`
              : iso,
          );
        }
        const all: (string | null)[] = [...loaded];
        // Baris yang tampil: sebagian acak dari yang dimuat, dicampur 'Lainnya' / '(kosong)'.
        const rows: { iso: string | null; text: string }[] = [...loaded]
          .sort(() => rnd() - 0.5)
          .slice(0, 1 + Math.floor(rnd() * Math.min(loaded.size, 15)))
          .map((iso) => ({ iso, text: "" }));
        if (rnd() < 0.4)
          rows.splice(Math.floor(rnd() * (rows.length + 1)), 0, { iso: null, text: "Lainnya" });
        if (rnd() < 0.3) {
          rows.splice(Math.floor(rnd() * (rows.length + 1)), 0, { iso: null, text: "(kosong)" });
          all.push(null);
        }
        const g = grain === "stamp" ? undefined : grain;
        const forms = dateLabelForms(
          rows.map((r) => r.iso),
          g,
          grain === "stamp",
          all,
        ).map((f) => f.map((t, k) => t ?? rows[k]!.text));
        const dated = rows.flatMap((r, k) => (r.iso ? [k] : []));
        const fulls = rows.map((r) => (r.iso ? formatDate(r.iso, g, grain === "stamp") : r.text));
        // Label lengkap pemilik setiap bentuk benar di antara SEMUA baris yang dimuat.
        const owners = new Map<string, Set<string>>();
        for (const iso of loaded)
          for (const t of truth(iso, grain))
            owners.set(t, (owners.get(t) ?? new Set()).add(formatDate(iso, g, grain === "stamp")));
        // Lebar bentuk unik terpendek: dari ruang ini ke atas semua label tanggal harus muat utuh.
        const shortest = Math.min(...forms.map((f) => Math.max(0, ...dated.map((k) => sf(f[k]!)))));
        const jitter = rnd() < 0.3;
        for (let room = 30; room <= 170; room += 10) {
          const rooms = rows.map(() => (jitter ? room - rnd() * 8 : room));
          const out = at(forms, rooms);
          seen.lists++;
          const tag = `${grain} ${rows.map((r) => r.iso ?? r.text).join(",")} @${room} → ${out.join(" | ")}`;
          // (b) Periode berbeda tidak pernah menjadi teks yang sama — di ruang berapa pun.
          for (const i of dated)
            for (const j of dated)
              if (i < j && fulls[i] !== fulls[j]) expect(out[i], tag).not.toBe(out[j]);
          if (Math.min(...rooms) >= shortest)
            for (const k of dated) expect(sf(out[k]!), tag).toBeLessThanOrEqual(rooms[k]!);
          let resort = false;
          for (const k of dated) {
            const t = out[k]!;
            const iso = rows[k]!.iso!;
            // (a) Tidak ada '…' di antara dua angka; setiap deret angka utuh dari bentuk lengkap barisnya.
            expect(t, tag).not.toMatch(/\d…\d/);
            const runs = new Set(forms.flatMap((f) => f[k]!.match(/\d+/g) ?? []));
            for (const r of t.match(/\d+/g) ?? []) expect(runs.has(r), `${r} ${tag}`).toBe(true);
            // (c) Bagian yang tampil sesuai tanggal/jam baris itu sendiri.
            expect(consistent(t, iso, grain), tag).toBe(true);
            if (!t.includes("…")) {
              // Label utuh tidak mungkin tertukar dengan baris lain yang dimuat.
              expect([...(owners.get(t) ?? [])], tag).toEqual([fulls[k]]);
              if (sf(t) > rooms[k]!) resort = true;
              if (!truth(iso, grain).slice(0, 1).concat(withYear(iso, grain)).includes(t))
                seen.yearless++;
            } else {
              seen.cut++;
              if (t.startsWith("…")) seen.timeTail++;
              expect(sf(t), tag).toBeLessThanOrEqual(rooms[k]!);
            }
          }
          if (resort) seen.lastResort++;
          // Baris bukan tanggal tetap teksnya (atau dipotong di tengah bila tidak muat).
          rows.forEach((r, k) => {
            if (!r.iso) expect(out[k] === r.text || /…/.test(out[k]!), tag).toBe(true);
          });
        }
      }
      // Sapuan memang melewati semua jalur: utuh tanpa tahun, dipotong per bagian, jam saja, upaya akhir.
      expect(seen.lists).toBe(30_000);
      expect(seen.yearless).toBeGreaterThan(1000);
      expect(seen.cut).toBeGreaterThan(100);
      expect(seen.timeTail).toBeGreaterThan(10);
      expect(seen.lastResort).toBeGreaterThan(0);
    }, 60_000);
  });

  it("baris tampil berjarak ≥ 1 tahun: bentuk tanpa tahun tidak ditawarkan", () => {
    const forms = dateLabelForms(["2025-12-22", "2025-12-15", "2024-12-16"], "day") as string[][];
    for (const f of forms) expect(f.every((l) => /2024|2025|\/2[45]\b/.test(l))).toBe(true);
    // Des → Jan berurutan (< 1 tahun) tetap boleh tanpa tahun.
    expect(dateLabelForms(["2025-12-31", "2026-01-01"], "day").flat()).toContain("31/12");
  });
});

describe("putaran 9: daftar inline bertumpuk bila tanggal tidak muat; tahun untuk 52 minggu", () => {
  it("strict: tanggal+jam berulang di 53,9 px → null (pemanggil menumpuk), bukan potongan CSS", () => {
    const isos = ["2026-03-23T13:30", "2026-03-23T08:00", "2026-03-22T13:30"];
    const forms = dateLabelForms(isos, undefined, true) as string[][];
    expect(rankedLabels(forms, [53.9, 53.9, 53.9], sf, true, true)).toBeNull();
    // Lebar bertumpuk (±136 px): label utuh, berbeda.
    const stacked = rankedLabels(forms, [136, 136, 136], sf, true, true)!;
    expect(new Set(stacked).size).toBe(3);
    expect(stacked.every((l) => !l.includes("…"))).toBe(true);
  });

  it("dua minggu berselisih 52 minggu (beda tahun kalender) tetap memuat tahun", () => {
    const forms = dateLabelForms(["2025-12-22", "2024-12-23"], "week") as string[][];
    for (const f of forms) expect(f.every((l) => /2024|2025|\/2[45]\b/.test(l))).toBe(true);
  });
});
