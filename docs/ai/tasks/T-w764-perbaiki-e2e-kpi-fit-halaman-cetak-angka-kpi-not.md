---
id: T-w764
title: 'Perbaiki e2e kpi-fit halaman cetak: angka KPI noted w4 terpotong 1 px'
status: todo
profile: standard
created: "2026-10-21T12:34:26Z"
updated: "2026-10-21T12:34:26Z"
created_by: claude-code
---

## Objective
Ditemukan saat T-1zdf (gagal konsisten di HEAD 8ce72cf, 4/4 run): tests/e2e/kpi-fit.spec.ts "AC1: halaman cetak (viewport renderer 1047 px, media print)" — angka KPI kartu bercatatan w4 terpotong 1 px di bawah (28 px, kotak @container KPI), toleransi 0,5 px. Tentukan apakah ini bug nyata (kpiHeightPx/ukuran huruf di halaman cetak) lalu perbaiki dengan tes regresi; jangan melonggarkan toleransi.

## Acceptance criteria
- [ ] Given project kpi-fit dijalankan utuh, then tes AC1 halaman cetak lulus (potongan angka <= 0,5 px) tanpa melonggarkan toleransi

## Risk
(Required for strict profile. Impact:, Security (STRIDE):, Rollback:, Validation:)

## Notes
