/*
 * Nama file ekspor (T-017, E14): "<judul widget atau widget>-<YYYYMMDD-HHmm Asia/Jakarta>.<ext>". Judul
 * berasal dari user, jadi disanitasi sebelum masuk header Content-Disposition (tanpa " \ ; / CR LF dan
 * karakter kendali → tidak bisa menyisipkan parameter/header lain) dan nama sheet Excel. Murni.
 */
import { JAKARTA_TZ } from "@/features/query/filters";

/** Panjang judul di nama file (titik kode); nama lengkap tetap pendek untuk sistem berkas mana pun. */
const TITLE_MAX = 80;

const STAMP = new Intl.DateTimeFormat("en-GB", {
  timeZone: JAKARTA_TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/** Waktu Asia/Jakarta sebagai YYYYMMDD-HHmm. */
export function jakartaStamp(at: Date): string {
  const p = Object.fromEntries(STAMP.formatToParts(at).map((x) => [x.type, x.value]));
  return `${p.year}${p.month}${p.day}-${p.hour}${p.minute}`;
}

/**
 * Judul aman untuk nama file: tanpa karakter kendali (termasuk CR/LF), tanpa " \ / ; serta karakter
 * yang ditolak sistem berkas (< > : | ? *), spasi dirapatkan, titik/spasi di ujung dibuang.
 */
export function cleanTitle(title: string): string {
  const s = title
    .normalize("NFC")
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029"\\/;<>:|?*]/g, " ")
    .replace(/\s+/g, " ")
    .replace(/^[\s.]+|[\s.]+$/g, "");
  return (
    [...s]
      .slice(0, TITLE_MAX)
      .join("")
      .replace(/[\s.]+$/, "") || "widget"
  );
}

export function exportFileName(title: string, at: Date, ext: "csv" | "xlsx"): string {
  return `${cleanTitle(title)}-${jakartaStamp(at)}.${ext}`;
}

/** Cadangan ASCII untuk filename="…": huruf beraksen → huruf dasar, sisanya non-ASCII/% → "_". */
export function asciiFileName(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .replace(/[^\x20-\x7e]|[%"\\;]/g, "_")
    .replace(/_+/g, "_");
}

/** RFC 5987 ext-value (UTF-8''…): encodeURIComponent juga meloloskan ' ( ) * yang tidak boleh. */
const rfc5987 = (s: string) =>
  encodeURIComponent(s).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);

/**
 * Header Content-Disposition unduhan: attachment + filename ASCII + filename* UTF-8 (RFC 6266). Nama
 * dibersihkan lagi di sini sehingga aman walau dipanggil dengan nama dari sumber lain.
 */
export function contentDisposition(fileName: string): string {
  const dot = fileName.lastIndexOf(".");
  const ext = dot > 0 ? fileName.slice(dot + 1).replace(/[^a-z0-9]/gi, "") : "";
  const base = cleanTitle(dot > 0 ? fileName.slice(0, dot) : fileName);
  const name = ext ? `${base}.${ext}` : base;
  return `attachment; filename="${asciiFileName(name)}"; filename*=UTF-8''${rfc5987(name)}`;
}

/** Excel: nama sheet ≤ 31 karakter, tanpa [ ] : * ? / \, tidak diawali/diakhiri ', bukan "History". */
export function sheetName(title: string): string {
  const s = title
    .normalize("NFC")
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f-\u009f[\]:*?/\\]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^'+|'+$/g, "")
    .trim();
  // ≤ 31 unit UTF-16 tanpa memotong pasangan surrogate.
  let out = "";
  for (const ch of s) {
    if (out.length + ch.length > 31) break;
    out += ch;
  }
  out = out.replace(/'+$/, "").trim();
  return !out || out.toLowerCase() === "history" ? "Data" : out;
}
