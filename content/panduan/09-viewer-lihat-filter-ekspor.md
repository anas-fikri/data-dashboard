---
title: Melihat dashboard, memakai filter, dan mengekspor
slug: viewer-lihat-filter-ekspor
role: VIEWER
context:
---

Sebagai **viewer**, Anda melihat dashboard yang dibagikan, menyaring datanya, dan mengunduh hasilnya — tanpa bisa mengubah apa pun.

## Membuka dashboard

Buka **Dashboard** → **Dibagikan ke saya**, atau dari **Beranda**. Dashboard yang dibagikan ke seluruh organisasi juga tampil di sana.

## Memakai filter

Di bilah **Filter** di atas dashboard:

- **Nilai** — ketik di **Cari nilai…**, centang satu atau beberapa nilai, atau **Pilih semua**.
- **Tanggal** — tiga cara:
  - **Pilihan cepat**: _Bulan ini_, _Kuartal ini_, _Sejak awal tahun_, _Bulan lalu_, _Kuartal lalu_, _Tahun lalu_, _30 hari terakhir_, _90 hari terakhir_ (dihitung dari tanggal hari ini).
  - **Pilih periode**: pilih **Bulan**, **Kuartal**, atau **Tahun**, lalu satu periode yang ada di data (mis. _Maret 2026_, _Kuartal 1 2026_). Daftar panjang bisa dicari dengan mengetik.
  - **Rentang sendiri** dengan tanggal _Dari_ dan _Sampai_.
- **Angka** — isi _Paling kecil_ / _Paling besar_, lalu **Terapkan**.

Filter aktif tampil sebagai label; tekan **Hapus semua filter** untuk kembali ke semua data. Di ponsel, buka filter lewat tombol **Filter**.

Pada grafik yang diizinkan pemiliknya, klik batang atau irisan pai untuk menyaring widget lain. Di widget pivot, label baris atau kolom juga bisa dipilih untuk menyaring widget lain.

Di widget **pivot**, sel kiri atas tabel berisi nama setiap bagian pivot dengan ikon saring (seperti tombol filter PivotTable Excel). Tekan namanya, lalu centang atau lepas centang nilai — total ikut berubah, pengaturan widget tidak. Catatan **Disaring — …** di bawah tabel menyebut saringan yang berlaku; tekan **Hapus saringan** untuk kembali ke semua data.

## Membaca angka pivot dan grafik

- Judul kolom seperti _% dari total kolom · Total Pendapatan_ atau _Total berjalan · …_ menyebut cara angka itu dihitung. Persen dihitung dari seluruh data yang lolos filter, termasuk baris yang tidak tampil.
- Baris **(Lainnya)** menggabungkan kelompok di luar N teratas; angkanya dihitung ulang dari data mentah, dan baris ini tidak bisa diklik untuk menyaring widget lain.
- Tanda **–** berarti tidak ada data atau angkanya tidak bisa dihitung (mis. dibagi nol pada field terhitung seperti margin).
- Beberapa widget bisa memakai definisi pivot yang sama (pivot tersimpan) sehingga angkanya selalu sama; definisinya diatur pemilik data dan tidak terbuka untuk viewer.

## Memperbesar tabel

Tekan ikon **Perbesar** di kepala widget tabel untuk membuka tabel itu selebar layar, bergaya lembar kerja: kolom nomor baris dan kepala kolom tetap terlihat saat digulir, dan urutan serta halaman ikut dari widget. Isinya hanya kolom widget itu, dengan filter dashboard yang sedang berlaku — viewer tidak bisa membuka seluruh isi sheet. Tekan **Tutup tampilan besar** atau Esc untuk kembali.

Bila dataset disimpan per periode dan pemilik memasang filter **Periode**, pilih periode di bilah filter (mis. **Periode terbaru**).

## Mengekspor

- **Satu widget** — tekan ikon ekspor di kepala widget, pilih **CSV** atau **Excel (XLSX)**, lalu tunggu sebentar — file terunduh otomatis (tekan **Unduh lagi** bila perlu). Ekspor mengikuti filter yang sedang aktif.
- **Seluruh dashboard** — tekan **Ekspor PDF** → **Buat PDF**.
