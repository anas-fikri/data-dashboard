---
id: T-0vjt
title: 'Polish panduan admin: tabel markdown, error/loading route, audit ubah artikel'
status: todo
profile: standard
depends_on:
  - T-020
created: "2026-10-16T20:32:43Z"
updated: "2026-10-16T20:32:43Z"
created_by: claude-code
---

## Objective
(describe the outcome in one paragraph)

## Acceptance criteria
- [ ] Given artikel berisi tabel markdown (GFM), when dirender di /panduan dan pratinjau, then tampil sebagai tabel yang bisa digulir keyboard, bukan teks mentah
- [ ] Given database tidak terjangkau, when membuka /panduan atau /admin/panduan, then halaman galat dengan tombol Coba lagi tampil (bukan galat global) dan ada status memuat
- [ ] Given admin membuat atau mengubah artikel, when tersimpan, then AuditLog mencatat guide.create/guide.update {slug, role}; terbitkan ulang artikel yang sudah terbit tidak menulis baris audit ganda

## Risk
(Required for strict profile. Impact:, Security (STRIDE):, Rollback:, Validation:)

## Notes
