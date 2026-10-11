---
id: T-008
title: 'Kanvas dashboard builder: grid, tambah/geser/ubah ukuran widget, simpan layout'
status: todo
profile: standard
goal: G-4
depends_on:
  - T-003
created: "2026-10-11T10:22:46Z"
updated: "2026-10-11T10:22:46Z"
created_by: claude-code
---

## Objective
Satu profil dataset bisa punya banyak dashboard. Kanvas grid 12 kolom (react-grid-layout), drag/resize, mode edit vs lihat, undo satu langkah, autosave layout JSON ke PostgreSQL.

## Acceptance criteria
- [ ] Given dashboard baru, when user menambah widget kosong lalu menggesernya dan mengubah ukurannya, then posisi dan ukuran tersimpan dan identik setelah halaman dimuat ulang
- [ ] Given mode lihat, when user mencoba drag widget, then widget tidak bergerak dan tidak ada panel konfigurasi
- [ ] Given lebar layar < 768 px, when membuka dashboard, then widget tersusun satu kolom tanpa scroll horizontal

## Risk
(Required for strict profile. Impact:, Security (STRIDE):, Rollback:, Validation:)

## Notes
