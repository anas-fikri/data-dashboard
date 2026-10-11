---
id: T-011
title: Tipe widget tabel, KPI, bar, line, pie dengan panel konfigurasi
status: todo
profile: standard
goal: G-4
depends_on:
  - T-009
  - T-010
created: "2026-10-11T14:45:09Z"
updated: "2026-10-11T14:45:09Z"
created_by: claude-code
---

## Objective
Panel konfigurasi: sheet, dimensi, ukuran + agregasi (sum/avg/count/min/max/count distinct), sort, top-N, format angka (ribuan ID, persen, Rp dengan spasi biasa, D11). Spec tersimpan di Widget. /api/query menerima {widgetId, filters} dan mengambil spec dari widget (pemilik dulu; non-pemilik diaktifkan T-016). Render ECharts (skill dataviz). Tabel: paginasi server 100 baris, sort kolom. Kolom hidden/hilang → pesan di widget, widget lain tetap jalan.

## Acceptance criteria
- [ ] Given widget bar dimensi cabang + sum(omzet) pada fixture kecil, when dirender, then nilai sama dengan SUMIF yang dihitung test dari fixture
- [ ] Given widget KPI format Rp dengan nilai 1234567.5, when dirender, then teks tepat 'Rp 1.234.568' dengan spasi U+0020
- [ ] Given widget tabel, when user sort kolom dan pindah halaman, then hanya 100 baris per halaman dikirim dan urutan sesuai
- [ ] Given kolom yang dirujuk widget disembunyikan di skema, when dashboard dibuka, then widget itu menampilkan pesan kolom tidak tersedia dan widget lain berfungsi
- [ ] Given widget tabel atas sheet 1 juta baris (perf), when sort + pindah halaman, then respons < 2 detik; bukti di docs/ai/perf/T-011.md

## Risk
(Required for strict profile. Impact:, Security (STRIDE):, Rollback:, Validation:)

## Notes
