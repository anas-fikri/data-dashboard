---
id: T-010
title: 'Kanvas dashboard builder: grid, drag/resize, autosave layout'
status: todo
profile: standard
goal: G-4
depends_on:
  - T-003
created: "2026-10-11T14:45:08Z"
updated: "2026-10-11T14:49:25Z"
created_by: claude-code
---

## Objective
Model Dashboard {datasetId, name, layout JSON} dan Widget {dashboardId, type, spec JSON, position}. Grid 12 kolom (react-grid-layout), drag/resize, mode edit vs lihat, undo satu langkah, autosave. Maks 10 dashboard per dataset. UI via plugin frontend-expert.

## Acceptance criteria
- [ ] Given dashboard baru, when user menambah widget kosong lalu menggeser dan mengubah ukurannya, then posisi dan ukuran identik setelah halaman dimuat ulang
- [ ] Given mode lihat, when user mencoba drag widget, then widget tidak bergerak dan panel konfigurasi tidak ada
- [ ] Given lebar layar < 768 px, when membuka dashboard, then widget tersusun satu kolom tanpa scroll horizontal
- [ ] Given dataset sudah punya 10 dashboard, when membuat yang ke-11, then ditolak code LIMIT_REACHED
- [ ] Given halaman/komponen task ini selesai, when /frontend-expert:audit dijalankan (anti-slop-design, responsive 320/768/1024/1440, accessibility), then tidak ada temuan Critical/High dan blok Conventions check (Tokens: preset project; Icons: waiver @tabler/icons-react; States loading/empty/error; Responsive; A11y) dicatat sebagai note task

## Risk
(Required for strict profile. Impact:, Security (STRIDE):, Rollback:, Validation:)

## Notes

- 2026-10-11T14:49:25Z UI wajib lewat rantai frontend-expert: design-foundations → tokens (preset dari T-025) → (+forms/data-fetching/app-shell sesuai kebutuhan) → components → anti-slop-code → responsive → motion ringan → anti-slop-design → polish → accessibility. Skip design-direction karena arah sudah dipilih di T-025, kecuali layar baru yang ambigu. Chart via skill dataviz; filter/select pakai Select kustom dari T-025, bukan native.
