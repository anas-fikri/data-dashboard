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
- 2026-10-21 (T-061): **diaktifkan** — blok dalam urut teks p95 6,0 s (10 jt) / 7,9 s (13 jt) > 2 s
  (docs/ai/perf/T-061.md). Perhatian: dari ±5,5 s itu hanya ±3–3,5 s tahap urut `ids`; tahap ambil isi
  `WHERE _row IN (ids)` ±2 s (dekompresi 30 kolom di hampir semua row group untuk 200 baris acak) tetap ada
  walau permutasi di-cache, jadi target ≤ 500 ms butuh juga memangkas kolom yang diambil (mis. hanya kolom di
  viewport) atau menyimpan baris hasil dalam urutan permutasi. Ukur dengan `npm run perf -- grid --only "urut teks dalam"`.
