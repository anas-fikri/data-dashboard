---
id: T-005
title: Spike parser xlsx/csv dan skrip sintesis fixture
status: todo
profile: standard
goal: G-3
depends_on:
  - T-001
created: "2026-10-11T14:45:08Z"
updated: "2026-10-11T14:45:08Z"
created_by: claude-code
---

## Objective
Skrip scripts/make-fixture.ts parametris: xlsx (sheet × baris × kolom, rasio teks, header di baris ke-N, duplikat header, tanggal campuran, desimal ID/US) dan csv (encoding, delimiter). Fixture kecil (≤ 50k baris) di-commit ke tests/fixtures/, fixture 1 GB disintesis ke tests/fixtures/perf/ (gitignored). Benchmark streaming ExcelJS WorkbookReader vs DuckDB read_xlsx (ekstensi excel) pada xlsx 1 GB teks-berat (3 sheet × 1 juta baris) dan csv 1 GB: waktu, puncak RSS, benar/tidak baris. Hasil → docs/ai/perf/T-005.md dan ADR-0002 (parser terpilih + mitigasi shared strings).

## Acceptance criteria
- [ ] Given skrip fixture, when dijalankan dengan parameter kecil, then menghasilkan xlsx dan csv deterministik (seed) yang dipakai test T-006/T-007 dan tercatat di tests/fixtures/README.md
- [ ] Given fixture xlsx 1 GB teks-berat, when kedua parser dibenchmark, then laporan docs/ai/perf/T-005.md memuat waktu, puncak RSS, jumlah baris per parser, dan ADR-0002 menetapkan parser serta mitigasi bila RSS > 2 GB
- [ ] Given npm run check, when dijalankan, then tidak menyentuh fixture perf dan selesai tanpa error

## Risk
(Required for strict profile. Impact:, Security (STRIDE):, Rollback:, Validation:)

## Notes
