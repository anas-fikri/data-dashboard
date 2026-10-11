---
id: T-002
title: Registrasi terbatas domain, verifikasi email, login JWT dengan sessionVersion
status: todo
profile: standard
goal: G-2
tags:
  - security
depends_on:
  - T-001
created: "2026-10-11T14:45:08Z"
updated: "2026-10-11T14:45:08Z"
created_by: claude-code
---

## Objective
Auth.js Credentials: email + password (argon2id). Registrasi hanya domain di ALLOWED_EMAIL_DOMAINS; token verifikasi dikirim via SMTP; login ditolak sebelum emailVerifiedAt terisi. Session JWT memuat userId + sessionVersion; middleware/auth() mencocokkan isActive dan sessionVersion ke DB setiap permintaan (D1). Route non-publik redirect ke /login?next=. Rate limit login 10 gagal/IP/10 menit (Redis), IP dari X-Forwarded-For hanya bila TRUST_PROXY=true.

## Acceptance criteria
- [ ] Given email berdomain di luar whitelist, when submit registrasi, then Server Action mengembalikan code DOMAIN_NOT_ALLOWED dan tidak ada user tersimpan
- [ ] Given email domain yang diizinkan, when registrasi lalu membuka tautan verifikasi yang diambil dari Mailpit, then emailVerifiedAt terisi dan user bisa login; sebelum itu login ditolak dengan code EMAIL_NOT_VERIFIED
- [ ] Given user belum login, when membuka /datasets, then diarahkan ke /login dan setelah login kembali ke /datasets
- [ ] Given 10 percobaan login gagal dari IP yang sama dalam 10 menit, when percobaan ke-11, then Route Handler login menjawab HTTP 429 dan Server Action mengembalikan code RATE_LIMITED
- [ ] Given user login, when sessionVersion user dinaikkan di DB, then permintaan berikutnya dengan JWT lama diarahkan ke /login

## Risk
(Required for strict profile. Impact:, Security (STRIDE):, Rollback:, Validation:)

## Notes
