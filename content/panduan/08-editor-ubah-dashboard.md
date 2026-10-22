---
title: Mengubah dashboard yang dibagikan kepada Anda
slug: editor-ubah-dashboard
role: EDITOR
context: BUILDER
---

Sebagai **editor**, Anda bisa mengubah widget dan tata letak dashboard milik rekan. Data dan pengaturan berbagi tetap di tangan pemiliknya.

## Menemukan dashboard

Buka **Dashboard** → bagian **Dibagikan ke saya**. Di kepala dashboard tertulis _Dibagikan oleh …_ beserta peran Anda.

## Mengubah widget

1. Tekan **Ubah tata letak**.
2. Tekan **Tambah widget** atau ikon pengaturan pada widget yang ada.
3. Ubah **Judul**, **Jenis tampilan**, **Kelompokkan menurut**, **Nilai**, dan **Format angka** — sama seperti pemilik (lihat _Menyusun dashboard pertama_).
4. Seret dan ubah ukuran kartu di layar lebar, atau pakai **Posisi** dan **Ukuran** di layar kecil.
5. Perubahan tersimpan otomatis; tekan **Selesai** bila sudah.

Salah pindah, ubah ukuran, tambah, atau hapus widget? Tekan **Urungkan** di bilah atas mode edit untuk membatalkan perubahan tata letak terakhir. Perubahan di panel pengaturan widget (judul, jenis, nilai) tidak ikut diurungkan — kembalikan secara manual.

## Mengatur kolom filter

Editor juga bisa menentukan kolom yang bisa disaring di bilah **Filter**:

1. Di mode edit, tekan **Atur kolom filter** di bilah filter di atas widget.
2. Tekan **Tambah kolom filter** lalu pilih kolomnya (mis. _Cabang_, _Tanggal_) — paling banyak 8 kolom.
3. Hapus kolom dengan tombol **×** di barisnya. Setiap perubahan langsung tersimpan dan berlaku untuk semua yang membuka dashboard.
4. Untuk filter bawaan (aktif saat dashboard dibuka), pilih filternya lalu tekan **Jadikan filter aktif sebagai bawaan**.

## Field terhitung dan pivot tersimpan

- Di widget pivot, grafik, dan angka, editor bisa memakai **Tampilkan sebagai** (mis. _% dari total kolom_, _Total berjalan_), **Tambah field terhitung** / **Pakai field terhitung** (mis. margin), dan N teratas dengan **(Lainnya)** — caranya sama dengan pemilik (panduan [Perhitungan seperti PivotTable untuk editor](/panduan/editor-perhitungan-pivot)).
- **Pivot tersimpan** dibuat dan diubah oleh pemilik dataset. Editor bisa memilihnya di **Sumber data** → **Pivot tersimpan**, mengatur tampilan widget (jenis, nilai, urutan, total), dan melihat definisinya (_Definisi hanya bisa diubah pemilik dataset (baca-saja)_) — lihat [Memakai pivot tersimpan sebagai editor](/panduan/editor-pakai-pivot-tersimpan).
- **Lepas dari sumber** menyalin pengaturan pivot tersimpan menjadi widget mandiri; perubahan pivot tersimpan berikutnya tidak lagi berlaku di widget itu.

## Melihat seluruh data (Lihat data)

Tekan **Lihat data** di kepala dashboard untuk membuka seluruh isi sheet dataset dashboard ini dalam bentuk lembar kerja seperti Excel (baca-saja):

- Urutkan dengan klik kepala kolom (**Shift+klik** sampai 3 kolom), saring lewat menu kolom → **Saring…** (**Alt+↓**), dan cari dengan kotak **Cari** atau **Ctrl+F**.
- **F2**, **Enter**, atau klik ganda pada sel membuka panel **Isi sel** (isi lengkap, nama file, dan nomor baris asli).
- Salin sel dengan **Ctrl+C**, atau pilih baris lewat nomor baris (**Shift+klik** untuk rentang, paling banyak 1.000 baris) lalu **Ctrl+C**, dan tempel di Excel.
- **Unduh tampilan** membuat file CSV atau Excel (XLSX) persis seperti tampilan sekarang (kolom terlihat, urutan, saringan, pencarian).

Pengaturan kolom (lebar, bekukan, sembunyikan, format) hanya tersimpan di browser Anda. Pada widget tabel, tombol **Perbesar** juga punya tautan **Buka di Lihat data**. Bila dataset disimpan per periode, kolom sistem **Periode** bisa dipakai di widget dan sebagai filter (pilihan **Periode terbaru**).

## Yang tidak bisa dilakukan editor

- Membagikan dashboard atau mengubah siapa yang punya akses.
- Mengganti nama atau menghapus dashboard.
- Membuka halaman dataset, mengunggah file, mengatur periode, atau mengubah skema (Lihat data tetap bisa dibuka, baca-saja).
- Membuat, mengubah, mengganti nama, atau menghapus pivot tersimpan.

Butuh perubahan di atas? Hubungi pemilik dashboard (namanya tercantum di kepala dashboard).
