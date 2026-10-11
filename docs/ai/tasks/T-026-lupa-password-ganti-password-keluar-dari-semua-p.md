---
id: T-026
title: Lupa password, ganti password, keluar dari semua perangkat
status: done
profile: strict
profile_pinned: true
goal: G-2
tags:
  - security
depends_on:
  - T-002
created: "2026-10-11T14:56:58Z"
updated: "2026-10-11T23:35:25Z"
closed: "2026-10-11T23:35:25Z"
created_by: claude-code
workers:
  - claude-code
branch: worktree-t-001-scaffold
base: 5d46f4bc8d3a3fb28b91f46206013bd3b87891fb
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
  - prisma/migrations/20261011163023_verification_token/migration.sql
  - prisma/migrations/20261011225415_token_pending_password/migration.sql
  - prisma/migrations/20261011230218_token_pending_name/migration.sql
  - prisma/migrations/migration_lock.toml
  - prisma/schema.prisma
  - prisma/seed.ts
  - public/brand/mark-dark.png
  - public/brand/mark.png
  - public/brand/pcp-logo-dark.png
  - public/brand/pcp-logo.png
  - scripts/dev-expire-reset.mjs
  - scripts/dev-reset-ratelimit.mjs
  - scripts/gen-dev-env.mjs
  - scripts/perf.mjs
  - scripts/storage-init.mjs
  - src/app/(app)/admin/page.tsx
  - src/app/(app)/akun/keamanan/page.tsx
  - src/app/(app)/akun/page.tsx
  - src/app/(app)/dashboards/page.tsx
  - src/app/(app)/datasets/page.tsx
  - src/app/(app)/layout.tsx
  - src/app/(app)/page.tsx
  - src/app/(app)/panduan/page.tsx
  - src/app/(auth)/layout.tsx
  - src/app/(auth)/login/page.tsx
  - src/app/(auth)/lupa-password/page.tsx
  - src/app/(auth)/register/page.tsx
  - src/app/(auth)/reset-password/page.tsx
  - src/app/(auth)/verify/page.tsx
  - src/app/api/auth/dev-bump-session/route.ts
  - src/app/api/auth/login/route.ts
  - src/app/api/auth/me/route.ts
  - src/app/api/health/route.ts
  - src/app/globals.css
  - src/app/health/page.tsx
  - src/app/layout.tsx
  - src/app/not-found.tsx
  - src/components/auth/auth-card.tsx
  - src/components/auth/forgot-password-form.tsx
  - src/components/auth/form-alert.tsx
  - src/components/auth/login-form.tsx
  - src/components/auth/register-form.tsx
  - src/components/auth/reset-password-form.tsx
  - src/components/auth/security-settings.tsx
  - src/components/auth/use-focus-on-error.ts
  - src/components/auth/verify-form.tsx
  - src/components/shell/account-menu.tsx
  - src/components/shell/app-shell.tsx
  - src/components/shell/brand.tsx
  - src/components/shell/nav-items.ts
  - src/components/shell/sidebar-nav.tsx
  - src/components/shell/theme-toggle.tsx
  - src/components/theme-provider.tsx
  - src/components/ui/avatar.tsx
  - src/components/ui/button.tsx
  - src/components/ui/card.tsx
  - src/components/ui/dropdown-menu.tsx
  - src/components/ui/empty-state.tsx
  - src/components/ui/field.tsx
  - src/components/ui/input.tsx
  - src/components/ui/page-header.tsx
  - src/components/ui/password-input.tsx
  - src/components/ui/select.tsx
  - src/features/auth/actions.ts
  - src/features/auth/email-domain.ts
  - src/features/auth/email.ts
  - src/features/auth/form-state.ts
  - src/features/auth/jwt.ts
  - src/features/auth/password-recovery.ts
  - src/features/auth/password.ts
  - src/features/auth/rate-limit.ts
  - src/features/auth/redirect.ts
  - src/features/auth/service.ts
  - src/features/auth/session.ts
  - src/features/auth/tokens.ts
  - src/instrumentation.ts
  - src/lib/db.ts
  - src/lib/env.ts
  - src/lib/health/checks.ts
  - src/lib/health/index.ts
  - src/lib/hooks/use-persisted-boolean.ts
  - src/lib/logger.ts
  - src/lib/mail.ts
  - src/lib/redis.ts
  - src/lib/storage/s3.ts
  - src/lib/utils.ts
  - src/proxy.ts
  - src/styles/tokens.css
  - tests/e2e/auth.spec.ts
  - tests/e2e/global-setup.ts
  - tests/e2e/health.spec.ts
  - tests/e2e/helpers.ts
  - tests/e2e/password.spec.ts
  - tests/e2e/shell.spec.ts
  - tests/e2e/zz-rate-limit.spec.ts
  - tests/features/auth/core.test.ts
  - tests/features/auth/rate-limit.test.ts
  - tests/lib/env.test.ts
  - tests/lib/health.test.ts
  - tests/lib/seed.test.ts
  - tests/stubs/server-only.ts
  - tsconfig.json
  - vitest.config.mts
review:
  passes:
    - "n": 1
      by: claude-security-reviewer-subagen
      at: "2026-10-11T23:29:00Z"
      findings: 4
    - "n": 2
      by: claude-security-reviewer-subagen
      at: "2026-10-11T23:30:52Z"
      findings: 0
    - "n": 3
      by: frontend-expert-design-reviewer
      at: "2026-10-11T23:31:05Z"
      findings: 5
    - "n": 4
      by: frontend-expert-design-reviewer
      at: "2026-10-11T23:33:58Z"
      findings: 1
    - "n": 5
      by: claude-code
      at: "2026-10-11T23:35:16Z"
      findings: 0
    - "n": 6
      by: frontend-expert-design-reviewer
      at: "2026-10-11T23:35:16Z"
      findings: 0
evidence:
  check:
    cmd: npm run check
    exit_code: 0
    duration_ms: 5678
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

      {"level":40,"time":1791761715263,"service":"data-dashboard","check":"B","detail":"koneksi ditolak","msg":"health check gagal"}
      {"level":40,"time":1791761715286,"service":"data-dashboard","check":"Lambat","detail":"Lambat: timeout 20 ms","msg":"health check gagal"}

       Test Files  5 passed (5)
            Tests  39 passed (39)
         Start at  06:35:14
         Duration  528ms (tests 55%, import 25%, transform 18%, worker 1%)


      > data-dashboard@0.1.0 audit
      > npm audit --audit-level=high --omit=dev && npm audit --audit-level=critical

      found 0 vulnerabilities
      found 0 vulnerabilities
    at: "2026-10-11T23:35:16Z"
    tree: 7ed0184eb8f12519686eae80c770a497b10ecac3d87c5ea41f0ab92446a1110a
  commits:
    - 0423efd
    - 15536b5
    - 27bf134
    - 2b68a94
    - 2c5ffeb
    - 401b86a
    - 4bff118
    - 5d46f4b
    - 6c7cef8
    - 7c5267b
    - 9558d66
    - "9835114"
    - 9b2bfc6
    - 9cd6ff0
    - ab9e083
    - bec0af8
    - d9f240b
    - dbe1056
    - e1ff563
    - e56694e
    - e594327
    - f511b61
    - fbf5494
  acceptance:
    total: 4
    done: 4
  audit:
    at: "2026-10-11T23:35:03Z"
    passed: true
    tree: 7ed0184eb8f12519686eae80c770a497b10ecac3d87c5ea41f0ab92446a1110a
    results:
      - name: osv-scanner (dependencies, offline db)
        exit_code: 0
        summary: |-
          Scanning dir .
          Starting filesystem walk for root: /
          Scanned /Users/anasfikri/Documents/Projects/pcpexpress/data-dashboard/.claude/worktrees/t-001-scaffold/package-lock.json file and found 604 packages
          End status: 69 dirs visited, 255 inodes visited, 1 Extract calls, 40.638959ms elapsed, 40.64ms wall time
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
Alur lupa password: token 32 byte acak, disimpan sebagai SHA-256, kedaluwarsa 30 menit, sekali pakai, tautan dari APP_URL env (bukan Host header); respons selalu netral anti-enumerasi. Ganti password saat login (wajib password lama). Keduanya menaikkan sessionVersion. Tombol 'keluar dari semua perangkat' = sessionVersion++. Rate limit 3 permintaan/email/jam dan 20/IP/jam. Kebijakan password dari T-002 (12–128 karakter).

## Acceptance criteria
- [x] Given email terdaftar maupun tidak, when minta reset, then respons identik 'jika terdaftar, cek inbox' dan hanya email terdaftar menerima tautan
- [x] Given tautan reset, when dipakai dua kali atau setelah 30 menit, then ditolak code TOKEN_INVALID dan token tersimpan hanya berupa hash
- [x] Given user login di dua browser, when ganti password di satu browser, then browser lain diarahkan ke /login pada permintaan berikutnya
- [x] Given 4 permintaan reset untuk email yang sama dalam 1 jam, when ke-4, then code RATE_LIMITED tanpa email terkirim

## Risk
Risk level: HIGH (pemulihan akun = jalur pengambilalihan akun klasik)
Impact surface: src/features/auth/{service,actions,email,rate-limit}.ts, VerificationToken (purpose RESET_PASSWORD, sudah ada di skema), halaman /lupa-password, /reset-password, /akun/keamanan, menu akun, proxy daftar publik.
Security (STRIDE): Spoofing — token reset 32B acak, hanya SHA-256 disimpan, 30 menit, sekali pakai (updateMany usedAt:null), tautan dari APP_URL; GET tautan hanya menampilkan form (pemindai email tidak memakai token). Tampering — reset menaikkan sessionVersion dan membatalkan semua token reset lain; ganti password wajib password lama. Information disclosure — respons minta-reset identik untuk email ada/tidak/belum aktif, email dikirim di latar (timing). DoS — rate limit 3/email/jam (tanpa +tag) dan 20/IP/jam; hit sebelum kerja apa pun. Elevation — akun nonaktif tidak menerima tautan reset; akun belum terverifikasi diarahkan ke alur verifikasi (tidak menerima reset).
Compatibility: memakai service/rate-limit/session T-002; form memakai FormState/useFocusOnError/PasswordInput.
Failure modes/edge cases: token kedaluwarsa/dipakai/ bentuk salah → TOKEN_INVALID; password baru sama dengan lama → diterima (tidak membocorkan); akun seed (passwordHash null) boleh memakai reset untuk menetapkan password pertama (jalur resmi admin seed); SMTP mati → respons tetap netral, error di log.
Rollback: revert commit; tidak ada migrasi.
Validation: unit untuk pesan/kebijakan; e2e: minta reset email terdaftar & tidak (respons identik, Mailpit hanya terima untuk terdaftar), reset via tautan → login dengan password baru, tautan kedua kali → tidak berlaku, rate limit ke-4 → RATE_LIMITED tanpa email ke-4, ganti password di konteks A → konteks B 401/redirect, keluar dari semua perangkat.
Open risks/assumptions: kedaluwarsa 30 menit diuji dengan memajukan expiresAt lewat endpoint dev (E2E_ENDPOINTS) bukan menunggu.

## Notes

- 2026-10-11T23:34:56Z Bukti e2e tests/e2e/password.spec.ts (5 skenario): respons minta reset identik untuk terdaftar/tidak dan hanya terdaftar menerima email; reset → password lama ditolak, baru berlaku; tautan dipakai kedua kali / kedaluwarsa (skrip DB) → Tautan tidak berlaku; ganti password di konteks A → konteks B /api/auth/me 401 + email pemberitahuan; permintaan ke-4 → RATE_LIMITED tanpa email ke-4; domain asing ditolak; keluar semua perangkat. Review keamanan 4 Low → 0; audit desain 1H/1M/3L → 1L → diperbaiki (konfirmasi Kirim lagi).

## Security checklist (OWASP ASVS 4.0.3)
<!-- Check each item when verified, or write "N/A: <reason>" after the text and check it. -->
- [x] V1 Architecture: trust boundaries and the components handling sensitive data are identified for this change — diverifikasi: alur pemulihan memakai primitif T-002 (token hash, rate limit, sessionVersion); tidak ada endpoint HTTP dev (skrip DB)
- [x] V2 Authentication: credentials are verified server-side; no default, hard-coded, or weak secrets — diverifikasi: reset hanya untuk akun aktif + terverifikasi; ganti password wajib password lama; kebijakan 12–128; email pemberitahuan setelah kredensial berubah (V2.2.3)
- [x] V3 Session management: session tokens are random, protected, invalidated on logout and expiry — diverifikasi: reset dan ganti password sessionVersion++ (sesi lain putus); ganti password menerbitkan ulang sesi perangkat ini; keluar semua perangkat = sessionVersion++
- [x] V4 Access control: every endpoint/action checks authorization server-side, deny by default (no IDOR) — diverifikasi: changePasswordAction mengambil userId dari sesi (tanpa IDOR); /akun/keamanan requireUser
- [x] V5 Validation, sanitization and encoding: all input validated; output encoded; no injection (SQL, OS, template) — diverifikasi: email dinormalisasi + domain whitelist; token bentuk base64url 43; HTML email di-escape
- [x] V6 Stored cryptography: sensitive data at rest uses approved algorithms; keys are not in the code — diverifikasi: token reset 32B acak, hanya SHA-256 disimpan, 30 menit
- [x] V7 Error handling and logging: errors reveal no internals; security events are logged without secrets — diverifikasi: respons netral; log tanpa token/password
- [x] V8 Data protection: personal/sensitive data is minimized, not cached or logged, and removable — N/A: tidak ada PII baru
- [x] V9 Communication: TLS for all external traffic; certificates validated — diverifikasi: tautan dari APP_URL (https wajib di produksi), bukan Host header
- [x] V10 Malicious code: no backdoors, time bombs, or unexplained network calls; dependencies are trusted — diverifikasi: tanpa dependency baru; aitk audit hijau
- [x] V11 Business logic: flows cannot be abused (limits, ordering, replay, race conditions) — diverifikasi: sekali pakai atomik; token reset lain batal saat reset/ganti password; rate limit IP dihitung lebih dulu (satu IP tidak bisa mengunci banyak korban); reset melepas kunci login akun
- [x] V12 Files and resources: uploads are type/size limited and stored safely; no path traversal or SSRF — N/A: tidak ada upload
- [x] V13 API and web service: API inputs/outputs are schema-validated; CORS and rate limits are deliberate — diverifikasi: GET tautan hanya form, POST memakai token; Server Action dengan cek Origin bawaan Next
- [x] V14 Configuration: secure defaults, security headers, no debug in production, dependencies up to date — diverifikasi: endpoint dev-expire-reset dihapus; skrip dev menolak NODE_ENV=production

## Evidence
<!-- Generated by aitk close. -->
- Check: `npm run check` → exit 0 at 2026-10-11T23:35:16Z (5678 ms)
- Acceptance criteria: 4/4 satisfied
- Commits: 0423efd, 15536b5, 27bf134, 2b68a94, 2c5ffeb, 401b86a, 4bff118, 5d46f4b, 6c7cef8, 7c5267b, 9558d66, 9835114, 9b2bfc6, 9cd6ff0, ab9e083, bec0af8, d9f240b, dbe1056, e1ff563, e56694e, e594327, f511b61, fbf5494
- Review pass 1 by claude-security-reviewer-subagen: 4 findings
- Review pass 2 by claude-security-reviewer-subagen: 0 findings
- Review pass 3 by frontend-expert-design-reviewer: 5 findings
- Review pass 4 by frontend-expert-design-reviewer: 1 findings
- Review pass 5 by claude-code: 0 findings
- Review pass 6 by frontend-expert-design-reviewer: 0 findings
