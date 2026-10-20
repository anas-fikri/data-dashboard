---
id: T-gcn8
title: Simpan baris judul dan peta kolom per segmen untuk unggahan periode
status: todo
profile: standard
depends_on:
  - T-040
created: "2026-10-20T01:03:01Z"
updated: "2026-10-20T01:03:01Z"
created_by: claude-code
---

## Objective
(describe the outcome in one paragraph)

## Acceptance criteria
- [ ] Given dua versi berbagi satu segmen, when baris judul dipilih ulang di salah satu versi, then baris judul segmen versi lain tidak berubah dan recast-nya tetap memakai baris judul miliknya
- [ ] Given unggahan periode dengan urutan kolom berbeda dari skema aktif, when recast per segmen berjalan, then setiap kolom di-cast dari kolom raw segmen yang benar lewat peta kolom per segmen yang tersimpan

## Risk
(Required for strict profile. Impact:, Security (STRIDE):, Rollback:, Validation:)

## Notes
