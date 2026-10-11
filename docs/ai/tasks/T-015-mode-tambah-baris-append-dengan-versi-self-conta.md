---
id: T-015
title: Mode tambah baris (append) dengan versi self-contained
status: todo
profile: standard
goal: G-5
depends_on:
  - T-014
created: "2026-10-11T14:45:09Z"
updated: "2026-10-11T14:45:09Z"
created_by: claude-code
---

## Objective
Mode APPEND: worker menulis raw versi baru = raw versi aktif ∪ raw file baru (satu COPY DuckDB, kolom dipetakan per nama asli, _row dilanjutkan), lalu cast dengan skema aktif seperti REPLACE; mismatch → AWAITING_MAPPING. Versi self-contained, menghapus versi lama aman.

## Acceptance criteria
- [ ] Given versi aktif 1.000 baris dan file baru 500 baris kolom sama, when APPEND selesai, then versi baru 1.500 baris dan aktif; versi lama tidak berubah
- [ ] Given versi aktif dihapus oleh retensi setelah 3 append berikutnya, when widget dibuka, then data lengkap karena versi aktif self-contained
- [ ] Given file baru APPEND dengan kolom beda nama, when ingest selesai, then AWAITING_MAPPING dan alur T-014 berlaku

## Risk
(Required for strict profile. Impact:, Security (STRIDE):, Rollback:, Validation:)

## Notes
