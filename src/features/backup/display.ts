/*
 * Bagian Admin › Backup yang tidak butuh server (dipakai komponen server dan klien, T-tsvf).
 */

/**
 * Batas lama simpan, sama dengan validasi ulang di deploy/backup.sh: bilangan bulat, server 3–365 dan NAS
 * 7–365 hari (batas bawah agar riwayat di NAS tidak bisa dihapus lewat aplikasi yang dibobol).
 */
export const RETENTION_LIMITS = {
  localDays: { min: 3, max: 365 },
  remoteDays: { min: 7, max: 365 },
} as const;

/** Waktu arsip dari namanya (dashboard-YYYYMMDDTHHMMSSZ.tar.age); null bila bukan pola itu. */
export function archiveTime(name: string): string | null {
  const m = /^dashboard-(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z\.tar\.age$/.exec(name);
  return m ? `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}Z` : null;
}

/**
 * Penjelasan galat backup dalam bahasa awam + tindakan; galat mentah tetap ditampilkan terpisah. null =
 * tidak dikenali.
 */
export function errorHint(error: string | null): string | null {
  if (!error) return null;
  if (/SSH_FX_FAILURE|"Failure"|no space|quota|disk full/i.test(error)) {
    return "NAS menolak menyimpan arsip. Biasanya ruang penyimpanan NAS penuh atau kuota folder/akun habis. Minta admin NAS memeriksa DSM: Storage Manager, Panel Kontrol › Folder Bersama › Edit › Kuota, dan Panel Kontrol › Pengguna › Kuota. Kirim ulang dijeda bertahap sampai berhasil.";
  }
  if (/permission denied|SSH_FX_PERMISSION_DENIED/i.test(error)) {
    return "Akun NAS tidak punya izin menulis atau menghapus di folder tujuan. Atur di DSM: Panel Kontrol › Folder Bersama › Edit › Izin (baca, tulis, dan hapus).";
  }
  if (/unable to authenticate|auth(entication)? fail|password/i.test(error)) {
    return "NAS menolak username atau password. Isi ulang password di bagian Salinan ke NAS, tekan Tes koneksi, lalu Simpan.";
  }
  if (/host key|knownhosts|known_hosts/i.test(error)) {
    return 'Kunci host NAS berubah. Bila NAS memang diinstal ulang/diganti, tekan "Lupakan kunci host", Tes koneksi, lalu Simpan.';
  }
  if (
    /timeout|timed out|connection refused|no route|unreachable|dial tcp|connection reset|EOF/i.test(
      error,
    )
  ) {
    return "Server aplikasi tidak bisa terhubung ke NAS (NAS mati, jaringan, atau firewall). Arsip disimpan di server dan dikirim ulang otomatis.";
  }
  if (/konfigurasi NAS/i.test(error)) {
    return "Pengaturan NAS tidak terbaca. Isi ulang di bagian Salinan ke NAS lalu Simpan.";
  }
  if (/backup gagal di langkah/i.test(error)) {
    return "Backup harian gagal sebelum arsip selesai dibuat. Pengelola server perlu memeriksa log service backup (docker compose logs backup).";
  }
  return null;
}

/** Ruang dianggap menipis bila kurang dari 2 × arsip terakhir (satu arsip baru + cadangan). */
export function lowSpace(freeBytes: number, lastArchiveBytes: number | null): boolean {
  return !!lastArchiveBytes && freeBytes < 2 * lastArchiveBytes;
}
