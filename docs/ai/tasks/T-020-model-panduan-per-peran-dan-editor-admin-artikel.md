---
id: T-020
title: Model panduan per peran dan editor admin (artikel markdown)
status: todo
profile: standard
goal: G-4
depends_on:
  - T-019
created: "2026-10-11T14:45:09Z"
updated: "2026-10-11T14:45:09Z"
created_by: claude-code
---

## Objective
GuideArticle {role: owner|editor|viewer|admin|all, contextKey?: upload|schema|builder, title, slug, bodyMarkdown, order, status: draft|published}. /admin/panduan: buat, edit dengan pratinjau tersanitasi, urutkan, terbitkan. Hanya isAdmin.

## Acceptance criteria
- [ ] Given admin, when membuat artikel role viewer dengan contextKey schema dan menerbitkannya, then artikel tersimpan published dan muncul di query artikel untuk role viewer
- [ ] Given markdown berisi tag <script>, when pratinjau/render, then tag dihapus dan tidak dieksekusi
- [ ] Given user non-admin, when membuka /admin/panduan atau memanggil Server Action-nya, then 404 / code NOT_FOUND
- [ ] Given dua artikel urutan 1 dan 2, when admin menukar urutan, then urutan baru tersimpan dan hanya artikel published tampil di /panduan

## Risk
(Required for strict profile. Impact:, Security (STRIDE):, Rollback:, Validation:)

## Notes
