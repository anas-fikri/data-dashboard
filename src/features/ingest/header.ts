/*
 * Header sebagai metadata (flow-kerja B3): raw.parquet menyimpan semua baris; di sini hanya ditebak
 * baris header dan dibentuk nama kolom. Fungsi murni (dipakai worker dan diuji unit).
 */
import type { RawValue } from "@/lib/xlsx/types";

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
 * Tebak baris header: baris pertama (dari sampel) yang terisi ≥ 50% lebar tabel dan ≥ 60% sel
 * terisinya berupa teks unik (bukan angka/tanggal). Baris judul (satu sel) dan baris data
 * (banyak angka/tanggal) terlewati. Tanpa kandidat → baris terisi pertama.
 */
export function guessHeaderRow(sample: SampleRow[]): number {
  if (sample.length === 0) return 1;
  const filled = (r: SampleRow) => r.vals.reduce((n: number, v) => n + (isEmpty(v) ? 0 : 1), 0);
  const width = Math.max(...sample.map(filled));
  const minFilled = Math.max(1, Math.ceil(width * 0.5));
  for (const r of sample) {
    const n = filled(r);
    if (n < minFilled) continue;
    const distinct = new Set<string>();
    for (const v of r.vals) if (isTextLike(v)) distinct.add(v.trim().toLowerCase());
    if (distinct.size / n >= 0.6) return r.row;
  }
  return (sample.find((r) => filled(r) >= minFilled) ?? sample[0]!).row;
}

/** Bentuk teks asli sebuah nilai header. */
export function headerText(v: RawValue): string {
  if (v === null || v === undefined) return "";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v);
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
