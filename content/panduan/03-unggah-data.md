---
title: Membuat dataset dan mengunggah file Excel/CSV
slug: unggah-data
role: OWNER
context: UPLOAD
---

Dataset adalah wadah data Anda. Satu dataset bisa berisi satu file Excel (sheet yang Anda pilih) atau satu file CSV, dan bisa diganti dengan file baru kapan saja.

## Membuat dataset

1. Buka **Dataset** → **Buat dataset**.
2. Isi **Nama dataset** (mis. _Penjualan cabang 2026_) dan, bila perlu, **Deskripsi**.
3. Tekan **Buat dataset**. Anda masuk ke halaman dataset itu.

## Mengunggah file

1. Di kartu **Data**, tekan **Pilih file** atau seret file ke kotak unggah.
2. Format yang diterima: **.xlsx** dan **.csv**, ukuran maksimal **1 GB**.
3. File Excel dengan dua sheet atau lebih: pilih **Sheet yang diimpor** lalu tekan **Unggah file**. Disarankan hanya memilih sheet berisi data — sheet ringkasan, pivot, atau grafik tidak perlu diimpor. Sheet tersembunyi dan sheet berisi PivotTable tidak dicentang bawaan; **Pilih semua** mencentang semuanya.
   - Data Anda dipecah ke beberapa sheet karena batas baris Excel (mis. _Data 1_, _Data 2_ dengan judul kolom yang sama)? Pilihan **Gabungkan sheet yang judul kolomnya sama menjadi satu** sudah tercentang untuk dataset baru. Barisnya ditumpuk menjadi satu sheet bernama sheet pertama, jadi dashboard dan Lihat data membaca semuanya sekaligus. Syaratnya: nama kolom sama (besar/kecil huruf tidak berpengaruh), **atau** sheet lanjutan tanpa baris judul (mis. hasil ekspor yang hanya memberi judul di sheet pertama) — sheet seperti itu dikenali bila sheet sebelumnya penuh (sedikitnya 50.000 baris) dengan jumlah kolom dan jenis isi yang sama, memakai judul sheet sebelumnya, dan semua barisnya dihitung sebagai data. Sheet dengan kolom berbeda tetap menjadi sheet sendiri. Saat mengganti data yang dulu digabung, pilihan ini sudah tercentang. Dataset lama yang sheet-nya masih terpisah juga bisa beralih: unggah ulang dengan centang ini, widget yang memakai sheet kedua dan seterusnya otomatis pindah ke sheet gabungan — angkanya kini menghitung baris semua sheet yang digabung. Kolom filter dashboard yang dipilih dari sheet kedua dan seterusnya perlu dipilih ulang dari sheet gabungan.
4. Selama mengunggah, progres dan perkiraan waktu tampil. Anda bisa menekan **Jeda** lalu **Lanjutkan**.
5. Koneksi terputus atau halaman tertutup? Pilih **file yang sama** lagi — unggahan dilanjutkan dari bagian terakhir (**Lanjutkan unggahan**) dengan pilihan sheet (dan gabungan) yang sama.

## Setelah file terunggah

Aplikasi memproses file dalam empat langkah: _Menyiapkan file_, _Membaca isi file_, _Menyimpan data_, _Mendeteksi tipe kolom_. File besar butuh beberapa menit; Anda boleh meninggalkan halaman.

Muncul **Pemroses unggahan sedang tidak aktif**? Artinya layanan pemroses di server sedang mati, jadi antrean tidak berjalan. File Anda aman di antrean dan otomatis diproses begitu pemroses dinyalakan lagi — tidak perlu mengunggah ulang. Beri tahu admin aplikasi.

Setelah selesai, kartu **Data aktif** menampilkan nama file dan waktu pembaruannya. Lanjutkan ke **Tinjau & koreksi skema** untuk memastikan setiap kolom terbaca benar.

## Tips

- Baris pertama sebaiknya berisi judul kolom. Bila judul ada di baris lain (mis. ada judul laporan di atasnya), Anda bisa memilih baris judul di halaman skema.
- **Riwayat versi** menyimpan versi aktif dan 3 versi siap terbaru; versi itu bisa diaktifkan lagi. File asli yang diunggah dihapus otomatis setelah 7 hari (datanya tetap tersimpan).
