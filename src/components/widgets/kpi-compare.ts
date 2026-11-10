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
      text: `vs ${label} (${prevText})`,
      status: null,
      full: `${label}: ${prevFull}`,
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
    direction === "flat"
      ? `Sama dengan ${label} (${prevFull})`
      : `${verb} ${change.slice(sign.length)} dibanding ${label} (${prevFull})`;
  return { direction, change, text: `vs ${label} (${prevText})`, status, full };
}
