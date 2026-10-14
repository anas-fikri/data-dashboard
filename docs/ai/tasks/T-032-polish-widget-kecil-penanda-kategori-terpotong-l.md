---
id: T-032
title: 'Polish widget kecil: penanda kategori terpotong, legenda pai samping, tab stop legenda'
status: todo
profile: standard
profile_pinned: true
goal: G-4
depends_on:
  - T-011
created: "2026-10-13T02:41:40Z"
updated: "2026-10-14T17:24:28Z"
created_by: claude-code
---

## Objective
Sisa temuan Low/Info verifikasi T-011 yang sengaja ditunda: (1) kartu batang sangat pendek menyembunyikan catatan 'N dari M' — beri lencana kecil 'N/M' di kepala kartu; (2) kartu pai pendek-lebar: legenda di samping donut; (3) region legenda/keterangan pai selalu jadi tab stop walau tidak meluap — jadikan fokus hanya bila meluap; (4) label minggu 'Mg <tanggal>' bisa dibaca 'Minggu' (hari) — ganti ke 'Mgg mulai …' atau sejenis; (5) swatch legenda identik di forced-colors — beri pola/bentuk berbeda; (6) kartu sentuh sempit di mode edit menyisakan ±46 px badan; (7) kunci cache halaman tabel memakai halaman yang diminta (bisa memakai halaman yang dijepit).

## Acceptance criteria
- [ ] Given kartu batang setinggi 2 baris grid dengan kategori terpotong, when dilihat, then pengguna melihat penanda jumlah kategori yang tampil dari total tanpa membuka tabel data
- [ ] Given legenda pai yang tidak meluap, when pengguna menekan Tab, then legenda tidak menjadi tab stop; bila meluap, tetap bisa difokus dan digulir dengan panah
- [ ] Given mode forced-colors, when legenda pai/garis dilihat, then tiap seri bisa dibedakan tanpa warna

## Risk
(Required for strict profile. Impact:, Security (STRIDE):, Rollback:, Validation:)

## Notes
- 2026-10-13T15:34:02Z Dari review T-019: axe 'region' (moderate, best-practice) pada portal Radix DropdownMenu/Select yang dirender ke <body> di luar landmark — pertimbangkan Portal container di dalam <main> atau wrapper landmark; bukan WCAG AA.
- 2026-10-14T17:24:28Z Dari T-014: Radix Select (src/components/ui/select.tsx) selalu modal dan menyembunyikan halaman dengan aria-hidden saat listbox terbuka → axe aria-hidden-focus (skip link, sidebar, topbar) di /skema, /pemetaan, panel widget, filter. Fokus terkunci di listbox sehingga tidak bisa dijangkau keyboard, tetapi axe tetap melapor. Perlu primitive listbox non-modal untuk seluruh app (T-019 baru menangani satu filter sebagai menu).
