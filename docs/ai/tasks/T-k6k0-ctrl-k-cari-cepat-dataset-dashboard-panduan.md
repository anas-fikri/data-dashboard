---
id: T-k6k0
title: 'Ctrl+K cari cepat: dataset, dashboard, panduan'
status: todo
profile: standard
tags:
  - ui
created: "2026-11-10T01:17:11Z"
updated: "2026-11-10T01:17:11Z"
created_by: claude-code
---

## Objective
Pengguna membuka kotak cari cepat dengan Ctrl+K / Cmd+K (atau tombol cari di header) untuk melompat ke dataset, dashboard, atau panduan yang boleh dilihatnya, dengan papan ketik penuh.

## Acceptance criteria
- [ ] Given pengguna masuk, when menekan Ctrl+K atau Cmd+K atau tombol Cari di header, then dialog cari terbuka dengan fokus di kotak input dan Esc menutupnya
- [ ] Given pengguna mengetik, when hasil tampil, then hanya dataset, dashboard (milik/dibagikan), dan panduan sesuai perannya yang muncul, dikelompokkan, dan bisa dipilih dengan panah atas/bawah + Enter
- [ ] Given pembaca layar, when dialog dibuka dan hasil berubah, then peran combobox/listbox benar dan jumlah hasil diumumkan

## Risk
(Required for strict profile. Impact:, Security (STRIDE):, Rollback:, Validation:)

## Notes
