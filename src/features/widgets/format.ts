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

export function formatNumber(value: number, format: NumberFormat): string {
  if (format.style === "auto") return nf({ maximumFractionDigits: 2 }).format(value);
  const digits = { minimumFractionDigits: format.decimals, maximumFractionDigits: format.decimals };
  if (format.style === "percent") return nf({ style: "percent", ...digits }).format(value);
  if (format.style === "rupiah") {
    const text = nf(digits).format(Math.abs(value));
    // Nilai yang dibulatkan ke 0 tidak diberi tanda minus ("-Rp 0").
    return `${value < 0 && text.replace(/[0.,]/g, "") !== "" ? "-" : ""}Rp ${text}`;
  }
  return nf(digits).format(value);
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
  const text = nf({ notation: "compact", maximumFractionDigits: 2 }).format(value);
  return format.style === "rupiah" ? `Rp ${text}` : text;
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
    case "duration":
      return typeof value === "number" ? formatNumber(value, format) : String(value);
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
