---
id: T-3k08
title: Koreksi ulang video panduan dan tambahkan narasi suara bahasa Indonesia
status: in_progress
profile: standard
created: "2026-10-18T00:20:47Z"
updated: "2026-10-18T00:20:51Z"
created_by: claude-code
workers:
  - claude-code
branch: worktree-t-001-scaffold
base: bcfa8288c525a179657675441f58996d8d7f5f3d
---

## Objective
(describe the outcome in one paragraph)

## Acceptance criteria
- [ ] Given UI terbaru, when kesembilan video panduan direkam ulang, then setiap adegan sesuai tampilan sekarang (tanpa langkah/teks usang; termasuk bagian Video + Takarir di editor artikel dan tab/kartu Panduan terbaru), diperiksa per frame
- [ ] Given video panduan diputar, when narasi berjalan, then terdengar suara penutur bahasa Indonesia yang natural (ElevenLabs, satu suara konsisten) dan setiap kalimat sinkron dengan langkah di layar tanpa jeda mati atau kalimat terpotong
- [ ] Given video bernarasi, when diunggah ke panduan, then takarir WebVTT dari naskah narasi ikut terpasang (tombol takarir di pemutar) dan durasi/poster diperbarui

## Risk
(Required for strict profile. Impact:, Security (STRIDE):, Rollback:, Validation:)

## Notes
