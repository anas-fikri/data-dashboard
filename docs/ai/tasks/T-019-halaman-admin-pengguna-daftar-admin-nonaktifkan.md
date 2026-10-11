---
id: T-019
title: 'Halaman admin pengguna: daftar, admin, nonaktifkan, alihkan kepemilikan'
status: todo
profile: standard
goal: G-2
tags:
  - security
depends_on:
  - T-002
  - T-003
  - T-010
created: "2026-10-11T14:45:09Z"
updated: "2026-10-11T14:45:09Z"
created_by: claude-code
---

## Objective
/admin/pengguna untuk isAdmin: daftar user (email, admin, aktif, login terakhir), toggle admin, nonaktifkan/aktifkan (menaikkan sessionVersion → sesi putus, D1), alihkan semua dataset user nonaktif ke user lain. Larangan: menonaktifkan diri sendiri atau admin aktif terakhir.

## Acceptance criteria
- [ ] Given admin menonaktifkan user B yang sedang login, when B mengirim permintaan berikutnya, then diarahkan ke /login dengan pesan akun nonaktif dan tidak bisa login lagi
- [ ] Given hanya satu admin aktif, when ia mencoba mencabut admin dirinya atau menonaktifkan dirinya, then code LAST_ADMIN
- [ ] Given user non-admin, when membuka /admin/pengguna atau memanggil Server Action-nya, then 404 / code NOT_FOUND tanpa perubahan
- [ ] Given dataset milik B (nonaktif) dengan dashboard, when admin mengalihkan ke C, then C pemilik dan dashboard tetap berfungsi

## Risk
(Required for strict profile. Impact:, Security (STRIDE):, Rollback:, Validation:)

## Notes
