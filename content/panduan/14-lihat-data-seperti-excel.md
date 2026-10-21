---
title: Melihat data seperti Excel (Lihat data)
slug: lihat-data-seperti-excel
role: OWNER
context:
---

**Lihat data** menampilkan seluruh isi sheet dataset dalam bentuk lembar kerja seperti Excel: gulir jutaan baris, urutkan, saring, cari, salin ke Excel, dan unduh hasilnya. Data tidak dikirim utuh ke browser — server yang mengurutkan dan menyaring, lalu mengirim baris yang sedang terlihat saja. Karena itu sheet berisi 10 juta baris tetap bisa dibuka, padahal Excel sendiri berhenti di 1.048.576 baris.

Lihat data bersifat **baca-saja**: tidak ada yang bisa mengubah isi data dari sini.

## Siapa yang bisa membuka

| Peran            | Cara membuka                                                                                                                            |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Pemilik dataset  | Halaman dataset → kartu **Data** → **Lihat data**; atau halaman **Skema data** → **Lihat data**; atau kepala dashboard → **Lihat data** |
| Editor dashboard | Kepala dashboard yang dibagikan → **Lihat data**, atau **Buka di Lihat data** di tampilan **Perbesar** tabel                            |
| Viewer           | Tidak bisa membuka seluruh sheet. Viewer memakai tombol **Perbesar** pada widget tabel (hanya kolom widget itu)                         |

## Tata letak

- **Tab sheet** ada di bawah tabel, seperti Excel.
- Kepala kolom berisi huruf kolom (**A**, **B**, **C** …), nama kolom, dan ikon tipe. Arahkan kursor ke kepala kolom untuk melihat kolom asalnya di file (mis. _Kolom D di file asli_). Huruf kolom tidak berubah walau kolom disembunyikan atau digeser.
- Kolom **Baris** di kiri dan baris kepala selalu terlihat saat digulir.
- Nomor baris = urutan di tampilan sekarang (1, 2, 3 …), jadi berubah saat diurutkan atau disaring. Nomor baris asli di file ada di panel **Isi sel**.
- Bilah status di bawah tabel, mis. _Baris 1.201–1.240 dari 9.812.334 (tersaring dari 10.000.000)_.
- Angka tampil `1.234.567,89`, tanggal `2 Mar 2026`, sel kosong tetap kosong, dan teks panjang dipotong di 500 karakter (isi lengkap di **Isi sel**).
- Dataset per periode punya pemilih **Periode: Semua ▾** untuk menampilkan periode tertentu saja.

## Mengurutkan

- Klik kepala kolom: urut naik → urut turun → tanpa urutan.
- **Shift+klik** kepala kolom lain untuk menambah urutan kedua dan ketiga (paling banyak 3 kolom).
- Atau buka menu kolom (ikon ⋮ di kepala kolom, atau Enter saat kepala kolom terfokus): **Urutkan naik**, **Urutkan turun**, **Tambah ke urutan**, **Lepas urutan kolom ini**, **Hapus semua urutan**.

Urutan dihitung server atas seluruh data, bukan hanya baris yang sudah dimuat. Blok pertama hasil urut bisa butuh beberapa detik pada sheet jutaan baris, begitu pula saat melompat jauh di tampilan yang terurut; gulir lanjutan sesudahnya cepat. Bila muncul pesan bahwa pengurutan terlalu berat, tekan **Hapus urutan** atau saring data dulu.

## Menyaring

1. Buka menu kolom → **Saring…** (atau tekan **Alt+↓** di kepala kolom).
2. Isi saringan sesuai tipe kolom:
   - **Teks**: centang nilai; ketik di kotak cari untuk daftar panjang (paling banyak 1.000 nilai ditampilkan).
   - **Angka**: isi _Paling kecil_ dan/atau _Paling besar_.
   - **Tanggal**: pilihan cepat (_Bulan ini_, _Tahun lalu_, …), satu periode, atau rentang sendiri.
3. Tekan **Terapkan**.

Saringan aktif tampil sebagai label di atas tabel beserta jumlah barisnya, mis. _1.234 baris (tersaring dari 450.000)_. Tekan × pada label untuk melepas satu saringan, atau **Hapus semua saringan**. Paling banyak 20 kolom bisa disaring sekaligus. Saringan di Lihat data tidak mengubah dashboard.

## Mencari

1. Ketik teks di kotak **Cari** (atau tekan **Ctrl+F** saat kursor ada di dalam tabel), lalu Enter.
2. Pencarian berlaku seperti saringan: hanya baris yang mengandung teks itu yang tampil, dan sel yang cocok disorot. Keterangan di bawah kotak menyebut _Ditemukan di N baris_.
3. Yang dicari: paling banyak 10 kolom teks yang sedang terlihat, teks paling panjang 100 karakter. Pencarian dihentikan setelah 10 detik — tekan **Batalkan** bila terlalu lama.
4. Tekan **Hapus pencarian** atau Esc untuk kembali ke semua baris.

## Mengatur kolom

Lewat menu kolom:

- **Paskan lebar kolom**, atau seret tepi kepala kolom untuk mengubah lebarnya. Seret kepala kolom untuk menggeser urutannya.
- **Bekukan sampai kolom ini**: kolom kiri tetap terlihat saat menggulir ke samping (paling banyak 3 kolom pertama). **Lepas pembekuan kolom** untuk mengembalikan.
- **Sembunyikan kolom**. Tampilkan lagi lewat tombol **Kolom** di atas tabel; **Kembalikan tampilan bawaan** mengembalikan semua pengaturan kolom.
- **Format tampilan** (kolom angka): _Otomatis_, _Angka_, _Rupiah_, _Persen_, serta **Tambah desimal** / **Kurangi desimal**.

Pengaturan ini hanya untuk Anda, tersimpan di browser ini per sheet. Skema data dan tampilan pengguna lain tidak berubah. Kolom yang disembunyikan di **Skema data** tidak tampil di Lihat data.

## Melompat dan ringkasan kolom

- **Ke baris**: isi nomor baris lalu **Buka**. **Ctrl+Home** / **Ctrl+End** melompat ke baris pertama / terakhir.
- Klik sel di kolom angka: bilah status menampilkan **Jumlah · Rata-rata · Min · Maks · Hitung** kolom itu atas seluruh baris tampilan (termasuk saringan dan pencarian), bukan hanya baris yang terlihat.

## Panel Isi sel

Tekan **F2** atau **Enter** pada sel (atau klik ganda; di ponsel cukup ketuk sel). Panel menampilkan:

- isi lengkap sel (sampai 32.767 karakter);
- **Sumber**: nama file, nomor baris asli di file, dan periodenya (dataset per periode);
- bila nilai di file tidak bisa dibaca sesuai tipe kolom: tulisan **Tidak terbaca sebagai …** beserta **Nilai asli di file**. Di tabel sel itu kosong, jadi panel ini menunjukkan data yang hilang karena tipe kolom kurang cocok — perbaiki tipenya di **Skema data** bila perlu;
- tombol **Salin isi**.

## Menyalin ke Excel

- **Satu sel**: klik sel lalu tekan **Ctrl+C** (Cmd+C di Mac).
- **Beberapa baris**: klik nomor baris, **Shift+klik** nomor baris lain untuk memilih rentang (atau **Shift+Spasi** dari keyboard), lalu tekan **Ctrl+C** atau **Salin (Ctrl+C)** di bilah pilihan. Baris judul ikut tersalin. Tempel langsung di Excel.
- Paling banyak **1.000 baris** sekali salin. Lebih dari itu, bilah pilihan menawarkan **Unduh tampilan**.
- Pilih **Desimal salinan: Koma (,)** atau **Titik (.)** di bawah tabel sesuai pengaturan Excel Anda (Excel berbahasa Indonesia biasanya koma). Angka disalin tanpa pemisah ribuan, tanggal sebagai `2026-03-02`.
- Teks yang diawali `=`, `+`, `-`, atau `@` diberi awalan `'` agar tidak dijalankan sebagai rumus di Excel.
- Tekan Esc atau **Batal pilih** untuk melepas pilihan.

Memilih rentang sel dengan diseret (mis. B2:D10) belum tersedia; salin per sel atau per baris.

## Mengunduh tampilan

1. Tekan **Unduh tampilan**.
2. Pilih format **Excel (XLSX)** atau **CSV**, lalu tekan **Buat file**.
3. File dibuat di server lalu terunduh. Tautannya berlaku 1 jam.

Isi file sama dengan tampilan sekarang: kolom yang terlihat dalam urutan tampil, urutan baris, saringan, pencarian, dan pilihan periode. Kolom yang disembunyikan tidak ikut. Bawaannya paling banyak **1 juta baris** per file (Excel tidak bisa lebih dari 1.048.575 baris data). Tampilan yang lebih besar ditolak dengan saran untuk menyaring dulu — file **tidak pernah dipotong diam-diam**. Setiap unduhan dicatat.

## Saat data berganti

Bila pemilik mengunggah data baru saat Anda sedang membuka Lihat data, muncul pemberitahuan **Data sudah diperbarui — muat ulang untuk melihat versi terbaru**. Tekan **Muat ulang**; baris dari dua versi tidak pernah tercampur.

## Di ponsel

- Tabel menggulir di dalam kotaknya; halaman tidak bergeser ke samping. Hanya kolom **Baris** yang dibekukan.
- **Ke baris**, **Unduh tampilan**, **Kolom**, dan **Desimal salinan** ada di tombol **Lainnya**.
- Menu kolom (urut dan saring) terbuka dari bawah layar.
- Ketuk sel untuk membuka **Isi sel**, lalu **Salin isi**.
- Tampilan terbaik di layar selebar 1.024 piksel atau lebih.

## Pintasan keyboard

| Tombol                      | Fungsi                                           |
| --------------------------- | ------------------------------------------------ |
| Panah, Tab, PageUp/PageDown | Pindah sel                                       |
| Home / End                  | Sel pertama / terakhir di baris                  |
| Ctrl+Home / Ctrl+End        | Baris pertama / terakhir data                    |
| Enter di kepala kolom       | Buka menu kolom                                  |
| Alt+↓                       | Saring kolom                                     |
| Ctrl+F                      | Cari                                             |
| F2 atau Enter               | Panel Isi sel                                    |
| Ctrl+C                      | Salin sel atau baris terpilih                    |
| Shift+Spasi                 | Pilih baris                                      |
| Esc                         | Lepas pilihan, tutup panel, atau hapus pencarian |

Pembaca layar (NVDA, VoiceOver) mendapat nama kolom, nomor baris, arah urutan, dan pengumuman seperti _Memuat baris …_ dan _Baris … dimuat_.

## Yang bisa dan belum bisa

| Bisa                                                         | Belum bisa (dan alasannya)                                                                                 |
| ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| Gulir jutaan baris, tab sheet, kepala dan kolom Baris beku   | Mengubah isi sel, rumus, makro, urungkan — data tersimpan sebagai salinan tetap dan diganti lewat unggahan |
| Urut sampai 3 kolom, saring per kolom, cari                  | Pivot dan conditional formatting di Lihat data — pakai widget **Pivot** di dashboard                       |
| Lebar, geser, bekukan (≤ 3), sembunyikan kolom, format angka | Warna, gaya, dan sel gabungan (merge) dari file asli — hanya isi dan tipe yang disimpan                    |
| Isi sel lengkap, termasuk nilai asli yang gagal dibaca       | Seret-pilih rentang sel lalu salin banyak sel sekaligus                                                    |
| Salin sel atau ≤ 1.000 baris, unduh tampilan CSV/XLSX        | Viewer membuka seluruh sheet — viewer hanya melihat kolom widget lewat **Perbesar**                        |
