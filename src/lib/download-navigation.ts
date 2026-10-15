/*
 * Unduhan ekspor (T-017) memakai <a download> ke /api/exports/<id>/download yang menjawab 302 ke URL
 * presigned storage (origin lain). Chromium mengubah unduhan yang dialihkan lintas origin menjadi
 * navigasi biasa, sehingga peringatan beforeunload editor ("Leave site?") muncul — padahal respons
 * `attachment` tidak pernah meninggalkan halaman, dan "Cancel" membatalkan unduhan.
 *
 * Pemicu unduhan menandai jendela singkat; penjaga beforeunload melewati SATU peringatan di jendela itu.
 * Lewat jendela (server lambat) → peringatan tampil seperti biasa (aman). Bila tidak ada navigasi (storage
 * satu origin), tanda dipakai paling banyak sekali dalam jendela itu; tata letak tertunda tetap dikirim
 * lewat keepalive saat pagehide (use-dashboard-editor).
 */
export const DOWNLOAD_NAV_MS = 10_000;

let until = 0;

/** Dipanggil tepat sebelum unduhan lewat tautan route unduh dimulai. */
export function markDownloadNavigation(now = Date.now()): void {
  until = now + DOWNLOAD_NAV_MS;
}

/** true (sekali) bila beforeunload ini milik navigasi unduhan yang baru ditandai. */
export function takeDownloadNavigation(now = Date.now()): boolean {
  const ours = now < until;
  until = 0;
  return ours;
}
