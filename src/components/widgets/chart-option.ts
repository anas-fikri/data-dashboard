import { TOP_N_MAX, type ChartType, type NumberFormat } from "@/features/widgets/spec";
import {
  AUTO_FORMAT,
  formatAxis,
  formatDate,
  formatMeasure,
  type ValueType,
} from "@/features/widgets/format";
import {
  durationScale,
  hasIsolated,
  isoToUtcMs,
  middleTruncate,
  msToIso,
  percentShares,
  timeBuckets,
} from "./chart-series";

export { isoToUtcMs, middleTruncate, percentShares } from "./chart-series";

/*
 * Opsi ECharts dari hasil query widget (T-011). Semua teks (label, tooltip) dirender sebagai teks:
 * tooltip renderMode "richText" + formatter yang mengembalikan string biasa, label sumbu lewat
 * formatter fungsi — nilai sel atau nama kolom berisi HTML tidak pernah menjadi markup (AC 7).
 * Opsi menyesuaikan ukuran kartu (review desain T-011 H2/H3): lebar label teks sebanding lebar grafik
 * dan dipendekkan di tengah (nama berawalan sama tetap bisa dibedakan; tanggal tidak dipotong), garis
 * sumbu lebih sedikit di kartu sempit. Garis per minggu/bulan/kuartal/tahun: sumbu kategori berisi
 * periode kontinu (satu label = satu periode nyata; periode kosong diisi); per hari/tanpa grain: sumbu
 * waktu UTC. Durasi (detik) di sumbu dalam jam/menit, di tooltip j:mm:dd. Pai tanpa label luar —
 * legenda HTML di bawah/samping. Murni.
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
  /**
   * Garis dengan dimensi tanggal: nilai ISO mentah per titik (null = tanggal kosong) + grain + nilai
   * periode tanpa data (0 = total/jumlah, null = garis putus; bawaan null).
   */
  time?: { iso: (string | null)[]; grain?: string; empty?: 0 | null };
  /** Tipe kolom ukuran (mis. "duration" → j:mm:dd dan sumbu jam). */
  valueType?: ValueType;
  reducedMotion: boolean;
}

export interface ChartSize {
  width: number;
  height: number;
}

export const OTHERS_LABEL = "Lainnya";

/** Perkiraan lebar karakter 12 px (huruf campuran) untuk memotong label sebelum ECharts mengukur. */
const CHAR_PX = 6.6;

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
const PERIOD_GRAINS = ["week", "month", "quarter", "year"] as const;
const isPeriod = (g?: string): g is (typeof PERIOD_GRAINS)[number] =>
  (PERIOD_GRAINS as readonly string[]).includes(g ?? "");

export function chartOption(i: ChartInput, theme: ChartTheme, size: ChartSize) {
  // Durasi "Otomatis": sumbu dalam jam/menit (nilai seri dibagi), tooltip kembali ke detik → j:mm:dd.
  const duration = i.valueType === "duration" && i.format.style === "auto";
  const scale = duration ? durationScale(i.values) : { div: 1, unit: "" };
  const measure = (v: unknown) =>
    typeof v === "number" ? formatMeasure(v, i.valueType, i.format) : "(kosong)";
  const value = (v: unknown) => measure(typeof v === "number" ? v * scale.div : v);
  const scaled = (vs: readonly (number | null)[]) =>
    scale.div === 1 ? [...vs] : vs.map((v) => (v === null ? null : v / scale.div));
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
          `${plain(p.name)}\n${measure(p.value)} (${shares[p.dataIndex] ?? 0}%)`,
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
  const unit = duration ? scale.unit : i.format.style === "rupiah" ? "Rp" : "";
  const valuePx = horizontal ? size.width - labelPx - 24 : size.height;
  const valueAxis = {
    type: "value" as const,
    // Satuan sekali di nama sumbu, bukan di tiap angka. Batang horizontal: di tengah bawah sumbu
    // (tidak menimpa angka terakhir); garis/kolom: di atas sumbu.
    name: unit,
    ...(horizontal
      ? { nameLocation: "middle" as const, nameGap: 4, nameMoveOverlap: true }
      : { nameGap: 10 }),
    nameTextStyle: { color: theme.muted, fontFamily: theme.font, align: "center" as const },
    splitNumber: splitNumber(valuePx),
    splitLine: { lineStyle: { color: theme.border } },
    axisLabel: {
      color: theme.muted,
      hideOverlap: true,
      showMaxLabel: true,
      formatter: (v: number) => formatAxis(v, duration ? AUTO_FORMAT : i.format),
    },
  };
  // Batas grid memuat label DAN nama sumbu (ECharts 6 outerBounds; containLabel hanya label).
  const grid = {
    left: 8,
    right: 16,
    top: 16,
    bottom: 8,
    outerBoundsMode: "same" as const,
    outerBoundsContain: "all" as const,
  };
  const axisTooltip = {
    ...tooltip,
    trigger: "axis" as const,
    axisPointer: { type: horizontal ? ("shadow" as const) : ("line" as const) },
  };

  const grain = i.time?.grain;
  if (i.type === "line" && i.time && !isPeriod(grain)) {
    // Per hari: hari tanpa data diisi (0/null), tidak dilompati garis lurus. Tanpa grain: apa adanya.
    const day =
      grain === "day"
        ? timeBuckets(i.time.iso, i.values, "day", i.time.empty ?? null, TOP_N_MAX.line)
        : null;
    // Titik bertanggal kosong tidak diplot (tetap ada di tabel data); urut waktu naik.
    const points: [number, number | null][] = day
      ? day.keys.map((k, n) => [k, day.values[n] ?? null])
      : i.time.iso
          .map((iso, k) => {
            const ms = iso ? isoToUtcMs(iso) : null;
            return ms === null ? null : ([ms, i.values[k] ?? null] as [number, number | null]);
          })
          .filter((p): p is [number, number | null] => p !== null)
          .sort((a, b) => a[0] - b[0]);
    const ys = scaled(points.map((p) => p[1]));
    const dateOnly = grain === "day" || i.time.iso.every((s) => !s || s.length <= 10);
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
        min: "dataMin",
        max: "dataMax",
        // Tanggal tanpa jam: tick paling rapat sehari (tidak ada "8 Okt" kembar di tengah hari).
        ...(dateOnly ? { minInterval: 86_400_000 } : {}),
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
          data: points.map((p, n): [number, number | null] => [p[0], ys[n] ?? null]),
          showSymbol: points.length <= 60 || hasIsolated(ys),
          connectNulls: false,
        },
      ],
    };
  }

  // Garis per minggu/bulan/kuartal/tahun: satu kategori per periode, kontinu dari yang pertama s.d.
  // terakhir — label selalu periode nyata (bukan tick otomatis yang diformat ulang).
  const periods =
    i.type === "line" && i.time && isPeriod(grain)
      ? timeBuckets(i.time.iso, i.values, grain, i.time.empty ?? null, TOP_N_MAX.line)
      : null;
  const labels = periods ? periods.keys.map((k) => formatDate(msToIso(k), grain)) : i.labels;
  const values = scaled(periods ? periods.values : i.values);
  const textLabels = !periods && i.textLabels;
  const categoryAxis = {
    type: "category" as const,
    data: labels,
    axisLine: { lineStyle: { color: theme.border } },
    axisTick: { show: false },
    axisLabel: {
      color: theme.muted,
      ...(horizontal ? { interval: 0 } : { hideOverlap: true }),
      formatter: (v: string) => (textLabels ? middleTruncate(v, labelChars) : v),
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
        data: values,
        ...(i.type === "line"
          ? {
              smooth: false,
              showSymbol: values.length <= 60 || hasIsolated(values),
              connectNulls: false,
            }
          : { barMaxWidth: 32, barCategoryGap: "30%", itemStyle: { borderRadius: [0, 4, 4, 0] } }),
      },
    ],
  };
}

/** Bar per 18 px tinggi kartu: lebih dari itu label bertabrakan → tampilkan N teratas saja. */
export const barsThatFit = (height: number) => Math.max(1, Math.floor((height - 32) / 18));
