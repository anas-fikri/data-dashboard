---
id: T-pxnn
title: Kotak cari pintar di menu Tambah kolom filter
status: in_progress
profile: standard
tags:
  - ui
created: "2026-10-23T01:28:45Z"
updated: "2026-10-23T01:28:45Z"
created_by: claude-code
workers:
  - claude-code
branch: claude/intelligent-albattani-fd1va8
base: f21a6ecbde85af8c204e98d04e3b0df5ae7e4abd
---

## Objective
(describe the outcome in one paragraph)

## Acceptance criteria
- [ ] Menu Tambah kolom filter dengan ≥ 8 kolom punya kotak cari yang langsung fokus; pencarian pintar (src/lib/search: awalan, potongan, singkatan, inisial) menyaring kolom semua sheet dan menyorot huruf yang cocok
- [ ] Keyboard: ketik menyaring, ↓ pindah ke hasil, Enter di kotak cari menambah hasil pertama yang bisa dipakai, Esc menutup; kolom yang sudah dipakai tetap tampil nonaktif dengan alasannya
- [ ] Berlaku di bilah filter (Atur kolom filter) dan kartu Pengaturan dashboard

## Risk
(Required for strict profile. Impact:, Security (STRIDE):, Rollback:, Validation:)

## Notes
