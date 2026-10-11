---
id: T-016
title: 'Berbagi dashboard: viewer/editor, organisasi, otorisasi query berbasis widget'
status: todo
profile: standard
goal: G-4
tags:
  - security
depends_on:
  - T-012
created: "2026-10-11T14:45:09Z"
updated: "2026-10-11T14:45:09Z"
created_by: claude-code
---

## Objective
Share {dashboardId, userId? | wholeOrg, role: VIEWER|EDITOR}. Organisasi = semua user aktif instance. Pemilik dataset mengelola akses. Non-pemilik hanya boleh /api/query {widgetId, filters} dengan filter terbatas kolom yang diizinkan dashboard (D6); mode bebas ditolak. Editor boleh mengubah widget/layout; viewer tidak. Audit log akses dasar (siapa membuka dashboard apa, kapan).

## Acceptance criteria
- [ ] Given dashboard dibagikan VIEWER ke user B, when B membuka, then B melihat dan memfilter; tombol edit tidak ada; Server Action edit mengembalikan code FORBIDDEN; /api/query mode bebas dari B menjawab HTTP 404
- [ ] Given dashboard pribadi, when user C membuka URL-nya, then 404; given dashboard dibagikan ke organisasi, when C membuka, then berhasil
- [ ] Given B viewer mengirim filter pada kolom yang tidak diizinkan dashboard, when /api/query, then HTTP 400
- [ ] Given pemilik mencabut akses organisasi, when user lain yang sedang membuka memuat data berikutnya, then 404 dan audit log mencatat akses sebelumnya

## Risk
(Required for strict profile. Impact:, Security (STRIDE):, Rollback:, Validation:)

## Notes
