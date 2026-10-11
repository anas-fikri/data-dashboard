---
id: T-001
title: Scaffold Next.js + Prisma + compose dev + check command
status: todo
profile: strict
profile_pinned: true
goal: G-2
tags:
  - security
created: "2026-10-11T14:45:08Z"
updated: "2026-10-11T14:57:00Z"
created_by: claude-code
---

## Objective
Next.js 15 App Router TS strict, Tailwind, Prisma + PostgreSQL 16, Vitest, Playwright, ESLint/Prettier, pino. docker-compose dev: PostgreSQL, MinIO (bucket + lifecycle AbortIncompleteMultipartUpload 1 hari + CORS ExposeHeaders ETag), Redis, Mailpit (SMTP dev). Env: DATABASE_URL, REDIS_URL, S3_ENDPOINT, S3_PUBLIC_ENDPOINT, SMTP_URL, MAIL_FROM, ALLOWED_EMAIL_DOMAINS, MAX_UPLOAD_BYTES. Prisma model User {email, passwordHash, isAdmin, isActive, sessionVersion, emailVerifiedAt}. Skrip npm run check (lint + typecheck + test) dan npm run perf (kosong dulu). .env.example lengkap.

## Acceptance criteria
- [ ] Given clone bersih dengan Node 22 dan compose dev berjalan, when npm install lalu npm run check, then lint, typecheck, dan test selesai tanpa error dalam < 3 menit
- [ ] Given compose dev berjalan, when membuka /health, then halaman menampilkan status koneksi PostgreSQL, MinIO, Redis, dan SMTP masing-masing OK
- [ ] Given database kosong, when menjalankan migrate + seed, then tabel User terbentuk dan satu admin (isAdmin=true, isActive=true) dibuat dari env SEED_ADMIN_EMAIL
- [ ] Given compose dev, when diperiksa, then Redis memakai requirepass, PostgreSQL/MinIO memakai kredensial non-default dari .env (bukan placeholder .env.example), dan /health merah bila kredensial masih sama dengan placeholder
- [ ] Given npm run check, when dijalankan, then memakai npm ci dari package-lock.json dan npm audit --audit-level=high lolos

## Risk
(Required for strict profile. Impact:, Security (STRIDE):, Rollback:, Validation:)

## Notes

- 2026-10-11T14:56:59Z Env tambahan: AUTH_SECRET (array untuk rotasi), APP_URL, APP_HOST, TRUST_PROXY. .env.example hanya placeholder; skrip dev generate secret (openssl rand). Compose dev sudah memisahkan network app/worker/renderer agar paritas dengan produksi.

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
