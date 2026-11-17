---
id: T-d1ns
title: 'Judul otomatis: tangani gagal ganti judul dan widget lama tanpa judul'
status: in_progress
profile: standard
tags:
  - ui
created: "2026-10-22T04:29:18Z"
updated: "2026-11-17T14:15:48Z"
created_by: claude-code
workers:
  - claude-code
branch: claude/cool-babbage-t5yojt
base: 9117b9deede9e645e46e8e75c07f05b0e5146f3f
---

## Objective
Temuan Low review T-12zs: (1) ganti judul otomatis yang gagal (jaringan) tidak diberitahukan dan hanya diingat di memori — setelah Selesai/muat ulang judul lama dianggap ketikan; (2) kartu widget lama tanpa judul tetap 'Widget tanpa judul' sampai pengaturannya diubah; (3) pesan 'diubah di tab lain' bisa muncul sesaat saat query membawa widgetVersion rename otomatis sebelum hasil rename tercatat.

## Acceptance criteria
- [x] Gagal ganti judul otomatis ditampilkan sebagai status simpan gagal dan dicoba ulang saat Selesai
- [x] Kartu widget tanpa judul menampilkan judul turunan
- [x] Tidak ada pesan konflik sesaat setelah judul otomatis diganti

## Risk
(Required for strict profile. Impact:, Security (STRIDE):, Rollback:, Validation:)

## Notes
