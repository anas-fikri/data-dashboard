/*
 * Teks bebas dari pengguna yang ditampilkan ke orang lain (nama tampilan, kata kunci cari).
 * Tanpa "server-only": aman dipakai juga saat render di klien.
 */

/** Karakter kontrol (\p{Cc}) dan format (\p{Cf}): termasuk bidi U+202A–202E, U+2066–2069, U+200B–200F. */
const INVISIBLE = /[\p{Cc}\p{Cf}]/gu;

/**
 * Teks satu baris yang aman ditampilkan: NFC, semua jenis spasi/baris baru jadi satu spasi, karakter
 * kontrol/format (termasuk penimpa arah teks seperti U+202E RLO) dibuang, ujung di-trim, dipotong
 * per code point. Kosong → null.
 */
export function cleanLine(raw: unknown, max: number): string | null {
  if (typeof raw !== "string") return null;
  const s = raw
    .normalize("NFC")
    .replace(/\s+/g, " ")
    .replace(INVISIBLE, "")
    .replace(/ {2,}/g, " ")
    .trim();
  const cut = Array.from(s).slice(0, max).join("").trim();
  return cut || null;
}

export const USER_NAME_MAX = 80;

/** Nama tampilan pengguna (registrasi, dan setiap jalur baca untuk data lama). */
export const cleanName = (raw: unknown): string | null => cleanLine(raw, USER_NAME_MAX);

/**
 * Nama yang memuat tanda @ (termasuk varian lebar penuh/kecil) bisa menyamar sebagai email pengguna
 * lain di daftar admin; nama orang tidak memerlukannya.
 */
export const looksLikeEmail = (name: string): boolean => /[@\uFE6B\uFF20]/.test(name);

/**
 * Escape wildcard LIKE/ILIKE PostgreSQL (escape bawaan = backslash). Prisma `contains` tidak
 * meng-escape `%` dan `_`, jadi q="_" akan cocok dengan semua baris.
 */
export const escapeLike = (s: string): string => s.replace(/[\\%_]/g, (c) => `\\${c}`);
