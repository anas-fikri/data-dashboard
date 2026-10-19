---
id: T-tqse
title: Deploy dari image yang di-build di luar VM
status: in_progress
profile: standard
depends_on:
  - T-023
created: "2026-10-17T05:18:27Z"
updated: "2026-10-19T01:06:17Z"
created_by: claude-code
workers:
  - claude-code
branch: worktree-t-001-scaffold
base: ba2efef8d86bde8926f0507acddd0cb88c013130
---

## Objective
(describe the outcome in one paragraph)

## Acceptance criteria
- [ ] Given image app/worker/renderer/backup di-build di luar VM produksi, when deploy dijalankan sesuai runbook di VM kosong, then app via HTTPS dan /health hijau dalam < 10 menit

## Risk
(Required for strict profile. Impact:, Security (STRIDE):, Rollback:, Validation:)

## Notes
- 2026-10-19: deploy.sh menerima DEPLOY_ENV_FILE + DEPLOY_PROJECT (dijaga: ≠ dashboard); deploy/empty-vm-drill.sh
  di olympus memuat arsip image lalu deploy salinan terpisah dari nol sampai /api/health hijau dalam 120 dtk
  (arsip dibuat dari image yang sudah ada di VM). images.sh build di Mac selesai (± 23 mnt) tetapi image app/worker/
  renderer hilang dari image store saat disk Mac ±99% penuh — putaran utuh "build di luar VM → deploy VM kosong"
  belum dijalankan; butuh mesin build dengan ruang disk ≥ 15 GB.
