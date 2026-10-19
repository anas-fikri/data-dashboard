---
title: Mengatur email (SMTP) dan backup
slug: admin-email-dan-backup
role: ADMIN
context:
---

Dua pengaturan sistem ada di menu **Admin**: server pengirim email dan salinan backup di luar server.

## Email (SMTP)

Buka **Admin → Email (SMTP)**. Email aplikasi (verifikasi akun, undangan, atur ulang password, berbagi dashboard, dan notifikasi backup) dikirim lewat server ini.

1. Isi **Server SMTP**, pilih **Keamanan** (_SSL/TLS_ port 465 atau _STARTTLS_ port 587), **Port**, **Username** (biasanya alamat email lengkap), dan **Password**.
2. Isi **Email pengirim** dan **Nama pengirim** (mis. _Data Dashboard_).
3. Tekan **Kirim email uji** — email masuk ke alamat di **Kirim email uji ke**. Bila gagal, pesan di atas form menyebut penyebabnya (password ditolak, server tidak terjangkau, atau port/keamanan tidak cocok).
4. Tekan **Simpan**. Pengaturan langsung dipakai tanpa restart.

Password tidak pernah ditampilkan lagi. Kosongkan kolom **Password** untuk tetap memakai password yang tersimpan — hanya berlaku bila server, port, dan username tidak diubah.

## Backup

Buka **Admin → Backup**. **Status backup** menampilkan backup harian terakhir (02.00 WIB), ukurannya, dan salinan di luar server.

Untuk menyalin backup ke penyimpanan S3 di luar server (mis. NAS kantor):

1. Isi **Endpoint** (alamat yang bisa dijangkau server aplikasi), **Bucket** khusus backup, **Folder**, **Access key**, dan **Secret key**. Pakai kunci khusus backup, bukan kunci admin.
2. Tekan **Tes koneksi**, lalu **Simpan**.

Bila penyimpanan tujuan tidak terjangkau, backup tetap dibuat dan disimpan sementara di server, dikirim ulang otomatis tiap 30 menit, dan admin menerima email serta pemberitahuan di aplikasi. Pemberitahuan juga muncul bila tidak ada backup baru lebih dari 26 jam.
