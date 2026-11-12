/**
 * Dijalankan Next.js sekali saat proses server boot (sebelum melayani permintaan).
 * Memvalidasi env lebih awal sehingga `next start` di produksi gagal keras bila
 * konfigurasi tidak lengkap atau masih memakai nilai placeholder, bukan 500 saat
 * route pertama menyentuh env.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { env } = await import("@/lib/env");
  env();
  // Cache parquet app dipanaskan saat versi baru aktif (T-pvq8); tidak menunggu Redis. Hanya
  // pengoptimalan: gagal dipasang tidak boleh menghentikan app (query mengunduh sendiri).
  try {
    const { listenVersionActivated } = await import("@/features/query/warm-runtime");
    listenVersionActivated();
  } catch (e) {
    const { logger } = await import("@/lib/logger");
    logger.error(
      { err: e instanceof Error ? e.message : String(e) },
      "pemanasan cache parquet tidak terpasang",
    );
  }
  // Monitor sumber daya (v1.18, ADR-0010): sampler host + antrean tiap 10 dtk. Gagal dipasang tidak
  // menghentikan app (panel menampilkan "Data server belum tersedia").
  try {
    const { startMetricsSampler } = await import("@/lib/metrics/sampler");
    startMetricsSampler();
  } catch (e) {
    const { logger } = await import("@/lib/logger");
    logger.error(
      { err: e instanceof Error ? e.message : String(e) },
      "sampler metrik tidak terpasang",
    );
  }
}
