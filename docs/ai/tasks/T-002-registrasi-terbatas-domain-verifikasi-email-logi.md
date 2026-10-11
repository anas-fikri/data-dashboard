---
id: T-002
title: Registrasi terbatas domain, verifikasi email, login JWT dengan sessionVersion
status: todo
profile: strict
profile_pinned: true
goal: G-2
tags:
  - security
depends_on:
  - T-001
  - T-025
created: "2026-10-11T14:45:08Z"
updated: "2026-10-11T14:57:00Z"
created_by: claude-code
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
(Required for strict profile. Impact:, Security (STRIDE):, Rollback:, Validation:)

## Notes
- 2026-10-11T14:49:24Z UI wajib lewat rantai frontend-expert: design-foundations → tokens (preset dari T-025) → (+forms/data-fetching/app-shell sesuai kebutuhan) → components → anti-slop-code → responsive → motion ringan → anti-slop-design → polish → accessibility. Skip design-direction karena arah sudah dipilih di T-025, kecuali layar baru yang ambigu. Chart via skill dataviz; filter/select pakai Select kustom dari T-025, bukan native.
- 2026-10-11T14:56:59Z Token verifikasi: 32 byte acak, simpan SHA-256, kedaluwarsa 24 jam, sekali pakai; resend dibatasi 3/email/jam; purge user belum verifikasi > 24 jam. Rate limit: per IP (X-Real-IP yang di-set proxy, bukan X-Forwarded-For append) DAN per akun (5 gagal/15 menit backoff); juga register/resend/verify. requireUser()/requireAdmin() satu helper Node-side dipanggil di SETIAP Server Action, Route Handler, layout; isAdmin dibaca dari baris DB hasil cek, bukan klaim JWT; middleware matcher mencakup /api/:path*.

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
