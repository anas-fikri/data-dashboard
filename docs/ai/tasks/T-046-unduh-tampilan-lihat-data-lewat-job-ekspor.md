---
id: T-046
title: Unduh tampilan Lihat data lewat job ekspor
status: todo
profile: standard
goal: G-6
tags:
  - api
  - security
  - ui
depends_on:
  - T-044
  - T-017
created: "2026-10-15T02:30:56Z"
updated: "2026-10-15T02:30:56Z"
created_by: claude-code
---

## Objective
Bagian rencana docs/ai/plans/2026-10-15-tampilan-excel-dan-data-periode.md — P-14, Fase 2. Perkiraan 2 hari. Baca bagian rencana yang relevan (§3 Lihat data, §4 periode, §5 batas, §6 risiko) sebelum mulai; cek ulang kontrak T-016 (otorisasi) dan T-017 (ekspor) sesuai risiko R21.

## Acceptance criteria
- [ ] Given saringan, urutan, dan kolom terlihat aktif, when 'Unduh tampilan' CSV/XLSX, then job T-017 menghasilkan file dengan kolom, urutan, dan baris sama dengan grid (diuji pada fixture 1.000 baris), tautan presigned berlaku 1 jam, dan AuditLog tercatat
- [ ] Given tampilan melewati batas T-017, then dialog menjelaskan batasnya (termasuk batas Excel 1.048.575 baris untuk XLSX) dan menyarankan saringan; file tidak pernah dipotong diam-diam
- [ ] Given viewer mencoba mengekspor tampilan sheet, then FORBIDDEN

## Risk
(Required for strict profile. Impact:, Security (STRIDE):, Rollback:, Validation:)

## Notes
