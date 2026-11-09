/*
 * Format tampilan Admin › Backup (T-tsvf) yang sama persis di server dan browser: waktu WIB disusun sendiri
 * (bukan toLocaleString — data ICU Node dan browser bisa berbeda dan memicu hydration mismatch).
 */

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
const WIB_MS = 7 * 60 * 60 * 1000;
const pad = (n: number) => String(n).padStart(2, "0");

/** "9 Nov 2026 17.05 WIB"; null/tidak valid → null. */
export function formatWib(iso: string | null | undefined): string | null {
  const t = iso ? Date.parse(iso) : NaN;
  if (!Number.isFinite(t)) return null;
  const d = new Date(t + WIB_MS);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()} ${pad(d.getUTCHours())}.${pad(d.getUTCMinutes())} WIB`;
}

/** "17.05 WIB" saja (untuk kejadian hari ini/berjalan). */
export function formatWibTime(iso: string | null | undefined): string | null {
  const t = iso ? Date.parse(iso) : NaN;
  if (!Number.isFinite(t)) return null;
  const d = new Date(t + WIB_MS);
  return `${pad(d.getUTCHours())}.${pad(d.getUTCMinutes())} WIB`;
}

/** Ukuran dengan satuan biner (KB … TB), koma desimal Indonesia, tanpa Intl. */
export function formatSize(bytes: number): string {
  const units = ["KB", "MB", "GB", "TB"];
  let v = Math.max(bytes, 0) / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  const digits = i >= 2 && v < 100 ? 1 : 0;
  const text = (digits ? v.toFixed(1) : String(Math.max(1, Math.round(v)))).replace(".", ",");
  return `${text.replace(/,0$/, "")} ${units[i]}`;
}
