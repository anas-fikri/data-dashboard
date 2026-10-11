---
id: T-011
title: 'Refresh data: upload ulang replace/append dengan versi dan pemetaan kolom'
status: todo
profile: standard
goal: G-5
depends_on:
  - T-009
created: "2026-10-11T10:22:46Z"
updated: "2026-10-11T14:13:44Z"
created_by: claude-code
---

## Objective
Profil dataset menerima upload lanjutan: mode ganti seluruh data atau tambah baris. Skema file baru dicocokkan ke skema tersimpan (nama kolom, tipe); mismatch ditampilkan untuk dipetakan manual. Setiap ingest sukses menjadi versi baru; dashboard menunjuk versi aktif; 3 versi terakhir dipertahankan.

## Acceptance criteria
- [ ] Given file baru dengan kolom sama, when mode ganti dan ingest selesai, then semua widget menampilkan data baru tanpa konfigurasi ulang
- [ ] Given file baru dengan satu kolom berganti nama, when ingest, then user diminta memetakan kolom tersebut sebelum data dipakai
- [ ] Given ingest versi baru gagal, when user membuka dashboard, then data versi sebelumnya tetap tampil dan status gagal terlihat di profil

## Risk
(Required for strict profile. Impact:, Security (STRIDE):, Rollback:, Validation:)

## Notes

- 2026-10-11T14:13:44Z Pemetaan kolom menulis ulang typed.parquet dari raw.parquet versi baru; tidak parse ulang file. Status baru 'menunggu pemetaan' (docs/flow-kerja.md A4, B5).
