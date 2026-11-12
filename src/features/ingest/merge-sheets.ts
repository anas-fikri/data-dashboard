/*
 * Gabungkan sheet berkolom sama (T-0gmm, v1.16): data yang dipecah ke beberapa sheet karena batas baris
 * Excel (1.048.576) menjadi satu sheet logis — satu segmen per sheet asal, urut sheet di file. Murni.
 *
 * Aturan: dua sheet satu kelompok bila jumlah kolom dan judul semua kolomnya sama (abaikan besar/kecil
 * huruf dan spasi berlebih; baris judulnya boleh beda posisi). Sheet tanpa kolom tidak pernah
 * digabung. Kelompok dinamai sheet pertamanya; sheet berkolom lain tetap sheet sendiri.
 */
import type { ColumnMeta } from "./header";

/** Judul kolom untuk perbandingan: trim, spasi tunggal, huruf kecil. */
const norm = (s: string) => s.replace(/\s+/g, " ").trim().toLocaleLowerCase("id-ID");

/** Kunci bentuk kolom sheet; null = sheet tanpa kolom (tidak digabung). */
export function columnsKey(rec: { colCount: number; columns: ColumnMeta[] }): string | null {
  if (rec.colCount < 1 || rec.columns.length === 0) return null;
  const byPos = new Map(rec.columns.map((c) => [c.pos, c]));
  const parts: string[] = [];
  for (let pos = 1; pos <= rec.colCount; pos++) {
    const c = byPos.get(pos);
    parts.push(norm(c ? c.original || c.name : ""));
  }
  return `${rec.colCount}\u0000${parts.join("\u0001")}`;
}

/**
 * Kelompok indeks sheet (urut kemunculan; anggota urut sheet di file). Kelompok satu anggota = sheet
 * biasa. `merge` false → setiap sheet kelompoknya sendiri.
 */
export function sheetGroups(
  recs: readonly { colCount: number; columns: ColumnMeta[] }[],
  merge: boolean,
): number[][] {
  if (!merge) return recs.map((_, i) => [i]);
  const groups: number[][] = [];
  const byKey = new Map<string, number[]>();
  recs.forEach((r, i) => {
    const key = columnsKey(r);
    const g = key === null ? undefined : byKey.get(key);
    if (g) {
      g.push(i);
      return;
    }
    const fresh = [i];
    groups.push(fresh);
    if (key !== null) byKey.set(key, fresh);
  });
  return groups;
}

/*
 * Sheet lanjutan tanpa judul (v1.19.1): ekspor yang dipecah per 1.048.576 baris sering hanya memberi judul di
 * sheet pertama — sheet berikutnya langsung berisi data, sehingga "judul" yang terdeteksi adalah baris data.
 * Sheet seperti itu dikenali dari pratinjaunya dan memakai judul sheet sebelumnya; seluruh barisnya data
 * (headerRow 0 → `_row > 0`).
 */
type Cell = string | null;
type ValueClass = "empty" | "num" | "date" | "text";
const NUMERIC = /^[-+]?(\d[\d.,\s]*|\.\d+)%?$/;
const DATE_TEXT = /^\d{1,4}[-/.]\d{1,2}[-/.]\d{1,4}/;
const classOf = (v: Cell): ValueClass => {
  const t = (v ?? "").trim();
  if (!t) return "empty";
  if (DATE_TEXT.test(t)) return "date";
  if (NUMERIC.test(t)) return "num";
  return "text";
};

export interface ContinuationRec {
  colCount: number;
  headerRow: number;
  columns: ColumnMeta[];
  preview: { rows: { row: number; cells: Cell[] }[] };
}

/**
 * `cand` adalah lanjutan tanpa judul dari `leader`: jumlah kolom sama, baris pertamanya tidak memuat judul
 * leader, dan jenis nilai (angka/tanggal/teks) di ≥ 3 kolom terisi cocok ≥ 80% dengan baris data pertama
 * leader. Ragu → bukan lanjutan (sheet tetap terpisah).
 */
export function isContinuation(leader: ContinuationRec, cand: ContinuationRec): boolean {
  if (leader.headerRow < 1 || cand.colCount !== leader.colCount || leader.colCount < 2)
    return false;
  const head = leader.preview.rows.find((r) => r.row === leader.headerRow);
  const data = leader.preview.rows.find((r) => r.row > leader.headerRow);
  const first = cand.preview.rows[0];
  if (!head || !data || !first) return false;
  const titles = new Set(head.cells.filter((c): c is string => !!c?.trim()).map(norm));
  if (first.cells.some((c) => !!c?.trim() && titles.has(norm(c)))) return false;
  let compared = 0;
  let same = 0;
  const width = Math.min(head.cells.length, first.cells.length, data.cells.length);
  for (let i = 0; i < width; i++) {
    const a = classOf(data.cells[i] ?? null);
    const b = classOf(first.cells[i] ?? null);
    if (a === "empty" || b === "empty") continue;
    compared++;
    if (a === b) same++;
  }
  return compared >= 3 && same * 5 >= compared * 4;
}

/**
 * Tandai sheet lanjutan (urut file): sheet yang merupakan lanjutan sheet sebelumnya (berantai — sheet 3
 * lanjutan sheet 2 yang lanjutan sheet 1) diberi headerRow 0 dan judul kolom leader. Mengubah `recs`;
 * kembalian = indeks sheet lanjutan → indeks leader.
 */
export function markContinuations(recs: ContinuationRec[]): Map<number, number> {
  const out = new Map<number, number>();
  for (let i = 1; i < recs.length; i++) {
    const prev = out.get(i - 1) ?? i - 1;
    const leader = recs[prev]!;
    const cand = recs[i]!;
    if (cand.headerRow === 0 || !isContinuation(leader, cand)) continue;
    cand.headerRow = 0;
    cand.columns = leader.columns.map((c) => ({ ...c }));
    out.set(i, prev);
  }
  return out;
}

/** Sheet gabungan tidak boleh masuk alur pemetaan (mapping.ts menulis ulang satu segmen per sheet). */
export class MergeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MergeError";
  }
}

export const MERGE_NEEDS_MAPPING =
  "File ini tidak cocok otomatis dengan data aktif, dan versi berisi sheet gabungan belum bisa dicocokkan lewat halaman pemetaan. Samakan nama sheet/judul kolom file dengan data aktif lalu unggah lagi, atau unggah tanpa pilihan “Gabungkan sheet” untuk mencocokkan lewat pemetaan.";

export const mergeHeaderDrift = (sheet: string, lead: string) =>
  `Sheet “${sheet}” tidak bisa digabung dengan “${lead}”: setelah baris judul data aktif diterapkan, judul kolomnya berbeda. Unggah lagi tanpa pilihan “Gabungkan sheet”.`;
