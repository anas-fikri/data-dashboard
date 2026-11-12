---
id: T-aavf
title: 'v1.19: ''Lewati periode ini'' di tinjauan unggahan periode — periode yang akan diganti bisa dipertahankan'
status: in_progress
profile: standard
created: "2026-11-12T01:35:38Z"
updated: "2026-11-12T02:48:42Z"
created_by: claude-code
workers:
  - claude-code
branch: claude/cool-babbage-t5yojt
base: ba2909986617becf15c995470de9533293870aa8
review:
  passes:
    - "n": 1
      by: claude-reviewer-subagent
      at: "2026-11-12T01:53:02Z"
      findings: 1
    - "n": 2
      by: claude-reviewer-subagent
      at: "2026-11-12T02:05:11Z"
      findings: 0
---

## Objective
(describe the outcome in one paragraph)

## Acceptance criteria
- [x] Setiap periode yang akan diganti punya pilihan 'Lewati periode ini': data lama tetap, baris file untuk periode itu tidak disimpan, periode lain tetap diterapkan
- [x] Rencana/sidik menyertakan skip; Terapkan dengan rencana yang dilihat; semua dilewati → tidak bisa diterapkan (NO_CHANGE)
- [x] Ringkasan/riwayat menyebut periode yang dilewati; panduan 15 + Yang baru

## Risk
(Required for strict profile. Impact:, Security (STRIDE):, Rollback:, Validation:)

## Notes

- 2026-11-12T01:35:38Z Dipisah dari T-rbrb (AC4) agar rilis v1.19 lebih cepat; tanpa migrasi. Kasus nyata pemilik 2026-11-11: April 2026 115.741 → 34.024 'Diganti'.
