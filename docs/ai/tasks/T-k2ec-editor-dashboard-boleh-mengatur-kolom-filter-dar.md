---
id: T-k2ec
title: Editor dashboard boleh mengatur kolom filter dari bilah filter
status: todo
profile: standard
tags:
  - ui
  - security
created: "2026-10-22T03:19:58Z"
updated: "2026-10-22T03:19:58Z"
created_by: claude-code
---

## Objective
(describe the outcome in one paragraph)

## Acceptance criteria
- [ ] Pemilik dan editor dashboard bisa menambah/menghapus kolom filter langsung di bilah filter mode edit tanpa gulir ke kartu pengaturan; viewer tetap tidak bisa (404/403 sesuai konvensi)
- [ ] Viewer tetap hanya mengirim {widgetId, dashboardFilters} untuk kolom filter yang terdaftar
- [ ] Panduan 08 editor diperbarui (keputusan pemilik 2026-10-22: editor boleh menambah filter)

## Risk
(Required for strict profile. Impact:, Security (STRIDE):, Rollback:, Validation:)

## Notes
