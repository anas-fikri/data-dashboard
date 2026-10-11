---
id: T-022
title: Halaman /panduan per peran, kartu mulai, bantuan kontekstual
status: todo
profile: standard
goal: G-4
depends_on:
  - T-021
  - T-016
  - T-008
created: "2026-10-11T14:45:09Z"
updated: "2026-10-11T14:45:09Z"
created_by: claude-code
---

## Objective
/panduan: tab per peran turunan user (admin = isAdmin; owner = punya dataset atau user baru; editor/viewer = share) + role all; daftar artikel published berurutan; render markdown tersanitasi; video; pencarian judul/isi. Kartu 'Mulai di sini' di beranda untuk user baru, hilang setelah artikel pertama ditandai dibaca (GuideRead per user). Tombol bantuan di halaman upload/skema/builder membuka panel samping artikel dengan contextKey cocok.

## Acceptance criteria
- [ ] Given user hanya viewer di satu dashboard, when membuka /panduan, then hanya artikel role viewer dan all tampil; slug artikel role owner menjawab 404
- [ ] Given user baru tanpa dataset dan share, when login pertama, then tab owner dan all tampil dan kartu 'Mulai di sini' muncul; setelah satu artikel ditandai dibaca, kartu hilang
- [ ] Given user di halaman skema, when menekan tombol bantuan, then panel samping menampilkan artikel contextKey schema untuk perannya tanpa meninggalkan halaman
- [ ] Given pencarian 'upload', when dikirim, then hasil hanya artikel yang boleh dilihat user dan mengandung kata itu

## Risk
(Required for strict profile. Impact:, Security (STRIDE):, Rollback:, Validation:)

## Notes
