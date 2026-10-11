---
id: T-001
title: Scaffold aplikasi Next.js + Prisma + check command
status: todo
profile: standard
goal: G-2
created: "2026-10-11T10:22:45Z"
updated: "2026-10-11T10:22:45Z"
created_by: claude-code
---

## Objective
Kerangka monorepo: Next.js App Router TS, Tailwind, Prisma+PostgreSQL, Vitest, ESLint, docker-compose dev (PostgreSQL, MinIO, Redis), skrip npm run check.

## Acceptance criteria
- [ ] Given clone bersih dengan Node 22, when menjalankan npm install lalu npm run check, then lint, typecheck, dan test selesai tanpa error
- [ ] Given docker-compose dev dijalankan, when membuka halaman /health, then halaman menampilkan status koneksi PostgreSQL, MinIO, dan Redis masing-masing OK
- [ ] Given Prisma schema awal (User, Workspace), when menjalankan migrate, then migrasi berhasil dan seed admin pertama dibuat

## Risk
(Required for strict profile. Impact:, Security (STRIDE):, Rollback:, Validation:)

## Notes
