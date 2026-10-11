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
}
