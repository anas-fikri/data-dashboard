---
title: Mengganti data dengan file baru dan memetakan kolom
slug: ganti-data-pemetaan
role: OWNER
context: UPLOAD
---

Data bulan berikutnya cukup diunggah ke dataset yang sama. Dashboard otomatis memakai data baru setelah versi itu aktif.

## Mengunggah versi baru

1. Buka halaman dataset → kartu **Data** → **Ganti data dengan file baru** → **Pilih file**.
2. Setelah diproses, versi baru menjadi **Aktif** dan versi lama tetap ada di **Riwayat versi**.

## Bila kolom file baru berbeda

Bila nama atau jumlah kolom berubah, versi baru berstatus **Menunggu pemetaan** dan muncul pesan _“nama-file” perlu pemetaan kolom_.

1. Tekan **Petakan kolom**.
2. Untuk setiap kolom lama, pilih kolom pasangannya di file baru — atau **Kosongkan (NULL)** bila memang tidak ada lagi.
3. Periksa **Ringkasan** dan **Periksa nilai yang tidak cocok** (nilai yang tidak bisa dikonversi ke tipe kolom akan dikosongkan).
4. Tekan **Simpan & aktifkan**.

Tidak jadi memakai file itu? Tekan **Buang versi ini**.

## Kembali ke versi lama

Di **Riwayat versi**, tekan **Aktifkan** pada baris versi yang diinginkan, lalu konfirmasi. Semua dashboard langsung memakai data versi itu.
