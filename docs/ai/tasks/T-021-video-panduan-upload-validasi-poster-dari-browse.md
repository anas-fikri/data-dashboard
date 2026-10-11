---
id: T-021
title: 'Video panduan: upload, validasi, poster dari browser, streaming'
status: todo
profile: standard
goal: G-4
depends_on:
  - T-020
  - T-004
created: "2026-10-11T14:45:09Z"
updated: "2026-10-11T14:45:09Z"
created_by: claude-code
---

## Objective
GuideVideo {articleId, title, objectKey, posterKey, durationSec}. Upload multipart B2 untuk mp4/webm ≤ 500 MB; signature dengan offset (mp4 ftyp byte 4–8, webm 1A45DFA3). Durasi dan poster diambil di browser (loadedmetadata + canvas → PNG) lalu diunggah (D12). Pemutar <video> via presigned 1 jam dengan Range.

## Acceptance criteria
- [ ] Given admin memilih mp4 valid, when upload selesai, then durasi tersimpan, poster PNG ada di MinIO, dan video tampil di pratinjau
- [ ] Given file .mkv diganti ekstensi .mp4 atau video > 500 MB, when upload, then ditolak sebelum tersimpan dengan code INVALID_FORMAT / FILE_TOO_LARGE
- [ ] Given user menekan putar dan melompat ke menit ke-5, when video berlanjut, then permintaan ke MinIO menjawab 206 Partial Content tanpa unduh penuh

## Risk
(Required for strict profile. Impact:, Security (STRIDE):, Rollback:, Validation:)

## Notes
