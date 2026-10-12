import type { ChartType, NumberFormat } from "@/features/widgets/spec";
import { formatAxis, formatNumber } from "@/features/widgets/format";

/*
 * Opsi ECharts dari hasil query widget (T-011). Semua teks (label, tooltip) dirender sebagai teks:
 * tooltip renderMode "richText" + formatter yang mengembalikan string biasa, label sumbu/pai lewat
 * formatter fungsi — nilai sel atau nama kolom berisi HTML tidak pernah menjadi markup (AC 7).
 * Warna dari token --chart-1…6 (dibaca saat render, ikut tema terang/gelap). Murni.
 */
export interface ChartTheme {
  colors: string[];
  text: string;
  muted: string;
  border: string;
  card: string;
  /** Font halaman yang sebenarnya (ECharts mengukur label dengan font ini; "inherit" tidak bisa diukur). */
  font: string;
}

export interface ChartInput {
  type: ChartType;
  /** Label kategori yang sudah diformat (tanggal id-ID, "(kosong)", dst.). */
  labels: string[];
  values: (number | null)[];
  measureLabel: string;
  dimensionLabel: string;
  format: NumberFormat;
  reducedMotion: boolean;
}

const LABEL_WIDTH = 120;

/** Ringkasan untuk pembaca layar (rincian lengkap ada di tabel data tersembunyi). */
export function chartSummary(
  i: Pick<ChartInput, "type" | "labels" | "measureLabel" | "dimensionLabel">,
) {
  const kind = i.type === "bar" ? "batang" : i.type === "line" ? "garis" : "pai";
  return `Grafik ${kind}: ${i.measureLabel} per ${i.dimensionLabel}, ${i.labels.length} kategori. Rincian nilai ada di tabel data.`;
}

export function chartOption(i: ChartInput, theme: ChartTheme) {
  const value = (v: unknown) => (typeof v === "number" ? formatNumber(v, i.format) : "(kosong)");
  const tooltip = {
    renderMode: "richText" as const,
    backgroundColor: theme.card,
    borderColor: theme.border,
    textStyle: { color: theme.text, fontSize: 12 },
  };
  const base = {
    color: theme.colors,
    animation: !i.reducedMotion,
    textStyle: { color: theme.muted, fontFamily: theme.font },
  };

  if (i.type === "pie") {
    return {
      ...base,
      tooltip: {
        ...tooltip,
        trigger: "item" as const,
        formatter: (p: { name: string; value: unknown; percent: number }) =>
          `${p.name}\n${value(p.value)} (${formatNumber(p.percent / 100, { style: "percent", decimals: 1 })})`,
      },
      series: [
        {
          type: "pie" as const,
          radius: ["42%", "68%"],
          avoidLabelOverlap: true,
          minShowLabelAngle: 8,
          itemStyle: { borderColor: theme.card, borderWidth: 2 },
          label: {
            color: theme.text,
            fontFamily: theme.font,
            lineHeight: 16,
            // Label menempel ke tepi kartu dan dipotong di sana — tidak keluar kartu di layar sempit.
            alignTo: "edge" as const,
            edgeDistance: 8,
            width: LABEL_WIDTH,
            overflow: "truncate" as const,
            formatter: (p: { name: string; percent: number }) =>
              `${p.name}\n${formatNumber(p.percent / 100, { style: "percent", decimals: 0 })}`,
          },
          labelLine: { lineStyle: { color: theme.border } },
          data: i.labels.map((name, k) => ({ name, value: i.values[k] ?? 0 })),
        },
      ],
    };
  }

  const categoryAxis = {
    type: "category" as const,
    data: i.labels,
    axisLine: { lineStyle: { color: theme.border } },
    axisTick: { show: false },
    axisLabel: {
      color: theme.muted,
      width: LABEL_WIDTH,
      overflow: "truncate" as const,
      formatter: (v: string) => v,
    },
  };
  const valueAxis = {
    type: "value" as const,
    splitLine: { lineStyle: { color: theme.border } },
    axisLabel: { color: theme.muted, formatter: (v: number) => formatAxis(v, i.format) },
  };
  // Batang horizontal: nama kategori panjang (cabang, produk) tetap terbaca; urutan dari atas.
  const horizontal = i.type === "bar";
  return {
    ...base,
    grid: { left: 8, right: 16, top: 12, bottom: 8, containLabel: true },
    tooltip: {
      ...tooltip,
      trigger: "axis" as const,
      axisPointer: { type: horizontal ? ("shadow" as const) : ("line" as const) },
      formatter: (params: { name: string; value: unknown }[]) => {
        const p = params[0];
        return p ? `${p.name}\n${i.measureLabel}: ${value(p.value)}` : "";
      },
    },
    xAxis: horizontal ? valueAxis : categoryAxis,
    yAxis: horizontal ? { ...categoryAxis, inverse: true } : valueAxis,
    series: [
      {
        type: i.type,
        name: i.measureLabel,
        data: i.values,
        ...(i.type === "line"
          ? { smooth: false, showSymbol: i.values.length <= 60, connectNulls: false }
          : { barMaxWidth: 32, itemStyle: { borderRadius: [0, 4, 4, 0] } }),
      },
    ],
  };
}
