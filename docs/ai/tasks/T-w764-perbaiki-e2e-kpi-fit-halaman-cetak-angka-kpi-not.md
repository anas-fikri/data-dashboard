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
- Diagnosis T-075 (2026-10-21, belum diperbaiki): direproduksi (--project=kpi-fit, 5 lulus, AC1 cetak
  gagal: "angka noted w4 terpotong (28 px, bawah @container …)", potongan 1 px > 0,5). Kotak yang
  memotong = kotak KPI (kpi-view.tsx, overflow-hidden, pb-3). Ukuran 28 px berasal dari batas tinggi
  `kpiHeightPx` (kpi-fit.ts: angka boleh memakai padding bawah kecuali 2 px ekor huruf, tinggi baris
  leading-tight 1,25). Dugaan: kotak isi teks (Range) font halaman cetak lebih tinggi dari 1,25 em
  sehingga cadangan 2 px kurang ± 1 px; perlu ukur ascent/descent font di halaman cetak lalu ubah rumus
  (mis. cadangan dari metrik font, bukan konstanta) + uji unit kpiHeightPx — jangan longgarkan toleransi.

