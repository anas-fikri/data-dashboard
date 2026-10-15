---
id: T-037
title: Baca daftar segmen di lapisan query dan cache parquet
status: todo
profile: standard
goal: G-6
tags:
  - query
  - perf
depends_on:
  - T-036
created: "2026-10-15T02:30:55Z"
updated: "2026-10-15T02:30:55Z"
created_by: claude-code
---

## Objective
Bagian rencana docs/ai/plans/2026-10-15-tampilan-excel-dan-data-periode.md — P-5, Fase 1. Perkiraan 4–5 hari. Baca bagian rencana yang relevan (§3 Lihat data, §4 periode, §5 batas, §6 risiko) sebelum mulai; cek ulang kontrak T-016 (otorisasi) dan T-017 (ekspor) sesuai risiko R21.

## Acceptance criteria
- [ ] Given sheet dengan 1 dan 24 segmen, when semua jenis widget, filter-values, sampel skema, dan count dijalankan, then hasil identik dengan satu file gabungan dan baseline T-009/T-011 tidak memburuk > 10%
- [ ] Given cache dingin pada sheet 24 segmen, when dashboard dibuka, then semua kunci disewa dalam satu admission (batch lease) tanpa QUERY_BUSY berulang, dan batas unduhan bersamaan tetap berlaku
- [ ] Given segmen dengan set kolom berbeda, then query memproyeksikan NULL AS c<pos>, dan kunci cache hasil tetap memuat versionId
- [ ] Given versi baru aktif dengan satu segmen tambahan, then hanya segmen baru yang di-prefetch ke cache lokal app

## Risk
(Required for strict profile. Impact:, Security (STRIDE):, Rollback:, Validation:)

## Notes
