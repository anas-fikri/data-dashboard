---
id: T-c6z4
title: Tampilkan pratinjau tabel pivot penuh di editor pivot tersimpan
status: todo
profile: standard
goal: G-7
tags:
  - ui
  - security
created: "2026-10-21T18:24:32Z"
updated: "2026-10-21T18:24:32Z"
created_by: claude-code
---

## Objective
T-074 memakai pratinjau ringkas di editor pivot tersimpan (kalimat bentuk tabel, nilai contoh field terhitung, nilai Saring) karena /api/query belum punya mode pivot untuk pemilik tanpa widget. Tambahkan mode query pivot pemilik { datasetId, pivot } (strict, D6 tetap: pemilik dataset saja, spec divalidasi seperti simpan widget) dan tampilkan tabel pivot pratinjau (PivotTableMarkup) di editor dengan batas sel yang sama.

## Acceptance criteria
- [ ] Given pemilik di editor pivot tersimpan, when mengubah baris/nilai, then tabel pratinjau memuat ulang dengan nilai yang sama dengan widget terikat
- [ ] Given editor/viewer atau dataset lain, when memanggil mode pivot pemilik, then 404 NOT_FOUND

## Risk
(Required for strict profile. Impact:, Security (STRIDE):, Rollback:, Validation:)

## Notes
