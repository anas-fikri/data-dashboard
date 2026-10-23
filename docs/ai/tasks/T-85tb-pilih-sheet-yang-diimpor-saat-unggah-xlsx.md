---
id: T-85tb
title: Pilih sheet yang diimpor saat unggah xlsx
status: in_progress
profile: standard
tags:
  - ui
created: "2026-10-23T11:22:17Z"
updated: "2026-10-23T15:07:49Z"
created_by: claude-code
workers:
  - claude-code
branch: claude/intelligent-albattani-fd1va8
base: 9c9b2f28c09b11e0d5f878e895a158ef3714a1c2
---

## Objective
(describe the outcome in one paragraph)

## Acceptance criteria
- [ ] Setelah file xlsx diunggah, pemilik memilih sheet yang diimpor (centang per sheet + Pilih semua) dengan saran: pilih hanya sheet berisi data (bukan ringkasan/pivot/grafik)
- [ ] Sheet yang tidak dipilih tidak di-ingest (hemat waktu dan kuota); versi pengganti tetap memetakan widget ke sheet yang dipilih
- [ ] CSV tidak berubah (satu sheet)

## Risk
(Required for strict profile. Impact:, Security (STRIDE):, Rollback:, Validation:)

## Notes

- 2026-10-23T12:01:42Z Rencana: docs/ai/plans/2026-10-23-pilih-sheet-unggah.md (baca daftar sheet di browser, kolom selectedSheets, worker onlySheets, picker; mode periode di luar v1).
