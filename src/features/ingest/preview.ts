/*
 * Pratinjau baris mentah awal per sheet (T-008): halaman skema memakainya untuk memilih ulang baris
 * header tanpa mengunduh raw.parquet. Sumbernya sampel tebakan header (SAMPLE_ROWS baris tersimpan
 * pertama), dibatasi kolom dan panjang sel agar baris Sheet tetap kecil walau sheet lebar atau bersel
 * panjang (≤ 30 × 50 × 100 karakter).
 */
import type { SampleRow } from "./header";
import { rawText } from "./raw-text";

export const PREVIEW_COLS = 50;
export const PREVIEW_CHARS = 100;

export interface SheetPreview {
  /** Jumlah kolom sheet; pratinjau memuat ≤ PREVIEW_COLS pertama. */
  colCount: number;
  /** Baris tersimpan pertama (baris kosong tidak ada di raw), urut nomor baris fisik. */
  rows: { row: number; cells: (string | null)[] }[];
}

export function previewOf(sample: SampleRow[], colCount: number): SheetPreview {
  const width = Math.min(colCount, PREVIEW_COLS);
  return {
    colCount,
    rows: [...sample]
      .sort((a, b) => a.row - b.row)
      .map((r) => ({
        row: r.row,
        cells: Array.from({ length: width }, (_, i) => {
          const t = rawText(r.vals[i]);
          return t === null ? null : t.slice(0, PREVIEW_CHARS);
        }),
      })),
  };
}

/** Sheet.preview dari DB (Json) → SheetPreview, atau null bila tidak ada/bentuknya tidak dikenal. */
export function parsePreview(v: unknown): SheetPreview | null {
  if (!v || typeof v !== "object") return null;
  const p = v as Partial<SheetPreview>;
  if (typeof p.colCount !== "number" || !Array.isArray(p.rows)) return null;
  return p as SheetPreview;
}
