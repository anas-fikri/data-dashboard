---
id: T-047
title: Tampilkan widget tabel layar penuh ('Perbesar') untuk viewer
status: todo
profile: standard
goal: G-6
tags:
  - ui
  - security
depends_on:
  - T-043
  - T-016
created: "2026-10-15T02:30:56Z"
updated: "2026-10-15T02:30:56Z"
created_by: claude-code
---

## Objective
Bagian rencana docs/ai/plans/2026-10-15-tampilan-excel-dan-data-periode.md — P-15, Fase 2. Perkiraan 1,5 hari. Baca bagian rencana yang relevan (§3 Lihat data, §4 periode, §5 batas, §6 risiko) sebelum mulai; cek ulang kontrak T-016 (otorisasi) dan T-017 (ekspor) sesuai risiko R21.

## Acceptance criteria
- [ ] Given viewer dashboard bersama, when 'Perbesar' pada widget tabel, then tabel layar penuh bergaya lembar kerja memakai /api/query {widgetId, dashboardFilters, page, sort} yang sama, hanya dengan kolom widget, tanpa tautan Lihat data
- [ ] Given viewer membuka URL Lihat data atau endpoint sheet secara langsung, then ditolak tanpa menampilkan nama kolom tersembunyi atau lama
- [ ] Given pemilik/editor, when 'Perbesar', then tersedia tautan 'Buka di Lihat data'

## Risk
(Required for strict profile. Impact:, Security (STRIDE):, Rollback:, Validation:)

## Notes
