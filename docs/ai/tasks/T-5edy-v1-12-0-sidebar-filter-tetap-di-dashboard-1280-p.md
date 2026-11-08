---
id: T-5edy
title: 'v1.12.0: sidebar filter tetap di dashboard (≥ 1280 px), bisa diciutkan'
status: in_progress
profile: standard
created: "2026-11-08T14:22:48Z"
updated: "2026-11-08T14:22:55Z"
created_by: claude-code
workers:
  - claude-code
branch: claude/cool-babbage-t5yojt
base: 14edcb2448f2c200d0d4418be49a6182c41732bb
---

## Objective
(describe the outcome in one paragraph)

## Acceptance criteria
- [ ] Given layar ≥ 1280 px dan dashboard berkolom filter, when halaman digulir ke bawah, then panel filter tetap terlihat di sisi kiri dan kontrolnya bisa dipakai tanpa naik ke atas
- [ ] Given sidebar filter, when tombol Ciutkan ditekan, then menjadi rel ikon dengan jumlah filter aktif, pilihan diingat browser, dan bisa dibuka lagi
- [ ] Given mode ubah dengan panel widget terbuka di ≥ 1280 px, when dirender, then sidebar filter otomatis menjadi rel agar kanvas tidak sempit
- [ ] Given layar < 1280 px, when dirender, then filter tetap di atas (bilah/lembar seperti sebelumnya)

## Risk
(Required for strict profile. Impact:, Security (STRIDE):, Rollback:, Validation:)

## Notes
