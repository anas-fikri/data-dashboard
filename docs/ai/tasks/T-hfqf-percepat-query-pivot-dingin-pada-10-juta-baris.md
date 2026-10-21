---
id: T-hfqf
title: Percepat query pivot dingin pada 10 juta baris
status: todo
profile: standard
goal: G-7
tags:
  - perf
created: "2026-10-21T19:46:58Z"
updated: "2026-10-21T19:46:58Z"
created_by: claude-code
---

## Objective
T-075 (docs/ai/perf/T-075.md): di kontainer 4 vCPU dengan setelan produksi, p95 pivot tanpa cache 10 jt baris = 4,6 s (2×3 lama), 8,1–8,2 s (4×8), 10,4–10,8 s (4×8 + Top N + terhitung); dashboard 6 widget terikat satu pivot tersimpan dingin ± 12 s (cache hit 2–6 ms). Target AC2 T-075 p95 ≤ 3 s hanya terpenuhi untuk cache hangat. Opsi (perlu ADR, perubahan arsitektur): pemanasan cache hasil widget setelah aktivasi versi/simpan pivot tersimpan (worker), satu agregat dasar per pivot tersimpan dipakai bersama widget terikat (grafik/KPI/tabel = turunan), atau parquet pra-agregat per pivot tersimpan. Ukur dulu di olympus (npm run perf -- pivot-lanjutan) sebelum memilih.

## Acceptance criteria
- [ ] Given npm run perf -- pivot-lanjutan 10000000 di profil T-023, then p95 dingin pivot 4×8 + Top N ≤ 3 s atau keputusan pemilik tercatat di ADR

## Risk
(Required for strict profile. Impact:, Security (STRIDE):, Rollback:, Validation:)

## Notes
