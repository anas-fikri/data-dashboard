---
id: T-8g53
title: Pantauan + peringatan email admin (health, backup, unggah gagal)
status: in_review
profile: standard
tags:
  - ops
created: "2026-11-06T09:29:30Z"
updated: "2026-11-06T10:32:56Z"
created_by: claude-code
workers:
  - claude-code
branch: claude/cool-babbage-t5yojt
base: b1e545a9b98e9b3c314112f6ffe337359d9c96aa
review:
  passes:
    - "n": 1
      by: claude-reviewer-subagent
      at: "2026-11-06T10:32:56Z"
      findings: 2
---

## Objective
(describe the outcome in one paragraph)

## Acceptance criteria
- [ ] Given layanan/backup bermasalah atau unggah gagal melonjak, when job pantauan 15 menit jalan, then admin menerima email sekali saat berubah status (+ pengingat 6 jam) dan email pulih
- [ ] Tanpa migrasi DB; unit test lulus

## Risk
(Required for strict profile. Impact:, Security (STRIDE):, Rollback:, Validation:)

## Notes
