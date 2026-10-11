---
id: T-012
title: Berbagi dashboard dalam organisasi dan peran viewer/editor
status: todo
profile: standard
goal: G-4
tags:
  - security
depends_on:
  - T-010
created: "2026-10-11T10:22:46Z"
updated: "2026-10-11T10:22:46Z"
created_by: claude-code
---

## Objective
Visibilitas dashboard: pribadi, user tertentu (email domain yang sama), atau semua user organisasi. Peran editor (ubah widget) dan viewer (lihat + filter). Pemilik dataset mengelola akses. Audit log akses dasar.

## Acceptance criteria
- [ ] Given dashboard dibagikan sebagai viewer ke user B, when B membuka dashboard, then B bisa melihat dan memfilter tetapi tombol edit, hapus, dan panel konfigurasi tidak tersedia dan Server Action edit ditolak 403
- [ ] Given dashboard pribadi, when user C dari domain yang sama membuka URL-nya, then mendapat 404
- [ ] Given dashboard dibagikan ke semua user organisasi, when pemilik mencabut akses, then user lain yang sedang membuka mendapat 404 pada permintaan data berikutnya

## Risk
(Required for strict profile. Impact:, Security (STRIDE):, Rollback:, Validation:)

## Notes
