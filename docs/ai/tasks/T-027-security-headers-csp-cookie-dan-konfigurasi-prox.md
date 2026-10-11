---
id: T-027
title: Security headers, CSP, cookie, dan konfigurasi proxy app
status: in_review
profile: strict
profile_pinned: true
goal: G-2
tags:
  - security
depends_on:
  - T-001
created: "2026-10-11T14:56:59Z"
updated: "2026-10-11T23:46:46Z"
created_by: claude-code
workers:
  - claude-code
branch: worktree-t-001-scaffold
base: c0a7685de81287d00c275b190a2d470ad665e00a
review:
  passes:
    - "n": 1
      by: claude-security-reviewer-subagen
      at: "2026-10-11T23:44:44Z"
      findings: 2
    - "n": 2
      by: claude-security-reviewer-subagen
      at: "2026-10-11T23:46:46Z"
      findings: 1
evidence:
  check:
    cmd: npm run check
    exit_code: 0
    duration_ms: 5581
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

      {"level":40,"time":1791762193825,"service":"data-dashboard","check":"B","detail":"koneksi ditolak","msg":"health check gagal"}
      {"level":40,"time":1791762193847,"service":"data-dashboard","check":"Lambat","detail":"Lambat: timeout 20 ms","msg":"health check gagal"}

       Test Files  6 passed (6)
            Tests  46 passed (46)
         Start at  06:43:13
         Duration  521ms (tests 53%, import 27%, transform 19%, worker 2%)


      > data-dashboard@0.1.0 audit
      > npm audit --audit-level=high --omit=dev && npm audit --audit-level=critical

      found 0 vulnerabilities
      found 0 vulnerabilities
    at: "2026-10-11T23:43:15Z"
    tree: 2925087e6348aa0c55a3e792dad2eb120824739afd7a70e5a8d7b23b332aba09
  audit:
    at: "2026-10-11T23:42:46Z"
    passed: true
    tree: f31d840086b84b8dfb4827f4aeb5d99556d643894f1263d1e6b497242a6d783d
    results:
      - name: osv-scanner (dependencies, offline db)
        exit_code: 0
        summary: |-
          Scanning dir .
          Starting filesystem walk for root: /
          Scanned /Users/anasfikri/Documents/Projects/pcpexpress/data-dashboard/.claude/worktrees/t-001-scaffold/package-lock.json file and found 604 packages
          End status: 69 dirs visited, 261 inodes visited, 1 Extract calls, 39.214167ms elapsed, 39.215ms wall time
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
next.config + middleware: CSP nonce (script-src 'self' 'nonce-…' 'strict-dynamic'; style-src 'self' 'unsafe-inline' untuk ECharts/react-grid-layout; img-src/media-src/connect-src 'self' data: https://storage.<domain>; object-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'), X-Content-Type-Options nosniff, Referrer-Policy strict-origin-when-cross-origin, Permissions-Policy minimal. Cookie __Secure- HttpOnly SameSite=Lax; AUTH_URL https; AUTH_TRUST_HOST=true; serverActions.allowedOrigins=[APP_HOST]; JWT maxAge ≤ 12 jam rolling; AUTH_SECRET array untuk rotasi. /health eksternal hanya 200/503, detail hanya admin. Pino redaksi: tidak log body, token, nilai filter.

## Acceptance criteria
- [x] Given halaman mana pun di produksi, when respons diperiksa, then header CSP dengan nonce, nosniff, Referrer-Policy, frame-ancestors 'none' ada dan tidak ada inline script tanpa nonce yang diblokir di console
- [x] Given cookie sesi, when diperiksa, then berprefix __Secure-, HttpOnly, SameSite=Lax, dan JWT kedaluwarsa ≤ 12 jam
- [x] Given Server Action dipanggil dengan Origin berbeda dari APP_HOST, when dikirim, then ditolak
- [x] Given /health diakses tanpa login, when respons, then hanya status 200/503 tanpa nama layanan internal; given admin, then detail per layanan

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
- 2026-10-11T23:46:16Z Bukti: AC1 e2e security-headers.spec (CSP nonce + strict-dynamic, nosniff, Referrer-Policy, frame-ancestors di /login /register /lupa-password /health; nonce beda per permintaan; 0 pelanggaran CSP termasuk toggle tema dan shell) + scripts/smoke-prod-headers.mjs pada next start produksi: semua lolos. AC2 unit sessionCookieSpec (https → __Secure-, HttpOnly, Lax, Secure, maxAge 12 jam). AC3 e2e replay Server Action dengan Origin asing → 'Invalid Server Actions request'. AC4 e2e health.spec: tanpa sesi {status, checkedAt} saja, admin melihat 5 layanan. Review keamanan: 2 Low → diperbaiki.

## Security checklist (OWASP ASVS 4.0.3)
<!-- Check each item when verified, or write "N/A: <reason>" after the text and check it. -->
- [x] V1 Architecture: trust boundaries and the components handling sensitive data are identified for this change — diverifikasi: proxy = satu titik pemasangan CSP/HSTS + gerbang sesi; header statis via next.config
- [x] V2 Authentication: credentials are verified server-side; no default, hard-coded, or weak secrets — N/A: tidak mengubah autentikasi (cookie spec terpusat, diuji unit)
- [x] V3 Session management: session tokens are random, protected, invalidated on logout and expiry — diverifikasi: cookie __Secure- HttpOnly SameSite=Lax Secure di https, JWT ≤ 12 jam (unit sessionCookieSpec)
- [x] V4 Access control: every endpoint/action checks authorization server-side, deny by default (no IDOR) — diverifikasi: /health dan /api/health detail hanya isAdmin dari DB; matcher proxy path persis (tanpa celah awalan)
- [x] V5 Validation, sanitization and encoding: all input validated; output encoded; no injection (SQL, OS, template) — diverifikasi: CSP nonce 128-bit per permintaan + strict-dynamic; header x-nonce/CSP permintaan selalu ditimpa proxy
- [x] V6 Stored cryptography: sensitive data at rest uses approved algorithms; keys are not in the code — N/A: tidak ada data kriptografis tersimpan baru
- [x] V7 Error handling and logging: errors reveal no internals; security events are logged without secrets — diverifikasi: publik /health hanya status; tidak ada nama layanan/latensi untuk non-admin
- [x] V8 Data protection: personal/sensitive data is minimized, not cached or logged, and removable — diverifikasi: Referrer-Policy strict-origin-when-cross-origin (filter di URL tidak bocor ke storage/eksternal)
- [x] V9 Communication: TLS for all external traffic; certificates validated — diverifikasi: HSTS max-age 1 tahun + includeSubDomains saat runtime bila APP_URL https; upgrade-insecure-requests di produksi
- [x] V10 Malicious code: no backdoors, time bombs, or unexplained network calls; dependencies are trusted — diverifikasi: tanpa dependency baru; aitk audit hijau
- [x] V11 Business logic: flows cannot be abused (limits, ordering, replay, race conditions) — N/A: tidak ada alur bisnis baru
- [x] V12 Files and resources: uploads are type/size limited and stored safely; no path traversal or SSRF — N/A: tidak ada upload
- [x] V13 API and web service: API inputs/outputs are schema-validated; CORS and rate limits are deliberate — diverifikasi: Server Action Origin asing ditolak (e2e replay); X-Frame-Options DENY + frame-ancestors 'none'
- [x] V14 Configuration: secure defaults, security headers, no debug in production, dependencies up to date — diverifikasi: smoke build produksi lolos (CSP tanpa unsafe-eval, HSTS, nosniff, 0 pelanggaran CSP); relaksasi dev hanya NODE_ENV=development; .dockerignore tanpa .env
