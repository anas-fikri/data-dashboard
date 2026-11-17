---
id: T-rq35
title: 'Drawer ponsel: tautan Detail kartu Server saat sudah di Admin › Sumber daya tidak menutup drawer (Low review T-h807, su…'
status: in_review
profile: standard
created: "2026-11-17T13:53:46Z"
updated: "2026-11-17T14:16:03Z"
created_by: claude-code
workers:
  - claude-code
branch: claude/cool-babbage-t5yojt
base: 3b545e03522c0f6b39ae0acb5dff8a35ea6ccd5c
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
- [x] Tautan Detail di drawer ponsel menutup drawer walau sudah di Admin › Sumber daya; fokus kembali ke tombol menu; klik bertombol pengubah tidak menutup

## Risk
Impact: kecil, UI/pesan. Security (STRIDE): lihat checklist. Rollback: image sebelumnya. Validation: unit + e2e terkait.

## Notes

## Security checklist (OWASP ASVS 4.0.3)
<!-- Check each item when verified, or write "N/A: <reason>" after the text and check it. -->
- [x] V1 Architecture: trust boundaries and the components handling sensitive data are identified for this change — hanya UI drawer/kartu Server (klien)
- [x] V2 Authentication: credentials are verified server-side; no default, hard-coded, or weak secrets — N/A: autentikasi tidak berubah
- [x] V3 Session management: session tokens are random, protected, invalidated on logout and expiry — N/A: sesi tidak berubah
- [x] V4 Access control: every endpoint/action checks authorization server-side, deny by default (no IDOR) — N/A: tautan Detail tetap ke halaman admin yang dijaga requireAdmin
- [x] V5 Validation, sanitization and encoding: all input validated; output encoded; no injection (SQL, OS, template) — N/A: tanpa input baru
- [x] V6 Stored cryptography: sensitive data at rest uses approved algorithms; keys are not in the code — N/A: tanpa data tersimpan baru
- [x] V7 Error handling and logging: errors reveal no internals; security events are logged without secrets — N/A
- [x] V8 Data protection: personal/sensitive data is minimized, not cached or logged, and removable — N/A: tanpa data pribadi baru
- [x] V9 Communication: TLS for all external traffic; certificates validated — N/A: tanpa lalu lintas baru
- [x] V10 Malicious code: no backdoors, time bombs, or unexplained network calls; dependencies are trusted — tanpa dependensi/panggilan jaringan baru
- [x] V11 Business logic: flows cannot be abused (limits, ordering, replay, race conditions) — N/A
- [x] V12 Files and resources: uploads are type/size limited and stored safely; no path traversal or SSRF — N/A: tanpa file
- [x] V13 API and web service: API inputs/outputs are schema-validated; CORS and rate limits are deliberate — N/A: tanpa API baru
- [x] V14 Configuration: secure defaults, security headers, no debug in production, dependencies up to date — N/A: konfigurasi tidak berubah
