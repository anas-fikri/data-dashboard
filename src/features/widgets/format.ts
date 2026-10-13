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

/** "-0", "-0%", "-Rp 0" (nilai negatif kecil yang dibulatkan ke nol) ditampilkan tanpa minus. */
const noNegZero = (text: string) =>
  text.startsWith("-") && !/[1-9]/.test(text) ? text.slice(1) : text;

export function formatNumber(value: number, format: NumberFormat): string {
  if (format.style === "auto") {
    // Maks. 2 desimal; nilai bukan nol yang lebih kecil dari 0,01 tetap terbaca (0,0004, bukan 0).
    const tiny = value !== 0 && Math.abs(value) < 0.01;
    return noNegZero(
      nf(tiny ? { maximumSignificantDigits: 2 } : { maximumFractionDigits: 2 }).format(value),
    );
  }
  const digits = { minimumFractionDigits: format.decimals, maximumFractionDigits: format.decimals };
  if (format.style === "percent")
    return noNegZero(nf({ style: "percent", ...digits }).format(value));
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
 * nama sumbu, bukan di tiap angka (review desain T-011 H3). 3 angka penting: garis sumbu 0,02 / 0,05 /
 * 1,25 jt tidak dibulatkan jadi "0" atau label kembar.
 */
export function formatAxis(value: number, format: NumberFormat): string {
  const sig = { maximumSignificantDigits: 3 };
  if (format.style === "percent") return noNegZero(nf({ style: "percent", ...sig }).format(value));
  return noNegZero(nf({ notation: "compact", ...sig }).format(value));
}

/**
 * Nilai ringkas untuk kartu sempit ("Rp 3,97 jt", "43,6%"); nilai lengkap tetap di title/sr-only.
 * Format pilihan (bukan "Otomatis"): nilai yang tidak disingkat (< 1.000, persen) tidak lebih teliti
 * dari nilai lengkap — "Rp 12" untuk 12,345 dengan 0 desimal, bukan "Rp 12,35".
 */
export function formatCompact(value: number, format: NumberFormat): string {
  const chosen = format.style !== "auto";
  const digits = (max: number) => (chosen ? Math.min(max, format.decimals) : max);
  if (format.style === "percent")
    return noNegZero(nf({ style: "percent", maximumFractionDigits: digits(1) }).format(value));
  // Nilai bukan nol < 0,01 tetap terbaca (0,004, bukan 0) — aturan yang sama dengan "Otomatis".
  const tiny = !chosen && value !== 0 && Math.abs(value) < 0.01;
  const opts: Intl.NumberFormatOptions = tiny
    ? { maximumSignificantDigits: 2 }
    : {
        notation: "compact",
        maximumFractionDigits: Math.abs(value) < 1000 ? digits(2) : 2,
      };
  if (format.style !== "rupiah") return noNegZero(nf(opts).format(value));
  // Tanda minus di depan "Rp", sama dengan formatNumber ("-Rp 3,97 jt"); "Rp 0" tanpa minus.
  return noNegZero(`${value < 0 ? "-" : ""}Rp ${nf(opts).format(Math.abs(value))}`);
}

/**
 * Nilai ukuran grafik (tooltip, tabel data, daftar peringkat): durasi (detik) j:mm:dd bila format
 * "Otomatis" — sama dengan KPI dan tabel — selain itu format angka pilihan.
 */
export function formatMeasure(
  value: number | null,
  type: ValueType | undefined,
  format: NumberFormat,
  compact = false,
): string {
  if (value === null) return "(kosong)";
  if (type === "duration" && format.style === "auto") return formatDuration(value);
  return compact ? formatCompact(value, format) : formatNumber(value, format);
}

/** Format yang dipakai sel tabel: format pilihan untuk kolom terpilih, selebihnya otomatis. */
export const AUTO_FORMAT: NumberFormat = { style: "auto", decimals: 0 };

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];

/** Awalan label minggu ("Mg 19 Jan 2026") — bukan bagian pembeda saat label dipendekkan. */
export const WEEK_PREFIX = "Mg";

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
      return `${WEEK_PREFIX} ${Number(d)} ${month} ${y}`;
    default:
      return `${Number(d)} ${month} ${y}${withTime && h ? ` ${h}:${mi}` : ""}`;
  }
}

/**
 * Bentuk label tanggal yang makin pendek untuk daftar sempit, satu bentuk untuk seluruh daftar (dicoba
 * dari yang terpanjang), disusun dari bagian utuh — tidak pernah dipotong per huruf:
 * minggu 'Mg 19 Jan 2026' → 'Mg 19 Jan' → 'Mg 19/1/26' → 'Mg 19/1' → '19/1/26' → '19/1';
 * hari '19 Jan 2026' → '19 Jan' → '19/1/26' → '19/1'; bulan 'Jan 2026' → 'Jan' → '1/26';
 * kuartal 'K1 2026' → 'K1' → 'K1/26'; cap waktu '19 Jan 2026 13:30' → '19 Jan 13:30' →
 * '19/1/26 13:30' → '19/1 13:30' → '13:30'.
 * Bentuk tanpa tahun hanya ditawarkan bila tetap unik di SEMUA baris yang dimuat (`all`), bukan hanya
 * yang tampil — 'Mg 19/1' juga untuk deret Des 2025–Jan 2026 selama tidak ada dua minggu bertanggal dan
 * berbulan sama; deret lintas tahun mencoba angka bertahun ('Mg 19/1/26') sebelum teks tanpa tahun.
 * Jam saja hanya bila semua cap waktu yang dimuat di hari yang sama. Bentuk bertahun selalu unik.
 * null = bukan tanggal (label tetap).
 */
export function dateLabelForms(
  isos: readonly (string | null)[],
  grain?: string,
  withTime = false,
  all: readonly (string | null)[] = isos,
): (string | null)[][] {
  const parse = (iso: string | null) =>
    iso ? /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/.exec(iso) : null;
  const parts = isos.map(parse);
  const loaded = [...all, ...isos].map(parse).filter((p) => p !== null);
  type Part = (p: RegExpExecArray) => string;
  const full: Part = (p) => formatDate(p[0], grain, withTime);
  // Unik = tidak ada dua periode berbeda (label lengkap berbeda) yang menjadi teks yang sama.
  const fullCount = new Set(loaded.map(full)).size;
  const unique = (f: Part) => new Set(loaded.map(f)).size === fullCount;
  const sameDay =
    withTime &&
    loaded.every((p) => p[4]) &&
    new Set(loaded.map((p) => p.slice(1, 4).join("-"))).size <= 1;
  const month: Part = (p) => MONTHS[Number(p[2]) - 1] ?? p[2]!;
  const time: Part = (p) => (withTime && p[4] ? ` ${p[4]}:${p[5]}` : "");
  const dayMonth: Part = (p) => `${Number(p[3])}/${Number(p[2])}`;
  const yy: Part = (p) => p[1]!.slice(2);
  const quarter: Part = (p) => `K${Math.floor((Number(p[2]) - 1) / 3) + 1}`;
  // [bentuk, bertahun]: bentuk tanpa tahun/tanggal ikut hanya bila unik.
  let candidates: [Part, boolean][];
  switch (grain) {
    case "year":
      candidates = [[full, true]];
      break;
    case "quarter":
      candidates = [
        [full, true],
        [quarter, false],
        [(p) => `${quarter(p)}/${yy(p)}`, true],
      ];
      break;
    case "month":
      candidates = [
        [full, true],
        [month, false],
        [(p) => `${Number(p[2])}/${yy(p)}`, true],
      ];
      break;
    case "week":
      candidates = [
        [full, true],
        [(p) => `${WEEK_PREFIX} ${Number(p[3])} ${month(p)}`, false],
        [(p) => `${WEEK_PREFIX} ${dayMonth(p)}/${yy(p)}`, true],
        [(p) => `${WEEK_PREFIX} ${dayMonth(p)}`, false],
        [(p) => `${dayMonth(p)}/${yy(p)}`, true],
        [dayMonth, false],
      ];
      break;
    default:
      candidates = [
        [full, true],
        [(p) => `${Number(p[3])} ${month(p)}${time(p)}`, false],
        [(p) => `${dayMonth(p)}/${yy(p)}${time(p)}`, true],
        [(p) => `${dayMonth(p)}${time(p)}`, false],
      ];
      if (sameDay) candidates.push([(p) => `${p[4]}:${p[5]}`, false]);
  }
  // Deret lintas tahun: angka bertahun ('Mg 22/12/25') dicoba sebelum teks tanpa tahun ('Mg 22 Des') —
  // tahun tetap terlihat selama muat; setahun: tahun tidak membedakan apa pun, teks lebih dulu.
  if (grain !== "year" && new Set(loaded.map((p) => p[1])).size > 1)
    [candidates[1], candidates[2]] = [candidates[2]!, candidates[1]!];
  // Tahun boleh hilang hanya bila baris tampil setahun kalender atau ≤ 183 hari ('31/12' lalu '1/1'
  // terbaca berurutan); 'Mg 22 Des' 2025 di samping 'Mg 23 Des' 2024 akan terbaca bulan yang sama.
  const shown = parts.filter((p) => p !== null);
  const days = shown.map((p) => Date.UTC(+p[1]!, +p[2]! - 1, +p[3]!) / 864e5);
  const withinYear =
    new Set(shown.map((p) => p[1])).size <= 1 || Math.max(...days) - Math.min(...days) <= 183;
  return candidates
    .filter(([f, withYear]) => withYear || (withinYear && unique(f)))
    .map(([f]) => parts.map((p) => (p ? f(p) : null)));
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
