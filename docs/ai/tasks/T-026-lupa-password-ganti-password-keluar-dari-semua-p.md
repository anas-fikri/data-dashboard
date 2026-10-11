---
id: T-026
title: Lupa password, ganti password, keluar dari semua perangkat
status: in_review
profile: strict
profile_pinned: true
goal: G-2
tags:
  - security
depends_on:
  - T-002
created: "2026-10-11T14:56:58Z"
updated: "2026-10-11T23:31:05Z"
created_by: claude-code
workers:
  - claude-code
branch: worktree-t-001-scaffold
base: 5d46f4bc8d3a3fb28b91f46206013bd3b87891fb
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
evidence:
  audit:
    at: "2026-10-11T23:30:20Z"
    passed: true
    tree: 416b74613e989e35e0ed5baa7efcf3c5ff4291e488d63a717a7083a4495b691f
    results:
      - name: osv-scanner (dependencies, offline db)
        exit_code: 0
        summary: |-
          Scanning dir .
          Starting filesystem walk for root: /
          Scanned /Users/anasfikri/Documents/Projects/pcpexpress/data-dashboard/.claude/worktrees/t-001-scaffold/package-lock.json file and found 604 packages
          End status: 69 dirs visited, 255 inodes visited, 1 Extract calls, 40.891791ms elapsed, 40.892ms wall time
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
- [ ] Given email terdaftar maupun tidak, when minta reset, then respons identik 'jika terdaftar, cek inbox' dan hanya email terdaftar menerima tautan
- [ ] Given tautan reset, when dipakai dua kali atau setelah 30 menit, then ditolak code TOKEN_INVALID dan token tersimpan hanya berupa hash
- [ ] Given user login di dua browser, when ganti password di satu browser, then browser lain diarahkan ke /login pada permintaan berikutnya
- [ ] Given 4 permintaan reset untuk email yang sama dalam 1 jam, when ke-4, then code RATE_LIMITED tanpa email terkirim

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
