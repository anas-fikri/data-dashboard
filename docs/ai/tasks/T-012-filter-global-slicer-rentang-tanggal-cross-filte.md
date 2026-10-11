---
id: T-012
title: Filter global, slicer, rentang tanggal, cross-filter
status: todo
profile: standard
goal: G-4
depends_on:
  - T-011
created: "2026-10-11T14:45:09Z"
updated: "2026-10-11T14:45:09Z"
created_by: claude-code
---

## Objective
Bar filter dashboard: slicer multi-select dengan pencarian server-side (DISTINCT LIMIT 1000, peringatan > 1000), rentang tanggal preset (bulan ini, kuartal, YTD) dihitung Asia/Jakarta dan dibandingkan naive (D8), filter angka. Kolom filter yang diizinkan tersimpan di Dashboard. Klik elemen chart → cross-filter widget lain (bisa dimatikan per widget). Filter di URL.

## Acceptance criteria
- [ ] Given slicer cabang dipilih 2 nilai, when dashboard dimuat ulang dengan URL sama, then kedua nilai terpilih dan semua widget terfilter
- [ ] Given user klik batang 'Jakarta' pada chart A, when cross-filter aktif, then widget B dan C hanya data Jakarta dan tombol hapus filter muncul
- [ ] Given hari ini 2026-10-11 Asia/Jakarta dan kolom DATE, when preset YTD, then filter 2026-01-01 ≤ tanggal ≤ 2026-10-11 tanpa pergeseran zona
- [ ] Given kolom dengan 5.000 nilai unik, when slicer dibuka, then 1000 nilai pertama tampil, peringatan muncul, dan mengetik 3 huruf menyaring di server

## Risk
(Required for strict profile. Impact:, Security (STRIDE):, Rollback:, Validation:)

## Notes
