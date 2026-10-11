---
id: T-003
title: CRUD profil dataset per user
status: todo
profile: standard
goal: G-2
depends_on:
  - T-002
created: "2026-10-11T10:22:45Z"
updated: "2026-10-11T10:22:45Z"
created_by: claude-code
---

## Objective
Profil dataset = kontainer untuk file dan dashboard: nama, deskripsi, pemilik, status (kosong/ingesting/siap/gagal). Daftar hanya milik user atau yang dibagikan.

## Acceptance criteria
- [ ] Given user login, when membuat profil dataset dengan nama unik, then profil muncul di daftar dengan status kosong
- [ ] Given profil dataset milik user lain yang tidak dibagikan, when user membuka URL-nya langsung, then mendapat 404
- [ ] Given profil dataset, when user mengubah nama/deskripsi atau menghapusnya, then perubahan tersimpan dan hapus memerlukan konfirmasi serta menghapus file terkait di storage

## Risk
(Required for strict profile. Impact:, Security (STRIDE):, Rollback:, Validation:)

## Notes
