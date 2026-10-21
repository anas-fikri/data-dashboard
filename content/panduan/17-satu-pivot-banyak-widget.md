---
title: Satu pivot untuk banyak widget
slug: satu-pivot-banyak-widget
role: OWNER
context:
---

**Pivot tersimpan** adalah satu definisi pivot (baris, kolom pemisah, nilai, field terhitung, **Tampilkan sebagai**, **Saring**, dan N teratas) yang disimpan di dataset dan dipakai bersama oleh banyak widget di banyak dashboard. Ubah definisinya sekali, semua widget yang memakainya ikut berubah — tidak ada lagi angka berbeda di dua dashboard karena salah satunya lupa diperbarui.

## Kapan dipakai

- Satu perhitungan (mis. _Laba dan margin per wilayah_) dipakai di beberapa dashboard atau di beberapa jenis tampilan sekaligus: tabel pivot, grafik batang, angka (KPI), dan tabel ringkas.
- Anda ingin satu tempat untuk mengubah rumus atau saringan, bukan mengedit setiap widget.

## Membuat pivot tersimpan

Ada dua cara:

1. **Dari halaman dataset**: buka dataset → kartu **Pivot tersimpan** → **Buat pivot tersimpan**. Isi **Nama** (unik di dataset ini, mis. _Laba per wilayah_), pilih **Sheet**, lalu susun pivotnya dengan pengaturan yang sama seperti widget Pivot. Tekan **Simpan pivot tersimpan**.
2. **Dari widget pivot yang sudah ada**: buka pengaturan widget Pivot → **Simpan sebagai pivot tersimpan** → isi **Nama pivot tersimpan** → simpan. Widget itu langsung memakai pivot tersimpan baru; tampilannya tidak berubah.

Halaman pivot tersimpan menampilkan kalimat ringkasan bentuk tabel dan nilai contoh field terhitung. Angka lengkapnya terlihat di widget yang memakai pivot itu. Satu dataset bisa punya paling banyak 50 pivot tersimpan.

## Memakai pivot tersimpan di widget

1. Di dashboard, tekan **Ubah tata letak**, lalu buka pengaturan widget.
2. Di **Sumber data**, pilih **Pivot tersimpan** (bukan **Sheet langsung**).
3. Pilih **Pivot tersimpan yang dipakai**. Kartu di bawahnya menyebut _Bersumber dari pivot tersimpan …_ beserta ringkasan definisinya.
4. Pilih jenis tampilan dan atur yang khusus untuk tampilan itu:

| Jenis                    | Yang diatur di widget                                                                                      |
| ------------------------ | ---------------------------------------------------------------------------------------------------------- |
| **Pivot**                | **Urutan baris**, **Tampilkan total**, **Subtotal per …**, filter silang, format angka                     |
| **Batang / Garis / Pai** | **Kelompokkan menurut** (baris pertama atau kolom **Pisahkan per**), satu **Nilai**, **Urutan**, **Maks.** |
| **Angka**                | Satu **Nilai** — tampil sebagai total keseluruhan                                                          |
| **Tabel**                | Urutan dan total; tabel berisi baris pivot tanpa kolom pemisah (paling banyak 200 baris)                   |

Perubahan tersimpan otomatis. **Saring** di pivot tersimpan berlaku untuk semua widget yang memakainya, termasuk grafik dan angka. Filter silang tidak ikut dari pivot tersimpan — nyalakan per widget bila perlu.

Tabel yang bersumber dari pivot tersimpan memakai baris terdalam sebagai acuan **Total berjalan** dan **Selisih**. Bila baris itu memakai N teratas, nilai tersebut tampil sebagai nilai biasa dengan catatan di kartu.

## Mengubah pivot tersimpan

1. Buka dataset → kartu **Pivot tersimpan** → **Ubah** pada baris pivotnya (atau **Ubah pivot tersimpan** dari panel widget).
2. Ubah definisinya, lalu tekan **Simpan perubahan**.
3. Bila pivot ini dipakai widget, muncul konfirmasi **Simpan perubahan pivot tersimpan?** dengan kalimat _Perubahan berlaku di N widget pada M dashboard._ Tekan **Simpan** untuk melanjutkan.

Semua widget yang memakainya langsung menampilkan definisi baru, termasuk untuk viewer — tidak ada angka lama yang tertinggal di cache. Ingat bahwa dashboard itu mungkin dibagikan ke orang lain.

Bila rekan atau tab lain menyimpan pivot yang sama lebih dulu, muncul pesan bahwa pivot tersimpan baru saja diubah, dengan tombol **Muat ulang**. Perubahan Anda tidak menimpa perubahan mereka; muat ulang (perubahan di halaman itu akan hilang, catat dulu bila perlu), lalu ulangi.

## Daftar, ganti nama, duplikat

Kartu **Pivot tersimpan** di halaman dataset menampilkan **Nama**, **Sheet**, **Dipakai di** (mis. _4 widget, 2 dashboard_ atau _Belum dipakai_), dan **Diubah**. Aksinya:

- **Ganti nama** — nama baru langsung tampil di panel widget yang memakainya.
- **Duplikat** — membuat salinan bernama _… (salinan)_ untuk dicoba tanpa mengubah widget yang ada.

## Lepas dari sumber

Ingin satu widget berbeda dari yang lain? Di panel widget, tekan **Lepas dari sumber** lalu konfirmasi. Pengaturan saat ini disalin menjadi widget mandiri, jadi tampilannya tetap sama; perubahan pivot tersimpan berikutnya tidak lagi berlaku di widget itu. Grafik dan angka mandiri tidak punya **Saring**, jadi saringan pivot tersimpan tidak ikut — periksa nilainya setelah dilepas.

## Menghapus pivot tersimpan

Tekan **Hapus** pada barisnya. Pivot yang masih dipakai tidak bisa dihapus: alasannya menyebut berapa widget dan dashboard mana yang memakainya. Lepaskan atau hapus widget itu dulu, lalu hapus pivotnya. Pivot yang tidak dipakai dihapus permanen setelah konfirmasi.

## Siapa bisa apa

| Peran            | Bisa                                                                                                      |
| ---------------- | --------------------------------------------------------------------------------------------------------- |
| Pemilik dataset  | Membuat, mengubah, mengganti nama, menduplikat, dan menghapus pivot tersimpan; memakainya di widget       |
| Editor dashboard | Memilih pivot tersimpan sebagai sumber widget, melihat definisinya (baca-saja), dan **Lepas dari sumber** |
| Viewer           | Hanya melihat hasilnya di dashboard; definisi pivot tersimpan tidak pernah terbuka                        |

## Saat data berganti versi

Saat Anda mengganti data atau memulihkan versi lama, pivot tersimpan ikut dipetakan ke kolom versi aktif, sama seperti widget. Bila kolom yang dipakai hilang, setiap widget yang memakainya menampilkan pesan kolom hilang; perbaiki definisinya sekali di halaman pivot tersimpan.
