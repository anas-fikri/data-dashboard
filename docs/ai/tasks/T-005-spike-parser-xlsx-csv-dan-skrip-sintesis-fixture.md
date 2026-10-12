---
id: T-005
title: Spike parser xlsx/csv dan skrip sintesis fixture
status: in_review
profile: standard
goal: G-3
depends_on:
  - T-001
created: "2026-10-11T14:45:08Z"
updated: "2026-10-12T04:38:42Z"
created_by: claude-code
workers:
  - claude-code
branch: worktree-t-001-scaffold
base: 626d6d6b2d82187060279d1ad836d78516665d1e
review:
  passes:
    - "n": 1
      by: claude-security-reviewer-subagen
      at: "2026-10-12T02:55:49Z"
      findings: 16
    - "n": 2
      by: claude-security-reviewer-subagen
      at: "2026-10-12T03:08:05Z"
      findings: 3
    - "n": 3
      by: claude-security-reviewer-subagen
      at: "2026-10-12T03:12:22Z"
      findings: 1
    - "n": 4
      by: claude-security-reviewer-subagen
      at: "2026-10-12T03:18:34Z"
      findings: 1
    - "n": 5
      by: claude-security-reviewer-subagen
      at: "2026-10-12T04:07:30Z"
      findings: 5
    - "n": 6
      by: claude-security-reviewer-subagen
      at: "2026-10-12T04:35:15Z"
      findings: 1
    - "n": 7
      by: claude-security-reviewer-subagen
      at: "2026-10-12T04:37:26Z"
      findings: 0
evidence:
  check:
    cmd: npm run check
    exit_code: 0
    duration_ms: 13859
    summary: |-
      > data-dashboard@0.1.0 check
      > npm run lint && npm run typecheck && npm run test && npm run audit


      > data-dashboard@0.1.0 lint
      > eslint . && prettier --check .

      Checking formatting...
      All matched files use Prettier code style!

      > data-dashboard@0.1.0 typecheck
      > tsc --noEmit


      > data-dashboard@0.1.0 test
      > vitest run


       RUN  v5.0.3 /Users/anasfikri/Documents/Projects/pcpexpress/data-dashboard/.claude/worktrees/t-001-scaffold

      {"level":40,"time":1791779869528,"service":"data-dashboard","check":"B","detail":"koneksi ditolak","msg":"health check gagal"}
      {"level":40,"time":1791779869555,"service":"data-dashboard","check":"Lambat","detail":"Lambat: timeout 20 ms","msg":"health check gagal"}

       Test Files  13 passed (13)
            Tests  122 passed (122)
         Start at  11:37:48
         Duration  3.47s (tests 64%, transform 18%, import 17%, worker 1%)


      > data-dashboard@0.1.0 audit
      > npm audit --audit-level=high --omit=dev && npm audit --audit-level=critical

      found 0 vulnerabilities
      # npm audit report

      uuid  <11.1.1
      Severity: moderate
      uuid: Missing buffer bounds check in v3/v5/v6 when buf is provided - https://github.com/advisories/GHSA-w5hq-g745-h8pq
      fix available via `npm audit fix --force`
      Will install exceljs@3.4.0, which is a breaking change
      node_modules/uuid
        exceljs  >=3.5.0
        Depends on vulnerable versions of uuid
        node_modules/exceljs

      2 moderate severity vulnerabilities

      To address all issues (including breaking changes), run:
        npm audit fix --force
    at: "2026-10-12T04:37:54Z"
    tree: 84de07d18e0615be89bcda4635742d294dac09ac35842e517f90149c06ac4286
  audit:
    at: "2026-10-12T04:38:29Z"
    passed: true
    tree: d735b62627f57c3013f3ff20bd68656d1c342a53d4675a0bac95f05e2ac669c6
    results:
      - name: osv-scanner (dependencies, offline db)
        exit_code: 0
        summary: |-
          Scanning dir .
          Starting filesystem walk for root: /
          Scanned /Users/anasfikri/Documents/Projects/pcpexpress/data-dashboard/.claude/worktrees/t-001-scaffold/package-lock.json file and found 715 packages
          End status: 91 dirs visited, 361 inodes visited, 1 Extract calls, 57.37ms elapsed, 57.37ms wall time
          Loaded npm local db from /Users/anasfikri/Library/Caches/osv-scalibr/npm/all.zip

          No issues found
      - name: npm audit (prod high, dev critical)
        exit_code: 0
        summary: |-
          > data-dashboard@0.1.0 audit
          > npm audit --audit-level=high --omit=dev && npm audit --audit-level=critical

          found 0 vulnerabilities
          found 0 vulnerabilities
      - name: aitk secret scan (tracked files)
        exit_code: 0
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
