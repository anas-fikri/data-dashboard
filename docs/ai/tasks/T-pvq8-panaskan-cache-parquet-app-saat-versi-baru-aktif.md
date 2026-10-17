---
id: T-pvq8
title: Panaskan cache parquet app saat versi baru aktif
status: todo
profile: standard
created: "2026-10-17T10:12:34Z"
updated: "2026-10-17T10:12:34Z"
created_by: claude-code
---

## Objective
(describe the outcome in one paragraph)

## Acceptance criteria
- [ ] Given ingest versi selesai dan versi diaktifkan, when pemilik membuka dashboard pertama kali, then file parquet versi itu sudah ada di cache app (tanpa unduh saat permintaan pertama) dan waktu buka dashboard pertama setara buka berikutnya
- [ ] Given cache app penuh atau storage gagal saat pemanasan, when pemanasan berjalan, then aktivasi versi tetap berhasil, kegagalan dicatat di log, dan query pertama tetap mengunduh seperti sebelumnya

## Risk
(Required for strict profile. Impact:, Security (STRIDE):, Rollback:, Validation:)

## Notes
