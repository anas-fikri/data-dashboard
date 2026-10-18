---
title: Mengelola pengguna
slug: admin-kelola-pengguna
role: ADMIN
context:
---

Menu **Admin → Pengguna** hanya tampil untuk admin.

## Menambah pengguna

Klik **Tambah pengguna**, isi **Email** (domain perusahaan) dan **Nama** (opsional), nyalakan **Jadikan admin** bila perlu, lalu tekan **Tambah & kirim undangan**. Pengguna menerima email berisi tautan untuk membuat password, berlaku 72 jam. Tautan kedaluwarsa atau email tidak sampai? Minta pengguna memakai **Lupa password?** di halaman masuk.

Pengguna juga bisa mendaftar sendiri lewat halaman **Daftar** dengan email perusahaan.

## Mencari pengguna

Ketik email atau nama di **Cari email atau nama**, lalu **Cari**. Saring dengan **Status**: _Aktif_, _Nonaktif_, atau _Belum verifikasi_. Tabel menampilkan peran, status, waktu terakhir masuk, dan jumlah dataset.

## Aksi per pengguna

Buka menu **Aksi** di baris pengguna:

- **Jadikan admin…** — memberi akses Admin (hanya untuk akun aktif dan terverifikasi).
- **Cabut admin…** — mencabut akses admin. Aplikasi menolak mencabut admin terakhir.
- **Nonaktifkan…** — pengguna langsung keluar dari semua perangkat dan tidak bisa masuk lagi. Data dan dashboardnya tetap ada.
- **Aktifkan** — mengembalikan akses akun yang dinonaktifkan.
- **Alihkan dataset…** — untuk akun nonaktif yang masih punya dataset: pilih **Pemilik baru**, lalu konfirmasi. Dataset beserta dashboardnya pindah ke pemilik baru.
- **Hapus akun…** — menghapus akun secara permanen. Ketik ulang email pengguna untuk mengonfirmasi. Hanya untuk akun yang tidak punya dataset: nonaktifkan dulu, lalu **Alihkan dataset…**. Akun Anda sendiri tidak bisa dihapus.

Pilih **Nonaktifkan** bila akses perlu dihentikan tetapi datanya masih dipakai, dan **Hapus akun** bila akun memang tidak diperlukan lagi. Setiap aksi dicatat di log audit beserta pelakunya.
