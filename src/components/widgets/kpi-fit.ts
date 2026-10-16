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
/**
 * Kotak bertinggi tetap yang sangat sempit/pendek: label + "Rp" dipertahankan selama angka ≥ 12 px;
 * paling kecil 10 px (masih terbaca) sebelum boleh pindah baris.
 */
export const KPI_READABLE_PX = 12;
export const KPI_FLOOR_PX = 10;
/** Sama dengan clamp(1.125rem, 15cqi, 2.25rem); cqi = lebar isi kotak KPI (kotak itu container). */
export const kpiFontPx = (room: number) => Math.min(36, Math.max(18, room * 0.15));
/**
 * Ukuran huruf terbesar yang muat setinggi kotak KPI (review T-018 R3-DS-1, T-p24e): kartu pendek dengan
 * judul dua baris atau baris catatan menyisakan kotak rendah — angka selebar kartu terpotong setengah.
 * `height` = tinggi isi kotak; `rem` = ukuran huruf akar (px; pengguna bisa memperbesarnya): angka boleh
 * memakai padding bawah (pb-3, 0,75rem) kecuali 2 px untuk ekor huruf ("p" pada "Rp"); baris label
 * text-sm 1,25rem + gap 0,25rem; tinggi baris angka leading-tight (1,25). Hanya untuk kotak yang
 * tingginya TIDAK mengikuti isinya (grid, kertas) — kartu yang tumbuh akan berputar mengecil.
 */
export const kpiHeightPx = (height: number, label: boolean, rem = 16) =>
  (height + 0.75 * rem - 2 - (label ? 1.5 * rem : 0)) / 1.25;
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
  /** Ukuran huruf angka (px) bila sudah diukur dan bukan text-sm; null = ikut kelas CSS. */
  px: number | null;
  /** Boleh pindah baris: tidak ada bentuk yang muat satu baris. */
  wrap: boolean;
  /** Baris label tampil (label beda dari judul, atau "Rp" pindah ke sana). */
  label: boolean;
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
 * `cap(label)` = batas ukuran huruf dari tinggi kotak dengan/tanpa baris label (kpiHeightPx); tidak ada =
 * kotak tumbuh mengikuti isi (hanya lebar). `labelled` = label beda dari judul (barisnya selalu tampil);
 * selain itu baris label hanya ada bila "Rp" pindah ke sana — dihitung per bentuk (review T-018 R4-CL-1).
 * `smallPx` = text-sm dalam px (ikut huruf akar).
 */
export function chooseKpi(
  options: KpiOption[],
  room: number | null,
  measure: (text: string, px: number) => number | null,
  cap?: (label: boolean) => number,
  labelled = true,
  smallPx = KPI_MIN_PX,
): KpiChoice {
  const fits = (text: string, px: number) => {
    if (room === null) return true;
    const w = measure(text, px);
    return w === null || w * SLACK <= room;
  };
  const pick = (opts: KpiOption[], label: (o: KpiOption) => boolean): KpiChoice | null => {
    for (const o of opts) {
      const px = room === null ? null : Math.min(kpiFontPx(room), cap?.(label(o)) ?? Infinity);
      if ((px === null || px > KPI_MIN_PX) && fits(o.text, px ?? 0))
        return { ...o, small: false, wrap: false, px, label: label(o) };
    }
    return null;
  };
  const withLabel = (o: KpiOption) => labelled || !!o.unit;
  const last = options[options.length - 1]!;
  const chosen = pick(options, withLabel);
  if (chosen) return chosen;
  if (!cap || room === null) {
    // Kartu tumbuh mengikuti isi (tumpukan ponsel): text-sm, boleh pindah baris (perilaku T-011).
    return {
      ...last,
      small: true,
      wrap: !fits(last.text, KPI_MIN_PX),
      px: null,
      label: withLabel(last),
    };
  }
  // Kotak bertinggi tetap: angka didahulukan dan SATU baris yang muat lebar dan tingginya — baris yang
  // dibungkus terpotong kotak ("696,51" tanpa "jt", R5-DS-1/INT-2). Urutan: tanpa label (tetap di
  // title/pembaca layar) dengan "Rp" tetap di angka (R4-CL-2); lalu huruf kecil satu baris — text-sm
  // (ikut huruf akar, R5-CL-1) dibatasi tinggi dan lebar — dengan label, tanpa label, lalu bentuk "Rp"
  // pindah tanpa label ("Rp" hilang dari tampilan; nilai lengkap tetap di title/pembaca layar).
  const plain = options.filter((o) => !o.unit);
  const hidden = pick(plain, () => false);
  if (hidden) return hidden;
  const oneLine = (o: KpiOption, label: boolean) => {
    const w = measure(o.text, 100);
    const byWidth = w === null ? Infinity : (room * 100) / (w * SLACK);
    return Math.min(smallPx, cap(label), byWidth);
  };
  const stages: [label: boolean, use: (o: KpiOption) => boolean, min: number][] = [
    [true, withLabel, KPI_READABLE_PX],
    [false, (o) => !o.unit, KPI_READABLE_PX],
    [false, () => true, KPI_FLOOR_PX],
  ];
  for (const [label, use, min] of stages) {
    // Huruf terbesar; yang hampir sama (≤ 0,5 px) → bentuk paling lengkap.
    const sized = options.filter(use).map((o) => ({ o, px: oneLine(o, label) }));
    const best = Math.max(...sized.map((s) => s.px));
    const at = sized.find((s) => s.px >= best - 0.5);
    if (at && best >= min) return { ...at.o, small: true, wrap: false, px: at.px, label };
  }
  return { ...last, small: true, wrap: true, px: KPI_FLOOR_PX, label: false };
}
