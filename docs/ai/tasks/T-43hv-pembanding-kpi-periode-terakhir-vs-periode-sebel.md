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
(Required for strict profile. Impact:, Security (STRIDE):, Rollback:, Validation:)

## Notes
