---
id: T-t1g0
title: 'Ingest: kolom dibaca id-ID padahal ada ribuan koma gaya US (''1,500'') ditandai ambigu seperti T-030'
status: todo
profile: standard
depends_on:
  - T-030
created: "2026-10-16T17:28:57Z"
updated: "2026-10-16T17:28:57Z"
created_by: claude-code
---

## Objective
(describe the outcome in one paragraph)

## Acceptance criteria
- [ ] Given CSV yang dibaca locale id-ID tetapi berisi nilai ribuan koma gaya US seperti '1,500' atau '12,345', when di-ingest, then kolom ditandai penulisan angka ambigu di halaman skema (atau dibaca US bila buktinya mayoritas)
- [ ] Given kolom id-ID bersih tanpa nilai ribuan koma, when di-ingest, then tidak ditandai

## Risk
(Required for strict profile. Impact:, Security (STRIDE):, Rollback:, Validation:)

## Notes
