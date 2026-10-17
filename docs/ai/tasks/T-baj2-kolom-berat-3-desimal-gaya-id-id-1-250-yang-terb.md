---
id: T-baj2
title: Kolom berat 3 desimal gaya id-ID ('1,250') yang terbaca US ditandai ambigu
status: todo
profile: standard
depends_on:
  - T-t1g0
created: "2026-10-17T06:59:24Z"
updated: "2026-10-17T06:59:24Z"
created_by: claude-code
---

## Objective
(describe the outcome in one paragraph)

## Acceptance criteria
- [ ] Given CSV yang angkanya hanya berbentuk koma 3 digit tanpa bukti kuat (mis. berat '1,250', '2,500'), when di-ingest, then kolom ditandai penulisan angka ambigu dengan pesan yang menjelaskan kedua tafsiran (1.250 ribuan vs 1,25 desimal)
- [ ] Given kolom US dengan bukti kuat ('1,234,567' atau '2,500.75'), when di-ingest, then tidak ditandai

## Risk
(Required for strict profile. Impact:, Security (STRIDE):, Rollback:, Validation:)

## Notes
