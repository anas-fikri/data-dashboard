---
id: T-xp28
title: 'v1.15.1: perbaikan rilis — rollback kenali tabel rilis, masa tunggu sehat app, cache build npm'
status: in_progress
profile: standard
tags:
  - deploy
created: "2026-11-11T02:18:54Z"
updated: "2026-11-11T02:21:03Z"
created_by: claude-code
workers:
  - claude-code
branch: claude/cool-babbage-t5yojt
base: 998095958b143111ed09228764d3fbaca501a2f9
---

## Objective
Pelajaran deploy v1.15.0 (2026-11-10): rollback ditolak karena tabel DashboardView (v1.14) tidak ada di daftar NEW_TABLES upgrade.sh; app butuh > 75 dtk sehat setelah backup + build di VM sehingga `up --wait`/proxy gagal padahal app sehat sendiri; build di Mac macet di `npm ci` karena lapisan dependensi selalu dibangun ulang (versi package.json naik tiap rilis). Perbaiki ketiganya tanpa mengubah perilaku produksi lain, dan catat langkah deploy lewat server (disk, NAS penuh) di runbook.

## Acceptance criteria
- [ ] Given database berisi tabel DashboardView atau tabel lain yang dibuat migrasi rilis (CREATE TABLE), when upgrade.sh rollback memeriksa database tujuan, then pemeriksaan lolos; tabel asing tetap ditolak sebelum app/worker dihentikan
- [ ] Given app butuh 75–120 dtk sampai /api/health/core lulus, when deploy.sh menjalankan up --wait, then compose menunggu (start_period 120 dtk) dan tidak menyatakan app unhealthy
- [ ] Given rilis hanya menaikkan versi package.json, when image dibangun ulang dengan cache yang ada, then lapisan npm ci memakai cache; Dockerfile tetap bisa dibangun dengan BuildKit maupun builder lama
- [ ] Given pemilik deploy lewat server, when membaca runbook, then ada langkah untuk disk kurang (hapus image rollback lama, cache build) dan NAS penuh saat preflight

## Risk
(Required for strict profile. Impact:, Security (STRIDE):, Rollback:, Validation:)

## Notes
