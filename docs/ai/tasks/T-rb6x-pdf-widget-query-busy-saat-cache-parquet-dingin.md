---
id: T-rb6x
title: 'PDF: widget QUERY_BUSY saat cache parquet dingin menunggu unduhan pertama lebih lama (bukan kartu galat)'
status: todo
profile: standard
depends_on:
  - T-018
created: "2026-10-16T15:09:42Z"
updated: "2026-10-16T15:09:42Z"
created_by: claude-code
---

## Objective
(describe the outcome in one paragraph)

## Acceptance criteria
- [ ] Given cache parquet dingin dan unduhan sheet pertama > 1,2 detik, when dashboard dua sheet diekspor PDF, then semua widget tercetak berisi data (tidak ada kartu 'Kode: QUERY_BUSY') selama unduhan selesai dalam batas tunggu unduhan
- [ ] Given unduhan tidak selesai dalam batas tunggu, when ekspor PDF, then PDF tetap jadi dalam batas waktu render dengan kartu galat widget itu (tidak menggantung)

## Risk
(Required for strict profile. Impact:, Security (STRIDE):, Rollback:, Validation:)

## Notes
