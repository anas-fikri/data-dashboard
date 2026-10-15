---
id: T-061
title: Ukur performa dan beban Lihat data pada 10 jt baris
status: todo
profile: standard
goal: G-6
tags:
  - perf
depends_on:
  - T-044
  - T-042
  - T-023
  - T-024
created: "2026-10-15T02:30:59Z"
updated: "2026-10-15T02:30:59Z"
created_by: claude-code
---

## Objective
Bagian rencana docs/ai/plans/2026-10-15-tampilan-excel-dan-data-periode.md — P-29, Fase 4. Perkiraan 2 hari. Baca bagian rencana yang relevan (§3 Lihat data, §4 periode, §5 batas, §6 risiko) sebelum mulai; cek ulang kontrak T-016 (otorisasi) dan T-017 (ekspor) sesuai risiko R21.

## Acceptance criteria
- [ ] Given profil T-023 dan fixture 10 jt × 30 kolom dengan cache hangat, when npm run perf skenario grid dijalankan, then laporan mencatat p95 blok tanpa urut ≤ 300 ms server / ≤ 500 ms tampil, blok pertama urut/saring ≤ 3 detik, 'Ke baris' ≤ 1 detik, dan waktu blok dalam urut teks
- [ ] Given 5 pengguna menggulir + dashboard 6 widget, then p95 widget ≤ 2× baseline, tanpa QUERY_TIMEOUT/QUERY_BUSY pada widget
- [ ] Given fixture 13 jt baris, then angka yang sama tercatat sebagai dasar keputusan menaikkan PERIOD_SHEET_MAX_ROWS
- [ ] Given blok dalam terurut p95 > 2 detik, then P-30 diaktifkan; bila tidak, P-30 ditutup tanpa dikerjakan

## Risk
(Required for strict profile. Impact:, Security (STRIDE):, Rollback:, Validation:)

## Notes
