/*
 * Teks perubahan baris satu sheet saat memulihkan periode (T-056 review L1). Modul tanpa impor agar aman
 * dipakai komponen klien (period-manage-plan menarik modul Node).
 */
const fmt = (n: number) => n.toLocaleString("id-ID");

/** "28 → 40 baris", "tidak ada → 40 baris", "5 → tidak ada (baris periode ini dilepas dari sheet ini)". */
export function sheetChange(s: { before: number | null; after: number | null }): string {
  const n = (x: number | null) => (x === null ? "tidak ada" : `${fmt(x)}`);
  if (s.after === null)
    return `${n(s.before)} → tidak ada (baris periode ini dilepas dari sheet ini)`;
  return `${n(s.before)} → ${fmt(s.after)} baris`;
}
