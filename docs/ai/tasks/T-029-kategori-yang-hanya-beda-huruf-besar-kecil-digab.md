---
id: T-029
title: Kategori yang hanya beda huruf besar/kecil digabung seperti pivot Excel
status: todo
profile: standard
profile_pinned: true
created: "2026-10-12T23:39:16Z"
updated: "2026-10-12T23:39:16Z"
created_by: claude-code
---

## Objective
Ditemukan verifikasi integritas T-011: GROUP BY pada dimensi teks memisahkan 'Bandung' dan 'BANDUNG', berbeda dari PivotTable/SUMIF/UNIQUE Excel yang tidak peka huruf besar/kecil. Putuskan perilaku bawaan (gabung tidak peka huruf) dan label tampil (nilai paling sering).

## Acceptance criteria
- [ ] Given dataset dengan 'Bandung', 'bandung', 'BANDUNG', when widget batang dikelompokkan per kolom itu, then satu kategori dengan total gabungan dan label nilai yang paling sering
- [ ] Given filter = 'bandung', when diterapkan, then baris ketiga variasi itu ikut

## Risk
(Required for strict profile. Impact:, Security (STRIDE):, Rollback:, Validation:)

## Notes
