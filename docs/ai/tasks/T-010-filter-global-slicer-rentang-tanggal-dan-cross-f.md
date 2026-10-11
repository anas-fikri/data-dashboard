---
id: T-010
title: Filter global, slicer, rentang tanggal, dan cross-filter antar widget
status: todo
profile: standard
goal: G-4
depends_on:
  - T-009
created: "2026-10-11T10:22:46Z"
updated: "2026-10-11T10:22:46Z"
created_by: claude-code
---

## Objective
Bar filter di atas dashboard: slicer nilai (multi-select dengan pencarian, opsi dari query distinct), rentang tanggal dengan preset (bulan ini, kuartal, YTD), filter angka. Klik elemen chart memfilter widget lain (bisa dimatikan per widget). Filter tersimpan di URL agar bisa dibagikan.

## Acceptance criteria
- [ ] Given slicer cabang dipilih 2 nilai, when dashboard dimuat ulang dengan URL yang sama, then kedua nilai tetap terpilih dan semua widget terfilter
- [ ] Given user klik batang 'Jakarta' pada chart A, when cross-filter aktif, then widget B dan C hanya menampilkan data Jakarta dan tombol hapus filter muncul
- [ ] Given kolom tanggal dipilih untuk rentang, when memilih preset YTD, then filter dari 1 Januari tahun berjalan sampai hari ini (Asia/Jakarta) diterapkan

## Risk
(Required for strict profile. Impact:, Security (STRIDE):, Rollback:, Validation:)

## Notes
