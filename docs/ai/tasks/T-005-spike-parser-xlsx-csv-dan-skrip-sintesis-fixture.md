---
id: T-005
title: Spike parser xlsx/csv dan skrip sintesis fixture
status: in_progress
profile: standard
goal: G-3
depends_on:
  - T-001
created: "2026-10-11T14:45:08Z"
updated: "2026-10-12T02:47:37Z"
created_by: claude-code
workers:
  - claude-code
branch: worktree-t-001-scaffold
base: 626d6d6b2d82187060279d1ad836d78516665d1e
---

## Objective
Skrip scripts/make-fixture.ts parametris: xlsx (sheet × baris × kolom, rasio teks, header di baris ke-N, duplikat header, tanggal campuran, desimal ID/US) dan csv (encoding, delimiter). Fixture kecil (≤ 50k baris) di-commit ke tests/fixtures/, fixture 1 GB disintesis ke tests/fixtures/perf/ (gitignored). Benchmark streaming ExcelJS WorkbookReader vs DuckDB read_xlsx (ekstensi excel) pada xlsx 1 GB teks-berat (3 sheet × 1 juta baris) dan csv 1 GB: waktu, puncak RSS, benar/tidak baris. Hasil → docs/ai/perf/T-005.md dan ADR-0002 (parser terpilih + mitigasi shared strings).

## Acceptance criteria
- [x] Given skrip fixture, when dijalankan dengan parameter kecil, then menghasilkan xlsx dan csv deterministik (seed) yang dipakai test T-006/T-007 dan tercatat di tests/fixtures/README.md
- [x] Given fixture xlsx 1 GB teks-berat, when kedua parser dibenchmark, then laporan docs/ai/perf/T-005.md memuat waktu, puncak RSS, jumlah baris per parser, dan ADR-0002 menetapkan parser serta mitigasi bila RSS > 2 GB
- [x] Given npm run check, when dijalankan, then tidak menyentuh fixture perf dan selesai tanpa error

## Risk
(Required for strict profile. Impact:, Security (STRIDE):, Rollback:, Validation:)

## Notes
- 2026-10-11T14:56:59Z Benchmark juga mengukur: penolakan <!DOCTYPE (entity expansion), rasio dekompresi, dan fixture zip-bomb kecil; parser yang tidak bisa dibatasi tidak dipilih (ADR-0002).
- 2026-10-12T02:47:36Z Hasil: docs/ai/perf/T-005.md. Keputusan parser di ADR-0005 (ADR-0002 sudah dipakai RustFS): parser sendiri yauzl + saxes dengan spill sharedStrings (xlsx 946 MB: 351 s, RSS 639 MB, 88 juta sel benar); DuckDB read_xlsx OOM di memory_limit 1 GB dan 2.266 MB di 4 GB; ExcelJS macet pada urutan Excel dan heap habis pada urutan sst-awal. CSV 974 MB via DuckDB read_csv: 22 s, 292 MB. Fixture kecil di tests/fixtures (README + manifest), npm run fixtures; DOCTYPE dan zip-bomb ditolak (tests/scripts/fixtures.test.ts).
