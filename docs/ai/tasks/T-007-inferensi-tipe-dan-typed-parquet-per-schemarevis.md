---
id: T-007
title: Inferensi tipe dan typed.parquet per schemaRevision
status: todo
profile: standard
goal: G-3
depends_on:
  - T-006
created: "2026-10-11T14:45:08Z"
updated: "2026-10-11T14:56:59Z"
created_by: claude-code
---

## Objective
Alur B3 tahap typed untuk versi pertama. Inferensi penuh via DuckDB TRY_CAST atas raw (WHERE _row > headerRow): bulat → DECIMAL(38,6) → tanggal/waktu pola teks → boolean literal (true/false/ya/tidak/yes/no, bukan 0/1) → teks; terpilih bila ≥ 98% non-kosong lolos. Deteksi numberLocale per kolom (ID bila ada ',' desimal atau pola \.\d{3}). Tanggal naive tanpa zona (D8). Tulis typed-1.parquet; nilai gagal → NULL + jumlah. Skema (nama tampil, nama asli, tipe, format tanggal, numberLocale, hidden=false, nullPct, distinctCount, castFailCount) + schemaRevision=1 ke PostgreSQL. Fungsi recast(sheet, schema) → typed-<rev+1>.parquet baru, pointer diganti setelah lengkap, file lama dihapus setelah 1 jam, lock Redis SET NX recast:<sheetId>.

## Acceptance criteria
- [ ] Given kolom 99% angka 1% teks, when inferensi, then tipe DECIMAL dengan castFailCount = jumlah teks; given kolom 90% angka 10% teks, then tipe teks
- [ ] Given kolom berisi hanya 0 dan 1, when inferensi, then tipe bilangan bulat (bukan boolean); given kolom berisi 'ya'/'tidak', then boolean
- [ ] Given kolom '1.234.567,89' dan kolom '1234.5', when inferensi, then kolom pertama numberLocale ID bernilai 1234567.89 dan kolom kedua US bernilai 1234.5
- [ ] Given kolom tanggal xlsx asli dan kolom teks '03/01/2026', when inferensi, then keduanya DATE bernilai 2026-01-03 tanpa pergeseran zona
- [ ] Given recast dipanggil dua kali bersamaan pada sheet yang sama, when berjalan, then hanya satu yang mengeksekusi, menghasilkan typed-2.parquet, dan typed-1.parquet masih ada sampai 1 jam

## Risk
(Required for strict profile. Impact:, Security (STRIDE):, Rollback:, Validation:)

## Notes

- 2026-10-11T14:56:59Z Lock recast: SET NX PX 30 menit + compare-and-delete (Lua) agar worker mati tidak mengunci selamanya. Hapus typed lama via job, bukan lifecycle.
