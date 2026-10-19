---
title: Tabel pivot seperti di Excel
slug: widget-pivot
role: OWNER
context: BUILDER
---

Widget **Pivot** meringkas data seperti _PivotTable_ di Excel: satu baris untuk setiap kategori (mis. _Customer_), satu kolom untuk setiap periode (mis. per bulan), dan angka hasil hitungan di setiap sel — lengkap dengan subtotal dan total. Angkanya dihitung dari seluruh data dataset, bukan hanya baris yang tampil.

## Dari PivotTable Excel ke widget Pivot

| Di Excel (PivotTable)                  | Di Data Dashboard                                                          |
| -------------------------------------- | -------------------------------------------------------------------------- |
| _Rows_                                 | **Baris** — **Satu baris per**, dan **Dirinci per** bila perlu dua tingkat |
| _Columns_                              | **Pisahkan per** (opsional)                                                |
| _Values_                               | **Nilai** (1–3), mis. _Total_, _Rata-rata_, _Jumlah baris_                 |
| _Subtotals_                            | Sakelar **Subtotal per …**                                                 |
| _Grand Total_                          | Sakelar **Tampilkan total**                                                |
| _Filters_                              | Bagian **Saring** di pengaturan pivot                                      |
| Tombol filter ▾ di _Row/Column Labels_ | Ikon saring di kepala tabel pivot                                          |
| _Slicer_                               | Bilah **Filter** dashboard                                                 |

## Membuat widget Pivot

1. Buka dashboard dalam mode edit (**Ubah tata letak**), tekan **Tambah widget**, lalu buka pengaturannya.
2. Isi **Judul**, lalu pilih jenis tampilan **Pivot**. Isian langsung terisi: kolom teks pertama sebagai baris, kolom tanggal (bila ada) dipisah per bulan, dan total kolom angka pertama.
3. Baca **kalimat ringkasan** di atas panel, mis. _Satu baris per Customer, satu kolom per Tanggal (per bulan), berisi Total No., dengan kolom dan baris Total._ Setiap perubahan langsung terlihat di kartu.
4. **Baris → Satu baris per**: kolom yang menjadi isi kolom paling kiri. Untuk kolom tanggal, pilih **Rentang waktu** (per hari, minggu, bulan, kuartal, tahun).
5. **Rinci baris** (opsional): pecah setiap baris per kolom kedua, mis. _Customer_ dirinci per _Layanan_. Baris kelompok berisi **subtotal** dan tampil di atas rinciannya.
6. **Pisahkan per** (opsional): satu kolom tabel untuk setiap nilai, mis. _Tanggal_ per bulan → _Jan 2026_, _Feb 2026_, …, lalu kolom **Total** di paling kanan.
7. **Nilai**: pilih cara menghitung (**Hitung**) dan kolomnya. Tekan **Tambah nilai** untuk sampai tiga nilai berdampingan, mis. total paket dan total omzet.
8. Atur **Urutan baris** (nilai terbesar dulu, A–Z, …), **Tampilkan total**, dan **Format angka**. Perlebar kartu lewat **Ukuran** atau dengan menarik sudutnya agar semua kolom terlihat.

9. **Saring** (opsional), seperti area _Filters_ di PivotTable: tekan **Tambah saringan**, pilih **Kolom** (mis. _Layanan_), lalu centang nilai yang dihitung (mis. _Darat_). Untuk "semua kecuali", tekan **Pilih semua** lalu lepas centang nilai yang tidak dihitung. Maksimal tiga kolom; pivot hanya menghitung baris yang cocok dengan semuanya. Selama belum ada nilai yang dicentang, saringan itu belum berlaku.
10. Sakelar **Klik label menyaring widget lain** (aktif untuk pivot baru): label baris atau kolom pivot yang dipilih pembaca menjadi filter untuk widget lain di dashboard. Matikan bila pivot ini hanya untuk dibaca. Pivot yang dibuat sebelum fitur ini ada belum menyaring widget lain sampai sakelarnya dinyalakan.

Kalau muncul pesan **Kolom ini sudah dipakai di atas dengan rentang waktu yang sama**, Anda memilih kolom yang sama dua kali (mis. _Customer_ sebagai baris dan sebagai rincian). Pilih kolom lain, atau untuk kolom tanggal pilih rentang waktu yang berbeda. Selama pesan ini ada, perubahan belum disimpan.

## Membaca tabel pivot

- Kepala kolom, nama baris, dan baris **Total** tetap terlihat saat tabel digulir. Di ponsel, geser tabel ke samping.
- Baris kelompok berlatar abu dan tebal adalah **subtotal**; kolom dan baris **Total** juga tebal. Tanda **–** berarti tidak ada data untuk sel itu.
- Tabel menampilkan paling banyak **200 baris** dan **40 kolom**. Bila lebih, catatan di bawah tabel menyebut berapa yang tampil; total tetap menghitung semua data. Persempit dengan filter dashboard.
- Filter dashboard dan klik pada grafik lain (filter silang) ikut menyaring pivot.

## Menyaring dari tabel pivot

Seperti tombol filter ▾ di _Row Labels_ dan _Column Labels_ PivotTable Excel, sel kiri atas tabel berisi nama setiap bagian pivot dengan ikon saring: kolom pemisah (mis. _Tanggal_) di atas, lalu baris (mis. _Customer › Layanan_).

1. Tekan nama bagian yang ingin disaring, mis. **Layanan**. Semua nilai tercentang di awal.
2. Lepas centang nilai yang tidak ingin dihitung (mis. _Udara_), atau tekan **Hapus pilihan** lalu centang hanya yang perlu. Ketik di kotak cari untuk daftar panjang.
3. Subtotal, kolom Total, dan baris Total langsung mengikuti. Ikon saring yang terisi menandai bagian yang sedang disaring, dan catatan **Disaring — …** di bawah tabel menyebut semua saringan yang berlaku (termasuk bagian **Saring** dari pengaturan widget).
4. Tekan **Hapus saringan** di catatan itu untuk kembali ke semua data.

Saringan ini tidak mengubah pengaturan widget dan hanya berlaku untuk pivot itu. Saringan ikut tautan halaman (bisa dibagikan atau dimuat ulang), ekspor CSV/Excel, dan **Ekspor PDF**.

Pilih label baris atau kolom (mis. _Customer 24_ atau _Jan 2026_) untuk menyaring **widget lain** ke nilai itu, sama seperti mengklik batang grafik. Filternya tampil di bilah filter (_Disaring dari …_) dan bisa dihapus dari sana; pilih label yang sama lagi untuk melepasnya. Pivot sumbernya sendiri tidak ikut tersaring.

## Ekspor dan cetak

- Tombol unduh di kepala kartu mengekspor pivot ke **CSV** atau **Excel (XLSX)**: satu kolom per kolom baris (nama kelompok diulang di setiap baris rincian), baris berlabel _Subtotal_, baris _Total_, dan angka bertipe angka sehingga bisa langsung dijumlah atau dibuat grafik di Excel.
- Ekspor dan PDF mengikuti saringan pivot yang sedang aktif; di PDF, saringan itu disebut di bawah tabel.
- **Ekspor PDF** dashboard mencetak baris dan kolom yang muat di kartu, beserta baris Total. Yang tidak muat disebut di catatan bawah — pakai ekspor Excel untuk semua baris dan kolom yang tampil di layar.
- Ekspor juga mengikuti batas tampil **200 baris × 40 kolom**; bila lebih, baris terakhir file berisi catatannya. Persempit dengan filter (mis. per periode) lalu ekspor per bagian.
