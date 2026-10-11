---
id: T-027
title: Security headers, CSP, cookie, dan konfigurasi proxy app
status: todo
profile: strict
profile_pinned: true
goal: G-2
tags:
  - security
depends_on:
  - T-001
created: "2026-10-11T14:56:59Z"
updated: "2026-10-11T14:57:02Z"
created_by: claude-code
---

## Objective
next.config + middleware: CSP nonce (script-src 'self' 'nonce-…' 'strict-dynamic'; style-src 'self' 'unsafe-inline' untuk ECharts/react-grid-layout; img-src/media-src/connect-src 'self' data: https://storage.<domain>; object-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'), X-Content-Type-Options nosniff, Referrer-Policy strict-origin-when-cross-origin, Permissions-Policy minimal. Cookie __Secure- HttpOnly SameSite=Lax; AUTH_URL https; AUTH_TRUST_HOST=true; serverActions.allowedOrigins=[APP_HOST]; JWT maxAge ≤ 12 jam rolling; AUTH_SECRET array untuk rotasi. /health eksternal hanya 200/503, detail hanya admin. Pino redaksi: tidak log body, token, nilai filter.

## Acceptance criteria
- [ ] Given halaman mana pun di produksi, when respons diperiksa, then header CSP dengan nonce, nosniff, Referrer-Policy, frame-ancestors 'none' ada dan tidak ada inline script tanpa nonce yang diblokir di console
- [ ] Given cookie sesi, when diperiksa, then berprefix __Secure-, HttpOnly, SameSite=Lax, dan JWT kedaluwarsa ≤ 12 jam
- [ ] Given Server Action dipanggil dengan Origin berbeda dari APP_HOST, when dikirim, then ditolak
- [ ] Given /health diakses tanpa login, when respons, then hanya status 200/503 tanpa nama layanan internal; given admin, then detail per layanan

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
