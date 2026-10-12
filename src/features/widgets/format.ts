/*
 * Format tampilan nilai widget (T-011, D11): angka ribuan id-ID ("1.234.567,5"), persen dari rasio
 * (0,256 → "25,6%"), rupiah "Rp 1.234.568" dengan spasi biasa U+0020 (bukan U+00A0 bawaan
 * Intl currency, agar sama persis saat disalin ke Excel/WA). Tanggal id-ID tanpa zona waktu (nilai
 * DuckDB naive dikirim sebagai teks ISO). Murni; dipakai server (uji) dan klien.
 */
import type { NumberFormat } from "./spec";

const numberFormats = new Map<string, Intl.NumberFormat>();
function nf(options: Intl.NumberFormatOptions): Intl.NumberFormat {
  const key = JSON.stringify(options);
  let f = numberFormats.get(key);
  if (!f) {
    f = new Intl.NumberFormat("id-ID", options);
    numberFormats.set(key, f);
  }
  return f;
}

/** "-0" (nilai negatif kecil yang dibulatkan ke nol) ditampilkan "0". */
const noNegZero = (text: string) => (/^-[0.,\s]*$/.test(text) ? text.slice(1) : text);

export function formatNumber(value: number, format: NumberFormat): string {
  if (format.style === "auto") {
    // Maks. 2 desimal; nilai bukan nol yang lebih kecil dari 0,01 tetap terbaca (0,0004, bukan 0).
    const tiny = value !== 0 && Math.abs(value) < 0.01;
    return noNegZero(
      nf(tiny ? { maximumSignificantDigits: 2 } : { maximumFractionDigits: 2 }).format(value),
    );
  }
  const digits = { minimumFractionDigits: format.decimals, maximumFractionDigits: format.decimals };
  if (format.style === "percent") return nf({ style: "percent", ...digits }).format(value);
  if (format.style === "rupiah") {
    const text = nf(digits).format(Math.abs(value));
    // Nilai yang dibulatkan ke 0 tidak diberi tanda minus ("-Rp 0").
    return `${value < 0 && text.replace(/[0.,]/g, "") !== "" ? "-" : ""}Rp ${text}`;
  }
  return noNegZero(nf(digits).format(value));
}

/** Label kategori angka (tahun, kode, nomor): tanpa pemisah ribuan — 2024, bukan 2.024. */
export function formatLabelNumber(value: number): string {
  return nf({ useGrouping: false, maximumFractionDigits: 2 }).format(value);
}

/** Durasi dari detik: "1:05:09", "26 hari 3:00" (Excel menyimpan durasi sebagai jam:menit:detik). */
export function formatDuration(seconds: number): string {
  const sign = seconds < 0 ? "-" : "";
  let s = Math.round(Math.abs(seconds));
  const days = Math.floor(s / 86_400);
  s -= days * 86_400;
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return days ? `${sign}${days} hari ${h}:${pad(m)}` : `${sign}${h}:${pad(m)}:${pad(sec)}`;
}

/**
 * Angka ringkas untuk sumbu grafik: 1,2 rb / 3,4 jt / 5,6 M. Tanpa "Rp" — satuan ditulis sekali di
 * nama sumbu, bukan di tiap angka (review desain T-011 H3).
 */
export function formatAxis(value: number, format: NumberFormat): string {
  if (format.style === "percent")
    return nf({ style: "percent", maximumFractionDigits: 1 }).format(value);
  return nf({ notation: "compact", maximumFractionDigits: 1 }).format(value);
}

/** Nilai ringkas untuk kartu sempit ("Rp 3,97 jt", "43,6%"); nilai lengkap tetap di title/sr-only. */
export function formatCompact(value: number, format: NumberFormat): string {
  if (format.style === "percent")
    return nf({ style: "percent", maximumFractionDigits: 1 }).format(value);
  if (format.style !== "rupiah")
    return nf({ notation: "compact", maximumFractionDigits: 2 }).format(value);
  // Tanda minus di depan "Rp", sama dengan formatNumber ("-Rp 3,97 jt").
  const text = nf({ notation: "compact", maximumFractionDigits: 2 }).format(Math.abs(value));
  return `${value < 0 ? "-" : ""}Rp ${text}`;
}

/** Format yang dipakai sel tabel: format pilihan untuk kolom terpilih, selebihnya otomatis. */
export const AUTO_FORMAT: NumberFormat = { style: "auto", decimals: 0 };

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];

/** Tanggal/waktu ISO naive ("2026-10-12" / "2026-10-12T08:30:00") → teks id-ID sesuai grain. */
export function formatDate(iso: string, grain?: string, withTime = false): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/.exec(iso);
  if (!m) return iso;
  const [, y, mo, d, h, mi] = m;
  const month = MONTHS[Number(mo) - 1] ?? mo;
  switch (grain) {
    case "year":
      return y!;
    case "quarter":
      return `K${Math.floor((Number(mo) - 1) / 3) + 1} ${y}`;
    case "month":
      return `${month} ${y}`;
    case "week":
      return `Mg ${Number(d)} ${month} ${y}`;
    default:
      return `${Number(d)} ${month} ${y}${withTime && h ? ` ${h}:${mi}` : ""}`;
  }
}

export type ValueType =
  "text" | "integer" | "decimal" | "duration" | "date" | "timestamp" | "boolean" | "count";

/** Satu sel/label sebagai teks (React meng-escape; ECharts lewat formatter yang meng-escape). */
export function formatCell(
  value: unknown,
  type: ValueType,
  format: NumberFormat,
  grain?: string,
): string {
  if (value === null || value === undefined || value === "") return "(kosong)";
  switch (type) {
    case "integer":
    case "decimal":
      return typeof value === "number" ? formatNumber(value, format) : String(value);
    case "duration":
      // Durasi tetap jam:menit:detik kecuali user memilih format angka tertentu.
      return typeof value === "number"
        ? format.style === "auto"
          ? formatDuration(value)
          : formatNumber(value, format)
        : String(value);
    case "count":
      return typeof value === "number"
        ? formatNumber(value, { style: "number", decimals: 0 })
        : String(value);
    case "date":
      return formatDate(String(value), grain);
    case "timestamp":
      return formatDate(String(value), grain, !grain);
    case "boolean":
      return value === true ? "Ya" : value === false ? "Tidak" : String(value);
    default:
      return String(value);
  }
}
