---
id: T-ykyd
title: 'v1.10.0: tema warna grafik dashboard, arah batang, garis tren'
status: in_progress
profile: standard
created: "2026-11-07T16:10:34Z"
updated: "2026-11-07T16:10:43Z"
created_by: claude-code
workers:
  - claude-code
branch: claude/cool-babbage-t5yojt
base: a77fe1b52270ac9fbc7a6643f051af765848c1f9
---

## Objective
(describe the outcome in one paragraph)

## Acceptance criteria
- [ ] Given tema grafik dipilih di Warna dashboard, when grafik Batang/Garis/Pai dirender (layar/PDF), then warna seri + swatch legenda memakai palet tema
- [ ] Given panel Warna dashboard dibuka, when dibaca, then menjelaskan warna status hanya untuk widget yang diberi Penilaian warna
- [ ] Given batang berdimensi tanggal/periode dengan arah Otomatis, when dirender, then tegak; Mendatar/Tegak manual dihormati
- [ ] Given Tren dipilih di Garis/Batang tegak berdimensi waktu, when dirender, then seri tren putus-putus + legenda arah tren

## Risk
(Required for strict profile. Impact:, Security (STRIDE):, Rollback:, Validation:)

## Notes
