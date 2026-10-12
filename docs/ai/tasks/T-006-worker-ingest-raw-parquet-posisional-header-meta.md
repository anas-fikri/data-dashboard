---
id: T-006
title: 'Worker ingest: raw.parquet posisional, header metadata, idempoten'
status: done
profile: strict
profile_pinned: true
goal: G-3
tags:
  - security
depends_on:
  - T-004
  - T-005
created: "2026-10-11T14:45:08Z"
updated: "2026-10-12T07:21:51Z"
closed: "2026-10-12T07:21:51Z"
created_by: claude-code
workers:
  - claude-code
branch: worktree-t-001-scaffold
base: 561f910b5d41b43569cc74d52a0f81a359ac32e4
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
  - prisma/migrations/20261012044448_ingest_sheet/migration.sql
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
  - scripts/dev-create-user.ts
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
  - scripts/perf-ingest.ts
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
  - src/features/ingest/csv-sniff.ts
  - src/features/ingest/csv.ts
  - src/features/ingest/header.ts
  - src/features/ingest/ingest.ts
  - src/features/ingest/raw-writer.ts
  - src/features/ingest/recovery.ts
  - src/features/ingest/repo.ts
  - src/features/uploads/client.ts
  - src/features/uploads/http.ts
  - src/features/uploads/parts.ts
  - src/features/uploads/service.ts
  - src/features/uploads/sniff.ts
  - src/instrumentation.ts
  - src/lib/db.ts
  - src/lib/duckdb/index.ts
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
  - src/lib/storage/files.ts
  - src/lib/storage/multipart.ts
  - src/lib/storage/objects.ts
  - src/lib/storage/s3.ts
  - src/lib/utils.ts
  - src/lib/xlsx/parser.ts
  - src/lib/xlsx/types.ts
  - src/proxy.ts
  - src/styles/tokens.css
  - src/worker/index.ts
  - tests/e2e/auth.spec.ts
  - tests/e2e/datasets.spec.ts
  - tests/e2e/global-setup.ts
  - tests/e2e/global-teardown.ts
  - tests/e2e/health.spec.ts
  - tests/e2e/helpers.ts
  - tests/e2e/ingest.spec.ts
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
  - tests/features/ingest/fakes.ts
  - tests/features/ingest/ingest-review.test.ts
  - tests/features/ingest/ingest.test.ts
  - tests/features/ingest/pure.test.ts
  - tests/features/ingest/recovery.test.ts
  - tests/features/ingest/wide.test.ts
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
  - tests/fixtures/tiga-sheet.xlsx
  - tests/fixtures/tiga-sheet.xlsx.manifest.json
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
      at: "2026-10-12T05:44:44Z"
      findings: 13
    - "n": 2
      by: claude-security-reviewer-subagen
      at: "2026-10-12T07:17:56Z"
      findings: 2
    - "n": 3
      by: claude-security-reviewer-subagen
      at: "2026-10-12T07:17:56Z"
      findings: 1
    - "n": 4
      by: claude-security-reviewer-subagen
      at: "2026-10-12T07:19:57Z"
      findings: 0
evidence:
  check:
    cmd: npm run check
    exit_code: 0
    duration_ms: 28041
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

      {"level":40,"time":1791789608108,"service":"data-dashboard","check":"B","detail":"koneksi ditolak","msg":"health check gagal"}
      {"level":40,"time":1791789608131,"service":"data-dashboard","check":"Lambat","detail":"Lambat: timeout 20 ms","msg":"health check gagal"}

       Test Files  18 passed (18)
            Tests  170 passed (170)
         Start at  14:20:06
         Duration  17.79s (tests 88%, import 6%, transform 5%)


      > data-dashboard@0.1.0 audit
      > npm audit --audit-level=high --omit=dev && npm audit --audit-level=critical

      found 0 vulnerabilities
      found 0 vulnerabilities
    at: "2026-10-12T07:20:25Z"
    tree: a1bb30534053fb648dddc7cb5acc702a528fb7d948e1cd0463dc16662af1e266
  commits:
    - 00400de
    - 03d94b3
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
    - 2a7eff2
    - 2b68a94
    - 2c2e6a4
    - 2c5ffeb
    - 30baa8d
    - 3107c1b
    - 401b86a
    - 457220a
    - 471d15b
    - 4bff118
    - 4d5aa50
    - 4f751b8
    - 561f910
    - 5d46f4b
    - 5f13bde
    - 60938f4
    - 60ea826
    - 626d6d6
    - 64a8e95
    - 66ba1d5
    - 6c7cef8
    - 76c40e2
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
    - b2d4c94
    - b330d22
    - b6d2610
    - be956d7
    - bec0af8
    - c0a7685
    - c1db097
    - c51c2b5
    - d363c9a
    - d6d03db
    - d9f240b
    - dbe1056
    - e1ff563
    - e28eb08
    - e3d5ef8
    - e3da62b
    - e541eb1
    - e56694e
    - e594327
    - e5a4396
    - f511b61
    - fbf5494
    - fe5861e
  acceptance:
    total: 8
    done: 8
  audit:
    at: "2026-10-12T07:21:39Z"
    passed: true
    tree: a1bb30534053fb648dddc7cb5acc702a528fb7d948e1cd0463dc16662af1e266
    results:
      - name: osv-scanner (dependencies, offline db)
        exit_code: 0
        summary: |-
          Scanning dir .
          Starting filesystem walk for root: /
          Scanned /Users/anasfikri/Documents/Projects/pcpexpress/data-dashboard/.claude/worktrees/t-001-scaffold/package-lock.json file and found 715 packages
          End status: 96 dirs visited, 391 inodes visited, 1 Extract calls, 63.289333ms elapsed, 63.29ms wall time
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
Alur B3 tahap raw. Proses worker/ terpisah, BullMQ concurrency 1, DuckDB memory_limit 1GB + temp_directory. Stream dari MinIO, SHA-256 sambil jalan. CSV: sniff 64 KB (encoding UTF-8/Windows-1252, delimiter, quote). xlsx: verifikasi ZIP/workbook, sheet satu per satu dengan parser ADR-0002, sel tanggal → ISO. Batch 50k → raw.parquet kolom posisional c1..cN VARCHAR + _row, semua baris. Tiap batch cek dataset masih ada. Setelah sheet: tebak headerRow (heuristik ≥ 60% sel teks unik non-kosong), nama kolom unik deterministik (kosong → kolom_<pos>, duplikat → _2), nama asli disimpan. Progres per sheet (baris diproses, total perkiraan) ditulis ke versi tiap ≤ 5 detik. Error → hapus semua objek Parquet versi, FAILED + pesan sheet/baris. Job diulang → hapus objek versi dulu (idempoten). Lib bersama src/lib/duckdb (koneksi, baca Parquet lokal/S3, interrupt) dibangun di sini.

## Acceptance criteria
- [x] Given fixture xlsx 3 sheet dengan header di baris ke-4, header kosong dan duplikat, when ingest, then headerRow=4 tersimpan, kolom bernama unik deterministik dengan nama asli tersimpan, dan jumlah baris raw per sheet = baris data + baris di atas header
- [x] Given fixture csv Windows-1252 delimiter titik koma, when ingest, then encoding dan delimiter terdeteksi dan karakter aksen utuh di raw.parquet
- [x] Given job dibunuh di tengah lalu diulang BullMQ, when job kedua selesai, then objek Parquet versi identik dengan ingest tanpa gangguan dan tidak ada objek parsial tersisa
- [x] Given dataset dihapus saat ingest berjalan, when batch berikutnya diproses, then worker berhenti dan objek versi dihapus
- [x] Given file xlsx rusak di tengah, when ingest gagal, then versi FAILED dengan pesan sheet/baris dan tidak ada objek Parquet versi tersisa
- [x] Given fixture xlsx 1 GB (perf), when ingest penuh, then selesai < 15 menit dengan puncak RSS < 2 GB; bukti di docs/ai/perf/T-006.md
- [x] Given fixture zip-bomb kecil (rasio > 20×) atau xlsx dengan <!DOCTYPE, when ingest, then FAILED cepat dengan pesan jelas tanpa RSS melampaui batas
- [x] Given sheet > 1.048.576 baris, kolom > 16.384, sheet > 50, atau sel > 32.767 karakter, when ingest, then baris/kolom/sheet berlebih ditolak dengan pesan dan sel panjang dipotong + dihitung; job > 60 menit → FAILED

## Risk
Risk level: HIGH. Worker memproses file tak tepercaya sampai 1 GB dengan akses storage dan DB; salah penanganan berarti DoS worker, objek yatim, atau versi tersangkut.

Impact surface:
- **Data:** prisma Sheet + DatasetVersion.ingestStartedAt/ingestStage/progress (migrasi ingest_sheet).
- **Pipeline:** src/features/ingest/* (ingest, csv, csv-sniff, header, raw-writer, repo), src/lib/duckdb, src/lib/storage/files.ts, src/lib/xlsx (parser dipindah dari scripts/bench + drain/onSheet/onProgress).
- **Worker:** antrean ingest, sapuan UPLOADED, penanganan gagal di percobaan terakhir.
- **Env dan skrip:** env WORKER_TMP_DIR, scripts/perf-ingest.ts, dev-upload-fixture "ingest".

Security (STRIDE):
- **DoS:**
  - File xlsx dibatasi seperti parser ADR-0005 (memori < ~500 MB; zip, XML, sel, baris, kolom, sheet).
  - CSV dibatasi: kolom ≤ 16.384, baris kosong ≤ 1 juta, max_line_size 8 MB, sel > 32.767 dipotong.
  - DuckDB dibatasi memory_limit 1 GB, temp ≤ 8 GB, threads 2.
  - Deadline 60 menit per percobaan, dengan watchdog interrupt untuk query panjang.
  - Concurrency 1 per proses; antrean ≤ satu potongan stream (drain).
- **Tampering:** isi file tidak pernah dieksekusi. Nama kolom hanya disimpan sebagai metadata dan dikutip saat dipakai SQL. Path DuckDB dibuat program, sedangkan nilai user lewat parameter binding.
- **Information disclosure:** pesan FAILED hanya menyebut sheet, baris, dan jenis masalah, tanpa path internal. Objek Parquet hanya di prefix versi, tanpa presigned GET.
- **Repudiation:** log terstruktur jobId/versionId/attempt.
- **Elevation:** worker tidak menerima input user selain versionId dari antrean, dan versi dibaca dari DB.

Compatibility: status versi tetap INGESTING dengan ingestStage "raw" sampai T-007 menulis typed dan READY. Label UI "Memproses" tetap benar.

Failure modes:
- **Worker mati atau diulang:** percobaan berikutnya menghapus prefix Parquet versi dan Sheet dulu, sehingga hasilnya identik (Parquet deterministik, diuji).
- **Dataset dihapus di tengah:** dicek tiap batch, saat watchdog, dan setelah unggah; worker berhenti lalu prefix dihapus.
- **Gagal permanen:** versi FAILED, prefix dan Sheet dihapus.
- **Gagal sementara:** BullMQ mengulang (3×). Bila percobaan terakhir gagal, versi FAILED dengan pesan umum.
- **Enqueue sempat gagal:** worker menyapu versi UPLOADED tanpa job saat start.

Rollback: revert commit dan drop migrasi ingest_sheet (kolom baru nullable, tabel Sheet baru); worker lama tidak memproses antrean ingest.

Validation:
- **Unit:**
  - header, nama kolom, sniff, pemindai, raw text;
  - ingest end-to-end in-process (25 test): 3 sheet header baris 4, Windows-1252, BOM, RFC 4180, UTF-16 ditolak, crash lalu ulang identik, upload putus lalu ulang identik, dataset dihapus saat batch dan saat unggah, xlsx rusak di tengah, zip-bomb, DOCTYPE, batas baris, deadline, sel panjang xlsx/csv.
- **e2e worker sungguhan:** xlsx 3 sheet, CSV Windows-1252, DOCTYPE dengan pesan di halaman.
- **Perf:** docs/ai/perf/T-006.md (xlsx 1 GB 324 s / 884 MB; csv 1 GB 50 s / 1.066 MB).

Open risks/assumptions:
- Transfer jaringan 1 GB tidak diukur di sini (T-024).
- Batas rasio zip 100x (ADR-0005) lebih longgar dari catatan awal "20×"; fixture zip-bomb (117x) tetap ditolak cepat.
- UI progres per sheet dibangun di T-008 (data progress sudah tersimpan tiap ≤ 5 detik).

## Notes
- 2026-10-11T14:56:59Z Batas: byte terdekompresi ≤ 20× ukuran file; temp_directory + max_temp_directory_size; lock Redis memakai PX TTL + compare-and-delete.
- 2026-10-12T01:31:31Z Dari T-004: antrean 'ingest' jobId=versionId, data {versionId} (src/lib/queue/connection.ts). Worker entry src/worker/index.ts sudah ada (antrean maintenance); tambah processor ingest di sana. Saat start, sapu versi UPLOADED tanpa job (enqueue bisa gagal saat Redis mati, versi tetap UPLOADED). Objek sumber: raw/<datasetId>/<versionId>/source.<xlsx|csv>, Content-Type application/octet-stream.
- 2026-10-12T02:47:36Z Dari T-005 (ADR-0005): pakai scripts/bench/parser-sax.ts sebagai dasar parser produksi (pindahkan ke src/, pertahankan batas: entri ≤ 10k, total tak terkompresi ≤ 24 GiB, rasio > 200x ditolak, DOCTYPE ditolak, spill sst > 128 MB). Unduh objek sumber ke disk temp worker dulu (zip butuh akses acak; disk temp ≥ 2× ukuran file). Nomor baris dari atribut r (baris kosong tidak dipancarkan; _row fisik). CSV: DuckDB read_csv langsung ke Parquet dengan kolom eksplisit hasil sniff 64 KB (all_varchar, null_padding). Jangan pakai DuckDB read_xlsx (kolom hilang tanpa range, OOM di 1 GB) atau ExcelJS. Fixture: tests/fixtures/kecil.xlsx dkk + manifest untuk verifikasi per sel. Ekstensi DuckDB tidak dipakai untuk xlsx, jadi tidak perlu bundel ekstensi excel.
- 2026-10-12T02:59:52Z Koreksi setelah review T-005 (menggantikan angka di catatan sebelumnya): batas parser kini rasio per entri ≤ 100x, total tak terkompresi ≤ min(24 GiB, 100× ukuran file), entri tumpang tindih ditolak, ≤ 50 sheet, ≤ 1.048.576 baris, ≤ 16.384 kolom, sel > 32.767 karakter dipotong + dihitung (ParseSummary.truncatedCells), nomor baris wajib naik, opsi deadline. Lihat ADR-0005 bagian Parameter.
- 2026-10-12T03:21:39Z Dari review T-005 putaran 4: batch raw.parquet harus di-flush berdasarkan jumlah baris (50k) ATAU ukuran (mis. 64 MB teks), mana yang lebih dulu — satu baris sah bisa berisi sampai 4 juta karakter sehingga 50k baris tanpa batas byte bisa menghabiskan memori.

## Security checklist (OWASP ASVS 4.0.3)
<!-- Check each item when verified, or write "N/A: <reason>" after the text and check it. -->
- [x] V1 Architecture: trust boundaries and the components handling sensitive data are identified for this change — diverifikasi: batas kepercayaan = file unggahan (tak tepercaya) → worker terpisah dari app; worker hanya menerima versionId dari antrean, data versi dibaca dari DB; direktori kerja per job di WORKER_TMP_DIR
- [x] V2 Authentication: credentials are verified server-side; no default, hard-coded, or weak secrets — N/A: worker tanpa endpoint/autentikasi user; kredensial DB/Redis/S3 dari env
- [x] V3 Session management: session tokens are random, protected, invalidated on logout and expiry — N/A: tidak menyentuh sesi
- [x] V4 Access control: every endpoint/action checks authorization server-side, deny by default (no IDOR) — diverifikasi: tidak ada input user selain versionId antrean; objek hanya ditulis ke prefix parquet/<datasetId>/<versionId>/ milik versi itu
- [x] V5 Validation, sanitization and encoding: all input validated; output encoded; no injection (SQL, OS, template) — diverifikasi: isi file tidak dieksekusi; SQL DuckDB memakai parameter binding untuk path/delimiter, identifier dibuat program dan dikutip; nama kolom user hanya metadata JSON
- [x] V6 Stored cryptography: sensitive data at rest uses approved algorithms; keys are not in the code — N/A: tidak ada data kriptografis baru (SHA-256 isi file untuk integritas)
- [x] V7 Error handling and logging: errors reveal no internals; security events are logged without secrets — diverifikasi: pesan FAILED menyebut sheet/baris/jenis masalah tanpa path internal; log pino jobId/versionId/attempt
- [x] V8 Data protection: personal/sensitive data is minimized, not cached or logged, and removable — diverifikasi: gagal/dataset dihapus → prefix parquet versi + metadata Sheet dihapus (hapus gagal → StorageCleanup); datasetId ikut di data job; direktori temp dihapus di finally, sisa worker mati dihapus saat start
- [x] V9 Communication: TLS for all external traffic; certificates validated — N/A: komunikasi ke storage/DB/Redis internal (TLS produksi di T-023)
- [x] V10 Malicious code: no backdoors, time bombs, or unexplained network calls; dependencies are trusted — diverifikasi: tanpa dependency baru di T-006; ekstensi DuckDB tidak di-autoload/diunduh saat runtime
- [x] V11 Business logic: flows cannot be abused (limits, ordering, replay, race conditions) — diverifikasi: concurrency 1 per worker, job idempoten (bersih dulu, Parquet deterministik), sapuan UPLOADED tanpa job, gagal sementara diulang 3× lalu FAILED (status job sebagai sumber kebenaran, termasuk stalled) + bersih; penyapu INGESTING macet tiap 15 menit
- [x] V12 Files and resources: uploads are type/size limited and stored safely; no path traversal or SSRF — diverifikasi: batas parser ADR-0005; kolom raw ≤ 2.048 (xlsx dan CSV), baris kosong CSV ≤ 1 juta, max_line_size 8 MB, sel dipotong 32.767; DuckDB memory_limit 1 GB + temp ≤ 8 GB, tanpa operator lebar yang OOM (test 1.000/1.100 kolom di 256 MB); deadline 60 menit + watchdog interrupt di semua query panjang; xlsx rusak/zip-bomb/DOCTYPE → FAILED (test)
- [x] V13 API and web service: API inputs/outputs are schema-validated; CORS and rate limits are deliberate — N/A: tidak ada API baru
- [x] V14 Configuration: secure defaults, security headers, no debug in production, dependencies up to date — diverifikasi: WORKER_TMP_DIR terdokumentasi (butuh upload + 8 GiB), autoinstall/autoload ekstensi DuckDB dimatikan, perf terpisah dari check

## Evidence
<!-- Generated by aitk close. -->
- Check: `npm run check` → exit 0 at 2026-10-12T07:20:25Z (28041 ms)
- Acceptance criteria: 8/8 satisfied
- Commits: 00400de, 03d94b3, 0423efd, 0458545, 0b3dbca, 0d4c16b, 15536b5, 183aee3, 1add773, 22b384e, 24e2978, 2653b85, 27bf134, 29f1080, 2a7eff2, 2b68a94, 2c2e6a4, 2c5ffeb, 30baa8d, 3107c1b, 401b86a, 457220a, 471d15b, 4bff118, 4d5aa50, 4f751b8, 561f910, 5d46f4b, 5f13bde, 60938f4, 60ea826, 626d6d6, 64a8e95, 66ba1d5, 6c7cef8, 76c40e2, 7c5267b, 7d27e01, 7dddfc4, 8492031, 915c9f1, 9558d66, 9835114, 9b2bfc6, 9cd6ff0, 9cee0e6, a384931, ab9e083, b189cbc, b2a1115, b2d4c94, b330d22, b6d2610, be956d7, bec0af8, c0a7685, c1db097, c51c2b5, d363c9a, d6d03db, d9f240b, dbe1056, e1ff563, e28eb08, e3d5ef8, e3da62b, e541eb1, e56694e, e594327, e5a4396, f511b61, fbf5494, fe5861e
- Review pass 1 by claude-security-reviewer-subagen: 13 findings
- Review pass 2 by claude-security-reviewer-subagen: 2 findings
- Review pass 3 by claude-security-reviewer-subagen: 1 findings
- Review pass 4 by claude-security-reviewer-subagen: 0 findings
