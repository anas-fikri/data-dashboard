---
id: T-fesf
title: 'Rapikan sisa review T-0vjt: nama region tabel unik, batas kolom di luar blok kode, status artikel atomik'
status: todo
profile: standard
depends_on:
  - T-0vjt
created: "2026-10-17T10:31:26Z"
updated: "2026-10-17T10:31:26Z"
created_by: claude-code
---

## Objective
(describe the outcome in one paragraph)

## Acceptance criteria
- [ ] Given artikel dengan dua tabel (atau dua blok kode) berjudul kolom sama, when dirender, then setiap region punya nama unik (axe landmark-unique lolos)
- [ ] Given baris '| --- |' dengan 9+ kolom di dalam blok kode berpagar, when artikel disimpan, then tidak ditolak sebagai tabel terlalu lebar; tabel sungguhan 9+ kolom tetap ditolak
- [ ] Given artikel dihapus atau diubah bersamaan dengan terbit/tarik, when setGuideStatus berjalan, then hasilnya NOT_FOUND untuk baris yang hilang dan audit memakai slug/peran hasil UPDATE yang sama
- [ ] Given sesi dicabut, when membuka /panduan atau /admin/panduan, then dialihkan ke /login (gerbang layout (daftar) teruji)

## Risk
(Required for strict profile. Impact:, Security (STRIDE):, Rollback:, Validation:)

## Notes
