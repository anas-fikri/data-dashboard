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
  /** Baris fisik sheet (judul + data). */
  rawRows: number;
  columns: ColumnMeta[];
  preview: { rows: { row: number; cells: Cell[] }[] };
}

const YEAR = /^(19|20)\d{2}$/;

/**
 * Sheet leader minimal sebesar ini sebelum sheet berikutnya boleh dianggap lanjutan (review v1.19.1 M2):
 * ekspor dipecah karena batas baris Excel (1.048.576, atau 65.536 format lama), jadi leader selalu besar,
 * sedangkan tabel lain di workbook (ringkasan, referensi) jarang sebesar ini.
 */
export const CONTINUATION_MIN_ROWS = 50_000;

/**
 * `cand` adalah lanjutan tanpa judul dari `leader`. Semua syarat:
 *  1. leader ≥ `minRows` baris (sheet penuh; lihat CONTINUATION_MIN_ROWS), jumlah kolom sama;
 *  2. baris pertama kandidat tidak memuat judul kolom leader;
 *  3. jenis nilai (angka/tanggal/teks) di ≥ 3 kolom terisi cocok ≥ 80% dengan baris data pertama leader;
 *  4. kolom pembeda (judul leader teks, data leader seragam angka/tanggal — baris judul tabel lain berupa
 *     teks di kolom itu): baris pertama kandidat cocok di ≥ 1 kolom pembeda dan paling banyak 20% meleset
 *     (satu sel janggal seperti "-" tidak menggagalkan, review M1); angka mirip tahun (1900–2099) tidak
 *     dihitung cocok, hanya menambah penyebut rasio.
 * Tabel serba teks tidak pernah dianggap lanjutan. Ragu → bukan lanjutan (sheet tetap terpisah).
 */
export function isContinuation(
  leader: ContinuationRec,
  cand: ContinuationRec,
  minRows = CONTINUATION_MIN_ROWS,
): boolean {
  if (leader.headerRow < 1 || cand.colCount !== leader.colCount || leader.colCount < 2)
    return false;
  if (leader.rawRows < minRows) return false;
  const head = leader.preview.rows.find((r) => r.row === leader.headerRow);
  const datas = leader.preview.rows.filter((r) => r.row > leader.headerRow).slice(0, 5);
  const data = datas[0];
  const first = cand.preview.rows[0];
  if (!head || !data || !first) return false;
  const titles = new Set(head.cells.filter((c): c is string => !!c?.trim()).map(norm));
  if (first.cells.some((c) => !!c?.trim() && titles.has(norm(c)))) return false;
  const width = Math.min(head.cells.length, first.cells.length, data.cells.length);
  let compared = 0;
  let same = 0;
  for (let i = 0; i < width; i++) {
    const a = classOf(data.cells[i] ?? null);
    const b = classOf(first.cells[i] ?? null);
    if (a === "empty" || b === "empty") continue;
    compared++;
    if (a === b) same++;
  }
  if (compared < 3 || same * 5 < compared * 4) return false;
  let matched = 0;
  let miss = 0;
  let years = 0;
  for (let i = 0; i < width; i++) {
    if (classOf(head.cells[i] ?? null) !== "text") continue;
    const kinds = new Set(
      datas.map((r) => classOf(r.cells[i] ?? null)).filter((k) => k !== "empty"),
    );
    if (kinds.size !== 1) continue;
    const kind = [...kinds][0]!;
    if (kind !== "num" && kind !== "date") continue;
    const v = (first.cells[i] ?? "").trim();
    const k = classOf(v);
    if (k === "empty") continue;
    const yearData = datas.some((r) => YEAR.test((r.cells[i] ?? "").trim()));
    if (kind === "num" && YEAR.test(v) && !yearData) {
      years++;
      continue;
    }
    if (k === kind) matched++;
    else miss++;
  }
  return matched >= 1 && miss * 5 <= matched + miss + years;
}

/**
 * Tandai sheet lanjutan (urut file): sheet yang merupakan lanjutan sheet sebelumnya (berantai — sheet 3
 * lanjutan sheet 2 yang lanjutan sheet 1) diberi headerRow 0 dan judul kolom leader. Mengubah `recs`;
 * kembalian = indeks sheet lanjutan → indeks leader.
 */
export function markContinuations(
  recs: ContinuationRec[],
  minRows = CONTINUATION_MIN_ROWS,
): Map<number, number> {
  const out = new Map<number, number>();
  for (let i = 1; i < recs.length; i++) {
    const prev = out.get(i - 1) ?? i - 1;
    const leader = recs[prev]!;
    const cand = recs[i]!;
    if (cand.headerRow === 0 || !isContinuation(leader, cand, minRows)) continue;
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
