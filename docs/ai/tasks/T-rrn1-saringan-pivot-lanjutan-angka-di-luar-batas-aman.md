---
id: T-rrn1
title: 'Saringan pivot lanjutan: angka di luar batas aman dan ringkasan bagian Saring'
status: todo
profile: standard
depends_on:
  - T-f4a7
created: "2026-10-19T16:45:51Z"
updated: "2026-10-19T16:45:51Z"
created_by: claude-code
---

## Objective
(describe the outcome in one paragraph)

## Acceptance criteria
- [ ] Given field pivot atau kategori grafik bernilai angka di luar ±9.007.199.254.740.991, when nilai itu dipilih di menu saring atau diklik untuk filter silang, then widget dan Ekspor PDF tidak gagal 'tidak valid' (nilai itu dilewati dengan keterangan, atau tidak bisa dipilih beserta alasannya)
- [ ] Given pivot dengan bagian Saring tersimpan, when panel pengaturan dibuka, then kalimat ringkasan di atas panel menyebut saringan itu (mis. 'hanya Layanan Darat')

## Risk
(Required for strict profile. Impact:, Security (STRIDE):, Rollback:, Validation:)

## Notes
