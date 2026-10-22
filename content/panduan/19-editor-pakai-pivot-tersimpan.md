---
title: Memakai pivot tersimpan sebagai editor
slug: editor-pakai-pivot-tersimpan
role: EDITOR
context: BUILDER
---

**Pivot tersimpan** adalah satu definisi pivot (baris, kolom pemisah, nilai, field terhitung, **Tampilkan sebagai**, **Saring**, dan N teratas) yang dibuat **pemilik dataset** dan dipakai bersama oleh banyak widget. Sebagai editor dashboard, Anda bisa memakainya sebagai sumber widget, tetapi tidak bisa membuat, mengubah, atau menghapusnya.

## Memakai pivot tersimpan di widget

1. Di dashboard, tekan **Ubah tata letak**, lalu buka pengaturan widget.
2. Di **Sumber data**, pilih **Pivot tersimpan** (bukan **Sheet langsung**).
3. Pilih **Pivot tersimpan yang dipakai**. Kartu di bawahnya menyebut _Bersumber dari pivot tersimpan …_ beserta ringkasan definisinya, dan catatan _Definisi hanya bisa diubah pemilik dataset (baca-saja)._
4. Pilih jenis tampilan dan atur yang khusus untuk tampilan itu:

| Jenis                    | Yang diatur di widget                                                                                      |
| ------------------------ | ---------------------------------------------------------------------------------------------------------- |
| **Pivot**                | **Urutan baris**, **Tampilkan total**, **Subtotal per …**, filter silang, format angka                     |
| **Batang / Garis / Pai** | **Kelompokkan menurut** (baris pertama atau kolom **Pisahkan per**), satu **Nilai**, **Urutan**, **Maks.** |
| **Angka**                | Satu **Nilai** — tampil sebagai total keseluruhan                                                          |
| **Tabel**                | Urutan dan total; tabel berisi baris pivot tanpa kolom pemisah (paling banyak 200 baris)                   |

Perubahan tersimpan otomatis. **Saring** di pivot tersimpan berlaku untuk semua widget yang memakainya, termasuk grafik dan angka. Filter silang tidak ikut dari pivot tersimpan — nyalakan per widget bila perlu.

Bila pemilik dataset mengubah definisinya, widget Anda langsung mengikuti definisi baru.

## Perlu definisi yang berbeda?

- **Minta pemilik dataset** mengubah pivot tersimpan bila perubahan itu memang berlaku untuk semua widget yang memakainya (mis. rumus margin salah).
- **Lepas dari sumber** bila hanya satu widget yang perlu berbeda: tekan **Lepas dari sumber** di panel widget lalu konfirmasi. Pengaturan saat ini disalin menjadi widget mandiri, jadi tampilannya tetap sama; perubahan pivot tersimpan berikutnya tidak lagi berlaku di widget itu. Grafik dan angka mandiri tidak punya **Saring**, jadi saringan pivot tersimpan tidak ikut — periksa nilainya setelah dilepas.

Widget mandiri bisa Anda atur sendiri dengan **Tampilkan sebagai**, field terhitung, dan N teratas (lihat [Perhitungan seperti PivotTable untuk editor](/panduan/editor-perhitungan-pivot)).

## Siapa bisa apa

| Peran            | Bisa                                                                                                      |
| ---------------- | --------------------------------------------------------------------------------------------------------- |
| Pemilik dataset  | Membuat, mengubah, mengganti nama, menduplikat, dan menghapus pivot tersimpan; memakainya di widget       |
| Editor dashboard | Memilih pivot tersimpan sebagai sumber widget, melihat definisinya (baca-saja), dan **Lepas dari sumber** |
| Viewer           | Hanya melihat hasilnya di dashboard; definisi pivot tersimpan tidak pernah terbuka                        |

## Saat kolom hilang

Bila pemilik mengganti data dan kolom yang dipakai pivot tersimpan hilang, widget menampilkan pesan kolom hilang. Definisinya diperbaiki pemilik dataset di halaman pivot tersimpan; beri tahu pemiliknya.
