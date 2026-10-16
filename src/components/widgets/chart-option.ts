import {
  TOP_N_MAX,
  type ChartSort,
  type ChartType,
  type NumberFormat,
} from "@/features/widgets/spec";
import {
  AUTO_FORMAT,
  formatAxis,
  formatDate,
  formatMeasure,
  type ValueType,
} from "@/features/widgets/format";
import {
  GRAIN_NOUN,
  RANK_WORD,
  durationScale,
  hasIsolated,
  isoToUtcMs,
  middleTruncate,
  msToIso,
  percentShares,
  timeBuckets,
  type BucketGrain,
} from "./chart-series";

export { barsThatFit, isoToUtcMs, middleTruncate, percentShares } from "./chart-series";

/*
 * Opsi ECharts dari hasil query widget (T-011). Semua teks (label, tooltip) dirender sebagai teks:
 * tooltip renderMode "richText" + formatter yang mengembalikan string biasa, label sumbu lewat
 * formatter fungsi — nilai sel atau nama kolom berisi HTML tidak pernah menjadi markup (AC 7).
 * Opsi menyesuaikan ukuran kartu (review desain T-011 H2/H3): lebar label teks sebanding lebar grafik
 * dan dipendekkan di tengah (nama berawalan sama tetap bisa dibedakan; tanggal tidak dipotong), garis
 * sumbu lebih sedikit di kartu sempit, satuan pindah ke label sumbu di kotak pendek. Garis per
 * minggu/bulan/kuartal/tahun: sumbu kategori berisi periode kontinu (satu label = satu periode nyata;
 * periode kosong diisi tanpa simbol titik); per hari (dan kolom tanggal tanpa grain): sumbu waktu UTC
 * dengan hari kosong diisi; kolom waktu tanpa grain: jam ikut tampil. Durasi (detik) di sumbu dalam
 * jam/menit, di tooltip j:mm:dd. Pai tanpa label luar — legenda HTML di bawah/samping. Murni.
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
   * periode tanpa data (0 = total/jumlah, null = garis putus; bawaan null). `dimType` "date" tanpa
   * grain = per hari (hari kosong diisi); "timestamp" tanpa grain = jam ikut tampil. `cut`: periode
   * kosong karena hanya N titik bernilai terbesar/terkecil yang diambil.
   */
  time?: {
    iso: (string | null)[];
    grain?: string;
    empty?: 0 | null;
    dimType?: "date" | "timestamp";
    cut?: "top" | "bottom";
  };
  /** Tipe kolom ukuran (mis. "duration" → j:mm:dd dan sumbu jam; "count" → sumbu bilangan bulat). */
  valueType?: ValueType;
  /**
   * Kategori terpilih (indeks label) — filter silang dari widget ini (T-012): batang/irisan lain
   * diredupkan dan yang terpilih diberi garis tepi; titik garis terpilih diperbesar.
   */
  selected?: number;
  reducedMotion: boolean;
  /**
   * Cetak PDF (T-018 D8): nilai batang/titik garis sebagai label teks (tersalin dari PDF; tabel data
   * sr-only terpotong saat cetak) dan tanpa animasi. Pai: nilainya di legenda HTML (chart-widget).
   */
  print?: boolean;
}

export interface ChartSize {
  width: number;
  height: number;
}

export const OTHERS_LABEL = "Lainnya";

/** Perkiraan lebar karakter 12 px (huruf campuran) untuk memotong label sebelum ECharts mengukur. */
const CHAR_PX = 6.6;
/** Perkiraan longgar (angka/huruf besar) untuk jarak label sumbu — lebih baik jarang daripada hilang. */
const AXIS_CHAR_PX = 7;
const LABEL_GAP = 12;
const DAY_MS = 86_400_000;
/** Kotak grafik lebih pendek dari ini: nama satuan sumbu ("Rp", "jam") pindah ke tiap label sumbu. */
const UNIT_NAME_MIN_H = 120;

/** Kegelapan batang/irisan yang tidak terpilih saat ada filter silang dari grafik ini. */
const DIMMED = 0.35;
/** Cetak: ruang atas grid untuk label nilai di atas titik garis tertinggi (11 px + jarak). */
const PRINT_TOP = 28;
const PRINT_LABEL_PX = 11;

/** Teks tooltip richText: "{a|b}" ditafsirkan sebagai gaya ECharts → disisipi spasi lebar-nol. */
const plain = (s: string) => s.replace(/\{/g, "{​");

const PERIOD_GRAINS = ["week", "month", "quarter", "year"] as const;
const isPeriod = (g?: string): g is (typeof PERIOD_GRAINS)[number] =>
  (PERIOD_GRAINS as readonly string[]).includes(g ?? "");

/**
 * Titik garis bertanggal yang diisi per periode: per minggu/bulan/kuartal/tahun (sumbu kategori) atau
 * per hari (sumbu waktu; juga kolom tanggal tanpa grain). Null = titik apa adanya (kolom waktu tanpa
 * grain, atau tipe tidak diketahui).
 */
function lineBuckets(i: Pick<ChartInput, "type" | "values" | "time">) {
  const t = i.time;
  if (i.type !== "line" || !t) return null;
  const grain: BucketGrain | null = isPeriod(t.grain)
    ? t.grain
    : t.grain === "day" || (!t.grain && t.dimType === "date")
      ? "day"
      : null;
  if (!grain) return null;
  return { grain, ...timeBuckets(t.iso, i.values, grain, t.empty ?? null, TOP_N_MAX.line) };
}

/** Garis dengan periode tanpa data yang diisi: jumlah periode di sumbu dan nama periodenya. */
export function periodFill(i: Pick<ChartInput, "type" | "values" | "time">) {
  const b = lineBuckets(i);
  if (!b) return undefined;
  const present = b.filled.filter((f) => !f).length;
  return present < b.keys.length
    ? { buckets: b.keys.length, present, noun: GRAIN_NOUN[b.grain] }
    : undefined;
}

/**
 * Titik garis di sumbu waktu (per hari, atau kolom waktu tanpa grain): titik bertanggal kosong tidak
 * diplot (tetap ada di tabel data); urut waktu naik. `filled` = hari tanpa data yang diisi.
 */
function timePoints(
  i: Pick<ChartInput, "values" | "time">,
  buckets: ReturnType<typeof lineBuckets>,
): { points: [number, number | null][]; filled: boolean[] } {
  const day = buckets?.grain === "day" ? buckets : null;
  if (day) {
    return { points: day.keys.map((k, n) => [k, day.values[n] ?? null]), filled: day.filled };
  }
  const points = (i.time?.iso ?? [])
    .map((iso, k) => {
      const ms = iso ? isoToUtcMs(iso) : null;
      return ms === null ? null : ([ms, i.values[k] ?? null] as [number, number | null]);
    })
    .filter((p): p is [number, number | null] => p !== null)
    .sort((a, b) => a[0] - b[0]);
  return { points, filled: points.map(() => false) };
}

/** Garis bertanggal per hari / tanpa grain: sumbu waktu (selain itu sumbu kategori). */
export const onTimeAxis = (i: Pick<ChartInput, "type" | "time">) =>
  i.type === "line" && !!i.time && !isPeriod(i.time.grain);

/** Waktu (ms) kategori terpilih pada garis bertanggal sama dengan `ms` (awal periode/titik). */
function selectedPoint(i: Pick<ChartInput, "selected" | "time">, ms: number): boolean {
  const iso = i.selected === undefined ? null : i.time?.iso[i.selected];
  return !!iso && isoToUtcMs(iso) === ms;
}

/**
 * Titik yang diklik → indeks kategori (label) sumber, untuk filter silang (T-012). `at` = indeks
 * kategori di sumbu (batang/garis/pai) atau waktu (ms) di sumbu waktu. null: irisan "Lainnya",
 * periode/hari kosong yang diisi, atau di luar data.
 */
export function pickIndex(
  i: Pick<ChartInput, "type" | "labels" | "values" | "time">,
  at: { index: number } | { ms: number },
): number | null {
  const buckets = lineBuckets(i);
  const time = onTimeAxis(i);
  let ms: number | null = null;
  if (time) {
    const { points, filled } = timePoints(i, buckets);
    const target = "ms" in at ? at.ms : (points[at.index]?.[0] ?? NaN);
    let best = -1;
    points.forEach((p, k) => {
      if (best < 0 || Math.abs(p[0] - target) < Math.abs(points[best]![0] - target)) best = k;
    });
    if (best < 0 || filled[best]) return null;
    ms = points[best]![0];
  } else if ("index" in at) {
    const k = at.index;
    const periods = buckets && buckets.grain !== "day" ? buckets : null;
    if (!periods) return k >= 0 && k < i.labels.length ? k : null;
    if (periods.filled[k] ?? true) return null;
    ms = periods.keys[k]!;
  }
  if (ms === null) return null;
  const k = (i.time?.iso ?? []).findIndex((s) => !!s && isoToUtcMs(s) === ms);
  return k >= 0 ? k : null;
}

/** Ringkasan untuk pembaca layar (rincian lengkap ada di tabel data). */
export function chartSummary(
  i: Pick<
    ChartInput,
    "type" | "labels" | "values" | "measureLabel" | "dimensionLabel" | "others" | "time"
  >,
  categories?: number,
  /**
   * Tanpa total keseluruhan dan mungkin terpotong. Pai: persen hanya dari kategori yang tampil;
   * batang/garis: "N teratas" menurut `sort`, bukan "N kategori" seolah lengkap.
   */
  partial = false,
  sort: ChartSort = "value_desc",
) {
  const kind = i.type === "bar" ? "batang" : i.type === "line" ? "garis" : "pai";
  const noun = i.type === "line" ? "titik" : "kategori";
  const shown = i.labels.length;
  // "Lainnya" hanya disebut bila irisannya memang ada (sisa pembulatan tidak digambar).
  const others = i.type === "pie" && !!i.others && i.others > 0;
  const count =
    partial && i.type !== "pie"
      ? `${shown} ${noun} ${RANK_WORD[sort]} (jumlah keseluruhan tidak tersedia)`
      : categories && categories > shown
        ? `${shown} dari ${categories} ${noun}${others ? ", sisanya digabung sebagai Lainnya" : ""}`
        : `${shown} ${noun}`;
  let extra =
    partial && i.type === "pie"
      ? ` Persentase dari ${shown} kategori yang tampil (total keseluruhan tidak tersedia).`
      : "";
  const b = lineBuckets(i);
  const gaps = b ? b.filled.filter(Boolean).length : 0;
  if (b && gaps > 0) {
    const what = `${gaps} ${GRAIN_NOUN[b.grain]}`;
    extra += i.time?.cut
      ? ` ${what} di luar ${shown} ${i.time.cut === "top" ? "terbesar" : "terkecil"} tidak digambar.`
      : i.time?.empty === 0
        ? ` ${what} tanpa data digambar sebagai 0.`
        : ` ${what} tanpa data tidak digambar (garis terputus).`;
  }
  return `Grafik ${kind}: ${i.measureLabel} per ${i.dimensionLabel}, ${count}.${extra}`;
}

const splitNumber = (px: number) => (px < 240 ? 2 : px < 420 ? 3 : 5);

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
  /** Titik garis terpilih: lebih besar dengan tepi warna kartu (tidak bergantung warna saja). */
  const picked = <V>(value: V) => ({
    value,
    symbol: "circle",
    symbolSize: 10,
    itemStyle: { borderColor: theme.card, borderWidth: 2 },
  });
  /**
   * Cetak: geseran (px) label nilai titik garis PERTAMA ke kanan — sejauh perlu agar tidak menjorok ke
   * label sumbu nilai (review T-018 R1-DS-5), tetapi tidak sampai menutupi label berikutnya yang sebaris
   * (rata kiri penuh membuat ECharts membuang label itu, R5-INT-1). `xs` = posisi titik dari sumbu nilai
   * (px), `vals` = nilai (sudah diskalakan), `skip` = tanpa label. Label berikutnya = titik BERLABEL
   * sesudahnya (periode kosong dilewati) yang sebaris — beda tinggi ≥ satu baris label tidak membatasi
   * (R6-DS-2). Bila label itu sudah bertumpuk dengan label pertama walau keduanya rata tengah (grafik
   * rapat), ia dibuang hideOverlap apa pun geserannya: geser penuh. Tinggi plot/rentang nilai
   * diperkirakan hati-hati (selisih tinggi lebih kecil).
   */
  const firstShift = (
    xs: readonly number[],
    vals: readonly (number | null)[],
    skip: readonly boolean[],
  ) => {
    const w = (k: number) =>
      skip[k] || vals[k] == null ? 0 : value(vals[k]).length * AXIS_CHAR_PX;
    const need = w(0) / 2 + 2 - (xs[0] ?? 0);
    if (!w(0) || need <= 0) return 0;
    const lo = Math.min(0, ...vals.map((v) => v ?? 0));
    const hi = Math.max(0, ...vals.map((v) => v ?? 0));
    const plotH = size.height - PRINT_TOP - 48;
    const rise = (k: number) =>
      (Math.abs(vals[k]! - vals[0]!) / Math.max((hi - lo) * 1.25, 1e-9)) * plotH;
    const next = vals.findIndex((v, k) => k > 0 && w(k) > 0 && rise(k) < PRINT_LABEL_PX + 4);
    if (next < 0) return need;
    const room = xs[next]! - w(next) / 2 - 4 - (xs[0]! + w(0) / 2);
    return room < 0 ? need : Math.min(need, room);
  };
  const base = {
    color: theme.colors,
    animation: !i.reducedMotion && !i.print,
    textStyle: { color: theme.muted, fontFamily: theme.font },
  };
  /**
   * Label nilai cetak; `skip` = periode tanpa data yang diisi (bukan nilai terukur, tanpa label).
   * Titik sumbu waktu bernilai [ms, y]. Label yang bertumpuk disembunyikan ECharts (hideOverlap).
   * `shift` = geseran label pertama (firstShift) — lewat labelLayout: ECharts mengabaikan label.offset
   * per titik bila seri punya labelLayout (R6-INT-1).
   */
  const valueLabel = (position: "right" | "top", skip: readonly boolean[], shift = 0) =>
    i.print
      ? {
          label: {
            show: true,
            position,
            distance: 4,
            color: theme.text,
            fontSize: PRINT_LABEL_PX,
            fontFamily: theme.font,
            formatter: (p: { value: unknown; dataIndex: number }) =>
              skip[p.dataIndex] ? "" : value(Array.isArray(p.value) ? p.value[1] : p.value),
          },
          labelLayout:
            shift > 0
              ? (p: { dataIndex: number }) => ({
                  hideOverlap: true,
                  ...(p.dataIndex === 0 ? { dx: shift } : {}),
                })
              : { hideOverlap: true },
        }
      : {};

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
    const sel = i.selected;
    const items =
      sel === undefined
        ? data
        : data.map((d, k) => ({
            ...d,
            itemStyle:
              k === sel
                ? {
                    ...(d as { itemStyle?: object }).itemStyle,
                    borderColor: theme.text,
                    borderWidth: 2,
                  }
                : { ...(d as { itemStyle?: object }).itemStyle, opacity: DIMMED },
          }));
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
          data: items,
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
  // Nama satuan butuh ±20 px tinggi; di kotak pendek ia jatuh di luar SVG → satuan di tiap label.
  const unitName = size.height >= UNIT_NAME_MIN_H;
  const axisText = (v: number) => {
    const t = formatAxis(v, duration ? AUTO_FORMAT : i.format);
    if (!unit || unitName) return t;
    if (unit !== "Rp") return `${t} ${unit}`;
    return t.startsWith("-") ? `-Rp ${t.slice(1)}` : `Rp ${t}`;
  };
  // Jumlah baris/unik dan bilangan bulat: garis sumbu tidak pernah di 0,3 / 0,6.
  const integral =
    !duration &&
    i.format.style !== "percent" &&
    (i.valueType === "count" ||
      (i.valueType === "integer" && i.values.every((v) => v === null || Number.isInteger(v))));
  const valuePx = horizontal ? size.width - labelPx - 24 : size.height;
  const valueAxis = {
    type: "value" as const,
    // Satuan sekali di nama sumbu, bukan di tiap angka. Batang horizontal: di tengah bawah sumbu
    // (tidak menimpa angka terakhir); garis/kolom: di atas sumbu.
    name: unitName ? unit : "",
    ...(horizontal
      ? { nameLocation: "middle" as const, nameGap: 4, nameMoveOverlap: true }
      : { nameGap: 10 }),
    nameTextStyle: { color: theme.muted, fontFamily: theme.font, align: "center" as const },
    splitNumber: splitNumber(valuePx),
    ...(integral ? { minInterval: 1 } : {}),
    splitLine: { lineStyle: { color: theme.border } },
    axisLabel: {
      color: theme.muted,
      hideOverlap: true,
      showMaxLabel: true,
      formatter: axisText,
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
  const buckets = lineBuckets(i);
  // Tooltip periode yang diisi: bukan nilai terukur.
  const gap = i.time?.cut
    ? `(di luar ${i.labels.length} ${i.time.cut === "top" ? "terbesar" : "terkecil"})`
    : i.time?.empty === 0
      ? `${value(0)} (tidak ada data)`
      : "(tidak ada data)";
  // Simbol titik garis: semua bila ≤ 60 titik atau ada titik terpencil. Ada periode yang diisi: titik
  // bersimbol = periode berisi data (yang diisi tanpa simbol), jadi simbol tidak boleh dijarangkan
  // ECharts ('auto' mengikuti label di kartu sempit) — juga di atas 60 periode bila yang berisi ≤ 60.
  const symbols = (ys: readonly (number | null)[], filled: readonly boolean[]) => {
    const fills = filled.some(Boolean);
    const isolated = hasIsolated(ys);
    const show = ys.length <= 60 || isolated || (fills && filled.filter((f) => !f).length <= 60);
    return {
      showSymbol: show,
      ...(show && (fills || isolated) ? { showAllSymbol: true } : {}),
      ...(fills
        ? { symbolSize: (_: unknown, p: { dataIndex: number }) => (filled[p.dataIndex] ? 0 : 4) }
        : {}),
    };
  };

  if (i.type === "line" && i.time && !isPeriod(grain)) {
    const day = buckets?.grain === "day" ? buckets : null;
    const { points, filled } = timePoints(i, buckets);
    const ys = scaled(points.map((p) => p[1]));
    // Kolom waktu tanpa grain: jam selalu di tooltip; di label sumbu bila rentang < 3 hari (selain
    // itu tick paling rapat sehari — tidak ada "31 Des 2025" kembar).
    const timestamp =
      !day && (i.time.dimType === "timestamp" || i.time.iso.some((s) => !!s && s.length > 10));
    const first = points.length ? msToIso(points[0]![0]) : "";
    const last = points.length ? msToIso(points.at(-1)![0]) : "";
    const clock = timestamp && (isoToUtcMs(last) ?? 0) - (isoToUtcMs(first) ?? 0) < 3 * DAY_MS;
    // Satu tanggal: label jam saja, tanggalnya sekali di nama sumbu (bila ada tempat).
    const oneDay = clock && first.slice(0, 10) === last.slice(0, 10);
    const when = (ms: number) => formatDate(msToIso(ms), grain, timestamp);
    const dayName = oneDay && unitName ? formatDate(first) : "";
    const dated = (iso: string) => `${formatDate(iso).replace(/ \d{4}$/, "")} ${iso.slice(11, 16)}`;
    const tick = (ms: number) => {
      const iso = msToIso(ms);
      if (!clock) return formatDate(iso, grain);
      // Beberapa hari, atau satu hari tanpa tempat untuk nama sumbu (kotak pendek): setiap label
      // "31 Des 18:00" — tanggal tidak hilang dari kartu (label tanggal saja bisa disembunyikan).
      return oneDay && dayName ? iso.slice(11, 16) : dated(iso);
    };
    // Label tick waktu jatuh di mana saja (bukan di ujung data) dan rata tengah: ruang kanan grid
    // setengah label terpanjang — label paling kanan tidak terpotong tepi kartu. Paling banyak 20 %
    // lebar: lebih dari itu ECharts menyerah memuat label sumbu nilai di kiri.
    const edgeText = points.reduce((m, p) => Math.max(m, tick(p[0]).length), 0);
    const right = Math.max(grid.right, Math.min((edgeText * AXIS_CHAR_PX) / 2, size.width * 0.2));
    // Titik pertama tepat di tepi kiri plot (min dataMin); posisi titik dari lebar plot perkiraan
    // (lebar − label sumbu nilai − jarak grid), sama seperti sumbu kategori.
    const maxY = ys.reduce<number>((m, v) => Math.max(m, Math.abs(v ?? 0)), 0);
    const plotT = size.width - grid.left - right - 8 - axisText(maxY).length * AXIS_CHAR_PX;
    const span = points.length > 1 ? points.at(-1)![0] - points[0]![0] : 0;
    const shift0 = firstShift(
      points.map((p) => (span > 0 ? ((p[0] - points[0]![0]) / span) * Math.max(plotT, 1) : 0)),
      ys,
      filled,
    );
    return {
      ...base,
      // Tick dan label sumbu waktu dalam UTC, sama dengan nilai tanggal naive dari DuckDB.
      useUTC: true,
      grid: { ...grid, right: Math.floor(right), ...(i.print ? { top: PRINT_TOP } : {}) },
      tooltip: {
        ...axisTooltip,
        formatter: (params: { value: [number, unknown]; dataIndex?: number }[]) => {
          const p = params[0];
          if (!p) return "";
          const shown = filled[p.dataIndex ?? -1] ? gap : value(p.value[1]);
          return `${when(p.value[0])}\n${plain(i.measureLabel)}: ${shown}`;
        },
      },
      xAxis: {
        type: "time" as const,
        min: "dataMin",
        max: "dataMax",
        ...(clock ? {} : { minInterval: DAY_MS }),
        ...(dayName
          ? {
              name: dayName,
              nameLocation: "middle" as const,
              nameGap: 26,
              nameTextStyle: { color: theme.muted, fontFamily: theme.font },
            }
          : {}),
        axisLine: { lineStyle: { color: theme.border } },
        splitLine: { show: false },
        axisLabel: {
          color: theme.muted,
          hideOverlap: true,
          formatter: tick,
        },
      },
      yAxis: valueAxis,
      series: [
        {
          type: "line" as const,
          name: i.measureLabel,
          data: points.map((p, n) =>
            selectedPoint(i, p[0]) ? picked([p[0], ys[n] ?? null]) : [p[0], ys[n] ?? null],
          ),
          ...symbols(ys, filled),
          ...valueLabel("top", filled, shift0),
          connectNulls: false,
        },
      ],
    };
  }

  // Garis per minggu/bulan/kuartal/tahun: satu kategori per periode, kontinu dari yang pertama s.d.
  // terakhir — label selalu periode nyata (bukan tick otomatis yang diformat ulang).
  const periods = buckets && buckets.grain !== "day" ? buckets : null;
  const labels = periods ? periods.keys.map((k) => formatDate(msToIso(k), grain)) : i.labels;
  const filled = periods ? periods.filled : labels.map(() => false);
  // Indeks data terpilih: periode yang memuat tanggal kategori terpilih, atau indeks label.
  const sel = periods
    ? (() => {
        const k = periods.keys.findIndex((ms) => selectedPoint(i, ms));
        return k >= 0 ? k : undefined;
      })()
    : i.selected;
  const values = scaled(periods ? periods.values : i.values);
  const textLabels = !periods && i.textLabels;
  // Kata pendek (≤ 10 karakter) di sumbu garis tidak dipotong — label yang tidak muat dijarangkan.
  const labelText = (v: string) =>
    !textLabels
      ? v
      : horizontal
        ? middleTruncate(v, labelChars)
        : middleTruncate(v, Math.max(labelChars, 10));
  // Garis: label dihitung mundur dari periode terakhir (terbaru) — selalu tampil dan tidak terpotong
  // tepi kartu ("Sep 202"): rata tengah bila muat di setengah periode + ruang kanan grid, selain itu
  // rata kanan pada titiknya. Jarak label dari perkiraan lebar teks dan lebar satu periode di area plot
  // (lebar − label sumbu nilai − jarak grid), sama rata di seluruh sumbu; hideOverlap tetap pengaman.
  const n = labels.length;
  const maxAbs = values.reduce<number>((m, v) => Math.max(m, Math.abs(v ?? 0)), 0);
  const plotW = size.width - grid.left - grid.right - 8 - axisText(maxAbs).length * AXIS_CHAR_PX;
  const band = Math.max(plotW, 1) / Math.max(n, 1);
  // Titik garis di tengah pitanya (setengah pita dari sumbu nilai).
  const shift0 =
    i.type === "line"
      ? firstShift(
          values.map((_, k) => band / 2 + k * band),
          values,
          filled,
        )
      : 0;
  const textW = labels.reduce((m, l) => Math.max(m, labelText(l).length), 1) * AXIS_CHAR_PX;
  const alignRight = n > 1 && textW / 2 > band / 2 + grid.right - 4;
  // Label terakhir rata kanan memakan seluruh lebarnya ke kiri: semua jarak dilebarkan (bukan satu
  // label dilewati — celah tidak rata).
  const minStep = Math.max(1, Math.ceil(((alignRight ? 1.5 : 1) * textW + LABEL_GAP) / band));
  // Langkah yang membagi n − 1 (≤ 1,5×) bila ada: label pertama dan terakhir tampil dengan jarak sama.
  let step = minStep;
  for (let s = minStep; s <= Math.ceil(minStep * 1.5) && s < n; s++) {
    if ((n - 1) % s === 0) {
      step = s;
      break;
    }
  }
  const shownLabels = new Set<number>();
  for (let k = n - 1; k >= 0; k -= step) shownLabels.add(k);
  // Periode pertama ikut berlabel bila ada tempat (awal dan akhir rentang terbaca).
  const leftmost = Math.min(...shownLabels);
  const leftEdge = leftmost * band - (leftmost === n - 1 && alignRight ? textW : textW / 2);
  if (n > 1 && textW / 2 + LABEL_GAP <= leftEdge) shownLabels.add(0);
  const showLabel = (k: number) => shownLabels.has(k);
  const categoryAxis = {
    type: "category" as const,
    data: labels,
    axisLine: { lineStyle: { color: theme.border } },
    // Garis: tick tepat di bawah titik — per periode bila cukup renggang (≥ 6 px), selain itu di
    // label yang tampil — sehingga titik terpencil bisa dicocokkan dengan periodenya.
    axisTick: horizontal
      ? { show: false }
      : { show: true, alignWithLabel: true, length: 4, interval: band >= 6 ? 0 : showLabel },
    axisLabel: {
      color: theme.muted,
      ...(horizontal
        ? { interval: 0 }
        : {
            interval: showLabel,
            hideOverlap: true,
            ...(n > 1 ? { showMaxLabel: true } : {}),
            ...(alignRight ? { alignMaxLabel: "right" as const } : {}),
          }),
      formatter: labelText,
    },
  };
  // Cetak: label nilai di ujung batang (ruang kanan selebar label terpanjang, maks. 30 %) atau di atas
  // titik garis (ruang atas; label titik terakhir rata tengah butuh setengah lebarnya di kanan).
  const valueTextPx = (v: number | null) => value(v).length * AXIS_CHAR_PX;
  const printGrid = !i.print
    ? grid
    : horizontal
      ? {
          ...grid,
          right: Math.round(
            Math.max(
              grid.right,
              Math.min(Math.max(0, ...values.map(valueTextPx)) + 8, size.width * 0.3),
            ),
          ),
        }
      : {
          ...grid,
          top: PRINT_TOP,
          right: Math.round(Math.max(grid.right, valueTextPx(values.at(-1) ?? null) / 2)),
        };
  return {
    ...base,
    grid: printGrid,
    tooltip: {
      ...axisTooltip,
      formatter: (params: { name: string; value: unknown; dataIndex?: number }[]) => {
        const p = params[0];
        if (!p) return "";
        const shown = filled[p.dataIndex ?? -1] ? gap : value(p.value);
        return `${plain(p.name)}\n${plain(i.measureLabel)}: ${shown}`;
      },
    },
    // Batang horizontal: nama kategori panjang tetap terbaca; urutan dari atas, semua label tampil.
    xAxis: horizontal ? valueAxis : categoryAxis,
    yAxis: horizontal ? { ...categoryAxis, inverse: true } : valueAxis,
    series: [
      {
        type: i.type,
        name: i.measureLabel,
        data: values.map((v, k) => {
          if (i.type === "line") return k === sel ? picked(v) : v;
          if (sel === undefined) return v;
          return k === sel
            ? { value: v, itemStyle: { borderColor: theme.text, borderWidth: 1.5 } }
            : { value: v, itemStyle: { opacity: DIMMED } };
        }),
        ...(i.type === "line"
          ? {
              smooth: false,
              ...symbols(values, filled),
              connectNulls: false,
            }
          : { barMaxWidth: 32, barCategoryGap: "30%", itemStyle: { borderRadius: [0, 4, 4, 0] } }),
        ...valueLabel(horizontal ? "right" : "top", filled, shift0),
      },
    ],
  };
}
