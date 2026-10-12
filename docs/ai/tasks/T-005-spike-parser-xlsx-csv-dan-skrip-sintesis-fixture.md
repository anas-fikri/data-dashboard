---
id: T-005
title: Spike parser xlsx/csv dan skrip sintesis fixture
status: done
profile: strict
goal: G-3
depends_on:
  - T-001
created: "2026-10-11T14:45:08Z"
updated: "2026-10-12T04:40:46Z"
closed: "2026-10-12T04:40:46Z"
created_by: claude-code
workers:
  - claude-code
branch: worktree-t-001-scaffold
base: 626d6d6b2d82187060279d1ad836d78516665d1e
paths:
  - .dockerignore
  - .env.example
  - .gitignore
  - .npmrc
  - .nvmrc
  - .prettierignore
  - .prettierrc
  - README.md
  - docker-compose.dev.yml
  - docs/flow-kerja.md
  - eslint.config.mjs
  - next.config.ts
  - package-lock.json
  - package.json
  - playwright.config.ts
  - postcss.config.mjs
  - prisma/migrations/20261011152124_init/migration.sql
  - prisma/migrations/20261011163023_verification_token/migration.sql
  - prisma/migrations/20261011225415_token_pending_password/migration.sql
  - prisma/migrations/20261011230218_token_pending_name/migration.sql
  - prisma/migrations/20261011234923_datasets/migration.sql
  - prisma/migrations/20261011235601_storage_cleanup/migration.sql
  - prisma/migrations/20261012011450_version_upload/migration.sql
  - prisma/migrations/migration_lock.toml
  - prisma/schema.prisma
  - prisma/seed.ts
  - public/brand/mark-dark.png
  - public/brand/mark.png
  - public/brand/pcp-logo-dark.png
  - public/brand/pcp-logo.png
  - scripts/bench-hostile.ts
  - scripts/bench-parsers.ts
  - scripts/bench/parser-duckdb-csv.ts
  - scripts/bench/parser-duckdb.ts
  - scripts/bench/parser-exceljs.ts
  - scripts/bench/parser-sax.ts
  - scripts/bench/types.ts
  - scripts/check-presign.mjs
  - scripts/dev-dataset-fixture.mjs
  - scripts/dev-expire-reset.mjs
  - scripts/dev-make-admin.mjs
  - scripts/dev-purge-test-data.mjs
  - scripts/dev-reset-ratelimit.mjs
  - scripts/dev-upload-fixture.mjs
  - scripts/fixtures/build-committed.ts
  - scripts/fixtures/make-hostile.ts
  - scripts/fixtures/model.ts
  - scripts/gen-dev-env.mjs
  - scripts/make-fixture.ts
  - scripts/perf.mjs
  - scripts/smoke-prod-headers.mjs
  - scripts/storage-init.mjs
  - src/app/(app)/admin/page.tsx
  - src/app/(app)/akun/keamanan/page.tsx
  - src/app/(app)/akun/page.tsx
  - src/app/(app)/dashboards/page.tsx
  - src/app/(app)/datasets/[id]/page.tsx
  - src/app/(app)/datasets/baru/page.tsx
  - src/app/(app)/datasets/page.tsx
  - src/app/(app)/layout.tsx
  - src/app/(app)/page.tsx
  - src/app/(app)/panduan/page.tsx
  - src/app/(auth)/layout.tsx
  - src/app/(auth)/login/page.tsx
  - src/app/(auth)/lupa-password/page.tsx
  - src/app/(auth)/register/page.tsx
  - src/app/(auth)/reset-password/page.tsx
  - src/app/(auth)/verify/page.tsx
  - src/app/api/auth/dev-bump-session/route.ts
  - src/app/api/auth/login/route.ts
  - src/app/api/auth/me/route.ts
  - src/app/api/health/route.ts
  - src/app/api/uploads/[id]/complete/route.ts
  - src/app/api/uploads/[id]/parts/route.ts
  - src/app/api/uploads/[id]/route.ts
  - src/app/api/uploads/route.ts
  - src/app/globals.css
  - src/app/health/page.tsx
  - src/app/layout.tsx
  - src/app/not-found.tsx
  - src/components/auth/auth-card.tsx
  - src/components/auth/forgot-password-form.tsx
  - src/components/auth/form-alert.tsx
  - src/components/auth/login-form.tsx
  - src/components/auth/register-form.tsx
  - src/components/auth/reset-password-form.tsx
  - src/components/auth/security-settings.tsx
  - src/components/auth/use-focus-on-error.ts
  - src/components/auth/verify-form.tsx
  - src/components/datasets/dataset-form.tsx
  - src/components/datasets/dataset-list.tsx
  - src/components/datasets/delete-dataset.tsx
  - src/components/datasets/status-badge.tsx
  - src/components/datasets/upload-panel.tsx
  - src/components/shell/account-menu.tsx
  - src/components/shell/app-shell.tsx
  - src/components/shell/brand.tsx
  - src/components/shell/nav-items.ts
  - src/components/shell/sidebar-nav.tsx
  - src/components/shell/theme-toggle.tsx
  - src/components/theme-provider.tsx
  - src/components/ui/avatar.tsx
  - src/components/ui/button.tsx
  - src/components/ui/card.tsx
  - src/components/ui/dropdown-menu.tsx
  - src/components/ui/empty-state.tsx
  - src/components/ui/field.tsx
  - src/components/ui/focus-notice.tsx
  - src/components/ui/input.tsx
  - src/components/ui/page-header.tsx
  - src/components/ui/password-input.tsx
  - src/components/ui/select.tsx
  - src/components/ui/textarea.tsx
  - src/features/auth/actions.ts
  - src/features/auth/email-domain.ts
  - src/features/auth/email.ts
  - src/features/auth/form-state.ts
  - src/features/auth/jwt.ts
  - src/features/auth/password-recovery.ts
  - src/features/auth/password.ts
  - src/features/auth/rate-limit.ts
  - src/features/auth/redirect.ts
  - src/features/auth/service.ts
  - src/features/auth/session.ts
  - src/features/auth/tokens.ts
  - src/features/datasets/actions.ts
  - src/features/datasets/label.ts
  - src/features/datasets/service.ts
  - src/features/datasets/validation.ts
  - src/features/uploads/client.ts
  - src/features/uploads/http.ts
  - src/features/uploads/parts.ts
  - src/features/uploads/service.ts
  - src/features/uploads/sniff.ts
  - src/instrumentation.ts
  - src/lib/db.ts
  - src/lib/env.ts
  - src/lib/health/checks.ts
  - src/lib/health/index.ts
  - src/lib/hooks/use-persisted-boolean.ts
  - src/lib/logger.ts
  - src/lib/mail.ts
  - src/lib/queue/connection.ts
  - src/lib/queue/versions.ts
  - src/lib/redis.ts
  - src/lib/security-headers.ts
  - src/lib/storage/multipart.ts
  - src/lib/storage/objects.ts
  - src/lib/storage/s3.ts
  - src/lib/utils.ts
  - src/proxy.ts
  - src/styles/tokens.css
  - src/worker/index.ts
  - tests/e2e/auth.spec.ts
  - tests/e2e/datasets.spec.ts
  - tests/e2e/global-setup.ts
  - tests/e2e/global-teardown.ts
  - tests/e2e/health.spec.ts
  - tests/e2e/helpers.ts
  - tests/e2e/password.spec.ts
  - tests/e2e/security-headers.spec.ts
  - tests/e2e/shell.spec.ts
  - tests/e2e/uploads.spec.ts
  - tests/e2e/zz-rate-limit.spec.ts
  - tests/features/auth/core.test.ts
  - tests/features/auth/rate-limit.test.ts
  - tests/features/datasets/create.test.ts
  - tests/features/datasets/delete.test.ts
  - tests/features/datasets/label.test.ts
  - tests/features/uploads/pure.test.ts
  - tests/features/uploads/service.test.ts
  - tests/fixtures/README.md
  - tests/fixtures/hostile/doctype.xlsx
  - tests/fixtures/hostile/hostile.manifest.json
  - tests/fixtures/hostile/zipbomb.xlsx
  - tests/fixtures/kecil-id-titikkoma.csv
  - tests/fixtures/kecil-id-titikkoma.csv.manifest.json
  - tests/fixtures/kecil-us.csv
  - tests/fixtures/kecil-us.csv.manifest.json
  - tests/fixtures/kecil-win1252.csv
  - tests/fixtures/kecil-win1252.csv.manifest.json
  - tests/fixtures/kecil.xlsx
  - tests/fixtures/kecil.xlsx.manifest.json
  - tests/fixtures/sedang.xlsx
  - tests/fixtures/sedang.xlsx.manifest.json
  - tests/fixtures/utf16.csv
  - tests/fixtures/utf16.csv.manifest.json
  - tests/lib/env.test.ts
  - tests/lib/health.test.ts
  - tests/lib/security-headers.test.ts
  - tests/lib/seed.test.ts
  - tests/scripts/fixtures.test.ts
  - tests/scripts/parser-sax-edge.test.ts
  - tests/stubs/server-only.ts
  - tsconfig.json
  - vitest.config.mts
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
    duration_ms: 12771
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

      {"level":40,"time":1791779969925,"service":"data-dashboard","check":"B","detail":"koneksi ditolak","msg":"health check gagal"}
      {"level":40,"time":1791779969949,"service":"data-dashboard","check":"Lambat","detail":"Lambat: timeout 20 ms","msg":"health check gagal"}

       Test Files  13 passed (13)
            Tests  122 passed (122)
         Start at  11:39:29
         Duration  3.26s (tests 66%, transform 18%, import 14%, worker 1%)


      > data-dashboard@0.1.0 audit
      > npm audit --audit-level=high --omit=dev && npm audit --audit-level=critical

      found 0 vulnerabilities
      found 0 vulnerabilities
    at: "2026-10-12T04:39:33Z"
    tree: d735b62627f57c3013f3ff20bd68656d1c342a53d4675a0bac95f05e2ac669c6
  commits:
    - 0423efd
    - "0458545"
    - 0b3dbca
    - 0d4c16b
    - 15536b5
    - 183aee3
    - 1add773
    - 22b384e
    - 24e2978
    - 2653b85
    - 27bf134
    - 29f1080
    - 2b68a94
    - 2c5ffeb
    - 30baa8d
    - 401b86a
    - 457220a
    - 471d15b
    - 4bff118
    - 4d5aa50
    - 4f751b8
    - 5d46f4b
    - 60ea826
    - 626d6d6
    - 64a8e95
    - 66ba1d5
    - 6c7cef8
    - 7c5267b
    - 7d27e01
    - 7dddfc4
    - "8492031"
    - 915c9f1
    - 9558d66
    - "9835114"
    - 9b2bfc6
    - 9cd6ff0
    - 9cee0e6
    - a384931
    - ab9e083
    - b189cbc
    - b2a1115
    - b330d22
    - bec0af8
    - c0a7685
    - c51c2b5
    - d363c9a
    - d6d03db
    - d9f240b
    - dbe1056
    - e1ff563
    - e28eb08
    - e3d5ef8
    - e3da62b
    - e56694e
    - e594327
    - e5a4396
    - f511b61
    - fbf5494
    - fe5861e
  acceptance:
    total: 3
    done: 3
  audit:
    at: "2026-10-12T04:40:36Z"
    passed: true
    tree: d735b62627f57c3013f3ff20bd68656d1c342a53d4675a0bac95f05e2ac669c6
    results:
      - name: osv-scanner (dependencies, offline db)
        exit_code: 0
        summary: |-
          Scanning dir .
          Starting filesystem walk for root: /
          Scanned /Users/anasfikri/Documents/Projects/pcpexpress/data-dashboard/.claude/worktrees/t-001-scaffold/package-lock.json file and found 715 packages
          End status: 91 dirs visited, 361 inodes visited, 1 Extract calls, 62.0735ms elapsed, 62.075ms wall time
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
Risk level: MEDIUM-HIGH. Spike ini menetapkan parser yang akan membaca file tak tepercaya sampai 1 GB di worker (T-006).
Impact surface:
- **Kode baru:** scripts/make-fixture.ts, scripts/fixtures/*, scripts/bench/* (parser-sax.ts menjadi dasar parser produksi T-006), scripts/bench-parsers.ts, scripts/bench-hostile.ts.
- **Fixture dan dokumen:** tests/fixtures/* (± 6 MB, deterministik), docs/ai/perf/T-005.md, ADR-0005.
- **Dependency:** @duckdb/node-api, yauzl, saxes (prod); exceljs + yazl (dev, `uuid` dipaksa 11.1.1 lewat overrides).
- **Proses:** npm run fixtures; teardown e2e membersihkan data uji.
Security (STRIDE):
- **DoS (memori/disk/CPU) dari xlsx buatan**, dibatasi berlapis (ADR-0005):
  - Zip: ≤ 10k entri, rasio ≤ 100x, total ≤ min(24 GiB, 100× file), entri tumpang tindih dan metadata entri berlebihan ditolak.
  - XML: DOCTYPE ditolak; buffer node saxes ≤ ± 294k karakter; kedalaman ≤ 64; ≤ 256 atribut dan ≤ 16k karakter atribut per tag.
  - Isi: ≤ 50 sheet, ≤ 1.048.576 baris, ≤ 16.384 kolom, sel ≤ 32.767 karakter (dipotong), baris ≤ 4 juta karakter.
  - Shared strings dan gaya: sharedStrings ≤ 64 juta, numFmt ≤ 1.000, cellXfs ≤ 65.536; spill ≤ 8 GiB; deadline per potongan; string disalin mandiri.
  - Hasil audit akhir: tidak ada struktur parser > ~500 MB.
- **Tampering (file rusak atau referensi palsu):** indeks sharedStrings, nomor baris dan kolom divalidasi lalu ditolak dengan pesan.
- **Information disclosure:** tidak ada; parser tidak membuka jaringan dan tidak mengekspansi entitas eksternal.
Rollback: kode spike berada di scripts/ dan tidak dipanggil aplikasi; revert commit, tanpa migrasi.
Validation:
- Unit test (38): kecocokan per sel dengan model fixture, determinisme generator, kasus tepi OOXML, setiap batas memori/disk, penolakan DOCTYPE/zip-bomb/struktur buatan.
- Benchmark 1 GB dengan checksum teks per sel.
- Probe reviewer probe3–probe10 ditolak atau diproses dengan RSS datar; 7 putaran review keamanan, pass terakhir 0 temuan.
Open risks/assumptions:
- Parse 1 GB ± 3 menit di M4; VM produksi diukur T-024.
- Worker butuh disk temp ± ukuran upload + 8 GiB (catatan di T-023).
- Format durasi [h]:mm diserahkan ke T-007.

## Notes
- 2026-10-11T14:56:59Z Benchmark juga mengukur: penolakan <!DOCTYPE (entity expansion), rasio dekompresi, dan fixture zip-bomb kecil; parser yang tidak bisa dibatasi tidak dipilih (ADR-0002).
- 2026-10-12T02:47:36Z Hasil: docs/ai/perf/T-005.md. Keputusan parser di ADR-0005 (ADR-0002 sudah dipakai RustFS): parser sendiri yauzl + saxes dengan spill sharedStrings (xlsx 946 MB: 351 s, RSS 639 MB, 88 juta sel benar); DuckDB read_xlsx OOM di memory_limit 1 GB dan 2.266 MB di 4 GB; ExcelJS macet pada urutan Excel dan heap habis pada urutan sst-awal. CSV 974 MB via DuckDB read_csv: 22 s, 292 MB. Fixture kecil di tests/fixtures (README + manifest), npm run fixtures; DOCTYPE dan zip-bomb ditolak (tests/scripts/fixtures.test.ts).

## Security checklist (OWASP ASVS 4.0.3)
<!-- Check each item when verified, or write "N/A: <reason>" after the text and check it. -->
- [x] V1 Architecture: trust boundaries and the components handling sensitive data are identified for this change — diverifikasi: batas kepercayaan = file unggahan tak tepercaya → parser (worker); parser tanpa akses jaringan/DB, hanya file lokal + direktori temp per parse
- [x] V2 Authentication: credentials are verified server-side; no default, hard-coded, or weak secrets — N/A: spike tanpa autentikasi; tidak mengubah alur login
- [x] V3 Session management: session tokens are random, protected, invalidated on logout and expiry — N/A: tidak menyentuh sesi
- [x] V4 Access control: every endpoint/action checks authorization server-side, deny by default (no IDOR) — N/A: skrip benchmark/fixture tidak dipanggil aplikasi; otorisasi ingest di T-006
- [x] V5 Validation, sanitization and encoding: all input validated; output encoded; no injection (SQL, OS, template) — diverifikasi: DOCTYPE/entitas ditolak (tanpa XXE), indeks sharedStrings/nomor baris/kolom divalidasi, path part dari relasi dinormalisasi di dalam zip (tidak menyentuh filesystem), nilai teks didekode tanpa eval
- [x] V6 Stored cryptography: sensitive data at rest uses approved algorithms; keys are not in the code — N/A: tidak ada data kriptografis
- [x] V7 Error handling and logging: errors reveal no internals; security events are logged without secrets — diverifikasi: XlsxLimitError berisi pesan yang bisa ditindak (sheet/baris) tanpa stack/path internal
- [x] V8 Data protection: personal/sensitive data is minimized, not cached or logged, and removable — diverifikasi: file spill di direktori temp per parse, dihapus di finally (test: tidak ada sisa)
- [x] V9 Communication: TLS for all external traffic; certificates validated — N/A: tidak ada komunikasi jaringan (ekstensi DuckDB hanya untuk benchmark, tidak dipakai parser terpilih)
- [x] V10 Malicious code: no backdoors, time bombs, or unexplained network calls; dependencies are trusted — diverifikasi: dependency baru audit bersih (osv-scanner + npm audit); uuid devDependency exceljs dipaksa 11.1.1 (GHSA-w5hq-g745-h8pq)
- [x] V11 Business logic: flows cannot be abused (limits, ordering, replay, race conditions) — N/A: tidak ada alur bisnis
- [x] V12 Files and resources: uploads are type/size limited and stored safely; no path traversal or SSRF — diverifikasi: batas berlapis melawan zip-bomb dan XML buatan (rasio/ekspansi/tumpang tindih/metadata zip, buffer node, kedalaman, atribut, panjang sel/baris, jumlah sst/format/sheet, spill 8 GiB, deadline); audit memori akhir: tidak ada struktur > ~500 MB; probe reviewer + 38 unit test
- [x] V13 API and web service: API inputs/outputs are schema-validated; CORS and rate limits are deliberate — N/A: tidak ada API
- [x] V14 Configuration: secure defaults, security headers, no debug in production, dependencies up to date — diverifikasi: fixture perf gitignored dan tidak disentuh npm run check; skrip dev fixture menolak NODE_ENV=production

## Evidence
<!-- Generated by aitk close. -->
- Check: `npm run check` → exit 0 at 2026-10-12T04:39:33Z (12771 ms)
- Acceptance criteria: 3/3 satisfied
- Commits: 0423efd, 0458545, 0b3dbca, 0d4c16b, 15536b5, 183aee3, 1add773, 22b384e, 24e2978, 2653b85, 27bf134, 29f1080, 2b68a94, 2c5ffeb, 30baa8d, 401b86a, 457220a, 471d15b, 4bff118, 4d5aa50, 4f751b8, 5d46f4b, 60ea826, 626d6d6, 64a8e95, 66ba1d5, 6c7cef8, 7c5267b, 7d27e01, 7dddfc4, 8492031, 915c9f1, 9558d66, 9835114, 9b2bfc6, 9cd6ff0, 9cee0e6, a384931, ab9e083, b189cbc, b2a1115, b330d22, bec0af8, c0a7685, c51c2b5, d363c9a, d6d03db, d9f240b, dbe1056, e1ff563, e28eb08, e3d5ef8, e3da62b, e56694e, e594327, e5a4396, f511b61, fbf5494, fe5861e
- Review pass 1 by claude-security-reviewer-subagen: 16 findings
- Review pass 2 by claude-security-reviewer-subagen: 3 findings
- Review pass 3 by claude-security-reviewer-subagen: 1 findings
- Review pass 4 by claude-security-reviewer-subagen: 1 findings
- Review pass 5 by claude-security-reviewer-subagen: 5 findings
- Review pass 6 by claude-security-reviewer-subagen: 1 findings
- Review pass 7 by claude-security-reviewer-subagen: 0 findings
