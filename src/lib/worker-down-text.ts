/**
 * Teks "pemroses tidak aktif" (T-r5tm) untuk koreksi skema, pemetaan, dan ekspor: job aman di antrean dan
 * berjalan sendiri setelah worker menyala lagi. Unggahan memakai noWorkerText (ingest-progress).
 */
export function workerDownText(what: string): string {
  return `Pemroses sedang tidak aktif, jadi ${what} belum berjalan. Permintaan Anda aman di antrean dan diproses otomatis setelah pemroses dinyalakan lagi — tidak perlu mengulang. Beri tahu admin aplikasi.`;
}
