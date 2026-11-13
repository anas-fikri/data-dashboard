/*
 * Baris pembanding KPI (T-43hv): "▲ 12,5 % vs Okt 2026 (Rp 1,2 jt)". Arah dan warna mengikuti penilaian
 * KPI (naik baik/turun baik, termasuk bawaan dashboard); tanpa penilaian → netral. Periode pembanding tanpa
 * baris → "Tidak ada data <periode>" tanpa persen; nilai pembanding 0 → selisih angka, bukan persen tak
 * hingga. Murni; dipakai layar dan PDF lewat KpiView.
 */
import type { KpiCompareData } from "@/features/query/spec";
import {
  formatCompact,
  formatDate,
  formatMeasure,
  type ValueType,
} from "@/features/widgets/format";
import type { NumberFormat } from "@/features/widgets/spec";
import type { Tone } from "@/features/widgets/tone";

export interface KpiCompareView {
  direction: "up" | "down" | "flat" | null;
  /** "+12,5%", "−3%", atau selisih angka ("+1.200") bila pembanding 0; null tanpa pembanding. */
  change: string | null;
  /** "vs Okt 2026 (Rp 1,2 jt)" atau "Tidak ada data Okt 2025". */
  text: string;
  /** Warna status: naik/turun dinilai baik/buruk; null = netral. */
  status: "good" | "bad" | null;
  /** Kalimat lengkap (title, pembaca layar). */
  full: string;
}

const ARROW = { up: "▲", down: "▼", flat: "▬" } as const;
const MINUS = "−";

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
};

export const compareArrow = (d: KpiCompareView["direction"]) => (d ? ARROW[d] : "");

export function kpiCompareView(
  value: unknown,
  cmp: KpiCompareData,
  type: ValueType,
  format: NumberFormat,
  tone: Tone | undefined,
): KpiCompareView {
  if (!cmp.period || !cmp.previousPeriod) {
    const text = "Tidak ada data bertanggal";
    return { direction: null, change: null, text, status: null, full: text };
  }
  const label = formatDate(cmp.previousPeriod, cmp.grain);
  // Periode berjalan (T-tyb1, keputusan: tetap membandingkan periode penuh pembanding, dengan keterangan).
  const until = cmp.latest ? ` · s.d. ${formatDate(cmp.latest, "day")}` : "";
  const untilFull = cmp.latest
    ? ` (${formatDate(cmp.period, cmp.grain)} baru berisi data s.d. ${formatDate(cmp.latest, "day")})`
    : "";
  const prev = cmp.previousRows > 0 ? num(cmp.previous) : null;
  if (prev === null) {
    const text = `Tidak ada data ${label}`;
    return {
      direction: null,
      change: null,
      text,
      status: null,
      full: `${text} sebagai pembanding`,
    };
  }
  const prevText = formatMeasure(prev, type, format, true);
  const prevFull = formatMeasure(prev, type, format);
  const cur = num(value);
  if (cur === null) {
    return {
      direction: null,
      change: null,
      text: `vs ${label} (${prevText})${until}`,
      status: null,
      full: `${label}: ${prevFull}${untilFull}`,
    };
  }
  const diff = cur - prev;
  const direction = diff > 0 ? "up" : diff < 0 ? "down" : "flat";
  const sign = diff > 0 ? "+" : diff < 0 ? MINUS : "";
  const change =
    prev === 0
      ? `${sign}${formatMeasure(Math.abs(diff), type, format, true)}`
      : `${sign}${formatCompact(Math.abs(diff / prev), { style: "percent", decimals: 1 })}`;
  const status =
    !tone || direction === "flat"
      ? null
      : (direction === "up") === (tone === "up")
        ? "good"
        : "bad";
  const verb = direction === "up" ? "Naik" : direction === "down" ? "Turun" : "Sama dengan";
  const full =
    (direction === "flat"
      ? `Sama dengan ${label} (${prevFull})`
      : `${verb} ${change.slice(sign.length)} dibanding ${label} (${prevFull})`) + untilFull;
  return { direction, change, text: `vs ${label} (${prevText})${until}`, status, full };
}

/**
 * Pembanding selain periode (v1.21): rasio terhadap ukuran kedua ("95,1% dari Jumlah baris (5,0 jt)") atau
 * pencapaian target ("▼ 95,1% dari target 1.000"). Rasio netral (tanpa warna); target berwarna menurut penilaian
 * KPI — tanpa penilaian dianggap lebih tinggi lebih baik (target = batas bawah yang dikejar).
 */
export function kpiReferenceView(
  value: unknown,
  ref: { kind: "measure"; value: unknown; label: string } | { kind: "target"; value: number },
  type: ValueType,
  format: NumberFormat,
  tone: Tone | undefined,
  /** Tipe + format ukuran pembanding (review M1): mis. jumlah baris tidak ditulis "Rp". */
  baseFmt?: { type: ValueType; format: NumberFormat },
  /** Penilaian "tanpa warna" dipilih eksplisit (T-djp6 L7): target tanpa warna baik/buruk. */
  noColor = false,
): KpiCompareView {
  const cur = num(value);
  const base = num(ref.value);
  const bType = baseFmt?.type ?? type;
  const bFormat = baseFmt?.format ?? format;
  const pctOf = (x: number) => formatCompact(x, { style: "percent", decimals: 1 });
  if (ref.kind === "measure") {
    // Server melewati ukuran pembanding (kolom disembunyikan/dihapus/tanggal): bukan "kosong" (review T-djp6 M1).
    if (ref.value === undefined) {
      const text = "Pembanding tidak tersedia (kolomnya disembunyikan atau tidak ada lagi)";
      return { direction: null, change: null, text, status: null, full: text };
    }
    const label = ref.label || "ukuran pembanding";
    if (base === null || base === 0) {
      const text = `${label}: ${base === null ? "kosong" : "0"} — rasio tidak bisa dihitung`;
      return { direction: null, change: null, text, status: null, full: text };
    }
    const baseText = formatMeasure(base, bType, bFormat, true);
    const baseFull = formatMeasure(base, bType, bFormat);
    if (cur === null) {
      return {
        direction: null,
        change: null,
        text: `${label} (${baseText})`,
        status: null,
        full: `${label}: ${baseFull}`,
      };
    }
    const change = pctOf(cur / base);
    return {
      direction: null,
      change,
      text: `dari ${label} (${baseText})`,
      status: null,
      full: `${change} dari ${label} (${baseFull})`,
    };
  }
  const target = ref.value;
  const tText = formatMeasure(target, type, format, true);
  const tFull = formatMeasure(target, type, format);
  if (cur === null) {
    const text = `Target ${tText}`;
    return { direction: null, change: null, text, status: null, full: `Target ${tFull}` };
  }
  const diff = cur - target;
  const direction = diff > 0 ? "up" : diff < 0 ? "down" : "flat";
  const better = (tone ?? "up") === "up";
  const status =
    noColor || direction === "flat" ? null : (direction === "up") === better ? "good" : "bad";
  const change =
    target === 0
      ? `${diff > 0 ? "+" : diff < 0 ? MINUS : ""}${formatMeasure(Math.abs(diff), type, format, true)}`
      : pctOf(cur / target);
  const gap = formatMeasure(Math.abs(diff), type, format);
  const full =
    direction === "flat"
      ? `Tepat sama dengan target ${tFull}`
      : `${target === 0 ? change : `${change} dari target ${tFull}`} (${direction === "up" ? "lebih" : "kurang"} ${gap})`;
  return {
    direction,
    change,
    text: target === 0 ? `vs target ${tText}` : `dari target ${tText}`,
    status,
    full,
  };
}
