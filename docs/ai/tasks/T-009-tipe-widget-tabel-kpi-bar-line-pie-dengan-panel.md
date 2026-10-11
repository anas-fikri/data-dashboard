---
id: T-009
title: 'Tipe widget: tabel, KPI, bar, line, pie dengan panel konfigurasi'
status: todo
profile: standard
goal: G-4
depends_on:
  - T-007
  - T-008
created: "2026-10-11T10:22:46Z"
updated: "2026-10-11T10:22:46Z"
created_by: claude-code
---

## Objective
Panel konfigurasi widget: pilih sheet, dimensi (sumbu/kategori), ukuran + agregasi (sum/avg/count/min/max/count distinct), sort, top-N, format angka (ribuan Indonesia, persen, Rp). Render ECharts dari hasil API query. Tabel dengan paginasi server dan sort kolom.

## Acceptance criteria
- [ ] Given widget bar, when user memilih dimensi cabang dan ukuran sum(omzet), then chart tampil dengan nilai sama dengan hasil SUMIF manual pada fixture
- [ ] Given widget KPI dengan format Rp, when nilai 1234567.5, then tampil 'Rp 1.234.568'
- [ ] Given widget tabel atas sheet 1 juta baris, when user sort kolom dan pindah halaman, then respons < 2 detik dan hanya 100 baris per halaman dikirim ke browser
- [ ] Given kolom yang direferensikan widget disembunyikan di skema, when dashboard dibuka, then widget menampilkan pesan kolom tidak tersedia dan widget lain tetap berfungsi

## Risk
(Required for strict profile. Impact:, Security (STRIDE):, Rollback:, Validation:)

## Notes
