---
id: T-026
title: Lupa password, ganti password, keluar dari semua perangkat
status: todo
profile: strict
profile_pinned: true
goal: G-2
tags:
  - security
depends_on:
  - T-002
created: "2026-10-11T14:56:58Z"
updated: "2026-10-11T14:57:02Z"
created_by: claude-code
---

## Objective
Alur lupa password: token 32 byte acak, disimpan sebagai SHA-256, kedaluwarsa 30 menit, sekali pakai, tautan dari APP_URL env (bukan Host header); respons selalu netral anti-enumerasi. Ganti password saat login (wajib password lama). Keduanya menaikkan sessionVersion. Tombol 'keluar dari semua perangkat' = sessionVersion++. Rate limit 3 permintaan/email/jam dan 20/IP/jam. Kebijakan password dari T-002 (12–128 karakter).

## Acceptance criteria
- [ ] Given email terdaftar maupun tidak, when minta reset, then respons identik 'jika terdaftar, cek inbox' dan hanya email terdaftar menerima tautan
- [ ] Given tautan reset, when dipakai dua kali atau setelah 30 menit, then ditolak code TOKEN_INVALID dan token tersimpan hanya berupa hash
- [ ] Given user login di dua browser, when ganti password di satu browser, then browser lain diarahkan ke /login pada permintaan berikutnya
- [ ] Given 4 permintaan reset untuk email yang sama dalam 1 jam, when ke-4, then code RATE_LIMITED tanpa email terkirim

## Risk
(Required for strict profile. Impact:, Security (STRIDE):, Rollback:, Validation:)

## Notes

## Security checklist (OWASP ASVS 4.0.3)
<!-- Check each item when verified, or write "N/A: <reason>" after the text and check it. -->
- [ ] V1 Architecture: trust boundaries and the components handling sensitive data are identified for this change
- [ ] V2 Authentication: credentials are verified server-side; no default, hard-coded, or weak secrets
- [ ] V3 Session management: session tokens are random, protected, invalidated on logout and expiry
- [ ] V4 Access control: every endpoint/action checks authorization server-side, deny by default (no IDOR)
- [ ] V5 Validation, sanitization and encoding: all input validated; output encoded; no injection (SQL, OS, template)
- [ ] V6 Stored cryptography: sensitive data at rest uses approved algorithms; keys are not in the code
- [ ] V7 Error handling and logging: errors reveal no internals; security events are logged without secrets
- [ ] V8 Data protection: personal/sensitive data is minimized, not cached or logged, and removable
- [ ] V9 Communication: TLS for all external traffic; certificates validated
- [ ] V10 Malicious code: no backdoors, time bombs, or unexplained network calls; dependencies are trusted
- [ ] V11 Business logic: flows cannot be abused (limits, ordering, replay, race conditions)
- [ ] V12 Files and resources: uploads are type/size limited and stored safely; no path traversal or SSRF
- [ ] V13 API and web service: API inputs/outputs are schema-validated; CORS and rate limits are deliberate
- [ ] V14 Configuration: secure defaults, security headers, no debug in production, dependencies up to date
