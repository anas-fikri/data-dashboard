---
id: T-010
title: 'Kanvas dashboard builder: grid, drag/resize, autosave layout'
status: todo
profile: standard
goal: G-4
depends_on:
  - T-003
created: "2026-10-11T14:45:08Z"
updated: "2026-10-11T14:45:08Z"
created_by: claude-code
---

## Objective
Model Dashboard {datasetId, name, layout JSON} dan Widget {dashboardId, type, spec JSON, position}. Grid 12 kolom (react-grid-layout), drag/resize, mode edit vs lihat, undo satu langkah, autosave. Maks 10 dashboard per dataset. UI via plugin frontend-expert.

## Acceptance criteria
- [ ] Given dashboard baru, when user menambah widget kosong lalu menggeser dan mengubah ukurannya, then posisi dan ukuran identik setelah halaman dimuat ulang
- [ ] Given mode lihat, when user mencoba drag widget, then widget tidak bergerak dan panel konfigurasi tidak ada
- [ ] Given lebar layar < 768 px, when membuka dashboard, then widget tersusun satu kolom tanpa scroll horizontal
- [ ] Given dataset sudah punya 10 dashboard, when membuat yang ke-11, then ditolak code LIMIT_REACHED

## Risk
(Required for strict profile. Impact:, Security (STRIDE):, Rollback:, Validation:)

## Notes
