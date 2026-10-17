---
id: T-h77x
title: Salin backup harian ke target off-VM
status: todo
profile: standard
tags:
  - security
depends_on:
  - T-023
created: "2026-10-17T05:18:25Z"
updated: "2026-10-17T05:18:25Z"
created_by: claude-code
---

## Objective
(describe the outcome in one paragraph)

## Acceptance criteria
- [ ] Given BACKUP_REMOTE berisi target off-VM (NAS/SFTP/S3) di .env.prod, when backup harian berjalan, then arsip .tar.age beserta .sha256 tersalin ke target dan retensi 30 hari juga berlaku di sana
- [ ] Given target off-VM, when verify-backup.sh dijalankan terhadap salinan off-VM, then checksum dan isi arsip valid

## Risk
(Required for strict profile. Impact:, Security (STRIDE):, Rollback:, Validation:)

## Notes
