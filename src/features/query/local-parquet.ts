/*
 * Registri cache parquet lokal proses ini (T-009, review N3). Modul terpisah tanpa DuckDB: penghapusan
 * dataset bisa membuang salinan lokal tanpa memuat modul native mesin query. Belum terdaftar = mesin
 * query proses ini belum berjalan = belum ada salinan yang dibuka. Hanya proses ini yang terjangkau;
 * replika lain membuang salinannya lewat batas menganggur cache (data yang dihapus tidak dibaca lagi).
 */

interface Forgetful {
  forget(key: string): void;
}

const g = globalThis as unknown as { queryLocalParquet?: Forgetful };

export function registerLocalParquet(cache: Forgetful) {
  g.queryLocalParquet = cache;
}

/** Buang salinan lokal typed.parquet data yang dihapus, termasuk yang sedang diunduh. */
export function forgetLocalParquet(keys: string[]) {
  const c = g.queryLocalParquet;
  if (!c) return;
  for (const k of keys) c.forget(k);
}
