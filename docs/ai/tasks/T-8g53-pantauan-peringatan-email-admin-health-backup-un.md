---
id: T-8g53
title: Pantauan + peringatan email admin (health, backup, unggah gagal)
status: todo
profile: standard
tags:
  - ops
created: "2026-11-06T09:29:30Z"
updated: "2026-11-06T09:29:30Z"
created_by: claude-code
---

## Objective
(describe the outcome in one paragraph)

## Acceptance criteria
- [ ] Given layanan/backup bermasalah atau unggah gagal melonjak, when job pantauan 15 menit jalan, then admin menerima email sekali saat berubah status (+ pengingat 6 jam) dan email pulih
- [ ] Tanpa migrasi DB; unit test lulus

## Risk
(Required for strict profile. Impact:, Security (STRIDE):, Rollback:, Validation:)

## Notes
