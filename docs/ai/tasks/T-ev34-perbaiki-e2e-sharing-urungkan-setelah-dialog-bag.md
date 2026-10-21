---
id: T-ev34
title: 'Perbaiki e2e sharing: urungkan setelah dialog Bagikan menutup kanvas mode edit'
status: todo
profile: standard
tags:
  - e2e
created: "2026-10-21T18:24:30Z"
updated: "2026-10-21T18:24:30Z"
created_by: claude-code
---

## Objective
Ditemukan saat T-074: tests/e2e/sharing.spec.ts:1849 ('peringatan kolom filter … #kolom-filter', bagian Ctrl+Z di dialog Bagikan) gagal deterministik di HEAD 1ad5b22 tanpa perubahan T-074 (diverifikasi dengan git stash, 2/2 run): setelah closeShare halaman berada di /dashboards (daftar) sehingga widget 'Urungkan nanti' tidak ditemukan. Cari apakah aplikasi bernavigasi (mis. Escape/Back, refresh akses) atau tesnya salah; perbaiki akarnya.

## Acceptance criteria
- [ ] Given --project=sharing dijalankan dua kali berturut-turut, then semua tes lulus tanpa waitForTimeout baru

## Risk
(Required for strict profile. Impact:, Security (STRIDE):, Rollback:, Validation:)

## Notes
