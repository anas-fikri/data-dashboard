---
id: T-002
title: Registrasi terbatas domain, verifikasi email, dan login
status: todo
profile: standard
goal: G-2
tags:
  - security
depends_on:
  - T-001
created: "2026-10-11T10:22:45Z"
updated: "2026-10-11T10:22:45Z"
created_by: claude-code
---

## Objective
Auth.js credentials/magic link. Daftar hanya untuk email berdomain di ALLOWED_EMAIL_DOMAINS (env, comma-separated). Verifikasi email wajib sebelum login. Session server-side, route non-publik redirect ke /login.

## Acceptance criteria
- [ ] Given email berdomain di luar whitelist, when user submit form registrasi, then permintaan ditolak dengan pesan domain tidak diizinkan dan tidak ada user tersimpan
- [ ] Given email berdomain yang diizinkan, when user registrasi lalu klik tautan verifikasi, then akun aktif dan user bisa login
- [ ] Given user belum login, when membuka /datasets, then diarahkan ke /login dan setelah login kembali ke /datasets
- [ ] Given 10 percobaan login gagal dari IP yang sama dalam 10 menit, when percobaan ke-11, then ditolak dengan status 429

## Risk
(Required for strict profile. Impact:, Security (STRIDE):, Rollback:, Validation:)

## Notes
