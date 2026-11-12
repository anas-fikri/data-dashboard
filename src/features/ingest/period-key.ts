/*
 * Kunci baris unggahan "Perbarui berdasarkan kunci" (v1.20, ADR-0011). Murni (dipakai worker dan app):
 * nilai kolom bertipe sebagai teks ter-trim; NULL bila salah satu kolom kunci kosong.
 */

const SEP = "chr(31)";

/** Ekspresi SQL kunci satu baris typed: teks ter-trim, NULL bila salah satu kolom kunci kosong. */
export function keySql(positions: readonly number[]): string {
  const part = (p: number) => `nullif(trim(CAST(c${Math.trunc(p)} AS VARCHAR)), '')`;
  if (positions.length === 1) return part(positions[0]!);
  const parts = positions.map(part);
  return `CASE WHEN ${parts.map((x) => `${x} IS NULL`).join(" OR ")} THEN NULL ELSE concat_ws(${SEP}, ${parts.join(", ")}) END`;
}
