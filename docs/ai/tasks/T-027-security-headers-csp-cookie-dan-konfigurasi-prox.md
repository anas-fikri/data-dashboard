---
id: T-027
title: Security headers, CSP, cookie, dan konfigurasi proxy app
status: in_progress
profile: strict
profile_pinned: true
goal: G-2
tags:
  - security
depends_on:
  - T-001
created: "2026-10-11T14:56:59Z"
updated: "2026-10-11T23:35:37Z"
created_by: claude-code
workers:
  - claude-code
branch: worktree-t-001-scaffold
base: c0a7685de81287d00c275b190a2d470ad665e00a
---

## Objective
next.config + middleware: CSP nonce (script-src 'self' 'nonce-…' 'strict-dynamic'; style-src 'self' 'unsafe-inline' untuk ECharts/react-grid-layout; img-src/media-src/connect-src 'self' data: https://storage.<domain>; object-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'), X-Content-Type-Options nosniff, Referrer-Policy strict-origin-when-cross-origin, Permissions-Policy minimal. Cookie __Secure- HttpOnly SameSite=Lax; AUTH_URL https; AUTH_TRUST_HOST=true; serverActions.allowedOrigins=[APP_HOST]; JWT maxAge ≤ 12 jam rolling; AUTH_SECRET array untuk rotasi. /health eksternal hanya 200/503, detail hanya admin. Pino redaksi: tidak log body, token, nilai filter.

## Acceptance criteria
- [ ] Given halaman mana pun di produksi, when respons diperiksa, then header CSP dengan nonce, nosniff, Referrer-Policy, frame-ancestors 'none' ada dan tidak ada inline script tanpa nonce yang diblokir di console
- [ ] Given cookie sesi, when diperiksa, then berprefix __Secure-, HttpOnly, SameSite=Lax, dan JWT kedaluwarsa ≤ 12 jam
- [ ] Given Server Action dipanggil dengan Origin berbeda dari APP_HOST, when dikirim, then ditolak
- [ ] Given /health diakses tanpa login, when respons, then hanya status 200/503 tanpa nama layanan internal; given admin, then detail per layanan

## Risk
Risk level: MEDIUM-HIGH (header salah bisa membuka XSS/clickjacking, atau sebaliknya mematikan aplikasi bila CSP terlalu ketat)
Impact surface: src/proxy.ts (nonce + CSP per permintaan), next.config.ts (header statis, serverActions.allowedOrigins), src/app/layout.tsx (nonce ke next-themes), health (detail hanya admin), cookie sesi (sudah di T-002), scripts dev admin.
Security (STRIDE): Tampering/XSS — CSP nonce + 'strict-dynamic', object-src 'none', base-uri 'self', form-action 'self'; Information disclosure — Referrer-Policy strict-origin-when-cross-origin (filter di URL tidak bocor ke storage), /health tanpa sesi hanya status; Elevation/clickjacking — frame-ancestors 'none' + X-Frame-Options DENY; CSRF — serverActions.allowedOrigins=[APP_HOST] (Next menolak Origin lain).
Compatibility: Next 16 mengambil nonce dari header Content-Security-Policy permintaan dan memasangnya di script framework; semua halaman sudah dinamis (auth). Dev butuh 'unsafe-eval' (React dev) — hanya bila NODE_ENV=development. style-src 'unsafe-inline' (ECharts/react-grid-layout memakai style inline; risiko rendah). connect-src/img-src/media-src menyertakan origin S3_PUBLIC_ENDPOINT (presigned PUT/GET, video panduan).
Failure modes/edge cases: next-themes inline script tanpa nonce akan diblokir → diberi nonce dari header; aset _next/static di luar matcher proxy tidak butuh CSP; HSTS hanya bila APP_URL https.
Rollback: revert commit.
Validation: unit buildCsp + cookie spec (https → __Secure-, HttpOnly, SameSite=Lax, Secure, maxAge ≤ 12 jam); e2e: header CSP ber-nonce + nosniff + Referrer-Policy + frame-ancestors di setiap halaman, 0 pelanggaran CSP di console (shell, auth, theme toggle); Server Action dengan Origin asing ditolak; /health & /api/health tanpa sesi hanya status, admin melihat detail; smoke build produksi (next build + start) memeriksa header.
Open risks/assumptions: uji cookie __Secure- dilakukan di level unit (dev memakai http).

## Notes

- 2026-10-11T15:44:38Z Dari review T-001: /health dan /api/health di produksi menyembunyikan field detail (publicView) — tambahkan jalur admin (requireAdmin) untuk melihat detail; cache 5 s sudah ada.

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
