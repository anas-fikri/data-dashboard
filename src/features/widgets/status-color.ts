/*
 * Warna status (v1.7.0): seperti Conditional Formatting Excel ("3 tingkat"), tetapi tanpa angka ambang
 * yang harus diisi pengguna. Setiap nilai punya arah penilaian (tone.ts): "up" = makin tinggi makin
 * baik (checkpoint tepat waktu), "down" = makin tinggi makin buruk (klaim). Nilai dibandingkan dengan
 * nilai lain di widget yang sama lalu dibagi menjadi TIGA tingkat bertangga (bukan gradien) menurut
 * posisinya di rentang terkecil–terbesar, sama dengan ikon 3 tingkat Excel (≥ 67 %, ≥ 33 %):
 *   sepertiga atas → baik (up) / perlu perhatian (down); tengah → sedang; sepertiga bawah → kebalikannya.
 * Satu sumber untuk layar, PDF, dan grafik batang. Murni.
 */
import type { ColorTemplate, Tone, WidgetColors } from "./tone";

export type Status = "good" | "mid" | "bad";
export const STATUSES: readonly Status[] = ["good", "mid", "bad"];

/** Teks status (pembaca layar, legenda, tooltip). */
export const STATUS_LABEL: Record<Status, string> = {
  good: "Baik",
  mid: "Sedang",
  bad: "Perlu perhatian",
};
export const TONE_LABEL: Record<Tone, string> = {
  up: "Makin tinggi makin baik",
  down: "Makin tinggi makin buruk",
};
export const TEMPLATE_LABEL: Record<ColorTemplate, string> = {
  soft: "Lembut (gaya Excel)",
  bold: "Tegas",
  cvd: "Ramah buta warna (biru–oranye)",
  custom: "Warna sendiri",
};

/** Warna satu status: latar sel, teks sel, dan warna batang grafik. */
export interface StatusSwatch {
  bg: string;
  fg: string;
  mark: string;
}
export type StatusPalette = Record<Status, StatusSwatch> & { names: Record<Status, string> };

const RGY = { good: "Hijau", mid: "Kuning", bad: "Merah" };
const TEMPLATES: Record<
  Exclude<ColorTemplate, "custom">,
  { light: StatusPalette; dark: StatusPalette }
> = {
  // Isian bawaan Excel: "Green Fill with Dark Green Text", "Yellow Fill…", "Light Red Fill…".
  soft: {
    light: {
      good: { bg: "#C6EFCE", fg: "#006100", mark: "#63BE7B" },
      mid: { bg: "#FFEB9C", fg: "#7A4500", mark: "#F2C744" },
      bad: { bg: "#FFC7CE", fg: "#9C0006", mark: "#F8696B" },
      names: RGY,
    },
    dark: {
      good: { bg: "#1E4D2B", fg: "#C6F2D0", mark: "#4CAF6E" },
      mid: { bg: "#4D3F12", fg: "#FFE9A8", mark: "#D9B23F" },
      bad: { bg: "#5A1E24", fg: "#FFC4CA", mark: "#E06666" },
      names: RGY,
    },
  },
  bold: {
    light: {
      good: { bg: "#00733C", fg: "#FFFFFF", mark: "#00804A" },
      mid: { bg: "#FFC000", fg: "#1F1F1F", mark: "#FFC000" },
      bad: { bg: "#C00000", fg: "#FFFFFF", mark: "#C00000" },
      names: RGY,
    },
    dark: {
      good: { bg: "#0F6B3D", fg: "#FFFFFF", mark: "#2EB872" },
      mid: { bg: "#E0A800", fg: "#1F1F1F", mark: "#F2B90F" },
      bad: { bg: "#A01919", fg: "#FFFFFF", mark: "#E04848" },
      names: RGY,
    },
  },
  // Biru = baik, oranye = perlu perhatian (Okabe–Ito): terbaca oleh buta warna merah–hijau.
  cvd: {
    light: {
      good: { bg: "#CFE2F3", fg: "#0B3D6E", mark: "#0072B2" },
      mid: { bg: "#EEEEEE", fg: "#333333", mark: "#A6A6A6" },
      bad: { bg: "#FCD9BD", fg: "#7A3500", mark: "#D55E00" },
      names: { good: "Biru", mid: "Abu-abu", bad: "Oranye" },
    },
    dark: {
      good: { bg: "#12324F", fg: "#CFE5FA", mark: "#56B4E9" },
      mid: { bg: "#3A3A3A", fg: "#E6E6E6", mark: "#8C8C8C" },
      bad: { bg: "#5A2E0C", fg: "#FFD9BA", mark: "#E69F00" },
      names: { good: "Biru", mid: "Abu-abu", bad: "Oranye" },
    },
  },
};

/** Template bawaan bila nilai punya arah tetapi widget belum memilih template. */
export const DEFAULT_COLORS: WidgetColors = { template: "soft" };

function luminance(hex: string): number {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const [r, g, b] = c.map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)) as [
    number,
    number,
    number,
  ];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Rasio kontras WCAG dua warna hex. */
export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

/** Teks di atas warna custom: hitam atau putih, mana yang lebih kontras. */
const textOn = (bg: string) =>
  contrast(bg, "#000000") >= contrast(bg, "#FFFFFF") ? "#1F1F1F" : "#FFFFFF";

/** Palet sebuah widget untuk tema terang/gelap. Custom: [buruk, sedang, baik], sama di kedua tema. */
export function statusPalette(colors: WidgetColors | undefined, dark: boolean): StatusPalette {
  const c = colors ?? DEFAULT_COLORS;
  if (c.template === "custom" && c.custom) {
    const [bad, mid, good] = c.custom;
    const sw = (hex: string): StatusSwatch => ({ bg: hex, fg: textOn(hex), mark: hex });
    return {
      good: sw(good),
      mid: sw(mid),
      bad: sw(bad),
      names: { good: "Warna baik", mid: "Warna sedang", bad: "Warna perlu perhatian" },
    };
  }
  const t = TEMPLATES[c.template === "custom" ? "soft" : c.template];
  return dark ? t.dark : t.light;
}

/** Rentang angka (terkecil, terbesar) yang dibandingkan; null bila < 2 angka berbeda. */
export function statusRange(values: Iterable<unknown>): { min: number; max: number } | null {
  let min = Infinity;
  let max = -Infinity;
  for (const v of values) {
    if (typeof v !== "number" || !Number.isFinite(v)) continue;
    if (v < min) min = v;
    if (v > max) max = v;
  }
  return max > min ? { min, max } : null;
}

/** Status satu nilai terhadap rentangnya; null bila bukan angka, tanpa arah, atau rentang datar. */
export function statusOf(
  v: unknown,
  tone: Tone | undefined,
  range: { min: number; max: number } | null,
): Status | null {
  if (!tone || !range || typeof v !== "number" || !Number.isFinite(v)) return null;
  const pos = (v - range.min) / (range.max - range.min);
  const high = pos >= 2 / 3;
  const low = pos < 1 / 3;
  if (!high && !low) return "mid";
  return high === (tone === "up") ? "good" : "bad";
}

/** Status setiap nilai sebuah deret (mis. batang grafik) terhadap rentang deret itu sendiri. */
export function statusSeries(
  values: readonly unknown[],
  tone: Tone | undefined,
): (Status | null)[] {
  const range = tone ? statusRange(values) : null;
  return values.map((v) => statusOf(v, tone, range));
}

/** Variabel CSS sel berstatus (globals.css memilih terang/gelap); dipasang di elemen pembungkus. */
export function statusCssVars(colors: WidgetColors | undefined): Record<string, string> {
  const vars: Record<string, string> = {};
  for (const [suffix, dark] of [
    ["", false],
    ["-d", true],
  ] as const) {
    const p = statusPalette(colors, dark);
    for (const s of STATUSES) {
      vars[`--st-${s}-bg${suffix}`] = p[s].bg;
      vars[`--st-${s}-fg${suffix}`] = p[s].fg;
    }
  }
  return vars;
}

/**
 * Status sel pivot: tiap nilai (m) dibandingkan dengan sel baris terdalam nilai yang sama di seluruh
 * kolom data (semua periode), tanpa baris kelompok/subtotal/Total dan kolom Total — seperti memilih
 * rentang isi PivotTable di Excel. `tones[m]` = arah nilai ke-m (urut spec); kolom data ke-j milik
 * nilai j mod jumlah nilai. null bila tidak ada nilai berarah.
 */
export function pivotStatus(
  model: {
    valueHeads: readonly { total: boolean }[];
    rows: readonly { kind: string; values: readonly unknown[] }[];
  },
  tones: readonly (Tone | undefined)[],
): ((row: { kind: string }, value: unknown, j: number) => Status | null) | null {
  const nv = tones.length;
  if (!nv || !tones.some(Boolean)) return null;
  const ranges = tones.map((tone, m) => {
    if (!tone) return null;
    const vals: unknown[] = [];
    for (const r of model.rows) {
      if (r.kind !== "leaf") continue;
      r.values.forEach((v, j) => {
        if (j % nv === m && !model.valueHeads[j]?.total) vals.push(v);
      });
    }
    return statusRange(vals);
  });
  return (row, value, j) => {
    if (row.kind !== "leaf" || model.valueHeads[j]?.total) return null;
    const m = j % nv;
    return statusOf(value, tones[m], ranges[m] ?? null);
  };
}

/** Pengaturan warna status widget pivot/grafik; undefined bila tidak ada nilai berarah. */
export interface WidgetStatus {
  tones: (Tone | undefined)[];
  colors?: WidgetColors;
}
export function specStatus(spec: {
  values?: readonly object[];
  measure?: object;
  colors?: WidgetColors;
}): WidgetStatus | undefined {
  const vals = spec.values ?? (spec.measure ? [spec.measure] : []);
  const tones = vals.map((v) => (v as { tone?: Tone }).tone);
  if (!tones.some(Boolean)) return undefined;
  return { tones, ...(spec.colors ? { colors: spec.colors } : {}) };
}
