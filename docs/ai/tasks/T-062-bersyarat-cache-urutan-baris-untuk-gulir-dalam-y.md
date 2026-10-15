---
id: T-062
title: (Bersyarat) Cache urutan baris untuk gulir dalam yang terurut
status: todo
profile: standard
goal: G-6
tags:
  - perf
  - query
  - conditional
depends_on:
  - T-061
created: "2026-10-15T02:30:59Z"
updated: "2026-10-15T02:30:59Z"
created_by: claude-code
---

## Objective
Bagian rencana docs/ai/plans/2026-10-15-tampilan-excel-dan-data-periode.md — P-30, Fase 4. Perkiraan 2–3 hari. Baca bagian rencana yang relevan (§3 Lihat data, §4 periode, §5 batas, §6 risiko) sebelum mulai; cek ulang kontrak T-016 (otorisasi) dan T-017 (ekspor) sesuai risiko R21.

## Acceptance criteria
- [ ] Given urut teks pada 10 jt baris, when blok dalam berikutnya diminta, then p95 ≤ 500 ms dengan memakai berkas permutasi _row (kunci: typed segmen + urut + saring)
- [ ] Given GRID_ORDER_CACHE_BYTES penuh, TTL 30 menit lewat, atau versi/revisi berganti, then entri lama dibuang dan tidak pernah dipakai untuk versi lain

## Risk
(Required for strict profile. Impact:, Security (STRIDE):, Rollback:, Validation:)

## Notes
