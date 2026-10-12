import type { ChartType, NumberFormat } from "@/features/widgets/spec";
import { formatAxis, formatNumber } from "@/features/widgets/format";

/*
 * Opsi ECharts dari hasil query widget (T-011). Semua teks (label, tooltip) dirender sebagai teks:
 * tooltip renderMode "richText" + formatter yang mengembalikan string biasa, label sumbu/pai lewat
 * formatter fungsi — nilai sel atau nama kolom berisi HTML tidak pernah menjadi markup (AC 7).
 * Opsi menyesuaikan ukuran kartu (review desain T-011 H2/H3): lebar label sebanding lebar grafik dan
 * dipendekkan di tengah (nama berawalan sama tetap bisa dibedakan), jumlah garis sumbu mengecil di
 * kartu sempit, label pai disembunyikan di kartu kecil (legenda HTML mengambil alih). Warna dari token
 * --chart-1…6 (dibaca saat render, ikut tema). Murni.
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
  /** Pai: jumlah ukuran kategori di luar N teratas (irisan "Lainnya"); 0/undefined = tidak ada. */
  others?: number;
  reducedMotion: boolean;
}

export interface ChartSize {
  width: number;
  height: number;
}

/** Lebar minimal agar label pai di luar lingkaran masih terbaca; di bawahnya pakai legenda HTML. */
export const PIE_LABEL_MIN_WIDTH = 320;
export const OTHERS_LABEL = "Lainnya";

/** Perkiraan lebar karakter 12 px (huruf campuran) untuk memotong label sebelum ECharts mengukur. */
const CHAR_PX = 6.6;

/** "Kantor PCP Express Gambir Unit 11" → "Kantor PCP…Gambir Unit 11": awal + akhir tetap terlihat. */
export function middleTruncate(text: string, maxChars: number): string {
  if (text.length <= maxChars || maxChars < 5) return text;
  const tail = Math.ceil((maxChars - 1) * 0.55);
  const head = maxChars - 1 - tail;
  return `${text.slice(0, head).trimEnd()}…${text.slice(text.length - tail).trimStart()}`;
}

/** Teks tooltip richText: "{a|b}" ditafsirkan sebagai gaya ECharts → disisipi spasi lebar-nol. */
const plain = (s: string) => s.replace(/\{/g, "{​");

/** Ringkasan untuk pembaca layar (rincian lengkap ada di tabel data). */
export function chartSummary(
  i: Pick<ChartInput, "type" | "labels" | "measureLabel" | "dimensionLabel">,
  categories?: number,
) {
  const kind = i.type === "bar" ? "batang" : i.type === "line" ? "garis" : "pai";
  const noun = i.type === "line" ? "titik" : "kategori";
  const shown = i.labels.length;
  const count =
    categories && categories > shown
      ? `${shown} dari ${categories} ${noun}${i.type === "pie" ? ", sisanya digabung sebagai Lainnya" : ""}`
      : `${shown} ${noun}`;
  return `Grafik ${kind}: ${i.measureLabel} per ${i.dimensionLabel}, ${count}.`;
}

const splitNumber = (px: number) => (px < 240 ? 2 : px < 420 ? 3 : 5);

export function chartOption(i: ChartInput, theme: ChartTheme, size: ChartSize) {
  const value = (v: unknown) => (typeof v === "number" ? formatNumber(v, i.format) : "(kosong)");
  const tooltip = {
    renderMode: "richText" as const,
    backgroundColor: theme.card,
    borderColor: theme.border,
    textStyle: { color: theme.text, fontSize: 12, fontFamily: theme.font },
    confine: true,
  };
  const base = {
    color: theme.colors,
    animation: !i.reducedMotion,
    textStyle: { color: theme.muted, fontFamily: theme.font },
  };

  if (i.type === "pie") {
    const withLabels = size.width >= PIE_LABEL_MIN_WIDTH && size.height >= 200;
    const labelChars = Math.max(6, Math.floor((size.width * 0.28) / CHAR_PX));
    const data = i.labels.map((name, k) => ({ name, value: i.values[k] ?? 0 }));
    if (i.others && i.others > 0) {
      // Irisan sisa memakai warna terakhir palet (abu-biru) — tidak tertukar dengan 5 irisan teratas.
      data.push({
        name: OTHERS_LABEL,
        value: i.others,
        itemStyle: { color: theme.colors[5] ?? theme.muted },
      } as (typeof data)[number]);
    }
    return {
      ...base,
      tooltip: {
        ...tooltip,
        trigger: "item" as const,
        formatter: (p: { name: string; value: unknown; percent: number }) =>
          `${plain(p.name)}\n${value(p.value)} (${formatNumber(p.percent / 100, { style: "percent", decimals: 1 })})`,
      },
      series: [
        {
          type: "pie" as const,
          radius: withLabels ? ["40%", "64%"] : ["48%", "82%"],
          center: ["50%", "50%"],
          avoidLabelOverlap: true,
          minShowLabelAngle: 6,
          itemStyle: { borderColor: theme.card, borderWidth: 2 },
          label: {
            show: withLabels,
            color: theme.text,
            fontFamily: theme.font,
            lineHeight: 16,
            // Label menempel ke tepi kartu — tidak keluar kartu.
            alignTo: "edge" as const,
            edgeDistance: 8,
            formatter: (p: { name: string; percent: number }) =>
              `${middleTruncate(p.name, labelChars)}\n${formatNumber(p.percent / 100, { style: "percent", decimals: 0 })}`,
          },
          labelLine: { show: withLabels, lineStyle: { color: theme.border } },
          data,
        },
      ],
    };
  }

  // Batang horizontal: nama kategori panjang tetap terbaca; urutan dari atas, semua label tampil.
  const horizontal = i.type === "bar";
  const labelPx = horizontal
    ? Math.round(Math.min(Math.max(size.width * 0.38, 56), 180))
    : Math.round(Math.min(Math.max(size.width / Math.max(i.labels.length, 1), 48), 120));
  const labelChars = Math.max(5, Math.floor(labelPx / CHAR_PX));
  const categoryAxis = {
    type: "category" as const,
    data: i.labels,
    axisLine: { lineStyle: { color: theme.border } },
    axisTick: { show: false },
    axisLabel: {
      color: theme.muted,
      ...(horizontal ? { interval: 0 } : { hideOverlap: true }),
      formatter: (v: string) => middleTruncate(v, labelChars),
    },
  };
  const valuePx = horizontal ? size.width - labelPx : size.height;
  const valueAxis = {
    type: "value" as const,
    // Satuan sekali di nama sumbu, bukan di tiap angka.
    name: i.format.style === "rupiah" ? "Rp" : "",
    nameTextStyle: { color: theme.muted, fontFamily: theme.font },
    splitNumber: splitNumber(valuePx),
    splitLine: { lineStyle: { color: theme.border } },
    axisLabel: {
      color: theme.muted,
      hideOverlap: true,
      formatter: (v: number) => formatAxis(v, i.format),
    },
  };
  return {
    ...base,
    grid: { left: 8, right: 24, top: 16, bottom: 8, containLabel: true },
    tooltip: {
      ...tooltip,
      trigger: "axis" as const,
      axisPointer: { type: horizontal ? ("shadow" as const) : ("line" as const) },
      formatter: (params: { name: string; value: unknown }[]) => {
        const p = params[0];
        return p ? `${plain(p.name)}\n${plain(i.measureLabel)}: ${value(p.value)}` : "";
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
          : { barMaxWidth: 32, barCategoryGap: "30%", itemStyle: { borderRadius: [0, 4, 4, 0] } }),
      },
    ],
  };
}

/** Bar per 18 px tinggi kartu: lebih dari itu label bertabrakan → tampilkan N teratas saja. */
export const barsThatFit = (height: number) => Math.max(1, Math.floor((height - 32) / 18));
