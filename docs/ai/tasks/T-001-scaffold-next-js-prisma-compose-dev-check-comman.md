---
id: T-001
title: Scaffold Next.js + Prisma + compose dev + check command
status: todo
profile: standard
goal: G-2
created: "2026-10-11T14:45:08Z"
updated: "2026-10-11T14:45:08Z"
created_by: claude-code
---

## Objective
Next.js 15 App Router TS strict, Tailwind, Prisma + PostgreSQL 16, Vitest, Playwright, ESLint/Prettier, pino. docker-compose dev: PostgreSQL, MinIO (bucket + lifecycle AbortIncompleteMultipartUpload 1 hari + CORS ExposeHeaders ETag), Redis, Mailpit (SMTP dev). Env: DATABASE_URL, REDIS_URL, S3_ENDPOINT, S3_PUBLIC_ENDPOINT, SMTP_URL, MAIL_FROM, ALLOWED_EMAIL_DOMAINS, MAX_UPLOAD_BYTES. Prisma model User {email, passwordHash, isAdmin, isActive, sessionVersion, emailVerifiedAt}. Skrip npm run check (lint + typecheck + test) dan npm run perf (kosong dulu). .env.example lengkap.

## Acceptance criteria
- [ ] Given clone bersih dengan Node 22 dan compose dev berjalan, when npm install lalu npm run check, then lint, typecheck, dan test selesai tanpa error dalam < 3 menit
- [ ] Given compose dev berjalan, when membuka /health, then halaman menampilkan status koneksi PostgreSQL, MinIO, Redis, dan SMTP masing-masing OK
- [ ] Given database kosong, when menjalankan migrate + seed, then tabel User terbentuk dan satu admin (isAdmin=true, isActive=true) dibuat dari env SEED_ADMIN_EMAIL

## Risk
(Required for strict profile. Impact:, Security (STRIDE):, Rollback:, Validation:)

## Notes
