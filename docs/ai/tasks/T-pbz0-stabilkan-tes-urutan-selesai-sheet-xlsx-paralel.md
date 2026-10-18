---
id: T-pbz0
title: Stabilkan tes urutan selesai sheet xlsx paralel yang flaky di bawah beban
status: todo
profile: standard
tags:
  - bug
created: "2026-10-18T04:23:08Z"
updated: "2026-10-18T04:23:08Z"
created_by: claude-code
---

## Objective
(describe the outcome in one paragraph)

## Acceptance criteria
- [ ] Given mesin sedang sibuk (CPU penuh), when tests/features/ingest/parallel.test.ts dijalankan berulang (mis. 20×), then tes urutan selesai sheet tidak pernah gagal karena waktu, tanpa melemahkan maksud tes (sheet kecil boleh selesai sebelum sheet besar)

## Risk
(Required for strict profile. Impact:, Security (STRIDE):, Rollback:, Validation:)

## Notes
