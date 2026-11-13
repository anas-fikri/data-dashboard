---
id: T-hgsz
title: 'T-zjwh lanjutan: sheet tambahan yang diabaikan karena sheet lain butuh pemetaan diberi alasan khusus; deteksi isi sheet…'
status: in_review
profile: standard
created: "2026-11-13T06:31:50Z"
updated: "2026-11-13T07:12:25Z"
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
