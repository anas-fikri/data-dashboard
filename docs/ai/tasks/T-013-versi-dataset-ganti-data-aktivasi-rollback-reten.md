---
id: T-013
title: 'Versi dataset: ganti data, aktivasi, rollback, retensi'
status: todo
profile: standard
goal: G-5
depends_on:
  - T-008
  - T-011
created: "2026-10-11T14:45:09Z"
updated: "2026-10-11T14:45:09Z"
created_by: claude-code
---

## Objective
Mode REPLACE. Ingest versi refresh men-cast raw dengan skema aktif per nama asli tanpa inferensi (D4); cocok → READY + aktif. Rollback: pemilik mengaktifkan salah satu dari 2 versi READY sebelumnya. Retensi 3 versi READY; job pembersihan menghapus metadata + Parquet versi lebih lama dan file asli > 7 hari sejak ingestFinishedAt. Jalur AWAITING_MAPPING di T-014.

## Acceptance criteria
- [ ] Given file baru dengan kolom sama (nama asli cocok setelah normalisasi spasi/kapital), when ingest REPLACE selesai, then versi baru aktif dan semua widget menampilkan data baru tanpa konfigurasi ulang; tipe yang dipaksa user di skema aktif tetap berlaku
- [ ] Given ingest versi baru gagal, when user membuka dashboard, then data versi aktif lama tampil dan badge gagal terlihat di profil
- [ ] Given 3 versi READY, when versi ke-4 READY, then versi tertua dihapus beserta Parquet-nya; when pemilik memilih rollback ke versi sebelumnya, then activeVersionId berpindah dan cache miss
- [ ] Given file asli berumur > 7 hari sejak ingestFinishedAt (sukses atau gagal), when job pembersihan berjalan, then file asli terhapus dan dashboard tetap berfungsi

## Risk
(Required for strict profile. Impact:, Security (STRIDE):, Rollback:, Validation:)

## Notes
