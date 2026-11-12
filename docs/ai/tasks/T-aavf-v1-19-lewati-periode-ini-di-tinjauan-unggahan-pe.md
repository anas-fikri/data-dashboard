---
id: T-aavf
title: 'v1.19: ''Lewati periode ini'' di tinjauan unggahan periode — periode yang akan diganti bisa dipertahankan'
status: todo
profile: standard
created: "2026-11-12T01:35:38Z"
updated: "2026-11-12T01:53:02Z"
created_by: claude-code
review:
  passes:
    - "n": 1
      by: claude-reviewer-subagent
      at: "2026-11-12T01:53:02Z"
      findings: 1
---

## Objective
(describe the outcome in one paragraph)

## Acceptance criteria
- [ ] Setiap periode yang akan diganti punya pilihan 'Lewati periode ini': data lama tetap, baris file untuk periode itu tidak disimpan, periode lain tetap diterapkan
- [ ] Rencana/sidik menyertakan skip; Terapkan dengan rencana yang dilihat; semua dilewati → tidak bisa diterapkan (NO_CHANGE)
- [ ] Ringkasan/riwayat menyebut periode yang dilewati; panduan 15 + Yang baru

## Risk
(Required for strict profile. Impact:, Security (STRIDE):, Rollback:, Validation:)

## Notes

- 2026-11-12T01:35:38Z Dipisah dari T-rbrb (AC4) agar rilis v1.19 lebih cepat; tanpa migrasi. Kasus nyata pemilik 2026-11-11: April 2026 115.741 → 34.024 'Diganti'.
