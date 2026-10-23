---
id: T-85tb
title: Pilih sheet yang diimpor saat unggah xlsx
status: in_progress
profile: standard
tags:
  - ui
created: "2026-10-23T11:22:17Z"
updated: "2026-10-23T15:24:24Z"
created_by: claude-code
workers:
  - claude-code
branch: claude/intelligent-albattani-fd1va8
base: 9c9b2f28c09b11e0d5f878e895a158ef3714a1c2
---

## Objective
Saat mengunggah xlsx berisi ≥ 2 worksheet (ganti semua data), pemilik memilih sheet yang diimpor sebelum file dikirim; sheet ringkasan/pivot/grafik tidak lagi ikut terimpor (contoh nyata: sheet "Pivot" menghasilkan kolom_1, kolom_3, …). Worker hanya membaca sheet terpilih; sheet data aktif yang tidak dipilih masuk alur pemetaan biasa (tidak pernah hilang diam-diam).

## Acceptance criteria
- [ ] Setelah file xlsx diunggah, pemilik memilih sheet yang diimpor (centang per sheet + Pilih semua) dengan saran: pilih hanya sheet berisi data (bukan ringkasan/pivot/grafik)
- [ ] Sheet yang tidak dipilih tidak di-ingest (hemat waktu dan kuota); versi pengganti tetap memetakan widget ke sheet yang dipilih
- [ ] CSV tidak berubah (satu sheet)
- [ ] CSV, mode per periode, dan antrean banyak file tidak berubah (pilihan kosong = semua sheet)

## Risk
Impact: panel unggah dataset (alur ganti data), init unggah, ingest xlsx (berurutan + paralel), skema (kolom aditif `DatasetVersion.selectedSheets TEXT[] DEFAULT '{}'`, tanpa backfill). Pilihan kosong = perilaku lama (semua sheet), jadi CSV, mode periode, antrean, dan unggahan lama tidak berubah. Bawaan centang = worksheet tampil tanpa PivotTable + sheet aktif yang cocok; sheet aktif yang dilepas → AWAITING_MAPPING (perilaku pemetaan yang ada).
Security (STRIDE): Tampering — nama sheet dari klien divalidasi server (array 1–50 nama unik ≤ 255 karakter, hanya xlsx + REPLACE) dan worker otoritatif: nama yang tidak ada di file → FAILED dengan pesan jelas; nama dipakai hanya sebagai pembanding (tanpa SQL/path). DoS — pembaca browser membatasi central directory 4 MB, XML 2 MB (dekompresi streaming dihentikan), 200 sheet; batas parser server (50 sheet/buku, dsb.) tetap. XML dibaca dengan regex tanpa entitas eksternal (DOCTYPE ditolak).
Rollback: kode lama mengabaikan kolom baru (unggahan berjalan dengan semua sheet); migrasi aditif tidak perlu di-rollback.
Validation: uji unit pembaca sheet (paritas nama dengan parser server, zip64, stored, prefix namespace, file rusak → null), aturan pilihan, validateInit, ingest berurutan/paralel (sheet tak dipilih tidak dibaca, indeks rapat, nama hilang → FAILED); e2e ingest (picker, galat kosong, pilih sebagian, ganti data → pemetaan); helper e2e mengonfirmasi pemilih otomatis di spec lama.

## Notes

- 2026-10-23T12:01:42Z Rencana: docs/ai/plans/2026-10-23-pilih-sheet-unggah.md (baca daftar sheet di browser, kolom selectedSheets, worker onlySheets, picker; mode periode di luar v1).
