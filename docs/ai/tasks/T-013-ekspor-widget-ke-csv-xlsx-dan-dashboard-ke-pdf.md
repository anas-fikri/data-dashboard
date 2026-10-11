---
id: T-013
title: Ekspor widget ke CSV/XLSX dan dashboard ke PDF
status: todo
profile: standard
goal: G-4
depends_on:
  - T-010
created: "2026-10-11T10:22:46Z"
updated: "2026-10-11T10:22:46Z"
created_by: claude-code
---

## Objective
Ekspor data widget (hasil agregasi dengan filter aktif) ke CSV dan XLSX, maksimal 1 juta baris, dibuat di server dan diunduh via tautan sementara. Ekspor dashboard ke PDF A4 landscape via render headless.

## Acceptance criteria
- [ ] Given widget tabel dengan filter aktif, when user ekspor CSV, then file berisi persis baris yang terfilter dengan header nama kolom tampilan
- [ ] Given hasil > 1 juta baris, when ekspor, then ditolak dengan saran mempersempit filter
- [ ] Given dashboard 6 widget, when ekspor PDF, then PDF berisi semua widget dengan nilai yang sama seperti di layar dan tautan unduh kedaluwarsa setelah 1 jam

## Risk
(Required for strict profile. Impact:, Security (STRIDE):, Rollback:, Validation:)

## Notes
