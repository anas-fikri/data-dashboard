---
id: T-01xj
title: 'T-0gmm lanjutan: uji unit jalur drift judul sheet gabungan (mergeHeaderDrift) + kolom filter ikut sheetMap saat aktivasi'
status: in_progress
profile: standard
created: "2026-11-11T06:05:40Z"
updated: "2026-11-13T10:58:36Z"
created_by: claude-code
workers:
  - claude-code
branch: claude/cool-babbage-t5yojt
base: 7552f301bfaa7860868d72396ef89c0499a6bfee
---

## Objective
Jalur drift judul sheet gabungan teruji, dan kolom filter dashboard tidak lagi kehilangan sheet-nya ketika sheet aktif diserap ke sheet gabungan atau ganti nama lewat pemetaan.

## Acceptance criteria
- [x] Uji unit jalur drift judul sheet gabungan (mergeHeaderDrift): versi gagal dengan saran, tanpa objek tersisa
- [x] Kolom filter dashboard (disimpan per nama sheet) ikut sheetMap saat aktivasi: sheet yang diserap/ganti nama → nama sheet target; diuji

## Risk
Impact: aktivasi versi (activateVersionInTx) menulis ulang Dashboard.filterColumns bila sheetMap mengganti nama sheet; dalam transaksi + advisory lock dashboard yang sama. Security (STRIDE): Tampering — hanya dashboard dataset yang sama, nama dari tabel Sheet. Rollback: versi sebelumnya (filter yang sudah dipetakan tetap valid karena nama sheet target ada). Validation: uji unit remapFilterColumns + uji aktivasi sheetMap + uji ingest drift; aitk check.

## Notes
- 2026-11-11T06:06:13Z Low review r3 T-0gmm: kolom kosong (absent, T-014) terlihat milik sheet aktif yang diserap gabungan tidak ikut dicek/dibawa (ingest.ts ±540 hanya plan.missing) — laporkan plan.absent yang tidak ada di skema pemimpin atau gabungkan ke absent kelompok. Juga: role=status peringatan pemilih mungkin tidak diumumkan karena dipasang bersama teksnya.
- 2026-11-13T10:58:36Z Catatan lama (kolom absent sheet yang diserap) tidak dikerjakan di sini — tetap Low.
