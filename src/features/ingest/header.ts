/*
 * Header sebagai metadata (flow-kerja B3): raw.parquet menyimpan semua baris; di sini hanya ditebak
 * baris header dan dibentuk nama kolom. Fungsi murni (dipakai worker dan diuji unit).
 */
import type { RawValue } from "@/lib/xlsx/types";
import { rawText } from "./raw-text";

export interface SampleRow {
  row: number;
  vals: RawValue[];
}

export interface ColumnMeta {
  /** Posisi 1-based = kolom cN di raw.parquet. */
  pos: number;
  /** Nama unik deterministik (dipakai skema/widget). */
  name: string;
  /** Nama asli apa adanya (termasuk kutip, titik koma, baris baru) — dipakai memetakan versi refresh. */
  original: string;
}

const NUMERIC = /^[-+]?(\d[\d.,\s]*|\.\d+)%?$/;
const DATE_TEXT = /^\d{1,4}[-/.]\d{1,2}[-/.]\d{1,4}/;

const isEmpty = (v: RawValue) => v === null || v === undefined || v === "";

/** Teks "nyata": string yang bukan angka/tanggal terformat. */
function isTextLike(v: RawValue): v is string {
  if (typeof v !== "string") return false;
  const t = v.trim();
  return t !== "" && !NUMERIC.test(t) && !DATE_TEXT.test(t);
}

/**
 * Tebak baris header di antara baris sampel yang terisi ≥ 50% lebar tabel (baris judul satu sel
 * terlewati): skor = proporsi sel teks (bukan angka/tanggal), ditambah sedikit untuk keunikan. Header
 * hampir seluruhnya label, baris data bercampur angka/tanggal; header dengan nama duplikat
 * ("Keterangan" ×5) tetap menang karena keunikan hanya penentu sekunder. Skor sama → baris paling
 * awal (header selalu mendahului data). Skor teks < 60% → baris terisi pertama.
 */
export function guessHeaderRow(sample: SampleRow[]): number {
  if (sample.length === 0) return 1;
  const filled = (r: SampleRow) => r.vals.reduce((n: number, v) => n + (isEmpty(v) ? 0 : 1), 0);
  const width = Math.max(...sample.map(filled));
  const minFilled = Math.max(1, Math.ceil(width * 0.5));
  let best: { row: number; score: number } | null = null;
  for (const r of sample) {
    const n = filled(r);
    if (n < minFilled) continue;
    let text = 0;
    const distinct = new Set<string>();
    for (const v of r.vals) {
      if (isTextLike(v)) {
        text++;
        distinct.add(v.trim().toLowerCase());
      }
    }
    const textRatio = text / n;
    if (textRatio < 0.6) continue;
    const score = textRatio + 0.05 * (distinct.size / n);
    if (!best || score > best.score + 1e-9) best = { row: r.row, score };
  }
  return best?.row ?? (sample.find((r) => filled(r) >= minFilled) ?? sample[0]!).row;
}

/** Panjang maksimum nama asli yang disimpan. */
const ORIGINAL_MAX = 256;

/**
 * Bentuk teks asli sebuah nilai header: sama dengan teks di raw.parquet (rawText), sehingga nama dari
 * parser (ingest) dan dari raw (recast saat baris header diganti) identik (review T-007 L9).
 */
export function headerText(v: RawValue): string {
  return (rawText(v) ?? "").slice(0, ORIGINAL_MAX);
}

/**
 * Nama kolom unik deterministik: rapikan spasi; kosong → kolom_<pos>; duplikat (tidak peka kapital)
 * → "Total", "Total_2", "Total_3" … dengan melewati nama yang sudah dipakai.
 */
export function columnNames(headerVals: RawValue[], colCount: number): ColumnMeta[] {
  const used = new Set<string>();
  const out: ColumnMeta[] = [];
  for (let pos = 1; pos <= colCount; pos++) {
    const original = headerText(headerVals[pos - 1]);
    const base = original.replace(/\s+/g, " ").trim().slice(0, 120) || `kolom_${pos}`;
    let name = base;
    for (let k = 2; used.has(name.toLowerCase()); k++) name = `${base}_${k}`;
    used.add(name.toLowerCase());
    out.push({ pos, name, original });
  }
  return out;
}
