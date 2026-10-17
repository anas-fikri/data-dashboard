---
id: T-y3y1
title: Konversi database produksi olympus dari SQL_ASCII ke UTF8
status: todo
profile: standard
depends_on:
  - T-023
created: "2026-10-17T05:18:26Z"
updated: "2026-10-17T05:18:26Z"
created_by: claude-code
---

## Objective
(describe the outcome in one paragraph)

## Acceptance criteria
- [ ] Given database data_dashboard di PostgreSQL host olympus, when diperiksa, then encoding UTF8 (C.UTF-8) dan isi identik dengan sebelum konversi (fingerprint.sh sama)
- [ ] Given user bernama dengan huruf non-ASCII, when admin mencari dengan huruf besar/kecil berbeda, then user ditemukan

## Risk
(Required for strict profile. Impact:, Security (STRIDE):, Rollback:, Validation:)

## Notes
