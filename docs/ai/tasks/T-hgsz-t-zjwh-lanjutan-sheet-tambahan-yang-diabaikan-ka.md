---
id: T-hgsz
title: 'T-zjwh lanjutan: sheet tambahan yang diabaikan karena sheet lain butuh pemetaan diberi alasan khusus; deteksi isi sheet…'
status: in_review
profile: standard
created: "2026-11-13T06:31:50Z"
updated: "2026-11-13T07:13:00Z"
created_by: claude-code
workers:
  - claude-code
branch: claude/cool-babbage-t5yojt
base: dcf39e5933767ceb20eddce3cbb1d772da10d231
review:
  passes:
    - "n": 1
      by: claude-reviewer-subagent
      at: "2026-11-13T07:12:25Z"
      findings: 1
    - "n": 2
      by: claude-reviewer-subagent
      at: "2026-11-13T07:12:52Z"
      findings: 0
---

## Objective
Layar tinjauan unggahan periode memberi alasan yang tepat untuk sheet yang diabaikan karena pemetaan kolom, dan memperingatkan sheet tergabung yang kemungkinan salinan (judul kolom + jumlah baris sama) agar baris tidak terhitung dua kali.

## Acceptance criteria
- [x] Sheet tambahan yang diabaikan karena sheet lain perlu pemetaan kolom diberi alasan khusus di layar tinjauan (bukan 'tidak cocok dengan sheet data mana pun')
- [x] Sheet tergabung dengan judul kolom + jumlah baris sama persis ditandai 'Kemungkinan salinan' di tinjauan
- [x] Rencana/periodMeta lama tanpa field baru tetap terbaca (default)

## Risk
Impact: rencana periode (field opsional ignoredForMapping, mergedSheets[].copies), ingest periode, layar tinjauan. Security (STRIDE): N/A — hanya teks peringatan dari nama sheet (dirender React, ter-escape). Rollback: versi sebelumnya; rencana dengan field baru tetap terbaca karena zod mengabaikan field tak dikenal? (versi lama: object strip → field baru dibuang, aman). Validation: uji ingest (salinan) + rencana (ignoredForMapping); aitk check.

## Notes

## Security checklist (OWASP ASVS 4.0.3)
<!-- Check each item when verified, or write "N/A: <reason>" after the text and check it. -->
- [x] V1 Architecture: trust boundaries and the components handling sensitive data are identified for this change — N/A — tidak tersentuh
- [x] V2 Authentication: credentials are verified server-side; no default, hard-coded, or weak secrets — N/A — tidak tersentuh
- [x] V3 Session management: session tokens are random, protected, invalidated on logout and expiry — N/A — tidak tersentuh
- [x] V4 Access control: every endpoint/action checks authorization server-side, deny by default (no IDOR) — N/A — tidak tersentuh
- [x] V5 Validation, sanitization and encoding: all input validated; output encoded; no injection (SQL, OS, template) — nama sheet ditampilkan lewat React (ter-escape); SQL sidik isi memakai lit() untuk path
- [x] V6 Stored cryptography: sensitive data at rest uses approved algorithms; keys are not in the code — N/A — tidak tersentuh
- [x] V7 Error handling and logging: errors reveal no internals; security events are logged without secrets — N/A — tidak tersentuh
- [x] V8 Data protection: personal/sensitive data is minimized, not cached or logged, and removable — N/A — tidak tersentuh
- [x] V9 Communication: TLS for all external traffic; certificates validated — N/A — tidak tersentuh
- [x] V10 Malicious code: no backdoors, time bombs, or unexplained network calls; dependencies are trusted — N/A — tidak tersentuh
- [x] V11 Business logic: flows cannot be abused (limits, ordering, replay, race conditions) — hanya peringatan, unggahan tidak diblokir
- [x] V12 Files and resources: uploads are type/size limited and stored safely; no path traversal or SSRF — membaca parquet lokal worker sendiri
- [x] V13 API and web service: API inputs/outputs are schema-validated; CORS and rate limits are deliberate — N/A — tidak tersentuh
- [x] V14 Configuration: secure defaults, security headers, no debug in production, dependencies up to date — N/A — tidak tersentuh
