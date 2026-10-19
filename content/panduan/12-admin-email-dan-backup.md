---
title: Mengatur email (SMTP) dan backup
slug: admin-email-dan-backup
role: ADMIN
context:
---

Dua integrasi ada di menu **Admin** bagian **Integrasi**: server pengirim email dan salinan backup ke NAS Synology.

## Email (SMTP)

Buka **Admin → Email (SMTP)**. Email aplikasi (verifikasi akun, undangan, atur ulang password, berbagi dashboard, dan notifikasi backup) dikirim lewat server ini.

1. Isi **Server SMTP**, pilih **Keamanan** (_SSL/TLS_ port 465 atau _STARTTLS_ port 587), **Port**, **Username** (biasanya alamat email lengkap), dan **Password**.
2. Isi **Email pengirim** dan **Nama pengirim** (mis. _Data Dashboard_).
3. Tekan **Kirim email uji** — email masuk ke alamat di **Kirim email uji ke**. Bila gagal, pesan di atas form menyebut penyebabnya (password ditolak, server tidak terjangkau, atau port/keamanan tidak cocok).
4. Tekan **Simpan**. Pengaturan langsung dipakai tanpa restart.

Password tidak pernah ditampilkan lagi. Kosongkan kolom **Password** untuk tetap memakai password yang tersimpan — hanya berlaku bila server, port, dan username tidak diubah.

## Backup ke NAS Synology

Buka **Admin → Backup ke NAS Synology**. **Status backup** menampilkan backup harian terakhir (02.00 WIB), ukurannya, dan salinan di NAS.

Siapkan dulu di DSM (sekali saja, oleh pengelola NAS):

1. **Panel Kontrol → Layanan File → FTP → SFTP**: aktifkan.
2. Buat akun khusus, mis. _dashboard-backup_, **tanpa hak admin**.
3. Buat shared folder, mis. _backup-data-dashboard_, dan beri akun tadi izin baca/tulis hanya ke folder ini.

Lalu di aplikasi:

1. Isi **Alamat NAS** (alamat IP atau nama yang bisa dijangkau server aplikasi), **Port SFTP** (bawaan 22), **Username**, **Password**, dan **Folder tujuan** (diawali nama shared folder, mis. _/backup-data-dashboard_).
2. Tekan **Tes koneksi**. Aplikasi menulis, membaca, lalu menghapus file uji di folder itu, dan mencatat **Kunci host NAS** (sidik jari _SHA256:…_).
3. Tekan **Simpan**. Pengaturan langsung dipakai tanpa restart.

Kunci host mencegah server lain menyamar sebagai NAS: setelah disimpan, koneksi ke server dengan kunci berbeda ditolak. Bila NAS memang diinstal ulang atau diganti, tekan **Lupakan kunci host**, isi **Password** lagi, lalu **Tes koneksi** dan **Simpan**.

Password tidak pernah ditampilkan lagi. Kosongkan kolom **Password** untuk tetap memakai password yang tersimpan — hanya berlaku bila alamat NAS, port, username, dan kunci host tidak berubah.

Bila NAS tidak terjangkau, backup tetap dibuat dan disimpan sementara di server, dikirim ulang otomatis tiap 30 menit, dan admin menerima email serta pemberitahuan di aplikasi. Pemberitahuan juga muncul bila tidak ada backup baru lebih dari 26 jam.
