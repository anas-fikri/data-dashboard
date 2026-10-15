/*
 * Unduhan ekspor (T-017) memakai <a download> ke /api/exports/<id>/download yang menjawab 302 ke URL
 * presigned storage (origin lain). Chromium mengubah unduhan yang dialihkan lintas origin menjadi
 * navigasi biasa, sehingga peringatan beforeunload editor ("Leave site?") muncul — padahal respons
 * `attachment` tidak pernah meninggalkan halaman, dan "Cancel" membatalkan unduhan.
 *
 * Pemicu unduhan menandai jendela singkat; penjaga beforeunload editor melewati SATU peringatan di
 * jendela itu. Penjaga SELALU terpasang selama mode edit (unloadGuard), juga saat semuanya tersimpan,
 * sehingga tanda dipakai oleh beforeunload unduhan itu sendiri dan tidak tertinggal untuk menelan
 * peringatan yang sungguhan sesudahnya (review R1 CL-2). Lewat jendela (server lambat) → peringatan
 * tampil seperti biasa (aman). Bila tidak ada navigasi (storage satu origin), tanda hidup paling lama
 * DOWNLOAD_NAV_MS dan dipakai paling banyak sekali.
 */
export const DOWNLOAD_NAV_MS = 5_000;

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

/**
 * Listener beforeunload editor. Tanda unduhan selalu dipakai lebih dulu (juga saat tidak ada yang perlu
 * diperingatkan); di luar navigasi unduhan itu peringatan muncul tepat saat `unsaved()` benar.
 */
export function unloadGuard(unsaved: () => boolean) {
  return (e: Pick<BeforeUnloadEvent, "preventDefault">) => {
    if (takeDownloadNavigation()) return;
    if (unsaved()) e.preventDefault();
  };
}
