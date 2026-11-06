---
id: T-d1ns
title: 'Judul otomatis: tangani gagal ganti judul dan widget lama tanpa judul'
status: todo
profile: standard
tags:
  - ui
created: "2026-10-22T04:29:18Z"
updated: "2026-10-22T04:29:18Z"
created_by: claude-code
---

## Objective
Temuan Low review T-12zs: (1) ganti judul otomatis yang gagal (jaringan) tidak diberitahukan dan hanya diingat di memori — setelah Selesai/muat ulang judul lama dianggap ketikan; (2) kartu widget lama tanpa judul tetap 'Widget tanpa judul' sampai pengaturannya diubah; (3) pesan 'diubah di tab lain' bisa muncul sesaat saat query membawa widgetVersion rename otomatis sebelum hasil rename tercatat.

## Acceptance criteria
- [ ] Gagal ganti judul otomatis ditampilkan sebagai status simpan gagal dan dicoba ulang saat Selesai
- [ ] Kartu widget tanpa judul menampilkan judul turunan
- [ ] Tidak ada pesan konflik sesaat setelah judul otomatis diganti

## Risk
(Required for strict profile. Impact:, Security (STRIDE):, Rollback:, Validation:)

## Notes
