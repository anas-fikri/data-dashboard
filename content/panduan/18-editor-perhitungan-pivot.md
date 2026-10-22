---
title: Perhitungan seperti PivotTable untuk editor
slug: editor-perhitungan-pivot
role: EDITOR
context: BUILDER
---

Widget **Pivot**, grafik, dan **Angka** (KPI) bisa menghitung lebih dari sekadar total: persentase dari total, total berjalan, selisih dari bulan sebelumnya, rumus seperti _margin_ atau _rata-rata per kiriman_, dan _N teratas_ dengan sisanya digabung ke **(Lainnya)**. Semua angka dihitung server dari **seluruh data yang lolos filter**, bukan hanya baris yang tampil di layar.

## Dari PivotTable Excel ke Data Dashboard

| Di Excel (PivotTable)                              | Di Data Dashboard                                                              |
| -------------------------------------------------- | ------------------------------------------------------------------------------ |
| _Show Values As_                                   | Pilihan **Tampilkan sebagai** di setiap nilai                                  |
| _Calculated Field_                                 | **Field terhitung** (rumus dari ukuran: Total, Rata-rata, Jumlah unik …)       |
| _Top 10_ pada _Row Labels_                         | **Tampilkan** _N teratas_ pada field baris, sisanya **(Lainnya)**              |
| Beberapa _Rows_ bertingkat + _Subtotals_ per field | Sampai **4 tingkat baris** dengan sakelar **Subtotal per …** di setiap tingkat |
| Banyak _Values_                                    | Sampai **8 nilai** berdampingan                                                |

## Tampilkan nilai sebagai

Di pengaturan widget, setiap nilai angka punya pilihan **Tampilkan sebagai**:

| Pilihan                       | Arti                                                         | Contoh                                   |
| ----------------------------- | ------------------------------------------------------------ | ---------------------------------------- |
| **Nilai biasa**               | Angka hasil hitungan apa adanya (bawaan)                     | Rp 4.000.000                             |
| **% dari total keseluruhan**  | Bagian dari total seluruh tabel                              | Jawa Barat = 51,8% dari semua pendapatan |
| **% dari total baris**        | Bagian dari total barisnya (hanya bila ada **Pisahkan per**) | Januari = 35,4% dari setahun Jawa Barat  |
| **% dari total kolom**        | Bagian dari total kolomnya                                   | Jawa Barat = 54,1% dari Januari          |
| **Total berjalan**            | Dijumlah terus dari item pertama                             | Jan 4 jt → Feb 7,8 jt → Mar 11,3 jt      |
| **Selisih dari sebelumnya**   | Nilai dikurangi item sebelumnya                              | Feb − Jan = −Rp 200.000                  |
| **% selisih dari sebelumnya** | Selisih dibagi nilai item sebelumnya                         | −5,0%                                    |

Hal yang perlu diingat:

- **Urutan acuan** total berjalan dan selisih: kolom **Pisahkan per** bila ada (mis. per bulan); tanpa itu, baris terdalam di dalam kelompoknya. Urutannya selalu label naik (bulan secara kronologis), apa pun **Urutan baris** yang dipilih. Bulan tanpa data dilewati, jadi "sebelumnya" berarti bulan terakhir yang ada datanya.
- Persentase dihitung terhadap total **seluruh data yang lolos filter**, termasuk baris dan kolom yang tidak tampil karena batas 200 baris × 40 kolom. Untuk **Rata-rata**, pembaginya rata-rata seluruh data, bukan jumlah sel.
- Sel **Total** dan **Subtotal**: persen tetap dihitung; total berjalan dan selisih dikosongkan (**–**).
- Grafik **Batang** dan **Garis** punya pilihan yang sama kecuali **% dari total baris** dan **% dari total kolom**; grafik **Pai** hanya **% dari total keseluruhan**; widget **Angka** tidak punya pilihan ini.
- Persen selalu tampil dengan satu desimal (mis. _12,5%_). Ekspor CSV, Excel, dan PDF memuat angka yang sama dengan layar, dan judul kolomnya menyebut caranya, mis. _% dari total kolom · Total Pendapatan_.

## Field terhitung

Field terhitung adalah rumus dari ukuran yang sudah dihitung, mis. **Margin = (Total Pendapatan − Total Biaya) ÷ Total Pendapatan**. Rumus disusun dari potongan (ukuran, operator, kurung, angka) — tidak ada kotak rumus bebas, jadi rumus tidak bisa salah ketik nama kolom.

1. Buka pengaturan widget, lalu tekan **Tambah field terhitung** (widget **Pivot**) atau **Pakai field terhitung** (widget **Batang**, **Garis**, **Pai**, dan **Angka**).
2. Isi **Nama field**, mis. _Margin_ (maks. 60 karakter).
3. Di **Tambah ke rumus**, susun rumus dari kiri ke kanan:
   - tekan **(** untuk kurung buka;
   - pilih **Ukuran** (mis. _Total_) dan **dari kolom** (mis. _Pendapatan_), lalu tekan **Tambah Total Pendapatan**;
   - tekan operator **−**, tambahkan _Total Biaya_, tekan **)**, tekan **÷**, lalu tambahkan _Total Pendapatan_ lagi.
4. Baca **Pratinjau**: _Margin = (Total Pendapatan − Total Biaya) ÷ Total Pendapatan_, beserta **Total keseluruhan (seluruh data)** sebagai nilai contoh.
5. Pilih **Format nilai** — _Persen_ untuk margin, _Rupiah_ untuk uang, atau **Ikuti format widget**.
6. Tekan **Simpan field**. Field muncul sebagai nilai baru; tekan **Ubah rumus** untuk mengubahnya.

Potongan baru selalu masuk di akhir rumus. Untuk memperbaiki, pilih potongan dengan panah kiri/kanan lalu tekan **Backspace**, atau tekan **Hapus bagian terakhir**. Selama rumus belum lengkap (mis. kurung belum ditutup atau dua operator berurutan), potongan yang salah ditandai merah, pesannya tampil di bawah rumus, dan **Simpan field** belum bisa ditekan.

### Menulis angka di rumus

Isian **Angka** memakai cara tulis Indonesia: **titik = pemisah ribuan**, **koma = desimal**.

| Ketik     | Dibaca sebagai                      |
| --------- | ----------------------------------- |
| 1.250     | seribu dua ratus lima puluh         |
| 0,5       | setengah                            |
| 1.250.000 | satu juta dua ratus lima puluh ribu |
| 0,125     | 0,125 (bukan 125)                   |

Tekan **Tambah angka** (atau Enter) untuk memasukkannya ke rumus. Contoh: _Target 10% = Total Pendapatan × 0,1_.

### Contoh rumus

| Nama field            | Rumus                                               | Format |
| --------------------- | --------------------------------------------------- | ------ |
| Laba                  | Total Pendapatan − Total Biaya                      | Rupiah |
| Margin                | (Total Pendapatan − Total Biaya) ÷ Total Pendapatan | Persen |
| Rata-rata per kiriman | Total Pendapatan ÷ Jumlah unik No Kiriman           | Rupiah |
| Target 10%            | Total Pendapatan × 0,1                              | Rupiah |

_Rata-rata per kiriman_ memakai **Jumlah unik** agar satu kiriman yang tercatat di dua baris tetap dihitung sekali.

### Cara angkanya dihitung

- Rumus dihitung **atas hasil hitungan kelompok**, bukan per baris lalu dijumlah. Margin di baris **Total** = (total pendapatan − total biaya) ÷ total pendapatan — sama seperti _Calculated Field_ Excel, dan bukan jumlah margin setiap baris.
- Pembagian dengan nol atau sel tanpa data menghasilkan **–** (tidak ada galat dan tidak ada angka tak hingga).
- Penjumlahan dan pengurangan uang tetap tepat sampai sen; hasil pembagian dibulatkan sesuai **Format nilai**.
- Field terhitung bisa dipakai untuk **Urutan baris**, **Top N**, dan **Tampilkan sebagai**, sama seperti nilai biasa.
- Grafik **Pai** hanya menerima rumus yang menjumlah atau mengurangkan **Total** atau **Jumlah baris** (tanpa × ÷ atau angka) — untuk rasio pakai grafik batang.
- Widget **Tabel** baris mentah tidak punya field terhitung. Butuh tabel berisi rumus? Pakai tabel yang bersumber dari **pivot tersimpan** (lihat [Memakai pivot tersimpan sebagai editor](/panduan/editor-pakai-pivot-tersimpan)).

## Pivot bertingkat: 4 tingkat baris dan 8 nilai

- **Baris**: tekan **Rinci baris** lalu **Rinci lagi** sampai 4 tingkat, mis. _Wilayah › Kota › Layanan › Bulan_. Setiap tingkat induk punya sakelar **Subtotal per …** sendiri: nyalakan hanya di tingkat yang perlu ringkasan.
- **Nilai**: tekan **Tambah nilai** atau **Tambah field terhitung** sampai 8 nilai.
- **Anggaran sel**: satu pivot paling banyak menampilkan **24.000 sel** (baris tampil × kolom tampil × nilai). Bila lebih, kolom di kanan tidak ditampilkan dan catatan di bawah tabel berbunyi _Menampilkan N dari M kolom — kurangi nilai atau tambah Saring_. Total tetap mencakup semua baris dan kolom. Contoh: 200 baris × 8 nilai → paling banyak 15 kolom tampil.
- Ekspor CSV/Excel memberi satu kolom untuk setiap tingkat baris; **Ekspor PDF** mencetak baris dan kolom yang muat di kartu dan menyebut sisanya di catatan. Kartu kecil di PDF yang tidak muat satu baris pun menyarankan memperbesar kartu.

## N teratas dan (Lainnya)

Di bawah setiap field baris ada pilihan **Tampilkan**: _Semua_, atau _3_, _5_, _10_, _20_, _50 teratas_.

1. Pilih mis. **5 teratas** pada _Kota_. Bila ada lebih dari satu nilai, pilih **Teratas menurut** (mis. _Nilai 1: Total Pendapatan_).
2. Lima kota terbesar tampil **per kelompok induknya** (mis. per wilayah); sisanya digabung ke satu baris **(Lainnya)**.
3. Angka **(Lainnya)** dihitung ulang dari data mentah, jadi rata-rata, jumlah unik, dan field terhitung tetap benar (bukan jumlah dari baris yang disembunyikan). **Subtotal** dan **Total** tidak berubah oleh N teratas.

Batasan:

- **(Lainnya)** tidak bisa diklik untuk menyaring widget lain.
- N teratas tidak bisa dipakai pada baris terdalam bersama **Total berjalan** atau **Selisih** tanpa **Pisahkan per**, karena item "sebelumnya" ikut tergabung ke (Lainnya). Pesannya tampil di bawah pilihan **Tampilkan**; hapus N teratas, ganti cara tampil, atau tambahkan **Pisahkan per**.

## Yang belum bisa

- Rumus per baris sebelum dijumlah, mis. Σ(qty × harga) — kolom itu perlu dibuat di file Excel sebelum diunggah.
- Fungsi seperti IF, ROUND, atau ABS, dan rumus yang diketik sebagai teks.
- **% dari induk**, peringkat (_rank_), dan indeks.
- N teratas pada kolom **Pisahkan per** (kolom tetap urut naik, maks. 40).
