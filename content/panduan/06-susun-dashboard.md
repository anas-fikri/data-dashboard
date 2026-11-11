---
title: Menyusun dashboard pertama
slug: susun-dashboard
role: OWNER
context: BUILDER
---

Dashboard berisi widget yang membaca dataset Anda. Setiap perubahan tersimpan otomatis.

## Membuat dashboard

1. Buka **Dashboard** → **Buat dashboard**.
2. Pilih **Dataset**, isi **Nama dashboard**, lalu tekan **Buat dashboard**. Centang **Mulai dengan dashboard contoh** agar widget awal langsung tersusun dari kolom data: angka total dan jumlah baris, grafik garis per tanggal, grafik batang per kategori, tabel data, serta kolom filter tanggal dan kategori. Semuanya bisa diubah atau dihapus. Dataset tanpa kolom angka atau tanggal tetap mendapat angka _Jumlah baris_ dan tabel.
3. Dashboard baru langsung terbuka dalam mode edit. Untuk dashboard yang sudah ada, tekan **Ubah tata letak**.

## Menambah widget

1. Tekan **Tambah widget**. Widget baru ditaruh di samping widget terakhir selama barisnya masih muat (tiga widget pertama berjajar dalam satu baris), dan panel pengaturannya langsung terbuka (untuk widget lain: ikon pengaturan di kepala kartu).
2. Pilih **Jenis tampilan**: **Angka** (KPI), **Batang**, **Garis**, **Pai**, **Tabel**, atau **Pivot** (ringkasan seperti _PivotTable_ Excel — lihat panduan _Tabel pivot seperti di Excel_). Isian langsung terisi dari data Anda: angka yang dihitung adalah kolom besaran (mis. _Omzet_), bukan kolom nomor urut atau kode (_No._, _ID_, _Kode_); grafik dikelompokkan menurut kolom kategori dengan 2–50 nilai berbeda (mis. _Cabang_); **Garis** memakai kolom tanggal per bulan.
3. **Judul** terisi otomatis dari pengaturan, mis. _Total Omzet per Cabang_, dan ikut berubah selama Anda belum mengetik judul sendiri. Ketik judul lain kapan saja; judul itu tidak ditimpa lagi. Kosongkan kolom **Judul** untuk kembali ke judul otomatis.
4. Untuk grafik, ubah **Kelompokkan menurut** (mis. _Cabang_) dan, untuk kolom tanggal, **Rentang waktu** (per hari, minggu, bulan, kuartal, tahun).
5. Ubah **Nilai** (_Total_, _Rata-rata_, _Jumlah baris_, _Jumlah terisi_, _Jumlah kosong_, _Jumlah nilai unik_, _Terkecil_, _Terbesar_) **dari kolom** yang dihitung. _Jumlah baris_ menghitung semua baris; _Jumlah terisi_ hanya baris yang kolomnya berisi (sel kosong tidak dihitung, seperti COUNTA di Excel) — cocok untuk kolom teks; _Jumlah kosong_ kebalikannya: baris yang kolomnya belum terisi (seperti COUNTBLANK), mis. resi yang tanggal terimanya masih kosong. Sel berisi spasi saja dianggap kosong. Di kolom teks, "-" atau 0 dianggap berisi; di kolom angka atau tanggal, isi yang tidak terbaca sebagai angka/tanggal (mis. "-" atau "belum") disimpan kosong sehingga ikut terhitung — cek nilai **gagal konversi** di **Tinjau & koreksi skema**. Kolom yang tidak ada di versi data ini tampil "(kosong)"/"Tidak ada data" (pivot: 0 dengan catatan kolom kosong), bukan jumlah semua baris. Pembanding periode tidak bisa memakai kolom tanggal yang sama dengan kolom yang dihitung kosongnya (baris kosong tidak punya tanggal). Klik batang/irisan lalu **Lihat baris data** membuka baris yang kolomnya kosong saja.
6. Atur **Format angka** (_Rupiah_, _Persen_, …) dan **Desimal** bila perlu.

**Arah batang** (khusus **Batang**): _Otomatis_ membuat batang tegak (kolom, urut waktu) bila dikelompokkan menurut tanggal/periode, dan mendatar untuk kategori teks (nama panjang tetap terbaca). Pilih _Mendatar_ atau _Tegak (kolom)_ untuk memaksa.

**Garis tren** (grafik **Garis**, atau **Batang** tegak menurut tanggal/periode): _Garis tren (lurus)_ menarik garis putus-putus seperti _Trendline_ Excel dan menulis arahnya di bawah grafik, mis. _Tren: naik 100 per bulan_; _Rata-rata 3/7 periode_ meratakan naik-turun bulanan agar arah besarnya terlihat. Periode tanpa data dilewati.

**Warna dashboard** (bilah atas, mode ubah) mengatur tiga hal untuk seluruh dashboard sekaligus: **Tema grafik** (warna garis, batang, dan irisan pai semua grafik — _Bawaan_, _Office_, _Lembut_, _Ramah buta warna_, _Pantai_, _Klasik_, _Bumi_, _Senja_, _Cerah_, _Laut_, _Beri_, _Ungu–biru_), **Penilaian warna bawaan** (warna status untuk semua widget yang belum memilih sendiri), dan **Template warna** status. Tanpa penilaian bawaan, warna status (hijau baik, merah perlu perhatian) hanya tampil di widget yang diberi **Penilaian warna** — lihat panduan _Tabel pivot seperti di Excel_, bagian _Warna status_.

Pilihan **Klik grafik menyaring widget lain** aktif secara bawaan: klik pada batang/irisan pai menyaring widget lain di dashboard. Matikan bila tidak diperlukan.

**Pembanding** (khusus **Angka**): pilih _Periode sebelumnya_ atau _Periode sama tahun lalu_, lalu **Kolom tanggal** dan **Periode** (bawaan _Per bulan_). Angka kini menampilkan periode terakhir yang ada di data (setelah filter), mis. _April 2026_, dan di bawahnya baris seperti **▲ +32,3% vs Mar 2026 (93)**. Warna ▲/▼ mengikuti **Penilaian warna** widget (atau penilaian bawaan dashboard): _makin tinggi makin baik_ → naik hijau, turun merah; tanpa penilaian → abu-abu. Bila periode pembanding tidak punya data, tertulis _Tidak ada data …_; bila nilainya 0, yang tampil selisih angka, bukan persen.

**Klik-tembus ke baris data** (grafik **Batang**, **Garis**, **Pai**): nyalakan, lalu centang **Kolom baris detail** (bawaan: kolom pengelompokan + kolom nilai). Klik kategori di grafik tetap menyaring widget lain seperti biasa; setelah itu tombol **Lihat baris data “Bandung”** muncul di atas grafik dan membuka tabel baris data kategori itu — mis. semua kiriman _Bandung_ — 100 baris per halaman, bisa diurutkan, mengikuti filter dashboard. Bila **Klik grafik menyaring widget lain** dimatikan, klik kategori langsung membuka tabel baris itu. Semua yang bisa melihat dashboard bisa membaca kolom yang Anda centang di sini, jadi pilih kolom yang memang boleh dilihat pembaca.

## Mengatur tata letak

- Layar lebar (≥ 1024 px): seret kepala kartu untuk memindahkan, tarik sudut kanan bawah untuk mengubah ukuran.
- Layar kecil: pakai kontrol **Posisi** dan **Ukuran** di panel pengaturan widget.
- Status **Semua perubahan tersimpan** di bilah atas menandakan pekerjaan aman. Tekan **Selesai** untuk kembali ke mode lihat.

## Filter dashboard

Di mode edit, tekan **Atur kolom filter** di bilah filter (atau buka kartu **Pengaturan dashboard**), lalu tambahkan **Kolom filter** (mis. _Cabang_, _Tanggal_). Editor dashboard juga bisa mengaturnya. Pembaca dashboard bisa memilih nilai, periode, atau rentang angka di bilah **Filter**.

**Filter bawaan**: pilih filter yang ingin langsung aktif saat dashboard dibuka (mis. _Tanggal_ = **Bulan ini**, _Cabang_ = _Jakarta_), lalu tekan **Jadikan filter aktif sebagai bawaan** di bilah filter mode edit. Pembaca melihat label _bawaan_ di filter itu, bisa menekan **Hapus semua filter** untuk melihat seluruh data, dan **Kembalikan filter bawaan** untuk memakainya lagi. Ekspor dan PDF memakai filter yang sedang aktif. Untuk menghapus bawaan, hapus semua filter di mode edit lalu tekan **Hapus filter bawaan**.

## Menduplikat dashboard

Butuh dashboard serupa untuk cabang atau periode lain? Di mode lihat, buka **Lainnya → Duplikat dashboard…**, beri nama (usulan: _nama (salinan)_), lalu tekan **Duplikat**. Salinan berisi semua widget, tata letak, kolom filter, filter bawaan, dan warna dashboard, lalu langsung terbuka. Salinan **tidak** ikut dibagikan — atur **Bagikan** lagi bila perlu — dan mengubah salinan tidak mengubah dashboard asal. Hanya pemilik dataset yang bisa menduplikat; batas 10 dashboard per dataset tetap berlaku.
