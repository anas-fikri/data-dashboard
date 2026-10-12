/*
 * Nilai sel → teks raw (T-006). Modul sendiri (tanpa DuckDB) karena dipakai juga oleh header.ts:
 * nama kolom dari parser (ingest) dan dari raw.parquet (recast T-007) harus berbentuk sama.
 */
import type { RawValue } from "@/lib/xlsx/types";

const pad = (n: number, w = 2) => String(n).padStart(w, "0");

/** Nilai sel → teks raw. Tanggal naive ISO (D8): tanpa jam bila 00:00:00. */
export function rawText(v: RawValue): string | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "string") return v === "" ? null : v;
  if (typeof v === "boolean") return v ? "TRUE" : "FALSE";
  if (typeof v === "number") return Number.isFinite(v) ? String(v) : null;
  const d = `${pad(v.getUTCFullYear(), 4)}-${pad(v.getUTCMonth() + 1)}-${pad(v.getUTCDate())}`;
  const h = v.getUTCHours();
  const m = v.getUTCMinutes();
  const s = v.getUTCSeconds();
  return h || m || s ? `${d}T${pad(h)}:${pad(m)}:${pad(s)}` : d;
}
