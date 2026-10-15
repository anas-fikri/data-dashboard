---
id: T-042
title: Pisahkan batas laju, slot, dan cache grid dari query widget
status: todo
profile: standard
goal: G-6
tags:
  - perf
  - security
depends_on:
  - T-041
created: "2026-10-15T02:30:56Z"
updated: "2026-10-15T02:30:56Z"
created_by: claude-code
---

## Objective
Bagian rencana docs/ai/plans/2026-10-15-tampilan-excel-dan-data-periode.md — P-10, Fase 2. Perkiraan 1,5 hari. Baca bagian rencana yang relevan (§3 Lihat data, §4 periode, §5 batas, §6 risiko) sebelum mulai; cek ulang kontrak T-016 (otorisasi) dan T-017 (ekspor) sesuai risiko R21.

## Acceptance criteria
- [ ] Given pengguna menggulir sampai 300 permintaan/menit, when dashboard miliknya dimuat bersamaan, then widget tidak terkena RATE_LIMITED karena aturan rate grid terpisah
- [ ] Given permintaan grid, then grid memakai maksimal 2 dari 4 slot global dan 2 in-flight per pengguna, dan blok grid tidak masuk cache hasil 64 MiB (hanya count dan ringkasan)
- [ ] Given 5 pengguna menggulir sheet 10 jt + dashboard 6 widget, then p95 widget ≤ 2× baseline T-012 dan tidak ada QUERY_BUSY pada widget

## Risk
(Required for strict profile. Impact:, Security (STRIDE):, Rollback:, Validation:)

## Notes
