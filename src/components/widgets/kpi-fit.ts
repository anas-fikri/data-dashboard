/*
 * Teks angka KPI yang muat di kartu (T-011, review desain). Urutan: bentuk lengkap; ringkas
 * ("Rp 6,22 M", "8 h 17 j"); ringkas dengan "Rp" pindah ke baris label ("6,22 M"); huruf text-sm;
 * terakhir boleh pindah baris. Nilai lengkap selalu di title dan untuk pembaca layar — yang tampil
 * tidak pernah potongan berelipsis. Min/maks kolom kode/tahun tanpa pemisah ribuan ("2026").
 * Murni; lebar teks diukur pemanggil (canvas).
 */
import type { Agg } from "@/features/query/spec";
import {
  formatCell,
  formatCompact,
  formatLabelNumber,
  formatNumber,
  type ValueType,
} from "@/features/widgets/format";
import { idLikeKind, resolveIdLike } from "@/features/widgets/id-like";
import type { NumberFormat } from "@/features/widgets/spec";

/** Ukuran huruf terkecil (text-sm, 14 px) untuk kartu yang terlalu sempit. */
export const KPI_MIN_PX = 14;
/** Sama dengan clamp(1.125rem, 15cqi, 2.25rem); cqi = lebar isi kotak KPI (kotak itu container). */
export const kpiFontPx = (room: number) => Math.min(36, Math.max(18, room * 0.15));
/** Canvas tidak memakai angka tabular (tnum): sisakan ruang agar teks tidak terpotong 1–2 px. */
const SLACK = 1.06;
const NUMERIC = new Set<ValueType>(["integer", "decimal", "duration"]);

export interface KpiOption {
  text: string;
  /** Satuan yang dipindah ke baris label ("Rp"). */
  unit: string | null;
}
export interface KpiChoice extends KpiOption {
  /** Huruf text-sm. */
  small: boolean;
  /** Boleh pindah baris: tidak ada bentuk yang muat satu baris. */
  wrap: boolean;
}

/** Durasi ringkas, dua satuan terbesar: "8 h 17 j", "1 j 5 m", "5 m 9 d" (lengkap tetap di title). */
export function formatDurationCompact(seconds: number): string {
  const s = Math.round(Math.abs(seconds));
  const sign = seconds < 0 && s > 0 ? "-" : "";
  const n = (v: number) => formatNumber(v, { style: "number", decimals: 0 });
  const two = (big: number, bigUnit: string, small: number, smallUnit: string) =>
    `${sign}${n(big)} ${bigUnit}${small ? ` ${small} ${smallUnit}` : ""}`;
  if (s >= 86_400) {
    let d = Math.floor(s / 86_400);
    let h = Math.round((s - d * 86_400) / 3600);
    if (h === 24) [d, h] = [d + 1, 0];
    return two(d, "h", h, "j");
  }
  if (s >= 3600) {
    let h = Math.floor(s / 3600);
    let m = Math.round((s % 3600) / 60);
    if (m === 60) [h, m] = [h + 1, 0];
    return h === 24 ? `${sign}1 h` : two(h, "j", m, "m");
  }
  if (s >= 60) return two(Math.floor(s / 60), "m", s % 60, "d");
  return `${sign}${s} d`;
}

/**
 * Nilai lengkap dan bentuk yang ditampilkan bila ruang kurang (urut, tanpa duplikat; yang terakhir
 * paling ringkas). `label` = label kolom hasil ("Maksimum Tahun").
 */
export function kpiTexts(
  value: unknown,
  type: ValueType,
  format: NumberFormat,
  agg: Agg,
  label: string,
): { full: string; options: KpiOption[] } {
  // Jumlah baris/unik juga mengikuti format pilihan user.
  const t: ValueType = type === "count" ? "decimal" : type;
  const only = (full: string) => ({ full, options: [{ text: full, unit: null }] });
  if (typeof value !== "number" || !NUMERIC.has(t)) return only(formatCell(value, t, format));
  // Min/maks kolom kode/tahun: "2026", bukan "2.026" atau "2,03 rb". Jumlah/rata-rata tetap berpemisah.
  // Nama ambigu ("Maksimum Resi Retur") diputuskan dari nilai ini (id-like.ts).
  const column = label.replace(/^(minimum|maksimum)\s+/i, "");
  if ((agg === "min" || agg === "max") && t === "integer" && format.style === "auto") {
    if (resolveIdLike(idLikeKind(column), [value])) return only(formatLabelNumber(value));
  }
  const full = formatCell(value, t, format);
  const compact =
    t === "duration" && format.style === "auto"
      ? formatDurationCompact(value)
      : formatCompact(value, format);
  const options: KpiOption[] = [
    { text: full, unit: null },
    { text: compact, unit: null },
  ];
  const rp = format.style === "rupiah" ? /^(-?)Rp (.+)$/.exec(compact) : null;
  if (rp) options.push({ text: `${rp[1]}${rp[2]}`, unit: "Rp" });
  return {
    full,
    options: options.filter((o, i) => options.findIndex((p) => p.text === o.text) === i),
  };
}

/**
 * Bentuk yang ditampilkan untuk lebar isi `room` (px; null = belum diukur → bentuk lengkap).
 * `measure` = lebar teks pada ukuran huruf `px`, null bila tidak bisa diukur (dianggap muat).
 */
export function chooseKpi(
  options: KpiOption[],
  room: number | null,
  measure: (text: string, px: number) => number | null,
): KpiChoice {
  const fits = (text: string, px: number) => {
    if (room === null) return true;
    const w = measure(text, px);
    return w === null || w * SLACK <= room;
  };
  const px = room === null ? 0 : kpiFontPx(room);
  for (const o of options) if (fits(o.text, px)) return { ...o, small: false, wrap: false };
  const last = options[options.length - 1]!;
  return { ...last, small: true, wrap: !fits(last.text, KPI_MIN_PX) };
}
