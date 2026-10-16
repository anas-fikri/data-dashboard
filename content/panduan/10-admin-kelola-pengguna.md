---
title: Mengelola pengguna
slug: admin-kelola-pengguna
role: ADMIN
context:
---

Menu **Admin → Pengguna** hanya tampil untuk admin.

## Mencari pengguna

Ketik email atau nama di **Cari email atau nama**, lalu **Cari**. Saring dengan **Status**: _Aktif_, _Nonaktif_, atau _Belum verifikasi_. Tabel menampilkan peran, status, waktu terakhir masuk, dan jumlah dataset.

## Aksi per pengguna

Buka menu **Aksi** di baris pengguna:

- **Jadikan admin…** — memberi akses Admin (hanya untuk akun aktif dan terverifikasi).
- **Cabut admin…** — mencabut akses admin. Aplikasi menolak mencabut admin terakhir.
- **Nonaktifkan…** — pengguna langsung keluar dari semua perangkat dan tidak bisa masuk lagi. Data dan dashboardnya tetap ada.
- **Aktifkan** — mengembalikan akses akun yang dinonaktifkan.
- **Alihkan dataset…** — untuk akun nonaktif yang masih punya dataset: pilih **Pemilik baru**, lalu konfirmasi. Dataset beserta dashboardnya pindah ke pemilik baru.

Setiap aksi dicatat di log audit beserta pelakunya.
