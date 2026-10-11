---
id: T-017
title: Halaman panduan penggunaan sesuai role dengan teks dan video
status: todo
profile: standard
goal: G-4
depends_on:
  - T-016
created: "2026-10-11T10:33:15Z"
updated: "2026-10-11T10:33:15Z"
created_by: claude-code
---

## Objective
Halaman /panduan: tab per role yang dimiliki user (role 'all' selalu tampil), daftar artikel terbit berurutan, isi markdown ter-render, pemutar video HTML5 dengan poster dan streaming range request dari MinIO via URL presigned berumur pendek. Pencarian judul/isi. Tautan 'Panduan' di navigasi utama dan tombol bantuan kontekstual di halaman upload, skema, dan builder yang membuka artikel terkait. Penanda 'sudah dibaca' per user untuk onboarding.

## Acceptance criteria
- [ ] Given user dengan role viewer saja, when membuka /panduan, then hanya artikel role viewer dan all yang tampil, artikel role owner tidak muncul dan tidak dapat diakses lewat slug langsung
- [ ] Given artikel dengan video, when user menekan putar dan melompat ke menit ke-5, then video langsung berlanjut dari posisi itu tanpa mengunduh penuh (respons 206 Partial Content)
- [ ] Given user baru pertama kali login, when masuk beranda, then muncul kartu 'Mulai di sini' yang menautkan ke panduan rolenya dan hilang setelah artikel pertama ditandai dibaca
- [ ] Given user berada di halaman skema, when menekan tombol bantuan, then panel samping membuka artikel panduan skema tanpa meninggalkan halaman

## Risk
(Required for strict profile. Impact:, Security (STRIDE):, Rollback:, Validation:)

## Notes
