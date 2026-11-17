---
id: T-v42a
title: 'Kolom filter: editor yang kolomnya baru disembunyikan pemilik mendapat INVALID tanpa petunjuk muat ulang (Low review T-…'
status: in_review
profile: standard
created: "2026-11-17T10:49:59Z"
updated: "2026-11-17T14:16:03Z"
created_by: claude-code
workers:
  - claude-code
branch: claude/cool-babbage-t5yojt
base: c303ec215484004a4709075e3ab5387d9181f0db
review:
  passes:
    - "n": 1
      by: claude-reviewer-subagent
      at: "2026-11-17T14:15:47Z"
      findings: 1
---

## Objective
Lihat judul task.

## Acceptance criteria
- [x] Editor yang menyimpan kolom filter yang baru disembunyikan pemilik mendapat petunjuk muat ulang; pesan sama untuk semua kolom tak tersedia (tanpa oracle nama tersembunyi)

## Risk
Impact: kecil, UI/pesan. Security (STRIDE): lihat checklist. Rollback: image sebelumnya. Validation: unit + e2e terkait.

## Notes

## Security checklist (OWASP ASVS 4.0.3)
<!-- Check each item when verified, or write "N/A: <reason>" after the text and check it. -->
- [x] V1 Architecture: trust boundaries and the components handling sensitive data are identified for this change — PATCH kolom filter (server)
- [x] V2 Authentication: credentials are verified server-side; no default, hard-coded, or weak secrets — N/A: autentikasi tidak berubah
- [x] V3 Session management: session tokens are random, protected, invalidated on logout and expiry — N/A: sesi tidak berubah
- [x] V4 Access control: every endpoint/action checks authorization server-side, deny by default (no IDOR) — tetap canEditWhere; pengecualian kolom tersimpan hanya pemilik
- [x] V5 Validation, sanitization and encoding: all input validated; output encoded; no injection (SQL, OS, template) — pesan galat menggemakan nama masukan, bukan nama tersembunyi; sama untuk semua kolom tak tersedia (tanpa oracle)
- [x] V6 Stored cryptography: sensitive data at rest uses approved algorithms; keys are not in the code — N/A: tanpa data tersimpan baru
- [x] V7 Error handling and logging: errors reveal no internals; security events are logged without secrets — pesan tanpa detail internal
- [x] V8 Data protection: personal/sensitive data is minimized, not cached or logged, and removable — N/A: tanpa data pribadi baru
- [x] V9 Communication: TLS for all external traffic; certificates validated — N/A: tanpa lalu lintas baru
- [x] V10 Malicious code: no backdoors, time bombs, or unexplained network calls; dependencies are trusted — tanpa dependensi/panggilan jaringan baru
- [x] V11 Business logic: flows cannot be abused (limits, ordering, replay, race conditions) — N/A
- [x] V12 Files and resources: uploads are type/size limited and stored safely; no path traversal or SSRF — N/A: tanpa file
- [x] V13 API and web service: API inputs/outputs are schema-validated; CORS and rate limits are deliberate — body divalidasi seperti sebelumnya
- [x] V14 Configuration: secure defaults, security headers, no debug in production, dependencies up to date — N/A: konfigurasi tidak berubah
