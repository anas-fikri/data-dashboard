---
id: T-q8vr
title: 'T-r5tm lanjutan: alarm worker — lock bisa kedaluwarsa saat SMTP lambat; worker crash-loop tidak memicu alarm'
status: in_review
profile: standard
created: "2026-11-13T04:44:33Z"
updated: "2026-11-13T05:56:28Z"
created_by: claude-code
workers:
  - claude-code
branch: claude/cool-babbage-t5yojt
base: 92ee2167e0c44e5c14ba489fad8cabd1ccf0d87f
review:
  passes:
    - "n": 1
      by: claude-reviewer-subagent
      at: "2026-11-13T05:56:00Z"
      findings: 1
    - "n": 2
      by: claude-reviewer-subagent
      at: "2026-11-13T05:56:22Z"
      findings: 0
---

## Objective
Alarm worker mati (T-r5tm) tidak mengirim email ganda saat SMTP lambat dan tetap menyala untuk worker yang crash-loop.

## Acceptance criteria
- [x] Status alarm disimpan sebelum email dikirim; email gagal memulihkan status lama — SMTP lambat tidak menghasilkan email ganda antar proses
- [x] Worker crash-loop (hidup sebentar lalu mati lagi) tetap memicu alarm setelah 10 menit; pulih hanya setelah worker hidup stabil 10 menit

## Risk
Impact: hanya logika alarm email di app produksi; email pulih kini tertunda 10 menit (stabil). Security (STRIDE): DoS email — dibatasi status tersimpan sebelum kirim + ulang 6 jam. Rollback: versi sebelumnya (status Redis kompatibel: field upSince diabaikan). Validation: uji unit keputusan termasuk crash-loop; aitk check.

## Notes

## Security checklist (OWASP ASVS 4.0.3)
<!-- Check each item when verified, or write "N/A: <reason>" after the text and check it. -->
- [x] V1 Architecture: trust boundaries and the components handling sensitive data are identified for this change — N/A — tidak tersentuh (hanya logika alarm email internal)
- [x] V2 Authentication: credentials are verified server-side; no default, hard-coded, or weak secrets — N/A — tidak tersentuh (hanya logika alarm email internal)
- [x] V3 Session management: session tokens are random, protected, invalidated on logout and expiry — N/A — tidak tersentuh (hanya logika alarm email internal)
- [x] V4 Access control: every endpoint/action checks authorization server-side, deny by default (no IDOR) — N/A — tidak tersentuh (hanya logika alarm email internal)
- [x] V5 Validation, sanitization and encoding: all input validated; output encoded; no injection (SQL, OS, template) — N/A — tidak tersentuh (hanya logika alarm email internal)
- [x] V6 Stored cryptography: sensitive data at rest uses approved algorithms; keys are not in the code — N/A — tidak tersentuh (hanya logika alarm email internal)
- [x] V7 Error handling and logging: errors reveal no internals; security events are logged without secrets — log tanpa rahasia
- [x] V8 Data protection: personal/sensitive data is minimized, not cached or logged, and removable — email hanya ke admin aktif, isi generik
- [x] V9 Communication: TLS for all external traffic; certificates validated — N/A — tidak tersentuh (hanya logika alarm email internal)
- [x] V10 Malicious code: no backdoors, time bombs, or unexplained network calls; dependencies are trusted — tanpa dependensi baru
- [x] V11 Business logic: flows cannot be abused (limits, ordering, replay, race conditions) — email dibatasi status tersimpan sebelum kirim + ulang 6 jam
- [x] V12 Files and resources: uploads are type/size limited and stored safely; no path traversal or SSRF — N/A — tidak tersentuh (hanya logika alarm email internal)
- [x] V13 API and web service: API inputs/outputs are schema-validated; CORS and rate limits are deliberate — N/A — tidak tersentuh (hanya logika alarm email internal)
- [x] V14 Configuration: secure defaults, security headers, no debug in production, dependencies up to date — N/A — tidak tersentuh (hanya logika alarm email internal)
