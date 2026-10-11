---
id: T-018
title: 'Halaman admin pengguna: daftar, jadikan admin, nonaktifkan akun'
status: todo
profile: standard
goal: G-2
tags:
  - security
depends_on:
  - T-002
created: "2026-10-11T14:13:44Z"
updated: "2026-10-11T14:13:44Z"
created_by: claude-code
---

## Objective
Peran admin melekat pada user (seed pertama dari T-001). Halaman /admin/pengguna hanya untuk admin: daftar user (email, peran, status, login terakhir), toggle admin, nonaktifkan/aktifkan akun. Nonaktif = sesi dicabut, login ditolak, dataset/dashboard miliknya tetap ada dan dapat dialihkan ke pemilik lain.

## Acceptance criteria
- [ ] Given admin login, when menonaktifkan user B yang sedang login, then permintaan berikutnya dari sesi B diarahkan ke /login dengan pesan akun nonaktif dan B tidak bisa login lagi
- [ ] Given hanya ada satu admin, when admin tersebut mencoba mencabut peran adminnya sendiri atau menonaktifkan dirinya, then ditolak dengan pesan harus ada minimal satu admin aktif
- [ ] Given user non-admin, when membuka /admin/pengguna atau memanggil Server Action-nya, then mendapat 404 dan tidak ada perubahan data
- [ ] Given user B dinonaktifkan, when admin mengalihkan dataset milik B ke user C, then C menjadi pemilik dan semua dashboard di dalamnya tetap berfungsi

## Risk
(Required for strict profile. Impact:, Security (STRIDE):, Rollback:, Validation:)

## Notes
