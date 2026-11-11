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
