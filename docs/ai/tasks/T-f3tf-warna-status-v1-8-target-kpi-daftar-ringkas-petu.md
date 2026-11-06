---
id: T-f3tf
title: 'Warna status v1.8: target, KPI, daftar ringkas, petunjuk garis/pai, terapkan template ke semua widget'
status: todo
profile: standard
tags:
  - ui
created: "2026-11-06T09:29:29Z"
updated: "2026-11-06T09:29:29Z"
created_by: claude-code
---

## Objective
Lanjutan warna status v1.7.0: mode target opsional (batas Baik/Perlu perhatian absolut, mis. SLA ≥ 95) per nilai, warna KPI terhadap target, warna di daftar batang ringkas, petunjuk di garis/pai/KPI bahwa warna ada di Batang/Pivot, dan tombol terapkan template ke semua widget dashboard (konsistensi tanpa migrasi).

## Acceptance criteria
- [ ] Given nilai berarah dengan target, when ditampilkan, then status memakai batas target (bukan rentang relatif) di pivot, batang, dan KPI
- [ ] Given widget garis/pai, when panel dibuka, then ada petunjuk warna status hanya untuk Batang/Pivot
- [ ] Given template dipilih, when Terapkan ke semua widget, then semua pivot/batang di dashboard memakai template itu
- [ ] Tanpa migrasi DB; unit test lulus

## Risk
(Required for strict profile. Impact:, Security (STRIDE):, Rollback:, Validation:)

## Notes
