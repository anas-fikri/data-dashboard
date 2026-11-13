---
id: T-tyb1
title: Temuan Low review v1.15 (pembanding KPI + klik-tembus)
status: in_progress
profile: standard
tags:
  - widgets
created: "2026-11-10T04:56:45Z"
updated: "2026-11-13T14:44:39Z"
created_by: claude-code
workers:
  - claude-code
branch: claude/cool-babbage-t5yojt
base: f5246f00ce1bab4a89610c53fe3e2b81575cba7d
---

## Objective
Sisa temuan Low review v1.15 (subagen, putaran 1) yang tidak memblokir rilis: kolom klik-tembus/pembanding yang disembunyikan setelah disimpan memblokir simpan otomatis widget dengan pesan umum (perlu tombol perbaiki/buang otomatis seperti kolom tabel); petunjuk filter silang dashboard masih 'pilih kategori…' untuk grafik berklik-tembus; panel Angka tidak menyebut bahwa warna ▲/▼ mengikuti penilaian bawaan dashboard; periode terakhir biasanya belum penuh (pertimbangkan catatan 's.d. <tanggal>' atau membandingkan rentang hari yang sama); 3 query pembanding bisa digabung.

## Acceptance criteria
- [x] Given kolom klik-tembus atau kolom tanggal pembanding disembunyikan setelah disimpan, when panel widget dibuka, then ada tindakan perbaikan (buang kolom / matikan) dan simpan otomatis tidak diam-diam terhenti
- [x] Given grafik berklik-tembus, when petunjuk filter silang tampil, then teksnya menyebut klik membuka baris data (dan saring lewat tombol di tabel itu)
- [x] Given Angka berpembanding tanpa penilaian sendiri dan dashboard punya penilaian bawaan, when panel dibuka, then petunjuk menyebut warna ▲/▼ mengikuti penilaian bawaan dashboard
- [x] Given periode terakhir belum penuh, when KPI berpembanding tampil, then label/keterangan menjelaskan rentang yang dibandingkan (keputusan desain dicatat)

## Risk
Impact: panel widget (perbaikan kolom klik-tembus/pembanding, petunjuk warna), petunjuk filter silang, query batas periode KPI (+1 kolom tanggal terakhir), teks pembanding KPI. Security: N/A (tanpa input/endpoint baru). Rollback: versi sebelumnya (field latest opsional). Validation: uji unit widget-config, kpi-compare, widget-query (DuckDB); aitk check.

## Notes
- 2026-11-10T05:01:05Z Dari review v1.15 r2: file ekspor KPI berpembanding belum menyebut periodenya (tambah kolom/label periode).
- 2026-11-13T14:44:39Z Keputusan desain AC4: tetap membandingkan periode pembanding penuh dengan periode berjalan; keterangan 's.d. <tanggal data terakhir>' di baris pembanding + kalimat lengkap (title/pembaca layar). Membandingkan rentang hari yang sama ditunda (mengubah angka yang sudah dipakai pemilik). Catatan ekspor KPI tanpa label periode: tidak dikerjakan (Low).
