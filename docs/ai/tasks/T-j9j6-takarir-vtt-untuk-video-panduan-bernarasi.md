---
id: T-j9j6
title: Takarir (VTT) untuk video panduan bernarasi
status: todo
profile: standard
depends_on:
  - T-021
created: "2026-10-16T21:34:35Z"
updated: "2026-10-16T21:34:35Z"
created_by: claude-code
---

## Objective
(describe the outcome in one paragraph)

## Acceptance criteria
- [ ] Given admin mengunggah file .vtt untuk sebuah video, when divalidasi (signature WEBVTT, ≤ 200 KB, Content-Type text/vtt dari server), then pemutar di /panduan menampilkan tombol takarir dan teks tampil sinkron
- [ ] Given file .vtt tidak valid atau > 200 KB, when diunggah, then ditolak INVALID_FORMAT / FILE_TOO_LARGE dan video tetap tanpa takarir

## Risk
(Required for strict profile. Impact:, Security (STRIDE):, Rollback:, Validation:)

## Notes
