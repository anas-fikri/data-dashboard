---
id: T-nn87
title: Mode layar TV + muat ulang otomatis di dashboard
status: todo
profile: standard
tags:
  - dashboards
  - ui
created: "2026-11-10T01:17:12Z"
updated: "2026-11-10T01:17:12Z"
created_by: claude-code
---

## Objective
Dashboard bisa ditampilkan di monitor operasional/gudang: mode layar penuh tanpa menu dan bilah samping, data dimuat ulang otomatis pada interval yang dipilih (mis. 1/5/15 menit), tanpa memuat ulang seluruh halaman.

## Acceptance criteria
- [ ] Given dashboard terbuka, when pengguna memilih Mode TV, then tampilan layar penuh tanpa sidebar/header/menu edit, filter aktif tetap berlaku, dan Esc/tombol Keluar kembali ke tampilan biasa
- [ ] Given muat ulang otomatis diatur (Mati/1/5/15/30 menit), when interval lewat, then data semua widget diambil ulang tanpa memuat ulang halaman, waktu pembaruan terakhir tampil, dan pengaturan diingat browser
- [ ] Given tab tidak terlihat atau koneksi putus, when interval lewat, then pengambilan ulang ditunda sampai tab terlihat lagi dan galat tidak menghapus data terakhir

## Risk
(Required for strict profile. Impact:, Security (STRIDE):, Rollback:, Validation:)

## Notes
