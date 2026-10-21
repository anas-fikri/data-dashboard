/*
 * Cache parquet lokal proses ini (T-009, review N3). Modul terpisah tanpa DuckDB: penghapusan dataset
 * bisa membuang salinan lokal, dan pemanasan saat versi aktif (T-pvq8) bisa mengisi cache, tanpa memuat
 * modul native mesin query. Belum terdaftar = cache proses ini belum dibuat = belum ada salinan yang
 * dibuka. Hanya proses ini yang terjangkau; replika lain membuang salinannya lewat batas menganggur cache
 * (data yang dihapus tidak dibaca lagi).
 */
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ParquetCache } from "@/lib/duckdb/parquet-cache";
import { env } from "@/lib/env";
import { downloadToFile, objectSize } from "@/lib/storage/files";

interface Forgetful {
  forget(key: string): void;
}

interface ForgetOrder {
  forget(typedKeys: string[]): void;
}

const g = globalThis as unknown as {
  queryLocalParquet?: Forgetful;
  queryParquetCache?: ParquetCache;
  queryOrderCache?: ForgetOrder;
};

/** Cache urutan "Lihat data" (T-062) proses ini: entri dari data yang dihapus ikut dibuang. */
export function registerOrderCache(cache: ForgetOrder) {
  g.queryOrderCache = cache;
}

export function registerLocalParquet(cache: Forgetful) {
  g.queryLocalParquet = cache;
}

/** Direktori kerja query proses ini: parquet/ (cache ini) dan tmp/ (DuckDB). */
export const queryCacheBase = () => env().QUERY_CACHE_DIR ?? join(tmpdir(), "dd-query");

/**
 * Satu cache per proses (satu proses per direktori cache), dibagi mesin query dan pemanasan versi aktif;
 * dibuat saat pertama dipakai.
 */
export function localParquetCache(): ParquetCache {
  if (!g.queryParquetCache) {
    const cache = new ParquetCache({
      dir: join(queryCacheBase(), "parquet"),
      maxBytes: env().MAX_LOCAL_PARQUET_BYTES,
      sizeOf: (key, signal) => objectSize(key, signal),
      download: async (key, dest, signal) => {
        await downloadToFile(key, dest, signal);
      },
      // Unduhan dibatasi terpisah dari slot query (review T-009 N2).
      maxDownloads: 2,
      perOwnerDownloads: 1,
    });
    g.queryParquetCache = cache;
    registerLocalParquet(cache);
  }
  return g.queryParquetCache;
}

/** Buang salinan lokal typed.parquet data yang dihapus, termasuk yang sedang diunduh. */
export function forgetLocalParquet(keys: string[]) {
  g.queryOrderCache?.forget(keys);
  const c = g.queryLocalParquet;
  if (!c) return;
  for (const k of keys) c.forget(k);
}
