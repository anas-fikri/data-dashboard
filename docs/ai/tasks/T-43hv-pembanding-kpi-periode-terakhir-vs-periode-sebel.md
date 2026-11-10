---
id: T-43hv
title: 'Pembanding KPI: periode terakhir vs periode sebelumnya / tahun lalu'
status: in_progress
profile: standard
tags:
  - widgets
  - query
created: "2026-11-10T03:55:58Z"
updated: "2026-11-10T03:55:59Z"
created_by: claude-code
workers:
  - claude-code
branch: claude/cool-babbage-t5yojt
base: 7809c7d015c841c053be1d0020a067f3527ec4d8
---

## Objective
KPI bisa menampilkan nilainya untuk periode terakhir (hari/minggu/bulan/kuartal/tahun) pada kolom tanggal pilihan, dibandingkan periode sebelumnya atau periode yang sama tahun lalu: ▲/▼ persen berwarna sesuai penilaian (naik baik / turun baik), di layar dan PDF, mengikuti filter dashboard.

## Acceptance criteria
- [ ] Given KPI dengan pembanding (kolom tanggal, periode Bulan, vs periode sebelumnya), when dashboard dibuka, then nilai = agregat bulan terakhir di data yang lolos filter, dan baris pembanding menampilkan ▲/▼ persen + nilai bulan sebelumnya beserta labelnya (mis. 'vs Okt 2026')
- [ ] Given pembanding 'periode sama tahun lalu', when dihitung, then periode pembanding = periode terakhir dikurangi satu tahun; tanpa data pembanding → 'tidak ada data <periode>' tanpa persen; nilai pembanding 0 → selisih angka, bukan persen tak hingga
- [ ] Given penilaian KPI naik baik/turun baik (atau bawaan dashboard), when nilai naik/turun, then warna ▲/▼ hijau/merah sesuai arah; Tanpa warna → netral
- [ ] Given kolom tanggal dihapus/diganti saat versi data baru, when diaktifkan, then pembanding ikut dipetakan atau ditandai kolom hilang; kolom bukan tanggal ditolak saat simpan

## Risk
Impact: spec KPI compare (spec.ts, remap.ts), widgetPlan kpi (widget.ts: kolom tanggal wajib), buildPeriodBoundsSql (sql.ts), runKpiCompare (service.ts: 3 query kecil, cache per batas/periode), tipe KpiCompareData (query/spec.ts), UI kpi-compare.ts, kpi-view.tsx, kpi-fit.ts (baris tambahan), kpi-compare-fields.tsx, status-fields.tsx (petunjuk).
Security (STRIDE): kolom tanggal pembanding bagian columnsOf widget (D6, dipilih pemilik/editor); identifier SQL dari program (c<pos>, grain dari enum, INTERVAL tetap), nilai filter tetap berparameter; kunci cache memuat spec + kolom/periode/pembanding + filter dashboard; DoS — +2 query kecil per KPI berpembanding, di antrean DuckDB yang sama.
Rollback: image v1.14.0 — KPI berpembanding tampil 'Pengaturan widget tidak valid' (skema strict) sampai roll-forward; data tetap; tanpa migrasi.
Validation: widget-query.test.ts (Maret vs Februari, filter dashboard menentukan periode, tahun lalu tanpa data, kolom bukan tanggal ditolak), kpi-compare.test.ts, drill.test.ts (KpiView), remap.test.ts, e2e kpi-drill (UI + warna + filter + ponsel/axe), suite e2e per proyek.

## Notes
