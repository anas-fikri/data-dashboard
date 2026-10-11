---
id: T-018
title: Ekspor dashboard ke PDF via renderer terpisah
status: todo
profile: standard
goal: G-4
depends_on:
  - T-016
created: "2026-10-11T14:45:09Z"
updated: "2026-10-11T14:45:09Z"
created_by: claude-code
---

## Objective
Layanan renderer (Chromium/Playwright) terpisah dari app dan worker. App menerbitkan token render sekali pakai 60 detik terikat (dashboardId, userId, filter); renderer membuka /render/<token> yang hanya menerima token itu, mencetak A4 landscape, menyimpan ke exports/, presigned 1 jam.

## Acceptance criteria
- [ ] Given dashboard 6 widget dengan filter aktif, when ekspor PDF, then PDF memuat semua widget dengan nilai sama seperti layar
- [ ] Given token render sudah dipakai atau > 60 detik, when /render/<token> dibuka, then 404
- [ ] Given renderer mati, when user ekspor PDF, then user melihat code RENDERER_UNAVAILABLE dalam ≤ 10 detik, bukan hang

## Risk
(Required for strict profile. Impact:, Security (STRIDE):, Rollback:, Validation:)

## Notes
