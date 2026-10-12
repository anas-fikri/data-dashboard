---
id: T-007
title: Inferensi tipe dan typed.parquet per schemaRevision
status: done
profile: strict
profile_pinned: true
goal: G-3
depends_on:
  - T-006
created: "2026-10-11T14:45:08Z"
updated: "2026-10-12T10:15:14Z"
closed: "2026-10-12T10:15:14Z"
created_by: claude-code
workers:
  - claude-code
branch: worktree-t-001-scaffold
base: ae491a653eb3e594e7e2b4206be02da59ce09105
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
  - prisma/migrations/20261012073023_typed_schema/migration.sql
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
  - src/features/ingest/infer.ts
  - src/features/ingest/ingest.ts
  - src/features/ingest/raw-text.ts
  - src/features/ingest/raw-writer.ts
  - src/features/ingest/recast.ts
  - src/features/ingest/recovery.ts
  - src/features/ingest/repo.ts
  - src/features/ingest/typed.ts
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
  - src/lib/lock.ts
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
  - tests/features/ingest/recast.test.ts
  - tests/features/ingest/recovery.test.ts
  - tests/features/ingest/typed.test.ts
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
      at: "2026-10-12T09:14:14Z"
      findings: 19
    - "n": 2
      by: claude-security-reviewer-subagen
      at: "2026-10-12T09:46:13Z"
      findings: 3
    - "n": 3
      by: claude-security-reviewer-subagen
      at: "2026-10-12T10:10:43Z"
      findings: 1
    - "n": 4
      by: claude-security-reviewer-subagen
      at: "2026-10-12T10:14:03Z"
      findings: 0
evidence:
  check:
    cmd: npm run check
    exit_code: 0
    duration_ms: 29377
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

      {"level":40,"time":1791800080746,"service":"data-dashboard","check":"B","detail":"koneksi ditolak","msg":"health check gagal"}
      {"level":40,"time":1791800080767,"service":"data-dashboard","check":"Lambat","detail":"Lambat: timeout 20 ms","msg":"health check gagal"}

       Test Files  20 passed (20)
            Tests  209 passed (209)
         Start at  17:14:40
         Duration  22.55s (tests 93%, transform 4%, import 4%)


      > data-dashboard@0.1.0 audit
      > npm audit --audit-level=high --omit=dev && npm audit --audit-level=critical

      found 0 vulnerabilities
      found 0 vulnerabilities
    at: "2026-10-12T10:15:04Z"
    tree: 780a3fa8fc125a6c7c7b9b399d364792abca00ae198cc10a81e92bfcd7ad14dc
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
    - 2291c8a
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
    - 316fa62
    - 327dde2
    - 38adbac
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
    - "6248130"
    - 626d6d6
    - 64a8e95
    - 66ba1d5
    - 6c7cef8
    - 76c40e2
    - 798158f
    - 7c5267b
    - 7d27e01
    - 7dddfc4
    - "8492031"
    - 8963fe4
    - 915c9f1
    - 9558d66
    - "9835114"
    - 9b2bfc6
    - 9cd6ff0
    - 9cee0e6
    - a02a7c0
    - a384931
    - ab9e083
    - ae491a6
    - b189cbc
    - b2a1115
    - b2d4c94
    - b330d22
    - b6d2610
    - bdd24f1
    - be956d7
    - bec0af8
    - c0a7685
    - c1db097
    - c51c2b5
    - d0e8dd2
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
    total: 5
    done: 5
  audit:
    at: "2026-10-12T10:14:25Z"
    passed: true
    tree: 780a3fa8fc125a6c7c7b9b399d364792abca00ae198cc10a81e92bfcd7ad14dc
    results:
      - name: osv-scanner (dependencies, offline db)
        exit_code: 0
        summary: |-
          Scanning dir .
          Starting filesystem walk for root: /
          Scanned /Users/anasfikri/Documents/Projects/pcpexpress/data-dashboard/.claude/worktrees/t-001-scaffold/package-lock.json file and found 715 packages
          End status: 97 dirs visited, 402 inodes visited, 1 Extract calls, 57.359208ms elapsed, 57.36ms wall time
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
Alur B3 tahap typed untuk versi pertama. Inferensi penuh via DuckDB TRY_CAST atas raw (WHERE _row > headerRow): bulat → DECIMAL(38,6) → tanggal/waktu pola teks → boolean literal (true/false/ya/tidak/yes/no, bukan 0/1) → teks; terpilih bila ≥ 98% non-kosong lolos. Deteksi numberLocale per kolom (ID bila ada ',' desimal atau pola \.\d{3}). Tanggal naive tanpa zona (D8). Tulis typed-1.parquet; nilai gagal → NULL + jumlah. Skema (nama tampil, nama asli, tipe, format tanggal, numberLocale, hidden=false, nullPct, distinctCount, castFailCount) + schemaRevision=1 ke PostgreSQL. Fungsi recast(sheet, schema) → typed-<rev+1>.parquet baru, pointer diganti setelah lengkap, file lama dihapus setelah 1 jam, lock Redis SET NX recast:<sheetId>.

## Acceptance criteria
- [x] Given kolom 99% angka 1% teks, when inferensi, then tipe DECIMAL dengan castFailCount = jumlah teks; given kolom 90% angka 10% teks, then tipe teks
- [x] Given kolom berisi hanya 0 dan 1, when inferensi, then tipe bilangan bulat (bukan boolean); given kolom berisi 'ya'/'tidak', then boolean
- [x] Given kolom '1.234.567,89' dan kolom '1234.5', when inferensi, then kolom pertama numberLocale ID bernilai 1234567.89 dan kolom kedua US bernilai 1234.5
- [x] Given kolom tanggal xlsx asli dan kolom teks '03/01/2026', when inferensi, then keduanya DATE bernilai 2026-01-03 tanpa pergeseran zona
- [x] Given recast dipanggil dua kali bersamaan pada sheet yang sama, when berjalan, then hanya satu yang mengeksekusi, menghasilkan typed-2.parquet, dan typed-1.parquet masih ada sampai 1 jam

## Risk
Risk level: HIGH. Tahap typed menentukan nilai yang dilihat semua dashboard, dan recast menerima input user (T-008) yang ikut membentuk SQL. Salah tipe berarti angka/tanggal salah di dashboard; salah validasi berarti SQL rusak atau DoS worker.

Impact surface:
- **Data:** migrasi typed_schema (Sheet.typedKey, schemaRevision, schema JSON). DatasetVersion menjadi READY + aktif (Dataset.activeVersionId) setelah semua sheet typed.
- **Pipeline:**
  - src/features/ingest/infer.ts: profil, keputusan tipe, ekspresi SQL;
  - typed.ts, recast.ts;
  - ingest.ts: tahap typed + finish;
  - repo.ts: setTyped, finish, prismaRecastRepo;
  - recovery.ts: penyapu tanpa filter tahap.
- **Lib:** src/lib/lock.ts (lock Redis), src/lib/queue (antrean recast, enqueueRecast, producer generik), src/lib/storage/objects.ts (deleteObject).
- **Worker:** antrean recast (concurrency 1) dan job maintenance delete-object (tertunda 1 jam).

Security (STRIDE):
- **Tampering/injection:** input recast divalidasi zod di recastSheet (selain di API T-008).
  - Tipe, locale, dan format tanggal berupa enum; pos dan headerRow bilangan bulat dalam rentang; kunci asing ditolak.
  - SQL hanya dibangun dari enum, angka, dan identifier c<pos> yang dikutip. Nama tampil tidak pernah masuk SQL. Pola regex dan format strptime adalah konstanta program, dilewatkan sebagai literal.
- **DoS:**
  - Profil memakai format long (UNPIVOT), sehingga jumlah agregat tetap untuk 2.048 kolom.
  - Profil dan COPY typed di bawah watchdog (deadline + dataset/sheet masih ada) dan memory_limit DuckDB.
  - Recast: satu per sheet (lock SET NX PX 3 menit, diperpanjang tiap menit dan dilepas dengan compare-and-delete Lua), deadline 20 menit, concurrency 1 per worker.
  - Profil: tiga query streaming bersaring WHERE (dasar/angka/tanggal) per ≤ 256 kolom; tanpa CTE bersama, karena CTE yang dimaterialisasi meluap ke file DB tanpa batas temp (review R1).
  - Baris > 180 juta karakter per potongan 2.048 baris ditolak lebih awal (RowTooLargeError).
- **Information disclosure:** typed.parquet di prefix versi yang sama dengan raw, tanpa presigned GET.
- **Elevation:** deleteObject hanya menerima kunci parquet/ tanpa "..". Kunci berasal dari DB (typedKey lama), bukan dari user.
- **Repudiation:** log jobId/sheetId/outcome recast.

Compatibility:
- Versi selesai ingest kini READY dan aktif (label "Siap").
- Sementara sampai T-013: setiap versi diinferensi dan diaktifkan. T-013 mengganti jalur refresh dengan cast memakai skema aktif.
- typed.parquet memakai nama kolom posisional c<pos>; nama tampil ada di Sheet.schema (dipakai T-009).

Failure modes:
- **Job ingest diulang:** prefix dan Sheet dibersihkan dulu; typed-1 deterministik (diuji identik bersama raw).
- **Recast bersamaan:** satu dieksekusi. Yang lain "busy" lalu ditunda 30 s (moveToDelayed + DelayedError, tanpa memakai jatah percobaan) sampai 30 menit. Dengan baseRevision, edit lama berakhir "stale".
- **Revisi berubah di tengah recast:** file baru dihapus, pointer lama tetap ("stale").
- **Worker mati saat recast:** lock lepas ≤ 3 menit (tidak diperpanjang lagi); pointer belum diganti; file typed-<rev>-<token> milik percobaan itu yatim di prefix versi dan ikut terhapus saat versi/dataset dihapus. Swap yang sudah commit lalu putus koneksi tidak menghapus file aktif (N1).
- **Job delete-object hilang:** typed lama tertinggal di prefix versi dan ikut terhapus saat versi/dataset dihapus (retensi T-013).

Rollback: revert commit T-007. Migrasi typed_schema hanya menambah kolom (nullable/default) sehingga boleh tetap. Versi READY tetap terbaca karena raw tidak berubah.

Validation:
- **Unit:**
  - typed.test.ts: AC 1–4, angka kanonik xlsx, kode bernol-depan, durasi, timestamp, statistik, decide;
  - recast.test.ts: AC 5, pilihan bertahan, ganti header, stale, lock dilepas saat error, input tidak valid;
  - ingest.test.ts: typed identik setelah job diulang;
  - recovery.test.ts.
- **e2e:** ingest.spec dengan worker sungguhan: READY + aktif + raw/typed per sheet, label "Siap" di halaman.
- **Perf:** docs/ai/perf/T-007.md (ingest 1 GB penuh, termasuk tahap typed).

Open risks/assumptions:
- distinctCount pasti hanya untuk kolom ≤ 10.000 nilai unik; di atas itu perkiraan HyperLogLog (± 2–4%).
- Format durasi [h]:mm dan jam (h:mm) sama-sama tersimpan sebagai durasi detik (format angka tidak tersimpan di raw).
- Bulan bernama (Jan/Mei/Agu) belum dikenali sebagai tanggal; user bisa memilih tipe di T-008.

## Notes
- 2026-10-11T14:56:59Z Lock recast: SET NX PX 30 menit + compare-and-delete (Lua) agar worker mati tidak mengunci selamanya. Hapus typed lama via job, bukan lifecycle.
- 2026-10-12T02:59:45Z Dari review T-005: format angka durasi seperti [h]:mm dideteksi parser sebagai tanggal (serial 1.5 → 1899-12-31T12:00); inferensi tipe harus mengenali kolom berformat durasi dan menyimpannya sebagai durasi/angka, bukan tanggal.

## Security checklist (OWASP ASVS 4.0.3)
<!-- Check each item when verified, or write "N/A: <reason>" after the text and check it. -->
- [x] V1 Architecture: trust boundaries and the components handling sensitive data are identified for this change — diverifikasi: batas kepercayaan = isi file (raw.parquet) dan input recast dari user (T-008) → diproses di worker terpisah; skema dan pointer typed di DB, objek di prefix versi
- [x] V2 Authentication: credentials are verified server-side; no default, hard-coded, or weak secrets — N/A: tidak ada endpoint/autentikasi baru (API recast di T-008); kredensial DB/Redis/S3 dari env
- [x] V3 Session management: session tokens are random, protected, invalidated on logout and expiry — N/A: tidak menyentuh sesi
- [x] V4 Access control: every endpoint/action checks authorization server-side, deny by default (no IDOR) — diverifikasi: recast hanya untuk sheetId dari antrean (otorisasi pemilik di API T-008); objek hanya ditulis/dihapus di prefix versi sheet itu; deleteObject hanya menerima kunci typed-<rev>[-token].parquet di prefix versi (raw tidak pernah cocok)
- [x] V5 Validation, sanitization and encoding: all input validated; output encoded; no injection (SQL, OS, template) — diverifikasi: input recast divalidasi zod (enum tipe/locale/format, pos dan headerRow bulat dalam rentang, kunci asing ditolak); SQL hanya dari enum/angka/identifier c<pos> yang dikutip dan konstanta program; nama tampil tidak masuk SQL
- [x] V6 Stored cryptography: sensitive data at rest uses approved algorithms; keys are not in the code — N/A: tidak ada data kriptografis baru
- [x] V7 Error handling and logging: errors reveal no internals; security events are logged without secrets — diverifikasi: outcome recast (done/busy/stale/gone/invalid) dicatat dengan jobId/sheetId tanpa isi data; gagal cast dihitung per kolom, bukan dilempar
- [x] V8 Data protection: personal/sensitive data is minimized, not cached or logged, and removable — diverifikasi: typed lama dihapus 1 jam setelah diganti (job delete-object); typed ikut terhapus bersama prefix versi/dataset; tidak ada data sel di log
- [x] V9 Communication: TLS for all external traffic; certificates validated — N/A: komunikasi internal ke storage/DB/Redis (TLS produksi di T-023)
- [x] V10 Malicious code: no backdoors, time bombs, or unexplained network calls; dependencies are trusted — diverifikasi: tanpa dependency baru (zod sudah ada); ekstensi DuckDB tidak diunduh saat runtime
- [x] V11 Business logic: flows cannot be abused (limits, ordering, replay, race conditions) — diverifikasi: satu recast per sheet (lock SET NX PX 3 menit diperpanjang tiap menit + compare-and-delete, deadline 20 menit), busy ditunda tanpa memakai percobaan, baseRevision menolak edit lama, pointer diganti optimistic per schemaRevision (stale → file baru dihapus), versi READY + aktif dalam satu transaksi
- [x] V12 Files and resources: uploads are type/size limited and stored safely; no path traversal or SSRF — diverifikasi: profil format long dengan agregat tetap (aman 2.048 kolom), watchdog deadline/sheet masih ada di semua query panjang, memory_limit DuckDB 1 GB, recast concurrency 1
- [x] V13 API and web service: API inputs/outputs are schema-validated; CORS and rate limits are deliberate — N/A: tidak ada API baru di task ini (enqueueRecast dipakai API T-008)
- [x] V14 Configuration: secure defaults, security headers, no debug in production, dependencies up to date — diverifikasi: migrasi aditif (kolom nullable/default), opsi job recast dan delete-object eksplisit, perf terdokumentasi (docs/ai/perf/T-007.md)

## Evidence
<!-- Generated by aitk close. -->
- Check: `npm run check` → exit 0 at 2026-10-12T10:15:04Z (29377 ms)
- Acceptance criteria: 5/5 satisfied
- Commits: 00400de, 03d94b3, 0423efd, 0458545, 0b3dbca, 0d4c16b, 15536b5, 183aee3, 1add773, 2291c8a, 22b384e, 24e2978, 2653b85, 27bf134, 29f1080, 2a7eff2, 2b68a94, 2c2e6a4, 2c5ffeb, 30baa8d, 3107c1b, 316fa62, 327dde2, 38adbac, 401b86a, 457220a, 471d15b, 4bff118, 4d5aa50, 4f751b8, 561f910, 5d46f4b, 5f13bde, 60938f4, 60ea826, 6248130, 626d6d6, 64a8e95, 66ba1d5, 6c7cef8, 76c40e2, 798158f, 7c5267b, 7d27e01, 7dddfc4, 8492031, 8963fe4, 915c9f1, 9558d66, 9835114, 9b2bfc6, 9cd6ff0, 9cee0e6, a02a7c0, a384931, ab9e083, ae491a6, b189cbc, b2a1115, b2d4c94, b330d22, b6d2610, bdd24f1, be956d7, bec0af8, c0a7685, c1db097, c51c2b5, d0e8dd2, d363c9a, d6d03db, d9f240b, dbe1056, e1ff563, e28eb08, e3d5ef8, e3da62b, e541eb1, e56694e, e594327, e5a4396, f511b61, fbf5494, fe5861e
- Review pass 1 by claude-security-reviewer-subagen: 19 findings
- Review pass 2 by claude-security-reviewer-subagen: 3 findings
- Review pass 3 by claude-security-reviewer-subagen: 1 findings
- Review pass 4 by claude-security-reviewer-subagen: 0 findings
