---
id: T-qrxf
title: 'Kepala kartu: ukur ulang lencana saat jenis pointer/font berubah dan batasi render sinkron'
status: todo
profile: standard
depends_on:
  - T-2jwv
created: "2026-10-17T11:16:27Z"
updated: "2026-10-17T11:16:27Z"
created_by: claude-code
---

## Objective
(describe the outcome in one paragraph)

## Acceptance criteria
- [ ] Given pointer berubah (any-pointer coarse ↔ fine) atau font web selesai dimuat tanpa kartu berubah ukuran, when lencana tampil, then judul tetap ≥ 4rem (lencana diukur ulang)
- [ ] Given ±50 kartu grafik melewati ambang lebar bersamaan (buka/tutup bilah samping), when lencana diukur ulang, then render sinkron hanya menyentuh komponen lencana (bukan seluruh isi kartu) dan tidak ada galat 'ResizeObserver loop'

## Risk
(Required for strict profile. Impact:, Security (STRIDE):, Rollback:, Validation:)

## Notes
