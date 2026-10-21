---
id: T-076
title: Dokumentasikan pivot lanjutan untuk pengguna, siapkan UAT dan rilis minor
status: todo
profile: standard
profile_pinned: true
goal: G-7
tags:
  - docs
depends_on:
  - T-075
created: "2026-10-21T10:24:17Z"
updated: "2026-10-21T10:24:17Z"
created_by: claude-code
---

## Objective
Perbarui project-context, decisions (D17 pivot lanjutan, D6 diperjelas), flow-kerja, panduan per peran (artikel baru), skrip UAT pemilik docs/ai/uat/T-076.md, dan siapkan rilis minor G-7 lewat aitk release. UAT tidak diterima atas nama pemilik. Rencana G-7 §7 fase 5.

## Acceptance criteria
- [ ] Given semua task G-7 selesai, then project-context, decisions (D17 + D6 diperjelas untuk widget terikat), flow-kerja, dan ADR-0009 (accepted + amandemen bila ada) mencerminkan perilaku akhir
- [ ] Given panduan per peran (T-020), then terbit artikel 'Membuat perhitungan seperti PivotTable' (field terhitung, Tampilkan nilai sebagai, Top N/Lainnya, contoh margin dan rata-rata per kiriman) dan 'Satu pivot untuk banyak widget' (pivot tersimpan, dampak edit, hapus), lewat seed (artikel lama dengan --update --only)
- [ ] Given docs/ai/uat/T-076.md, then berisi langkah UAT pemilik dengan data contoh dan hasil yang diharapkan untuk keempat fitur + versi tampil; status UAT menunggu pemilik (aitk uat), tidak diterima atas nama pemilik
- [ ] Given aitk release di main setelah UAT, then CHANGELOG memuat bagian versi minor baru dan package.json naik (rencana: 1.1.0 setelah fase 1–2, 1.2.0 setelah fase 3, 1.3.0 setelah G-7 selesai, sesuai keputusan pemilik), tag image deploy mengikuti T-066

## Risk
(Required for strict profile. Impact:, Security (STRIDE):, Rollback:, Validation:)

## Notes
