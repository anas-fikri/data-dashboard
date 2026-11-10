---
id: T-tyb1
title: Temuan Low review v1.15 (pembanding KPI + klik-tembus)
status: todo
profile: standard
tags:
  - widgets
created: "2026-11-10T04:56:45Z"
updated: "2026-11-10T04:57:15Z"
created_by: claude-code
---

## Objective
Sisa temuan Low review v1.15 (subagen, putaran 1) yang tidak memblokir rilis: kolom klik-tembus/pembanding yang disembunyikan setelah disimpan memblokir simpan otomatis widget dengan pesan umum (perlu tombol perbaiki/buang otomatis seperti kolom tabel); petunjuk filter silang dashboard masih 'pilih kategori…' untuk grafik berklik-tembus; panel Angka tidak menyebut bahwa warna ▲/▼ mengikuti penilaian bawaan dashboard; periode terakhir biasanya belum penuh (pertimbangkan catatan 's.d. <tanggal>' atau membandingkan rentang hari yang sama); 3 query pembanding bisa digabung.

## Acceptance criteria
- [ ] Given kolom klik-tembus atau kolom tanggal pembanding disembunyikan setelah disimpan, when panel widget dibuka, then ada tindakan perbaikan (buang kolom / matikan) dan simpan otomatis tidak diam-diam terhenti
- [ ] Given grafik berklik-tembus, when petunjuk filter silang tampil, then teksnya menyebut klik membuka baris data (dan saring lewat tombol di tabel itu)
- [ ] Given Angka berpembanding tanpa penilaian sendiri dan dashboard punya penilaian bawaan, when panel dibuka, then petunjuk menyebut warna ▲/▼ mengikuti penilaian bawaan dashboard
- [ ] Given periode terakhir belum penuh, when KPI berpembanding tampil, then label/keterangan menjelaskan rentang yang dibandingkan (keputusan desain dicatat)

## Risk
(Required for strict profile. Impact:, Security (STRIDE):, Rollback:, Validation:)

## Notes
