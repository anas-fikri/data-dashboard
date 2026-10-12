---
id: T-008
title: Halaman status ingest, review skema, dan koreksi
status: done
profile: strict
goal: G-3
depends_on:
  - T-007
created: "2026-10-11T14:45:08Z"
updated: "2026-10-12T13:27:48Z"
closed: "2026-10-12T13:27:48Z"
created_by: claude-code
workers:
  - claude-code
branch: worktree-t-001-scaffold
base: 724603c823c68df2314d780f94b1513afd84391d
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
  - prisma/migrations/20261012112638_sheet_preview/migration.sql
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
  - scripts/perf-query.ts
  - scripts/perf.mjs
  - scripts/smoke-prod-headers.mjs
  - scripts/storage-init.mjs
  - src/app/(app)/admin/page.tsx
  - src/app/(app)/akun/keamanan/page.tsx
  - src/app/(app)/akun/page.tsx
  - src/app/(app)/dashboards/page.tsx
  - src/app/(app)/datasets/[id]/page.tsx
  - src/app/(app)/datasets/[id]/skema/page.tsx
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
  - src/app/api/datasets/[id]/progress/route.ts
  - src/app/api/health/route.ts
  - src/app/api/query/route.ts
  - src/app/api/sheets/[id]/recast/[jobId]/route.ts
  - src/app/api/sheets/[id]/recast/route.ts
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
  - src/components/datasets/ingest-progress.tsx
  - src/components/datasets/status-badge.tsx
  - src/components/datasets/upload-panel.tsx
  - src/components/schema/column-editor.tsx
  - src/components/schema/column-row.tsx
  - src/components/schema/column-toolbar.tsx
  - src/components/schema/format-cell.tsx
  - src/components/schema/header-preview-list.tsx
  - src/components/schema/header-row-picker.tsx
  - src/components/schema/labels.ts
  - src/components/schema/recast-banner.tsx
  - src/components/schema/refresh-button.tsx
  - src/components/schema/retry-notice.tsx
  - src/components/schema/sample-section.tsx
  - src/components/schema/sample-table.tsx
  - src/components/schema/save-bar.tsx
  - src/components/schema/sheet-tabs.tsx
  - src/components/schema/use-recast.tsx
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
  - src/features/ingest/preview.ts
  - src/features/ingest/raw-text.ts
  - src/features/ingest/raw-writer.ts
  - src/features/ingest/recast-input.ts
  - src/features/ingest/recast.ts
  - src/features/ingest/recovery.ts
  - src/features/ingest/repo.ts
  - src/features/ingest/typed.ts
  - src/features/query/cache.ts
  - src/features/query/http.ts
  - src/features/query/local-parquet.ts
  - src/features/query/runtime.ts
  - src/features/query/service.ts
  - src/features/query/spec.ts
  - src/features/query/sql.ts
  - src/features/schema/http.ts
  - src/features/schema/runtime.ts
  - src/features/schema/service.ts
  - src/features/uploads/client.ts
  - src/features/uploads/http.ts
  - src/features/uploads/parts.ts
  - src/features/uploads/service.ts
  - src/features/uploads/sniff.ts
  - src/instrumentation.ts
  - src/lib/db.ts
  - src/lib/duckdb/engine.ts
  - src/lib/duckdb/index.ts
  - src/lib/duckdb/parquet-cache.ts
  - src/lib/env.ts
  - src/lib/health/checks.ts
  - src/lib/health/index.ts
  - src/lib/hooks/use-persisted-boolean.ts
  - src/lib/hooks/use-polling.ts
  - src/lib/hooks/use-session-json.ts
  - src/lib/http-body.ts
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
  - tests/e2e/schema.spec.ts
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
  - tests/features/query/query.test.ts
  - tests/features/schema/schema.test.ts
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
  - tests/lib/http-body.test.ts
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
      at: "2026-10-12T13:12:08Z"
      findings: 2
    - "n": 2
      by: frontend-expert-design-reviewer
      at: "2026-10-12T13:12:08Z"
      findings: 6
    - "n": 3
      by: claude-security-reviewer-subagen
      at: "2026-10-12T13:20:37Z"
      findings: 1
    - "n": 4
      by: frontend-expert-design-reviewer
      at: "2026-10-12T13:20:37Z"
      findings: 1
    - "n": 5
      by: frontend-expert-design-reviewer
      at: "2026-10-12T13:23:25Z"
      findings: 0
    - "n": 6
      by: claude-security-reviewer-subagen
      at: "2026-10-12T13:25:34Z"
      findings: 0
evidence:
  check:
    cmd: npm run check
    exit_code: 0
    duration_ms: 34446
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

      {"level":40,"time":1791811549413,"service":"data-dashboard","check":"B","detail":"koneksi ditolak","msg":"health check gagal"}
      {"level":40,"time":1791811549441,"service":"data-dashboard","check":"Lambat","detail":"Lambat: timeout 20 ms","msg":"health check gagal"}

       Test Files  23 passed (23)
            Tests  278 passed (278)
         Start at  20:25:47
         Duration  26.78s (tests 93%, transform 4%, import 3%)


      > data-dashboard@0.1.0 audit
      > npm audit --audit-level=high --omit=dev && npm audit --audit-level=critical

      found 0 vulnerabilities
      found 0 vulnerabilities
    at: "2026-10-12T13:26:15Z"
    tree: df1e1272d5337e67852b7d4e516a4f784c68e2b4cde4d66a18ac405f11b4e751
  commits:
    - 00400de
    - 03d94b3
    - 0423efd
    - "0458545"
    - 04e47a2
    - 0b3dbca
    - 0d4c16b
    - 15536b5
    - 183aee3
    - 1add773
    - 2291c8a
    - 22b384e
    - 24e2978
    - 2653b85
    - "2725e19"
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
    - 3bf60b5
    - 401b86a
    - 40c4360
    - 457220a
    - 471d15b
    - 4bff118
    - 4d5aa50
    - 4f751b8
    - 561f910
    - 5d46f4b
    - 5def94f
    - 5f13bde
    - 608c247
    - 60938f4
    - 60ea826
    - "6248130"
    - 626d6d6
    - 642bb4e
    - 64a8e95
    - 66ba1d5
    - 6c7cef8
    - 724603c
    - 76c40e2
    - 76e3600
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
    - bdc0360
    - bdd24f1
    - be956d7
    - bec0af8
    - c0a7685
    - c1db097
    - c51c2b5
    - c540736
    - c665ce6
    - ce6ecb7
    - d0e8dd2
    - d1fa24d
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
    - f8b7660
    - fbf5494
    - fe5861e
  acceptance:
    total: 6
    done: 6
  audit:
    at: "2026-10-12T13:27:38Z"
    passed: true
    tree: df1e1272d5337e67852b7d4e516a4f784c68e2b4cde4d66a18ac405f11b4e751
    results:
      - name: osv-scanner (dependencies, offline db)
        exit_code: 0
        summary: |-
          Scanning dir .
          Starting filesystem walk for root: /
          Scanned /Users/anasfikri/Documents/Projects/pcpexpress/data-dashboard/.claude/worktrees/t-001-scaffold/package-lock.json file and found 715 packages
          End status: 112 dirs visited, 464 inodes visited, 1 Extract calls, 59.210417ms elapsed, 59.211ms wall time
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
Halaman profil dataset: progres per sheet (polling ≤ 5 s) dan pesan gagal. Tab skema per sheet: kolom, tipe, % null, unik, gagal cast, 50 baris sampel via src/lib/duckdb. Koreksi: pilih ulang baris header (metadata + re-cast, tanpa parse ulang), rename, ubah tipe/format tanggal termasuk override serial Excel, numberLocale, sembunyikan. Setiap simpan → recast T-007 → schemaRevision naik. UI via plugin frontend-expert.

## Acceptance criteria
- [x] Given versi INGESTING, when halaman profil dibuka, then progres per sheet diperbarui ≤ 5 detik dan setelah FAILED pesan sheet/baris tampil
- [x] Given ingest selesai, when membuka tab skema, then tiap sheet menampilkan kolom, tipe, % null, gagal cast, dan 50 baris sampel
- [x] Given header terdeteksi di baris 1 padahal benar di baris 3, when user memilih baris 3, then skema diganti dengan nama dari baris 3, typed-<rev+1> dibuat tanpa membaca file asli, dan baris 1–3 tidak ada di data
- [x] Given kolom teks '31-12-2025', when user mengubah tipe ke tanggal format dd-mm-yyyy, then kolom DATE dan jumlah baris gagal parse dilaporkan
- [x] Given user mengganti nama tampil kolom, when menyimpan, then nama baru dipakai di builder dan nama asli tetap tersimpan
- [x] Given halaman/komponen task ini selesai, when /frontend-expert:audit dijalankan (anti-slop-design, responsive 320/768/1024/1440, accessibility), then tidak ada temuan Critical/High dan blok Conventions check (Tokens: preset project; Icons: waiver @tabler/icons-react; States loading/empty/error; Responsive; A11y) dicatat sebagai note task

## Risk
- **Impact:**
  - Halaman profil dataset: blok statis "sedang diproses" diganti panel progres hidup.
  - Halaman baru /datasets/[id]/skema.
  - Kolom DB baru Sheet.preview (nullable; data lama = null → hanya input nomor baris).
  - API baru: GET /api/datasets/[id]/progress, POST /api/sheets/[id]/recast, GET /api/sheets/[id]/recast/[jobId].
  - Refactor execOnParquet di query (dipakai /api/query dan sampel).
  - Pesan gagal ingest kini diawali lokasi sheet/baris.
- **Security (STRIDE):**
  - **Spoofing:** semua rute memakai sesi server (requireUser("action")), tanpa sesi → 401.
  - **Tampering:**
    - Koreksi divalidasi zod strict: hanya enum dan angka bulat dalam rentang colCount/1.048.576.
    - Nama tampil tidak pernah masuk SQL.
    - Posisi kolom untuk SQL sampel berasal dari skema di DB (dibulatkan).
    - baseRevision wajib: edit dari tampilan lama → STALE, juga dicek ulang di worker.
  - **Repudiation:** enqueue dan hasil recast dicatat worker (jobId, sheetId, outcome).
  - **Information disclosure:**
    - Sheet selalu di-resolve lewat versi aktif dataset milik user (version.activeFor.ownerId); job milik sheet lain → 404.
    - Respons no-store; error tak terduga → 503 tanpa detail.
  - **DoS:**
    - Recast 20 per 10 menit per user dan worker concurrency 1.
    - Body POST ≤ 256 KB dibaca streaming; sampel ≤ 50 baris × 60 kolom × 200 karakter.
    - Preview ≤ 30 × 50 × 100 karakter.
    - Polling 2,5 s / 1,5 s berhenti saat selesai dan saat tab tersembunyi.
  - **Elevation:** CSRF — POST wajib Origin = APP_URL (403).
- **Rollback:**
  - Revert commit T-008. Migrasi sheet_preview hanya menambah kolom nullable (aman dibiarkan).
  - Revisi skema hasil koreksi tetap valid untuk kode lama (format Sheet.schema tidak berubah).
- **Validation:**
  - Unit: tests/features/schema/schema.test.ts (sampel nyata DuckDB, permintaan dan status koreksi, pesan gagal) dan tes pratinjau ingest.
  - e2e: tests/e2e/schema.spec.ts, project "schema", worker sungguhan, AC 1–5.
  - axe-core WCAG 2.2 AA: 0 pelanggaran di 17 kombinasi state × tema × lebar.
  - Overflow horizontal 0 px di 320/768/1024/1440.

## Notes
- 2026-10-11T14:49:25Z UI wajib lewat rantai frontend-expert: design-foundations → tokens (preset dari T-025) → (+forms/data-fetching/app-shell sesuai kebutuhan) → components → anti-slop-code → responsive → motion ringan → anti-slop-design → polish → accessibility. Skip design-direction karena arah sudah dipilih di T-025, kecuali layar baru yang ambigu. Chart via skill dataviz; filter/select pakai Select kustom dari T-025, bukan native.
- 2026-10-12T10:16:06Z Dikerjakan setelah T-009: sampel 50 baris dan pratinjau skema memakai cache lokal typed.parquet + DuckDB aplikasi (src/lib/query) yang dibangun T-009. Recast dipicu lewat enqueueRecast(sheetId, {baseRevision, headerRow?, columns?}) dari src/lib/queue/versions.ts; outcome busy/stale/invalid/failed ditampilkan ke user.
- 2026-10-12T13:23:25Z Conventions check (frontend-expert /audit putaran 3, commit 5def94f: CRITICAL_HIGH 0, tanpa temuan terbuka). Tokens: preset project zinc-blue (src/styles/tokens.css, globals.css), 0 warna mentah, tinggi kontrol dari --control-h-lg/--control-h/--control-h-sm. Icons: waiver @tabler/icons-react (kebijakan project), tanpa Lucide. States: loading (skeleton sampel, progres dari server, pending bernama, antre/diproses), empty (belum ada data, sheet belum siap + tombol muat ulang, tanpa baris, filter tanpa hasil), error (RetryNotice, basi + muat ulang, polling coba lagi, validasi field), selesai (notifikasi fokus + tombol tutup). Responsive: 320/768/1024/1440, overflow 0 px di semua state; CTA penuh dan ≥ 44 px di bawah 768. Waiver: tautan breadcrumb 24 px (lolos WCAG 2.5.8 AA; tombol 'Kembali ke dataset' 44 px jadi jalur sentuh utama). A11y: axe-core WCAG 2.2 AA 0 pelanggaran di 17 kombinasi + hover, pending, selesai, gelap, progres; keyboard penuh (Tab, Select Enter/panah/Escape, radio panah). Performance UI belum diukur (Lighthouse) — catatan Info.

## Security checklist (OWASP ASVS 4.0.3)
<!-- Check each item when verified, or write "N/A: <reason>" after the text and check it. -->
- [x] V1 Architecture: trust boundaries and the components handling sensitive data are identified for this change — Batas kepercayaan: browser → rute /api/datasets/[id]/progress, /api/sheets/[id]/recast(/[jobId]) dan halaman skema (sesi server) → service (cek pemilik + versi aktif) → Postgres (Sheet.schema/preview), Redis (lock, indeks job, rate limit), BullMQ → worker recast; sampel lewat DuckDB terkunci (T-009). Dirinci di Risk.
- [x] V2 Authentication: credentials are verified server-side; no default, hard-coded, or weak secrets — N/A: tidak ada kredensial baru; semua rute memakai requireUser ("action" → 401 untuk API).
- [x] V3 Session management: session tokens are random, protected, invalidated on logout and expiry — N/A: tidak mengubah sesi. Polling yang menerima 401 berhenti dan halaman dirender ulang ke login.
- [x] V4 Access control: every endpoint/action checks authorization server-side, deny by default (no IDOR) — Dataset where {id, ownerId}; sheet hanya di versi aktif dataset milik user (version.activeFor.ownerId), diuji langsung ke Postgres dalam transaksi yang di-rollback (review). Status job milik sheet lain dijawab sama dengan job tidak ada (tanpa oracle). Bukan pemilik → 404.
- [x] V5 Validation, sanitization and encoding: all input validated; output encoded; no injection (SQL, OS, template) — Koreksi divalidasi zod strict (enum + bilangan bulat dalam rentang colCount/1.048.576, nama 1–120 karakter, nama ganda ditolak); nama tampil tidak pernah masuk SQL; SQL sampel hanya posisi kolom dari DB + $path terikat; id rute divalidasi regex (cuid, ?sheet=\d{1,4}, jobId angka/rc_<hex>); semua teks dirender sebagai teks React (tanpa dangerouslySetInnerHTML).
- [x] V6 Stored cryptography: sensitive data at rest uses approved algorithms; keys are not in the code — N/A: tidak menyimpan rahasia; id job acak dari randomBytes hanya untuk keunikan.
- [x] V7 Error handling and logging: errors reveal no internals; security events are logged without secrets — Error tak terduga → 503 "Layanan sedang tidak tersedia" tanpa detail; failedReason BullMQ tidak pernah dikirim ke klien; log hanya userId/sheetId + pesan error.
- [x] V8 Data protection: personal/sensitive data is minimized, not cached or logged, and removable — Respons API no-store. Pratinjau mentah dibatasi 30 × 50 × 100 karakter; sampel 50 × 60 × 200. Data ikut terhapus bersama dataset (kaskade Sheet; indeks Redis ber-TTL 2 jam).
- [x] V9 Communication: TLS for all external traffic; certificates validated — N/A di aplikasi: tidak ada trafik eksternal baru; TLS di reverse proxy deployment (T-023).
- [x] V10 Malicious code: no backdoors, time bombs, or unexplained network calls; dependencies are trusted — Tanpa dependensi baru; tanpa panggilan jaringan selain Postgres/Redis/BullMQ yang sudah ada; npm audit 0, osv-scanner bersih.
- [x] V11 Business logic: flows cannot be abused (limits, ordering, replay, race conditions) — baseRevision wajib (STALE) + CAS revisi untuk perubahan metadata dan swap typed di worker (dua edit dari revisi yang sama: satu menang, satu basi). Satu job per sheet (BUSY) dan ≤ 2 job berjalan per user (QUEUE_FULL) di bawah lock Redis per user — probe live 3 serentak → 2 antre + 1 ditolak. Rate limit 20/10 menit (recast) dan 60/10 menit (metadata), slot dikembalikan bila antrean gagal.
- [x] V12 Files and resources: uploads are type/size limited and stored safely; no path traversal or SSRF — Tidak ada unggahan baru. Halaman skema hanya memuat sheet yang dibuka (bukan semua sheet); tidak ada path dari input user.
- [x] V13 API and web service: API inputs/outputs are schema-validated; CORS and rate limits are deliberate — Body POST dibaca streaming ≤ 900 KB (413 dengan pesan jelas), Origin wajib = APP_URL (403), content-type JSON; respons berbentuk tetap {ok, code, message}; tanpa header CORS; polling berhenti pada 401/403/404/410.
- [x] V14 Configuration: secure defaults, security headers, no debug in production, dependencies up to date — Tanpa flag/env baru selain aturan rate limit di kode; retensi job recast dibatasi (1 jam/200, gagal 24 jam/500); migrasi hanya menambah kolom nullable.

## Evidence
<!-- Generated by aitk close. -->
- Check: `npm run check` → exit 0 at 2026-10-12T13:26:15Z (34446 ms)
- Acceptance criteria: 6/6 satisfied
- Commits: 00400de, 03d94b3, 0423efd, 0458545, 04e47a2, 0b3dbca, 0d4c16b, 15536b5, 183aee3, 1add773, 2291c8a, 22b384e, 24e2978, 2653b85, 2725e19, 27bf134, 29f1080, 2a7eff2, 2b68a94, 2c2e6a4, 2c5ffeb, 30baa8d, 3107c1b, 316fa62, 327dde2, 38adbac, 3bf60b5, 401b86a, 40c4360, 457220a, 471d15b, 4bff118, 4d5aa50, 4f751b8, 561f910, 5d46f4b, 5def94f, 5f13bde, 608c247, 60938f4, 60ea826, 6248130, 626d6d6, 642bb4e, 64a8e95, 66ba1d5, 6c7cef8, 724603c, 76c40e2, 76e3600, 798158f, 7c5267b, 7d27e01, 7dddfc4, 8492031, 8963fe4, 915c9f1, 9558d66, 9835114, 9b2bfc6, 9cd6ff0, 9cee0e6, a02a7c0, a384931, ab9e083, ae491a6, b189cbc, b2a1115, b2d4c94, b330d22, b6d2610, bdc0360, bdd24f1, be956d7, bec0af8, c0a7685, c1db097, c51c2b5, c540736, c665ce6, ce6ecb7, d0e8dd2, d1fa24d, d363c9a, d6d03db, d9f240b, dbe1056, e1ff563, e28eb08, e3d5ef8, e3da62b, e541eb1, e56694e, e594327, e5a4396, f511b61, f8b7660, fbf5494, fe5861e
- Review pass 1 by claude-security-reviewer-subagen: 2 findings
- Review pass 2 by frontend-expert-design-reviewer: 6 findings
- Review pass 3 by claude-security-reviewer-subagen: 1 findings
- Review pass 4 by frontend-expert-design-reviewer: 1 findings
- Review pass 5 by frontend-expert-design-reviewer: 0 findings
- Review pass 6 by claude-security-reviewer-subagen: 0 findings
