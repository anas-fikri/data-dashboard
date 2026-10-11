---
id: T-002
title: Registrasi terbatas domain, verifikasi email, login JWT dengan sessionVersion
status: in_review
profile: strict
profile_pinned: true
goal: G-2
tags:
  - security
depends_on:
  - T-001
  - T-025
created: "2026-10-11T14:45:08Z"
updated: "2026-10-11T23:13:34Z"
created_by: claude-code
workers:
  - claude-code
branch: worktree-t-001-scaffold
base: 9558d66d0a4120de3b2e3e0b558d678f30f07434
review:
  passes:
    - "n": 1
      by: claude-security-reviewer-subagen
      at: "2026-10-11T22:54:13Z"
      findings: 14
    - "n": 2
      by: claude-security-reviewer-subagen
      at: "2026-10-11T23:02:17Z"
      findings: 5
    - "n": 3
      by: frontend-expert-design-reviewer
      at: "2026-10-11T23:03:44Z"
      findings: 12
    - "n": 4
      by: claude-security-reviewer-subagen
      at: "2026-10-11T23:11:05Z"
      findings: 0
    - "n": 5
      by: frontend-expert-design-reviewer
      at: "2026-10-11T23:13:34Z"
      findings: 5
---

## Objective
Auth.js Credentials: email + password (argon2id). Registrasi hanya domain di ALLOWED_EMAIL_DOMAINS; token verifikasi dikirim via SMTP; login ditolak sebelum emailVerifiedAt terisi. Session JWT memuat userId + sessionVersion; middleware/auth() mencocokkan isActive dan sessionVersion ke DB setiap permintaan (D1). Route non-publik redirect ke /login?next=. Rate limit login 10 gagal/IP/10 menit (Redis), IP dari X-Forwarded-For hanya bila TRUST_PROXY=true.

## Acceptance criteria
- [ ] Given email berdomain di luar whitelist, when submit registrasi, then Server Action mengembalikan code DOMAIN_NOT_ALLOWED dan tidak ada user tersimpan
- [ ] Given email domain yang diizinkan, when registrasi lalu membuka tautan verifikasi yang diambil dari Mailpit, then emailVerifiedAt terisi dan user bisa login; sebelum itu login ditolak dengan code EMAIL_NOT_VERIFIED
- [ ] Given user belum login, when membuka /datasets, then diarahkan ke /login dan setelah login kembali ke /datasets
- [ ] Given 10 percobaan login gagal dari IP yang sama dalam 10 menit, when percobaan ke-11, then Route Handler login menjawab HTTP 429 dan Server Action mengembalikan code RATE_LIMITED
- [ ] Given user login, when sessionVersion user dinaikkan di DB, then permintaan berikutnya dengan JWT lama diarahkan ke /login
- [ ] Given halaman/komponen task ini selesai, when /frontend-expert:audit dijalankan (anti-slop-design, responsive 320/768/1024/1440, accessibility), then tidak ada temuan Critical/High dan blok Conventions check (Tokens: preset project; Icons: waiver @tabler/icons-react; States loading/empty/error; Responsive; A11y) dicatat sebagai note task
- [ ] Given password < 12 atau > 128 karakter, when registrasi, then ditolak code WEAK_PASSWORD; given valid, then disimpan argon2id (m=64 MiB, t=3, p=1)
- [ ] Given /login?next=https://evil.example atau next=//evil, when login sukses, then diarahkan ke / (hanya path relatif yang diterima)
- [ ] Given email sudah terdaftar, when registrasi ulang, then respons identik 'cek inbox' dan email 'akun sudah ada' terkirim; given 'user@evilpcpexpress.com' dengan whitelist 'pcpexpress.com', then ditolak (exact match domain lowercase)
- [ ] Given Route Handler /api/* dan Server Action apa pun, when dipanggil dengan JWT yang sessionVersion-nya basi, then ditolak oleh requireUser() Node-side (bukan hanya middleware halaman)

## Risk
Risk level: HIGH (autentikasi: pintu masuk seluruh aplikasi)
Impact surface: prisma (VerificationToken, migrasi), src/features/auth/* (password, token, session JWT, rate limit, actions), src/proxy.ts (middleware), src/app/(auth)/{login,register,verify}, src/app/api/auth/*, AccountMenu logout, (app) layout/pages protected, email via SMTP.
Security (STRIDE): Spoofing — JWT HS256 dengan AUTH_SECRET ≥32B (array rotasi), cookie HttpOnly/SameSite=Lax/Secure(prod), klaim sv dicocokkan ke DB tiap permintaan (D1). Tampering — token verifikasi 32B acak, hanya hash disimpan, sekali pakai, kedaluwarsa 24 jam. Repudiation — lastLoginAt; AuditLog penuh di T-016. Information disclosure — respons registrasi/login netral (anti-enumerasi), pesan error tanpa internals, password tidak pernah di-log (pino redaksi). DoS — rate limit per IP dan per akun di Redis (login 10/10m IP, 5/15m akun; register 3/email/h, 20/IP/h; resend 3/email/h); argon2 m=64MiB dibatasi oleh rate limit. Elevation — isAdmin dibaca dari DB, bukan JWT; requireUser/requireAdmin dipanggil di setiap action/handler/page; open redirect dicegah (hanya path relatif).
Compatibility: Next 16 proxy.ts (pengganti middleware.ts) di edge hanya cek bentuk JWT; verifikasi DB di Node. getSessionUser() stub T-025 diganti implementasi nyata tanpa mengubah antarmuka shell.
Failure modes/edge cases: Redis mati → login ditolak (fail-closed) dengan pesan; SMTP mati → registrasi tetap membuat user + token, pesan 'coba kirim ulang'; passwordHash null (seed) → verifikasi dummy hash (timing konstan) → ditolak; email kapital/spasi → dinormalkan; domain subdomain/evilpcpexpress.com → exact match; token dipakai dua kali/kedaluwarsa → TOKEN_INVALID; next= absolut/'//' → '/'; sessionVersion basi → cookie dihapus + redirect.
Rollback: revert commit + prisma migrate (drop VerificationToken); tidak ada data produksi.
Validation: unit (password, token hash, JWT sign/verify/rotasi, safeNext, domain check, rate limit dengan Redis palsu, requireUser dengan prisma palsu); e2e Playwright: register → ambil tautan dari Mailpit API (8026) → verify → login → /datasets; login salah 11× → 429; sessionVersion++ via prisma → redirect; audit design-reviewer untuk halaman auth.
Open risks/assumptions: menyimpang dari D1 (Auth.js) → ADR-0003; IP klien di dev tidak tersedia (Next tidak mengekspos socket) → 'local' bila TRUST_PROXY=false.

## Notes
- 2026-10-11T14:49:24Z UI wajib lewat rantai frontend-expert: design-foundations → tokens (preset dari T-025) → (+forms/data-fetching/app-shell sesuai kebutuhan) → components → anti-slop-code → responsive → motion ringan → anti-slop-design → polish → accessibility. Skip design-direction karena arah sudah dipilih di T-025, kecuali layar baru yang ambigu. Chart via skill dataviz; filter/select pakai Select kustom dari T-025, bukan native.
- 2026-10-11T14:56:59Z Token verifikasi: 32 byte acak, simpan SHA-256, kedaluwarsa 24 jam, sekali pakai; resend dibatasi 3/email/jam; purge user belum verifikasi > 24 jam. Rate limit: per IP (X-Real-IP yang di-set proxy, bukan X-Forwarded-For append) DAN per akun (5 gagal/15 menit backoff); juga register/resend/verify. requireUser()/requireAdmin() satu helper Node-side dipanggil di SETIAP Server Action, Route Handler, layout; isAdmin dibaca dari baris DB hasil cek, bukan klaim JWT; middleware matcher mencakup /api/:path*.
- 2026-10-11T15:44:38Z Syarat dari review T-001: user dengan passwordHash null (admin seed) wajib ditolak login dengan pembandingan dummy hash agar timing konstan; AUTH_SECRET sudah array (env().AUTH_SECRET) → pakai langsung di Auth.js secret.

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
