---
id: T-063
title: Uji performa dan e2e siklus periode bulanan, serta runbook disk
status: todo
profile: standard
goal: G-6
tags:
  - perf
  - e2e
  - ops
depends_on:
  - T-055
  - T-056
  - T-057
  - T-058
  - T-059
  - T-023
  - T-024
created: "2026-10-15T02:30:59Z"
updated: "2026-10-15T02:30:59Z"
created_by: claude-code
---

## Objective
Bagian rencana docs/ai/plans/2026-10-15-tampilan-excel-dan-data-periode.md — P-31, Fase 4. Perkiraan 2–3 hari. Baca bagian rencana yang relevan (§3 Lihat data, §4 periode, §5 batas, §6 risiko) sebelum mulai; cek ulang kontrak T-016 (otorisasi) dan T-017 (ekspor) sesuai risiko R21.

## Acceptance criteria
- [ ] Given 24 unggahan bulanan 400 rb baris (ditambah 10 × 1 jt baris), then durasi unggahan ke-N ≤ 1,2× unggahan ke-1 dan byte objek baru per unggahan ≈ ukuran parquet periodenya, tercatat di docs/ai/perf/<task>.md
- [ ] Given retensi + GC setelah 24 unggahan, then total storage ≈ data aktif + periode yang masih dirujuk versi tersimpan, dan job invarian lolos
- [ ] Given e2e atur periode → tambah Jan, Feb → ganti Feb (lewat tinjauan) → keepPeriods=2 dengan EVICT_OLDEST → rollback → hapus → pulihkan, then KPI 'Jumlah baris' dan baris per periode sesuai di setiap langkah, dan alur REPLACE lama lolos tanpa mengubah helper
- [ ] Given backup harian T-023, then pertambahan backup per unggahan ≈ parquet periode itu, dan runbook memuat rumus ukuran disk (RustFS, cache app, tmp worker, cache urutan)

## Risk
(Required for strict profile. Impact:, Security (STRIDE):, Rollback:, Validation:)

## Notes
