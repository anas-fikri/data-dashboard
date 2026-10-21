---
title: Mengunggah data per periode (bulanan, kuartalan, tahunan)
slug: data-per-periode
role: OWNER
context: UPLOAD
---

Laporan bulanan tidak perlu diunggah ulang seluruhnya setiap bulan. Dengan **data per periode**, dataset menyimpan data per bulan (atau kuartal, atau tahun): periode baru **ditambahkan**, periode yang sudah ada **diganti utuh** — tidak pernah digandakan. Mengunggah file yang sama dua kali hasilnya sama dengan sekali. Semua periode tetap berada di dataset dan sheet yang sama, jadi dashboard bisa membandingkan antarbulan.

Setiap perubahan periode membuat versi baru di **Riwayat versi**, sehingga selalu bisa dikembalikan.

## Mengaktifkan data per periode (Atur periode)

Dilakukan sekali per dataset, setelah dataset berisi data.

1. Buka halaman dataset → kartu **Data per periode** → **Atur periode** (atau tautan _Ingin menyimpan data per bulan? Atur periode_ di kartu Data).
2. Pilih **Satuan periode**: **Bulan**, **Kuartal**, atau **Tahun**.
3. Pilih **Sumber periode** untuk setiap sheet:
   - **Dari kolom tanggal** (disarankan): periode setiap baris diambil dari kolom tanggal itu. Satu file boleh berisi banyak bulan; aplikasi memecahnya sendiri.
   - **Saya pilih saat upload**: untuk sheet tanpa kolom tanggal. Setiap kali mengunggah, Anda memilih periode file itu. Untuk data yang sudah ada, pilih periodenya di bagian **Periode data sekarang**.
4. Atur **Simpan N periode terbaru** (kosongkan untuk bawaan admin, biasanya 24; paling banyak 60) dan **Saat batas tercapai** (lihat _Batas penyimpanan_ di bawah).
5. Tekan **Tinjau**. Belum ada data yang berubah. Periksa:
   - sebaran baris per periode — angka yang aneh (mis. bulan yang tertukar karena format tanggal hari/bulan) terlihat di sini;
   - **baris tanpa tanggal valid**, dengan contoh nomor barisnya. Perbaiki tanggalnya di file lalu unggah ulang, atau centang **Buang N baris tanpa tanggal valid** (jumlahnya dicatat di riwayat versi);
   - **Kapasitas**: pemakaian batas dan perkiraan berapa periode lagi yang muat.
6. Tekan **Terapkan**. Data aktif disusun ulang per periode sebagai versi baru. Dashboard memakai angka yang sama; versi sebelumnya tetap bisa diaktifkan lagi dari **Riwayat versi**.

## Mengunggah periode baru atau pengganti

1. Di kartu **Data**, seret file ke kotak **Tambah atau perbarui periode** atau tekan **Pilih file**.
2. Untuk sheet yang periodenya dipilih saat upload, isi **Periode file**. Pilihan terisi dari nama file bila jelas (mis. _laporan_2026-03.xlsx_ → Maret 2026) — selalu periksa. Bila nama file tidak menyebut periode yang jelas, Anda wajib memilihnya.
3. File diproses seperti biasa. Hanya baris file baru yang diperiksa dan disimpan; periode lain tidak ditulis ulang, jadi unggahan bulan ke-24 secepat bulan pertama.
4. Hasilnya:
   - **Langsung aktif** bila file murni menambah periode baru dari kolom tanggal, masih dalam batas, dan tanpa peringatan. Riwayat versi mencatat mis. _Maret 2026 ditambahkan (12.950 baris)_.
   - **Menunggu konfirmasi** untuk semua kasus lain: ada periode yang diganti, dilepas karena batas, menyusut banyak, periode kecil yang mungkin nyasar, periode dari pilihan Anda (bukan kolom tanggal), atau file identik. Tekan **Tinjau perubahan**.

Ingin mengganti seluruh isi dataset? Pakai **Ganti semua data…** di bawah kotak unggah. Konfirmasinya menyebut _Semua N periode akan diganti_; setelah itu data tidak lagi disimpan per periode sampai Anda **Atur periode** lagi.

## Layar tinjauan

Layar **Tinjau perubahan periode** menunjukkan apa yang akan terjadi sebelum data aktif diubah:

| Periode  | Sekarang | Setelah | Keterangan                      |
| -------- | -------- | ------- | ------------------------------- |
| Feb 2026 | 12.400   | 12.950  | Diganti                         |
| Mar 2026 | –        | 13.020  | Baru                            |
| Mar 2024 | 11.800   | –       | Dilepas karena batas 24 periode |

- **Periode kecil yang mungkin nyasar** (mis. 3 baris bertanggal 31 Januari di file Februari) bawaannya **Kecualikan** — baris itu tidak disimpan. Pilih **Masukkan** bila memang benar; dampaknya langsung terlihat di tabel.
- **Menyusut**: bila periode diganti dengan data jauh lebih sedikit (lebih dari 50%), centang _Saya paham … diganti dengan data yang lebih sedikit_. Ini mencegah bulan yang baru separuh menimpa bulan yang lengkap.
- **Dilepas**: periode yang keluar karena batas harus dicentang _Saya paham … dilepas dari data aktif_.
- **File identik** dengan periode yang sudah ada diberi catatan; menerapkannya tidak mengubah isi data.
- **Sheet yang tidak ada di file** tetap memakai data lamanya (_Pertahankan data lama sheet itu_).
- Untuk periode pilihan Anda: bila ada kolom tanggal yang di luar periode itu, muncul peringatan. Bila periodenya salah, batalkan lalu unggah ulang dengan periode yang benar.
- **Batas setelah diterapkan** menampilkan meter pemakaian.

Tombol: **Lihat isi file** (membuka isi file di Lihat data sebelum diterapkan), **Terapkan**, dan **Batalkan upload** (file dibuang, data aktif tidak berubah). Bila data berubah selama Anda meninjau, rencana dihitung ulang dan ditampilkan lagi sebelum diterapkan. Unggahan yang tidak diputuskan dalam 7 hari dibuang otomatis.

## Batas penyimpanan

Batas selalu dihitung per **periode utuh** — periode tidak pernah dipotong atau dipecah.

| Batas                           | Bawaan                                                |
| ------------------------------- | ----------------------------------------------------- |
| Periode disimpan per dataset    | 24 (pengaturan pemilik, maks. 60)                     |
| Baris per sheet (semua periode) | 10 juta                                               |
| Ukuran data per dataset         | 16 GiB                                                |
| Periode per sheet               | 120                                                   |
| Kuota per pengguna              | 20 GiB, dihitung dari data yang benar-benar tersimpan |

**Saat batas tercapai** (diatur di Atur periode / Pengaturan periode):

- **Tolak unggahan (bawaan)**: unggahan ditolak dan data aktif tidak berubah. Pesannya menyebut periode yang perlu dihapus dulu, mis. _Menyimpan April 2026 akan melewati batas simpan 24 periode. Hapus periode Maret 2024 dulu, atau ubah pengaturan "Saat batas tercapai"._
- **Lepas periode terlama otomatis**: periode terlama (menurut periodenya, bukan tanggal unggah) dilepas utuh agar periode baru muat. Selalu lewat layar tinjauan dan masih bisa dipulihkan selama versi lamanya tersimpan.

Kasus lain:

- Periode yang **lebih tua** dari periode tertua saat batas sudah penuh ditolak (_Periode … di luar batas simpan …_), karena menyimpannya berarti melepas data yang lebih baru.
- Satu periode yang **sendirian melebihi** batas (mis. lebih dari 10 juta baris) ditolak. Hubungi admin, atau unggah hanya sheet/kolom yang diperlukan.
- Karena periode tidak dipotong, total data bisa berhenti sedikit di bawah batas.

**Meter dan peringatan.** Saat pemakaian mencapai 80% dari salah satu batas, kartu **Data per periode** dan panel unggah menampilkan meter (mis. _18 dari 24 periode disimpan · mendekati batas_) dan perkiraan, mis. _Dengan rata-rata 1,0 jt baris per periode, dataset ini menyimpan sekitar 10 periode_. Bila ukuran file diperkirakan melewati batas, panel unggah menampilkan perkiraan, mis. _Perkiraan ±14 jt baris di seluruh file (dari ukuran file), melebihi batas 10 jt baris per sheet: kemungkinan ditolak_ — hanya peringatan, unggahan tetap berjalan dan kepastiannya dihitung setelah file diproses.

## Mengelola periode: unggah ulang, hapus, pulihkan

Kartu **Data per periode** berisi daftar periode di data aktif (terbaru di atas): Periode, Baris per sheet, File, Diunggah oleh, Tanggal, dan aksi.

- **Unggah ulang**: membuka panel unggah dengan periode terisi. File pengganti mengganti periode itu utuh.
- **Hapus**: periode dilepas dari data aktif dalam hitungan detik; periode lain tidak berubah. Periode terakhir tidak bisa dihapus — pakai **Ganti semua data…**.
- **Pulihkan periode**: periode yang dihapus, diganti, atau dilepas bisa dipulihkan dari versi lama yang **masih tersimpan** (aktif + 3 versi terakhir). Dialognya menyebut perubahan baris per sheet. Bila versi lamanya sudah terhapus, alasannya tertulis dan tombolnya tidak ada.
- Selama ada file yang sedang diproses atau menunggu keputusan, tombol-tombol ini nonaktif sampai selesai.

**Kembali ke versi lama** lewat **Riwayat versi** → **Aktifkan** juga bisa, tetapi semua perubahan sesudahnya ikut hilang dari data aktif (peringatannya menyebut periode yang terdampak). Untuk mengembalikan satu periode saja, pakai **Pulihkan**.

## Banyak file sekaligus (antrean)

Mengisi riwayat 12–24 bulan sekaligus:

1. Pilih atau seret **beberapa file** ke kotak **Tambah atau perbarui periode** (paling banyak 36 file).
2. Periksa daftar **Antrean N file**: urutannya periode lama dulu. Isi periode setiap file bila perlu, atau hapus file dari daftar.
3. Tekan **Mulai antrean (N file)**.

File diunggah lalu diproses satu per satu, dengan status mis. _File 3 dari 12_. Bila satu file perlu tinjauan atau pemetaan kolom, antrean berhenti sampai Anda memutuskan, lalu lanjut sendiri. File yang gagal tidak menghentikan file lain; ringkasan tampil di akhir. Antrean tetap diproses walau halaman ditutup setelah semua file terunggah. File yang belum terunggah saat halaman ditutup bisa dipilih ulang (**Pilih ulang file antrean**) atau dilewati. **Hentikan antrean** membatalkan file yang belum diproses; periode yang sudah diterapkan tetap.

## Satu periode dari beberapa file (kelompok)

Satu bulan lebih dari 1.048.576 baris tidak muat di satu sheet Excel. Pecah menjadi beberapa file (atau ekspor sebagai CSV, yang tidak punya batas baris itu), lalu:

1. Pilih semua file bulan itu sekaligus.
2. Nyalakan **Satu periode dari beberapa file** (paling banyak 10 file per kelompok, bawaan admin) dan, bila perlu, pilih periode kelompoknya.
3. Tekan **Unggah sebagai satu kelompok (N file)**.

Setelah semua file terunggah, semuanya diproses sebagai **satu** versi: periodenya diganti utuh oleh gabungan semua file. Bila satu file gagal, tidak ada yang diterapkan. File kembar dalam satu kelompok ditolak.

## Kolom yang berbeda dan aturan tetap

- Bila kolom file baru berbeda, unggahan menunggu **pemetaan kolom** seperti biasa. Pemetaan hanya berlaku untuk periode di file itu; periode lama tidak berubah. **Kosongkan** berarti kosong untuk periode baru saja. Kolom tambahan disimpan sebagai kolom tersembunyi bertipe Teks (periode lama bernilai kosong). Nama kolom yang sudah dipetakan diingat untuk bulan berikutnya.
- Tipe kolom tidak diubah di layar pemetaan; ubah dari **Skema data** (diproses per bagian data dengan progres mis. _Segmen 7 dari 24_).
- Periode setiap baris dibekukan saat diunggah. Tipe kolom tanggal sumber periode tidak bisa diubah, dan baris judul tidak bisa dipilih ulang, selama data per periode.

## Atur ulang periode

Untuk mengganti satuan (mis. bulan → kuartal) atau kolom tanggal sumbernya: **Pengaturan periode** → **Atur ulang periode**. Pilih satuan dan sumber baru, atau **Ikuti periode sekarang** (setiap baris tetap di periodenya, digabung ke satuan yang dipilih; satuan yang lebih kecil butuh kolom tanggal). Tekan **Tinjau**, lalu **Terapkan**. Hasilnya versi baru; versi dengan periode lama tetap bisa diaktifkan lagi dari Riwayat versi.

## Kolom Periode di dashboard

Sheet per periode punya kolom sistem **Periode** (atau **Periode (sistem)** bila sudah ada kolom bernama Periode). Kolom ini bisa dipakai di widget sebagai pengelompokan (mis. satu batang per bulan), di urutan, dan sebagai filter dashboard dengan pilihan **Periode terbaru**. Untuk dataset tanpa kolom tanggal, kolom inilah satu-satunya cara membandingkan periode. Viewer hanya bisa menyaring per periode bila kolom ini dipasang sebagai filter dashboard. Di **Lihat data**, pilih periode lewat **Periode: Semua ▾**.
