# Rencana v1.20 — Unggahan periode: Tambah / Perbarui berdasarkan kunci (T-rbrb, ADR-0011)

## Tujuan

Unggahan ke dataset per periode tidak lagi selalu mengganti periode utuh. Bila sheet data punya **kolom kunci**,
bawaannya **Perbarui berdasarkan kunci**: baris berkunci sama dikoreksi, kunci baru ditambahkan, baris lama yang tidak
ada di file tetap. Satu bulan yang terpecah ke beberapa file/unggahan (batas 1.048.576 baris Excel) bisa diunggah
berurutan tanpa saling menimpa.

## Keputusan pemilik (2026-11-12)

| # | Keputusan |
|---|---|
| K1 | Kunci dinamis: pemilik memilih satu/lebih kolom kunci per sheet data (tidak khusus Billing) |
| K2 | Kunci sama dengan tanggal di periode lain → baris dipindah ke periode barunya (kunci unik se-sheet data) |
| K3 | Kunci dobel di file → unggahan ditolak, notifikasi berisi daftar kunci yang dobel |
| K4 | Tanpa duplikat kunci → tidak perlu konfirmasi (aktif otomatis bila tidak ada yang menyusut/ditolak) |

## Fase

1. **Data + pengaturan** — migrasi `SheetLineage.keyColumns Int[]` (+ `uploadMode` versi/antrean); halaman Pengaturan periode: pilih
   kolom kunci per sheet data (dengan cek keunikan data aktif: jumlah kunci dobel yang sudah ada ditampilkan).
2. **Rencana** — `computePeriodPlan` menerima mode (`REPLACE` | `APPEND` | `UPSERT`) dan per periode: `updated`,
   `added`, `kept`, `movedOut`; aksi baru `UPDATED` (periode yang ditulis ulang). Konfirmasi: tidak ada untuk
   APPEND/UPSERT bersih (K4); kunci dobel/kosong → penolakan `KEY_DUPLICATE`/`KEY_EMPTY` dengan contoh ≤ 50 kunci.
3. **Worker** — setelah cast: kunci file (DuckDB, kolom kunci typed) → dobel/kosong; kunci lama: scan kolom kunci semua
   segmen aktif sheet data → `_row` lama yang tertimpa per segmen; tulis ulang periode terdampak sebagai kelompok baru
   (bagian 1 = salinan raw+typed lama tanpa `_row` tertimpa, bagian 2..n = file); periode yang hanya kehilangan baris
   (pindah) → salinan saja; commit seperti biasa (manifest, gerbang integritas).
4. **UI unggah + tinjauan** — pilihan mode di panel unggah periode (bawaan Perbarui bila ada kunci); tabel tinjauan:
   Diperbarui/Ditambah/Tetap per periode; panduan 15, Yang baru.

## Uji

- Unit: rencana per mode (hitungan, aksi, auto-aktif K4, penolakan dobel/kosong), pemilihan periode terdampak (K2).
- Integrasi ingest: unggahan kedua bulan yang sama (kunci baru) → baris bertambah; kunci sama → nilai terkoreksi;
  kunci pindah bulan → hilang dari bulan lama; kunci dobel → FAILED dengan daftar; Ganti tetap seperti sekarang.
- e2e: pengaturan kunci, unggah Perbarui → aktif otomatis, tinjauan saat menyusut.

## Risiko

- Kunci yang tidak unik secara bisnis membuang baris → tampilkan hitungan "diperbarui" dan Pulihkan; tinjauan wajib
  pada unggahan Perbarui pertama setelah kunci diubah.
- Biaya tulis ulang periode besar → batas waktu/progres "menulis ulang periode"; periode tanpa perubahan tidak disentuh.
