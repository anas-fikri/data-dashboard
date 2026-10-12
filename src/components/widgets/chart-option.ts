import type { ChartType, NumberFormat } from "@/features/widgets/spec";
import { formatAxis, formatDate, formatNumber } from "@/features/widgets/format";

/*
 * Opsi ECharts dari hasil query widget (T-011). Semua teks (label, tooltip) dirender sebagai teks:
 * tooltip renderMode "richText" + formatter yang mengembalikan string biasa, label sumbu lewat
 * formatter fungsi — nilai sel atau nama kolom berisi HTML tidak pernah menjadi markup (AC 7).
 * Opsi menyesuaikan ukuran kartu (review desain T-011 H2/H3): lebar label teks sebanding lebar grafik
 * dan dipendekkan di tengah (nama berawalan sama tetap bisa dibedakan; tanggal tidak dipotong), garis
 * sumbu lebih sedikit di kartu sempit. Grafik garis berdimensi tanggal memakai sumbu waktu (periode
 * kosong tampak sebagai celah). Pai tanpa label luar — legenda HTML di bawah/samping. Murni.
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
  /** Label kategori berupa teks bebas (boleh dipendekkan di tengah); tanggal/angka tidak. */
  textLabels?: boolean;
  /** Garis dengan dimensi tanggal: nilai ISO mentah per titik (null = tanggal kosong) + grain. */
  time?: { iso: (string | null)[]; grain?: string };
  reducedMotion: boolean;
}

export interface ChartSize {
  width: number;
  height: number;
}

export const OTHERS_LABEL = "Lainnya";

/** Perkiraan lebar karakter 12 px (huruf campuran) untuk memotong label sebelum ECharts mengukur. */
const CHAR_PX = 6.6;

/** "Kantor PCP Express Gambir Unit 11" → "Kantor P…bir Unit 11": awal + akhir tetap terlihat. */
export function middleTruncate(text: string, maxChars: number): string {
  if (text.length <= maxChars || maxChars < 5) return text;
  const tail = Math.ceil((maxChars - 1) * 0.55);
  const head = maxChars - 1 - tail;
  return `${text.slice(0, head).trimEnd()}…${text.slice(text.length - tail).trimStart()}`;
}

/** Teks tooltip richText: "{a|b}" ditafsirkan sebagai gaya ECharts → disisipi spasi lebar-nol. */
const plain = (s: string) => s.replace(/\{/g, "{​");

/**
 * Persen bulat yang jumlahnya tepat 100 (metode sisa terbesar) — label/legenda pai tidak berjumlah
 * 99 % atau 101 % (review integritas T-011). Nilai harus ≥ 0.
 */
export function percentShares(values: number[]): number[] {
  const total = values.reduce((s, v) => s + v, 0);
  if (total <= 0) return values.map(() => 0);
  const raw = values.map((v) => (v / total) * 100);
  const out = raw.map(Math.floor);
  let rest = 100 - out.reduce((s, v) => s + v, 0);
  const order = raw.map((v, i) => ({ i, frac: v - Math.floor(v) })).sort((a, b) => b.frac - a.frac);
  for (const { i } of order) {
    if (rest <= 0) break;
    out[i]! += 1;
    rest -= 1;
  }
  return out;
}

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

const msToIso = (ms: number) => new Date(ms).toISOString().slice(0, 19);
/** ISO naive → milidetik UTC (ECharts membaca string tanggal sebagai waktu lokal; di sini semua UTC). */
export function isoToUtcMs(iso: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2}))?)?/.exec(iso);
  if (!m) return null;
  const [, y, mo, d, h = "0", mi = "0", se = "0"] = m;
  return Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(se));
}

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
    const data = i.labels.map((name, k) => ({ name, value: i.values[k] ?? 0 }));
    if (i.others && i.others > 0) {
      // Irisan sisa memakai warna terakhir palet — tidak tertukar dengan 5 irisan teratas.
      data.push({
        name: OTHERS_LABEL,
        value: i.others,
        itemStyle: { color: theme.colors[5] ?? theme.muted },
      } as (typeof data)[number]);
    }
    const shares = percentShares(data.map((d) => Math.max(0, d.value)));
    return {
      ...base,
      tooltip: {
        ...tooltip,
        trigger: "item" as const,
        formatter: (p: { name: string; value: unknown; dataIndex: number }) =>
          `${plain(p.name)}\n${value(p.value)} (${shares[p.dataIndex] ?? 0}%)`,
      },
      series: [
        {
          type: "pie" as const,
          radius: ["50%", "86%"],
          center: ["50%", "50%"],
          itemStyle: { borderColor: theme.card, borderWidth: 2 },
          // Tanpa label luar: nama + persen di legenda HTML (tidak terpotong "…" di kartu sempit).
          label: { show: false },
          labelLine: { show: false },
          data,
        },
      ],
    };
  }

  const horizontal = i.type === "bar";
  const labelPx = horizontal
    ? Math.round(Math.min(Math.max(size.width * 0.38, 56), 180))
    : Math.round(Math.min(Math.max(size.width / Math.max(i.labels.length, 1), 48), 120));
  const labelChars = Math.max(5, Math.floor(labelPx / CHAR_PX));
  const unit = i.format.style === "rupiah" ? "Rp" : "";
  const valuePx = horizontal ? size.width - labelPx : size.height;
  const valueAxis = {
    type: "value" as const,
    // Satuan sekali di nama sumbu, bukan di tiap angka.
    name: unit,
    nameGap: horizontal ? 10 : 14,
    nameTextStyle: {
      color: theme.muted,
      fontFamily: theme.font,
      align: horizontal ? "left" : "center",
    },
    splitNumber: splitNumber(valuePx),
    splitLine: { lineStyle: { color: theme.border } },
    axisLabel: {
      color: theme.muted,
      hideOverlap: true,
      formatter: (v: number) => formatAxis(v, i.format),
    },
  };
  const grid = {
    left: 8,
    // Ruang untuk nama satuan di ujung sumbu (tidak menimpa angka terakhir / terpotong di atas).
    right: unit && horizontal ? 32 : 16,
    top: unit && !horizontal ? 28 : 16,
    bottom: 8,
    containLabel: true,
  };
  const axisTooltip = {
    ...tooltip,
    trigger: "axis" as const,
    axisPointer: { type: horizontal ? ("shadow" as const) : ("line" as const) },
  };

  if (i.type === "line" && i.time) {
    const grain = i.time.grain;
    // Titik bertanggal kosong tidak diplot (tetap ada di tabel data); urut waktu naik.
    const points = i.time.iso
      .map((iso, k) => {
        const ms = iso ? isoToUtcMs(iso) : null;
        return ms === null ? null : ([ms, i.values[k] ?? null] as [number, number | null]);
      })
      .filter((p): p is [number, number | null] => p !== null)
      .sort((a, b) => a[0] - b[0]);
    return {
      ...base,
      // Tick dan label sumbu waktu dalam UTC, sama dengan nilai tanggal naive dari DuckDB.
      useUTC: true,
      grid,
      tooltip: {
        ...axisTooltip,
        formatter: (params: { value: [number, unknown] }[]) => {
          const p = params[0];
          if (!p) return "";
          return `${formatDate(msToIso(p.value[0]), grain)}\n${plain(i.measureLabel)}: ${value(p.value[1])}`;
        },
      },
      xAxis: {
        type: "time" as const,
        axisLine: { lineStyle: { color: theme.border } },
        splitLine: { show: false },
        axisLabel: {
          color: theme.muted,
          hideOverlap: true,
          formatter: (ms: number) => formatDate(msToIso(ms), grain),
        },
      },
      yAxis: valueAxis,
      series: [
        {
          type: "line" as const,
          name: i.measureLabel,
          data: points,
          showSymbol: points.length <= 60,
          connectNulls: false,
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
      ...(horizontal ? { interval: 0 } : { hideOverlap: true }),
      formatter: (v: string) => (i.textLabels ? middleTruncate(v, labelChars) : v),
    },
  };
  return {
    ...base,
    grid,
    tooltip: {
      ...axisTooltip,
      formatter: (params: { name: string; value: unknown }[]) => {
        const p = params[0];
        return p ? `${plain(p.name)}\n${plain(i.measureLabel)}: ${value(p.value)}` : "";
      },
    },
    // Batang horizontal: nama kategori panjang tetap terbaca; urutan dari atas, semua label tampil.
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
