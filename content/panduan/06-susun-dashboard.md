---
title: Menyusun dashboard pertama
slug: susun-dashboard
role: OWNER
context: BUILDER
---

Dashboard berisi widget yang membaca dataset Anda. Setiap perubahan tersimpan otomatis.

## Membuat dashboard

1. Buka **Dashboard** → **Buat dashboard**.
2. Pilih **Dataset**, isi **Nama dashboard**, lalu tekan **Buat dashboard**.
3. Dashboard baru langsung terbuka dalam mode edit. Untuk dashboard yang sudah ada, tekan **Ubah tata letak**.

## Menambah widget

1. Tekan **Tambah widget**. Widget baru ditaruh di samping widget terakhir selama barisnya masih muat (tiga widget pertama berjajar dalam satu baris), dan panel pengaturannya langsung terbuka (untuk widget lain: ikon pengaturan di kepala kartu).
2. Pilih **Jenis tampilan**: **Angka** (KPI), **Batang**, **Garis**, **Pai**, **Tabel**, atau **Pivot** (ringkasan seperti _PivotTable_ Excel — lihat panduan _Tabel pivot seperti di Excel_). Isian langsung terisi dari data Anda: angka yang dihitung adalah kolom besaran (mis. _Omzet_), bukan kolom nomor urut atau kode (_No._, _ID_, _Kode_); grafik dikelompokkan menurut kolom kategori dengan 2–50 nilai berbeda (mis. _Cabang_); **Garis** memakai kolom tanggal per bulan.
3. **Judul** terisi otomatis dari pengaturan, mis. _Total Omzet per Cabang_, dan ikut berubah selama Anda belum mengetik judul sendiri. Ketik judul lain kapan saja; judul itu tidak ditimpa lagi. Kosongkan kolom **Judul** untuk kembali ke judul otomatis.
4. Untuk grafik, ubah **Kelompokkan menurut** (mis. _Cabang_) dan, untuk kolom tanggal, **Rentang waktu** (per hari, minggu, bulan, kuartal, tahun).
5. Ubah **Nilai** (_Total_, _Rata-rata_, _Jumlah baris_, _Jumlah terisi_, _Jumlah nilai unik_, _Terkecil_, _Terbesar_) **dari kolom** yang dihitung. _Jumlah baris_ menghitung semua baris; _Jumlah terisi_ hanya baris yang kolomnya berisi (sel kosong tidak dihitung, seperti COUNTA di Excel) — cocok untuk kolom teks.
6. Atur **Format angka** (_Rupiah_, _Persen_, …) dan **Desimal** bila perlu.

Pilihan **Klik grafik menyaring widget lain** aktif secara bawaan: klik pada batang/irisan pai menyaring widget lain di dashboard. Matikan bila tidak diperlukan.

## Mengatur tata letak

- Layar lebar (≥ 1024 px): seret kepala kartu untuk memindahkan, tarik sudut kanan bawah untuk mengubah ukuran.
- Layar kecil: pakai kontrol **Posisi** dan **Ukuran** di panel pengaturan widget.
- Status **Semua perubahan tersimpan** di bilah atas menandakan pekerjaan aman. Tekan **Selesai** untuk kembali ke mode lihat.

## Filter dashboard

Di kartu **Pengaturan dashboard** (mode edit), tambahkan **Kolom filter** (mis. _Cabang_, _Tanggal_). Pembaca dashboard bisa memilih nilai, periode, atau rentang angka di bilah **Filter**.
