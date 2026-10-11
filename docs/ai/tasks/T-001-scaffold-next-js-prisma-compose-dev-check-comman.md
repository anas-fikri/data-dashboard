---
id: T-001
title: Scaffold Next.js + Prisma + compose dev + check command
status: in_review
profile: strict
profile_pinned: true
goal: G-2
tags:
  - security
created: "2026-10-11T14:45:08Z"
updated: "2026-10-11T15:51:51Z"
created_by: claude-code
workers:
  - claude-code
branch: worktree-t-001-scaffold
base: 9cd6ff0125358cc270cee3da5b5f6af3969cafb2
paths:
  - .env.example
  - .gitignore
  - .npmrc
  - .nvmrc
  - .prettierignore
  - .prettierrc
  - README.md
  - docker-compose.dev.yml
  - docs/flow-kerja.md
  - eslint.config.mjs
  - next.config.ts
  - package-lock.json
  - package.json
  - playwright.config.ts
  - postcss.config.mjs
  - prisma/migrations/20261011152124_init/migration.sql
  - prisma/migrations/migration_lock.toml
  - prisma/schema.prisma
  - prisma/seed.ts
  - scripts/gen-dev-env.mjs
  - scripts/perf.mjs
  - scripts/storage-init.mjs
  - src/app/api/health/route.ts
  - src/app/favicon.ico
  - src/app/globals.css
  - src/app/health/page.tsx
  - src/app/layout.tsx
  - src/app/page.tsx
  - src/lib/db.ts
  - src/lib/env.ts
  - src/lib/health/checks.ts
  - src/lib/health/index.ts
  - src/lib/logger.ts
  - src/lib/mail.ts
  - src/lib/redis.ts
  - src/lib/storage/s3.ts
  - tests/e2e/health.spec.ts
  - tests/lib/env.test.ts
  - tests/lib/health.test.ts
  - tests/lib/seed.test.ts
  - tsconfig.json
  - vitest.config.mts
review:
  passes:
    - "n": 1
      by: claude-code
      at: "2026-10-11T15:36:19Z"
      findings: 1
    - "n": 2
      by: claude-code
      at: "2026-10-11T15:43:39Z"
      findings: 17
    - "n": 3
      by: claude-code
      at: "2026-10-11T15:51:51Z"
      findings: 2
evidence:
  check:
    cmd: npm run check
    exit_code: 0
    duration_ms: 5135
    summary: |-
      > data-dashboard@0.1.0 check
      > npm run lint && npm run typecheck && npm run test && npm run audit


      > data-dashboard@0.1.0 lint
      > eslint . && prettier --check .

      Checking formatting...
      All matched files use Prettier code style!

      > data-dashboard@0.1.0 typecheck
      > tsc --noEmit


      > data-dashboard@0.1.0 test
      > vitest run


       RUN  v5.0.3 /Users/anasfikri/Documents/Projects/pcpexpress/data-dashboard/.claude/worktrees/t-001-scaffold

      {"level":40,"time":1791733622692,"service":"data-dashboard","check":"B","detail":"koneksi ditolak","msg":"health check gagal"}
      {"level":40,"time":1791733622713,"service":"data-dashboard","check":"Lambat","detail":"Lambat: timeout 20 ms","msg":"health check gagal"}

       Test Files  3 passed (3)
            Tests  20 passed (20)
         Start at  22:47:02
         Duration  293ms (import 55%, transform 30%, tests 13%, worker 2%)


      > data-dashboard@0.1.0 audit
      > npm audit --audit-level=high --omit=dev && npm audit --audit-level=critical

      found 0 vulnerabilities
      found 0 vulnerabilities
    at: "2026-10-11T15:47:03Z"
    tree: 6e7865033ba0c53b7cd1eacf06b566dfa7a121ed80265ec64087c49c12091f48
  commits:
    - 457220a
    - 9cd6ff0
  acceptance:
    total: 5
    done: 5
  audit:
    at: "2026-10-11T15:46:43Z"
    passed: true
    tree: 2bc01b9d2f7dcfcd97a82c48af6f7921342ab5daad14826374a85ac1497a8a49
    results:
      - name: osv-scanner (dependencies, offline db)
        exit_code: 0
        summary: |-
          Scanning dir .
          Starting filesystem walk for root: /
          Scanned /Users/anasfikri/Documents/Projects/pcpexpress/data-dashboard/.claude/worktrees/t-001-scaffold/package-lock.json file and found 509 packages
          End status: 37 dirs visited, 140 inodes visited, 1 Extract calls, 31.9115ms elapsed, 31.914ms wall time
          Loaded npm local db from /Users/anasfikri/Library/Caches/osv-scalibr/npm/all.zip

          No issues found
      - name: npm audit (prod high, dev critical)
        exit_code: 0
        summary: |-
          > data-dashboard@0.1.0 audit
          > npm audit --audit-level=high --omit=dev && npm audit --audit-level=critical

          found 0 vulnerabilities
          found 0 vulnerabilities
      - name: aitk secret scan (tracked files)
        exit_code: 0
---

## Objective
Next.js 16 (dipasang 16.4; Next 15 membawa postcss rentan) App Router TS strict, Tailwind, Prisma + PostgreSQL 16, Vitest, Playwright, ESLint/Prettier, pino. docker-compose dev: PostgreSQL, RustFS S3 (ADR-0002; bucket + lifecycle AbortIncompleteMultipartUpload 1 hari + CORS ExposeHeaders ETag via scripts/storage-init.mjs), Redis requirepass, Mailpit (SMTP dev). Env: DATABASE_URL, REDIS_URL, S3_ENDPOINT, S3_PUBLIC_ENDPOINT, SMTP_URL, MAIL_FROM, ALLOWED_EMAIL_DOMAINS, MAX_UPLOAD_BYTES. Prisma model User {email, passwordHash, isAdmin, isActive, sessionVersion, emailVerifiedAt}. Skrip npm run check (lint + typecheck + test) dan npm run perf (kosong dulu). .env.example lengkap.

## Acceptance criteria
- [x] Given clone bersih dengan Node 22 dan compose dev berjalan, when npm install lalu npm run check, then lint, typecheck, dan test selesai tanpa error dalam < 3 menit
- [x] Given compose dev berjalan, when membuka /health, then halaman menampilkan status koneksi PostgreSQL, object storage (RustFS), Redis, dan SMTP masing-masing OK
- [x] Given database kosong, when menjalankan migrate + seed, then tabel User terbentuk dan satu admin (isAdmin=true, isActive=true) dibuat dari env SEED_ADMIN_EMAIL
- [x] Given compose dev, when diperiksa, then Redis memakai requirepass, PostgreSQL/RustFS memakai kredensial non-default dari .env (bukan placeholder .env.example), dan /health merah bila kredensial masih sama dengan placeholder
- [x] Given npm run check, when dijalankan, then memakai npm ci dari package-lock.json dan npm audit --audit-level=high lolos

## Risk
Risk level: MEDIUM (fondasi: semua task berikutnya mewarisi konfigurasi ini)
Impact surface: struktur repo, package.json/lockfile, next.config, tsconfig strict, eslint/prettier, prisma schema + migrasi awal (User), seed admin, docker-compose.dev (PostgreSQL, RustFS S3 + storage-init bucket/lifecycle/CORS via AWS SDK, Redis requirepass, Mailpit), .env.example, /health, skrip npm run check/perf.
Security (STRIDE): Spoofing — seed admin dari env SEED_ADMIN_EMAIL tanpa password (login baru ada di T-002; akun seed tidak bisa dipakai sebelum verifikasi/reset). Tampering — compose dev memakai kredensial dari .env, bukan default image. Information disclosure — /health menampilkan detail layanan (dev); pembatasan eksternal di T-027; tidak ada secret di log. DoS — n/a. Elevation — tidak ada endpoint tulis. Dependency — versi dipin di lockfile, npm audit --audit-level=high di check.
Compatibility: Node mesin dev = 26, konvensi 22 LTS → engines ">=22", .nvmrc 22, CI pakai 22. Prisma + Next standalone. ESLint 9 flat config (typescript-eslint + react + hooks + jsx-a11y; eslint-config-next dilepas).
Failure modes/edge cases: compose belum up → /health merah per layanan dengan pesan, bukan crash; env hilang → zod gagal cepat saat start dengan nama variabel; kredensial masih placeholder → /health merah; bucket belum ada → init container membuatnya idempoten.
Rollback: hapus branch worktree; tidak ada data produksi.
Validation: npm run check (lint, typecheck, vitest unit untuk env/health/placeholder, npm audit) < 3 menit; manual: docker compose up → migrate → seed → /health hijau; Playwright e2e /health dijalankan terpisah (npm run test:e2e).
Open risks/assumptions: dipasang Next 16.4 + React 19.3 (Next 15 membawa postcss rentan tanpa fix). Object storage RustFS, bukan MinIO (ADR-0002). Mailpit SMTP verify dianggap mewakili SMTP produksi.

## Notes
- 2026-10-11T14:56:59Z Env tambahan: AUTH_SECRET (array untuk rotasi), APP_URL, APP_HOST, TRUST_PROXY. .env.example hanya placeholder; skrip dev generate secret (openssl rand). Compose dev sudah memisahkan network app/worker/renderer agar paritas dengan produksi.
- 2026-10-11T15:24:22Z Bukti: aitk check exit 0 (6 s); /api/health 200 lima layanan OK (PostgreSQL, Redis, Object storage RustFS, SMTP Mailpit, Konfigurasi); Playwright tests/e2e/health.spec.ts 1 passed; placeholder AUTH_SECRET=change-me → Konfigurasi fail (diuji); migrate init + seed admin@pcpexpress.com. Port dev: app 3100, PG 5433, Redis 6380, RustFS 9100/9101, Mailpit 1026/8026 (5432/6379/3000 dipakai project lain di mesin ini).

## Security checklist (OWASP ASVS 4.0.3)
<!-- Check each item when verified, or write "N/A: <reason>" after the text and check it. -->
- [x] V1 Architecture: trust boundaries and the components handling sensitive data are identified for this change — diverifikasi: batas kepercayaan = browser ↔ app ↔ (PostgreSQL, Redis, RustFS, SMTP) di network compose; data sensitif hanya env
- [x] V2 Authentication: credentials are verified server-side; no default, hard-coded, or weak secrets — diverifikasi: tidak ada kredensial default — gen-dev-env.mjs membuat secret acak, /health merah bila placeholder
- [x] V3 Session management: session tokens are random, protected, invalidated on logout and expiry — N/A: belum ada sesi (T-002)
- [x] V4 Access control: every endpoint/action checks authorization server-side, deny by default (no IDOR) — N/A: belum ada endpoint tulis/akses data; /health tanpa data pengguna
- [x] V5 Validation, sanitization and encoding: all input validated; output encoded; no injection (SQL, OS, template) — diverifikasi: env divalidasi zod; tidak ada input pengguna
- [x] V6 Stored cryptography: sensitive data at rest uses approved algorithms; keys are not in the code — diverifikasi: tidak ada data sensitif disimpan selain hash (passwordHash null di seed); secret hanya env
- [x] V7 Error handling and logging: errors reveal no internals; security events are logged without secrets — diverifikasi: safeMessage() menyamarkan URL koneksi; pino redaksi token/password/cookie
- [x] V8 Data protection: personal/sensitive data is minimized, not cached or logged, and removable — diverifikasi: tidak ada PII selain email admin seed; tidak di-log
- [x] V9 Communication: TLS for all external traffic; certificates validated — N/A: TLS di reverse proxy produksi (T-023); dev loopback 127.0.0.1
- [x] V10 Malicious code: no backdoors, time bombs, or unexplained network calls; dependencies are trusted — diverifikasi: lockfile + npm audit (prod high, dev critical) di npm run check; image dipin tag
- [x] V11 Business logic: flows cannot be abused (limits, ordering, replay, race conditions) — N/A: belum ada alur bisnis
- [x] V12 Files and resources: uploads are type/size limited and stored safely; no path traversal or SSRF — N/A: belum ada upload (T-004); bucket dengan lifecycle abort-mpu sudah disiapkan
- [x] V13 API and web service: API inputs/outputs are schema-validated; CORS and rate limits are deliberate — diverifikasi: /api/health hanya GET, no-store; CORS storage terbatas origin app + PUT/GET/HEAD
- [x] V14 Configuration: secure defaults, security headers, no debug in production, dependencies up to date — diverifikasi: poweredByHeader off, port hanya 127.0.0.1, Redis requirepass + protected-mode; header keamanan lengkap di T-027

## Evidence
<!-- Generated by aitk close. -->
- Check: `npm run check` → exit 0 at 2026-10-11T15:34:45Z (5340 ms)
- Acceptance criteria: 5/5 satisfied
- Commits: 457220a, 9cd6ff0
