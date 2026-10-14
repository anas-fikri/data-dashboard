/*
 * Logika slicer (T-012), murni agar bisa diuji tanpa DOM. Dua mode:
 * - pilih (in): centang nilai yang dipakai, maks. 500;
 * - kecualikan (not_in): "Pilih semua" lalu lepas centang = "Semua kecuali …" (maks. 500
 *   dikecualikan). Berlaku juga untuk nilai yang tidak termuat di daftar (> 1.000 nilai unik), jadi
 *   kebiasaan Excel "pilih semua lalu lepas satu" tidak terpotong batas 500 pilihan.
 * "Pilih semua hasil" (dengan kata cari) tidak pernah diam-diam memotong: bila hasil belum lengkap
 * atau pilihan akan melebihi 500, tombolnya nonaktif dengan alasan yang menawarkan mode kecualikan.
 * Mode diturunkan dari filter (not_in = kecualikan); "Pilih semua" tanpa pengecualian (tanpa filter)
 * diingat per kolom di filter-context, jadi tetap sama saat popover/bagian lembar dibuka lagi. Mode
 * kecualikan dengan daftar lengkap yang diketahui tidak bisa mengecualikan semua nilai (0 baris yang
 * tampak seperti "Semua"): centang terakhir dikunci — juga saat mencari (daftar lengkap terakhir
 * diingat, `fullList`), jadi kunci tidak bisa dilewati lewat kata cari.
 */
import { SELECTED_MAX, type DashFilter, type FilterValue } from "./filter-model";

const num = (n: number) => n.toLocaleString("id-ID");

export interface SlicerInput {
  column: string;
  value: DashFilter | undefined;
  /** "Pilih semua" tanpa pengecualian: tanpa filter ("Semua"), tetapi semua tampil tercentang. */
  allMode: boolean;
  /** Nilai yang termuat untuk kata cari terakhir. */
  results: FilterValue[];
  truncated: boolean;
  /** Daftar yang tampil adalah hasil pencarian (kata cari milik daftar itu, bukan ketikan). */
  searching: boolean;
  /** Daftar lengkap terakhir (tanpa kata cari, tidak terpotong); tidak diketahui = tanpa kunci. */
  fullList?: FilterValue[] | null;
}

export function slicerModel({
  column,
  value,
  allMode,
  results,
  truncated,
  searching,
  fullList,
}: SlicerInput) {
  const exclude = value?.op === "not_in" || (!value && allMode);
  /** Mode pilih: nilai terpilih; mode kecualikan: nilai yang dikecualikan. */
  const picked = value?.op === "in" || value?.op === "not_in" ? value.values : [];
  const has = (v: FilterValue) => picked.some((s) => s === v);
  const inResults = (v: FilterValue) => results.some((r) => r === v);
  const full = picked.length >= SELECTED_MAX;
  const filter = (vs: FilterValue[]): DashFilter | null =>
    vs.length ? { column, op: exclude ? "not_in" : "in", values: vs } : null;
  const addable = results.filter((v) => !has(v));
  // Daftar lengkap (yang tampil, atau yang terakhir dimuat selama mencari) dalam mode kecualikan:
  // nilai yang masih tercentang.
  const known = searching ? fullList : truncated ? null : results;
  const kept = exclude && known ? known.filter((v) => !has(v)) : null;
  const lastKept = (v: FilterValue) => kept?.length === 1 && kept[0] === v;

  const selectAll = !searching
    ? // Tanpa kata cari: mode kecualikan tanpa pengecualian (= semua nilai, termasuk yang tidak tampil).
      { label: "Pilih semua", off: exclude && !picked.length, next: null, allMode: true }
    : exclude
      ? {
          label: "Pilih semua hasil",
          off: !results.some(has),
          next: filter(picked.filter((v) => !inResults(v))),
          allMode: true,
        }
      : {
          label: "Pilih semua hasil",
          off: !addable.length,
          next: filter([...picked, ...addable]),
          allMode: false,
        };
  const blocked = !searching
    ? null
    : truncated
      ? "Hasil pencarian belum lengkap — ketik lebih lengkap untuk memilih semua hasil."
      : !exclude && picked.length + addable.length > SELECTED_MAX
        ? `Hasil terlalu banyak untuk dipilih (maks. ${num(SELECTED_MAX)} nilai). Kosongkan pencarian, pakai “Pilih semua”, lalu lepas nilai yang tidak perlu.`
        : null;

  return {
    exclude,
    picked,
    full,
    /** Nilai terpilih/dikecualikan yang tidak ada di daftar (mis. dari URL): tetap bisa diubah. */
    pinned: searching ? [] : picked.filter((v) => !inResults(v)),
    isOn: (v: FilterValue) => (exclude ? !has(v) : has(v)),
    /** Daftar penuh: hanya centang yang akan menambah daftar (pilih/kecualikan) yang nonaktif. */
    locked: (v: FilterValue) => full && !has(v),
    /** Centang terakhir di mode kecualikan: tidak bisa dilepas (alasannya di minOne). */
    lastKept,
    minOne: kept?.length === 1 ? "Minimal satu nilai harus dipilih." : null,
    toggle: (v: FilterValue) =>
      lastKept(v)
        ? (value ?? null)
        : filter(has(v) ? picked.filter((s) => s !== v) : [...picked, v]),
    selectAll: { ...selectAll, blocked },
    cleared: !value && !allMode,
    /** Ringkasan pilihan untuk status ("2 dari maks. 500 dipilih.", "Semua kecuali 1 nilai."). */
    summary: exclude
      ? picked.length
        ? `Semua kecuali ${num(picked.length)} nilai.`
        : "Semua dipilih."
      : `${num(picked.length)} dari maks. ${num(SELECTED_MAX)} dipilih.`,
    fullText: exclude
      ? `Maksimal ${num(SELECTED_MAX)} nilai dikecualikan. Centang lagi sebagian untuk mengecualikan nilai lain.`
      : `Maksimal ${num(SELECTED_MAX)} nilai dipilih. Lepas sebagian, atau pakai “Pilih semua” lalu lepas nilai yang tidak perlu.`,
  };
}
