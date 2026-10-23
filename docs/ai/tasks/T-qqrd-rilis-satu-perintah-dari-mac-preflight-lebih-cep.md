---
id: T-qqrd
title: Rilis satu perintah dari Mac + preflight lebih cepat dan aman
status: in_progress
profile: standard
tags:
  - ops
created: "2026-10-23T11:51:15Z"
updated: "2026-10-23T14:24:49Z"
created_by: claude-code
workers:
  - claude-code
branch: claude/intelligent-albattani-fd1va8
base: 4a32c9efaf5063b9b971924ea2fad51d649ff2b6
---

## Objective
(describe the outcome in one paragraph)

## Acceptance criteria
- [ ] deploy/release.sh menjalankan tag → build → kirim → preflight → git archive → load/migrate/start → seed panduan dengan satu koneksi SSH; berhenti di langkah pertama yang gagal (uji tests/scripts/release.test.ts)
- [ ] upgrade.sh preflight: Redis wajib sehat, ruang disk dihitung dari ukuran arsip backup terakhir, REUSE_BACKUP_HOURS memakai backup terverifikasi yang baru (uji upgrade-gates)
- [ ] Runbook §12 (Redis AOF rusak) dan §13 (rilis satu perintah)

## Risk
(Required for strict profile. Impact:, Security (STRIDE):, Rollback:, Validation:)

## Notes
