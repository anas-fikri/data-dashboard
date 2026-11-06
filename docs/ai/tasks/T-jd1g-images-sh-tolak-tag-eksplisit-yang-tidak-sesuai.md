---
id: T-jd1g
title: 'images.sh: tolak tag eksplisit yang tidak sesuai versi package.json'
status: in_progress
profile: standard
tags:
  - deploy
created: "2026-11-06T16:25:36Z"
updated: "2026-11-06T16:25:36Z"
created_by: claude-code
workers:
  - claude-code
branch: claude/cool-babbage-t5yojt
base: 343ac0c3ef2aaf66297dad38d72655e23848ddc5
---

## Objective
(describe the outcome in one paragraph)

## Acceptance criteria
- [ ] Given package.json 1.8.0, when images.sh build v1.8.1, then build ditolak dengan pesan (tanpa membangun)
- [ ] Given package.json 1.8.1, when images.sh build v1.8.1 atau v1.8.1-r2, then build lanjut

## Risk
(Required for strict profile. Impact:, Security (STRIDE):, Rollback:, Validation:)

## Notes
