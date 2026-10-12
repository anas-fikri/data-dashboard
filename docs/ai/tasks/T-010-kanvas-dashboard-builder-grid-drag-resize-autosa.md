---
id: T-010
title: 'Kanvas dashboard builder: grid, drag/resize, autosave layout'
status: done
profile: strict
goal: G-4
depends_on:
  - T-003
created: "2026-10-11T14:45:08Z"
updated: "2026-10-12T15:16:37Z"
closed: "2026-10-12T15:16:37Z"
created_by: claude-code
workers:
  - claude-code
branch: worktree-t-001-scaffold
base: 13b3d0b81229d28544cf5d428adf24673f64cb5e
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
  - prisma/migrations/20261012133500_dashboard_widgets/migration.sql
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
  - src/app/(app)/dashboards/[id]/page.tsx
  - src/app/(app)/dashboards/baru/page.tsx
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
  - src/app/api/dashboards/[id]/layout/route.ts
  - src/app/api/dashboards/[id]/widgets/[widgetId]/route.ts
  - src/app/api/dashboards/[id]/widgets/route.ts
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
  - src/components/dashboards/canvas-empty.tsx
  - src/components/dashboards/canvas-toolbar.tsx
  - src/components/dashboards/dashboard-api.ts
  - src/components/dashboards/dashboard-canvas.tsx
  - src/components/dashboards/dashboard-form.tsx
  - src/components/dashboards/dashboard-list.tsx
  - src/components/dashboards/dashboard-settings.tsx
  - src/components/dashboards/layout-ops.ts
  - src/components/dashboards/use-dashboard-editor.ts
  - src/components/dashboards/use-media-query.ts
  - src/components/dashboards/widget-card.tsx
  - src/components/dashboards/widget-panel-frame.tsx
  - src/components/dashboards/widget-panel.tsx
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
  - src/features/dashboards/actions.ts
  - src/features/dashboards/http.ts
  - src/features/dashboards/service.ts
  - src/features/dashboards/validation.ts
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
  - src/lib/api-route.ts
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
  - tests/components/layout-ops.test.ts
  - tests/e2e/auth.spec.ts
  - tests/e2e/dashboards.spec.ts
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
  - tests/features/dashboards/dashboards.test.ts
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
  - tests/lib/api-route.test.ts
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
      at: "2026-10-12T14:27:51Z"
      findings: 2
    - "n": 2
      by: frontend-expert-design-reviewer
      at: "2026-10-12T14:27:51Z"
      findings: 6
    - "n": 3
      by: claude-security-reviewer-subagen
      at: "2026-10-12T14:36:03Z"
      findings: 0
    - "n": 4
      by: claude-security-reviewer-subagen
      at: "2026-10-12T14:39:43Z"
      findings: 0
    - "n": 5
      by: frontend-expert-design-reviewer
      at: "2026-10-12T14:48:30Z"
      findings: 3
    - "n": 6
      by: frontend-expert-design-reviewer
      at: "2026-10-12T15:02:18Z"
      findings: 2
    - "n": 7
      by: frontend-expert-design-reviewer
      at: "2026-10-12T15:14:23Z"
      findings: 0
evidence:
  check:
    cmd: npm run check
    exit_code: 0
    duration_ms: 30954
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

      {"level":40,"time":1791818086498,"service":"data-dashboard","check":"B","detail":"koneksi ditolak","msg":"health check gagal"}
      {"level":40,"time":1791818086523,"service":"data-dashboard","check":"Lambat","detail":"Lambat: timeout 20 ms","msg":"health check gagal"}

       Test Files  26 passed (26)
            Tests  306 passed (306)
         Start at  22:14:44
         Duration  22.81s (tests 92%, import 4%, transform 4%)


      > data-dashboard@0.1.0 audit
      > npm audit --audit-level=high --omit=dev && npm audit --audit-level=critical

      found 0 vulnerabilities
      found 0 vulnerabilities
    at: "2026-10-12T15:15:09Z"
    tree: 48a5a8fb1559299bc593de2341aa838531dd3167136bb693b2f839c122fc30ac
  commits:
    - 00400de
    - 03d94b3
    - 0423efd
    - "0458545"
    - 04e47a2
    - 0b3dbca
    - 0d4c16b
    - 13b3d0b
    - 15536b5
    - 183aee3
    - 1add773
    - "2170640"
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
    - 37af03d
    - 38adbac
    - 3bf60b5
    - 3fd726f
    - 401b86a
    - 40c4360
    - 457220a
    - 471d15b
    - 4bff118
    - 4d5aa50
    - 4f751b8
    - 561f910
    - 5aeb313
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
    - 7fa3c87
    - "8492031"
    - 8963fe4
    - 8e072af
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
    - c67c26b
    - ce6ecb7
    - d0e8dd2
    - d1fa24d
    - d363c9a
    - d6d03db
    - d85299c
    - d9f240b
    - dbe1056
    - ddf64a3
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
    total: 5
    done: 5
  audit:
    at: "2026-10-12T15:15:12Z"
    passed: true
    tree: 48a5a8fb1559299bc593de2341aa838531dd3167136bb693b2f839c122fc30ac
    results:
      - name: osv-scanner (dependencies, offline db)
        exit_code: 0
        summary: |-
          Scanning dir .
          Starting filesystem walk for root: /
          Scanned /Users/anasfikri/Documents/Projects/pcpexpress/data-dashboard/.claude/worktrees/t-001-scaffold/package-lock.json file and found 720 packages
          End status: 124 dirs visited, 505 inodes visited, 1 Extract calls, 60.188625ms elapsed, 60.188ms wall time
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
Model Dashboard {datasetId, name, layout JSON} dan Widget {dashboardId, type, spec JSON, position}. Grid 12 kolom (react-grid-layout), drag/resize, mode edit vs lihat, undo satu langkah, autosave. Maks 10 dashboard per dataset. UI via plugin frontend-expert.

## Acceptance criteria
- [x] Given dashboard baru, when user menambah widget kosong lalu menggeser dan mengubah ukurannya, then posisi dan ukuran identik setelah halaman dimuat ulang
- [x] Given mode lihat, when user mencoba drag widget, then widget tidak bergerak dan panel konfigurasi tidak ada
- [x] Given lebar layar < 768 px, when membuka dashboard, then widget tersusun satu kolom tanpa scroll horizontal
- [x] Given dataset sudah punya 10 dashboard, when membuat yang ke-11, then ditolak code LIMIT_REACHED
- [x] Given halaman/komponen task ini selesai, when /frontend-expert:audit dijalankan (anti-slop-design, responsive 320/768/1024/1440, accessibility), then tidak ada temuan Critical/High dan blok Conventions check (Tokens: preset project; Icons: waiver @tabler/icons-react; States loading/empty/error; Responsive; A11y) dicatat sebagai note task

## Risk
- **Impact:**
  - Model baru Widget; Dashboard mendapat nameKey (unik per dataset), layoutRevision, relasi widgets.
  - Migrasi 20261012133500_dashboard_widgets mengisi nameKey untuk dashboard lama (nama kembar diberi akhiran " (n)").
  - Halaman baru /dashboards, /dashboards/baru, /dashboards/[id] (lihat/edit).
  - API baru: POST /api/dashboards/[id]/widgets, PATCH/DELETE /api/dashboards/[id]/widgets/[widgetId], PUT /api/dashboards/[id]/layout.
  - Komponen bersama yang berubah: PageHeader (tumpuk + CTA full-width sampai 767 px, sebelumnya 639 px), helper src/lib/api-route.ts (dipakai ulang oleh rute skema).
  - Dependensi baru react-grid-layout 2.2.4 (dipin).
- **Security (STRIDE):**
  - **Spoofing:** semua rute dan action memakai sesi server; tanpa sesi → 401.
  - **Tampering:**
    - Tata letak divalidasi zod strict: id cuid unik, x + w ≤ 12, h ≤ 40, y ≤ 2000, ≤ 50 widget.
    - Server selalu memadatkan layout sebelum menyimpan.
    - Tambah, hapus, dan simpan otomatis wajib membawa baseRevision di bawah advisory lock per dashboard: tab yang tertinggal → STALE, tidak pernah menimpa.
    - Nama dinormalisasi NFC; karakter kontrol/format ditolak (kecuali ZWJ/ZWNJ) dan wajib ada karakter terlihat.
  - **Repudiation:** perubahan tata letak tidak diaudit per langkah (bukan data sensitif); kegagalan rute dicatat terstruktur dengan label rute.
  - **Information disclosure:**
    - Dashboard/widget selalu di-resolve lewat dataset.ownerId; milik orang lain → 404 (tanpa oracle).
    - Respons no-store; error tak terduga → 503 tanpa detail.
  - **DoS:**
    - Rate limit dashboardEdit 600 per 10 menit per user.
    - Body JSON ≤ 64 KB.
    - Batas 10 dashboard per dataset dan 50 widget per dashboard dihitung di bawah lock (paralel tidak menembus).
    - Lock yang habis waktu → BUSY (409), bukan 500.
  - **Elevation:** CSRF — mutasi wajib Origin = APP_URL (403); Server Actions Next memeriksa Origin bawaan.
- **Rollback:**
  - Revert commit T-010.
  - Migrasi menambah tabel Widget dan kolom Dashboard; aman dibiarkan untuk kode lama. Kode lama tidak menulis nameKey, jadi revert kode tanpa revert skema memerlukan default nameKey — revert bersama migrasi bila perlu (dashboard belum dipakai produksi).
- **Validation:**
  - Unit: tests/features/dashboards/dashboards.test.ts (batas, nama, lock + revisi, STALE, pemadatan, NOT_FOUND saat dashboard hilang) dan tests/components/layout-ops.test.ts (geser/ubah ukuran tanpa seret, tepi grid).
  - e2e: tests/e2e/dashboards.spec.ts — AC 1–4, urungkan, lembar pengaturan < 1280 px dengan fokus masuk/kembali, fokus setelah hapus, STALE lintas tab.
  - Migrasi diuji di database sementara (nama kembar → akhiran, nameKey NOT NULL).
  - axe WCAG 2.2 AA + best-practice: 42 kombinasi (375/768/1024/1280/1440 × terang/gelap × daftar/lihat/edit/edit+panel, plus form buat), 0 pelanggaran, overflow 0.

## Notes
- 2026-10-11T14:49:25Z UI wajib lewat rantai frontend-expert: design-foundations → tokens (preset dari T-025) → (+forms/data-fetching/app-shell sesuai kebutuhan) → components → anti-slop-code → responsive → motion ringan → anti-slop-design → polish → accessibility. Skip design-direction karena arah sudah dipilih di T-025, kecuali layar baru yang ambigu. Chart via skill dataviz; filter/select pakai Select kustom dari T-025, bukan native.
- 2026-10-12T15:14:34Z Conventions check (T-010 dashboard builder, audit frontend-expert ronde 4 @d85299c + 37af03d: 0 Critical/High/Medium/Low). Tokens: preset project zinc-blue (src/styles/tokens.css → globals.css @theme inline), override react-grid-layout memakai token, 0 warna mentah. Icons: waiver @tabler/icons-react (standar project, 20/1.5), tanpa Lucide. States: loading (pulse sebelum ukur, Button pending, Menyimpan…) / empty (tanpa dataset, tanpa dashboard, kanvas kosong lihat+edit dengan satu aksi utama, widget kosong) / error (form + server, simpan gagal + Coba lagi, STALE: peringatan dengan satu tombol Muat ulang yang difokus, edit dibekukan). Responsive: 375/640–767/768/900/1024/1280/1366/1440, mouse + sentuh: overflow 0, 0 kontrol kartu terpotong, sentuh menggulir dari kepala kartu dan menyeret dari pegangan 44 px (any-pointer: coarse), pengaturan = lembar < 1280 (bawah di ponsel, kartu kanan-bawah di tablet, maks 55dvh) dan menempel ≥ 1280, widget yang diatur tetap terlihat setelah buka/geser/tambah, CTA ponsel full-width. Hierarchy: satu h1 dan satu aksi utama per tampilan. Typography: h1 → h2 (widget) → h2 (panel/pengaturan). A11y: axe 0 pelanggaran × 42 (WCAG 2.2 AA + best-practice); fokus masuk panel saat dibuka, kembali ke tombol pengaturan saat X/Escape (judul yang diketik tersimpan), ke Urungkan setelah hapus, ke Muat ulang saat STALE; urutan DOM = urutan tampilan; alternatif 2.5.7 satu langkah per tekan dengan pembacaan posisi + pengumuman tepi; reduced motion; pembaca layar belum diuji manual. Motion: RGL 200 ms transform/ukuran, reduced-motion → none, gulir instan. Control geometry: radius token, pegangan sentuh dan kontrol ikon ponsel 44 px; status pending belum dirender di audit (parsial).

## Security checklist (OWASP ASVS 4.0.3)
<!-- Check each item when verified, or write "N/A: <reason>" after the text and check it. -->
- [x] V1 Architecture: trust boundaries and the components handling sensitive data are identified for this change — Batas kepercayaan: browser → Server Actions (buat/ganti nama/hapus dashboard) dan rute /api/dashboards/[id]/... (sesi server) → service dashboards (cek pemilik lewat dataset.ownerId) → Postgres (Dashboard.layout/layoutRevision, Widget). Tidak ada data pribadi baru; dirinci di Risk.
- [x] V2 Authentication: credentials are verified server-side; no default, hard-coded, or weak secrets — N/A: tidak mengubah autentikasi; memakai sesi yang ada (requireUser).
- [x] V3 Session management: session tokens are random, protected, invalidated on logout and expiry — N/A: tidak mengubah sesi.
- [x] V4 Access control: every endpoint/action checks authorization server-side, deny by default (no IDOR) — Setiap query dashboard/widget memakai where dataset.ownerId = user; widget juga dibatasi dashboardId. Bukan pemilik atau id tidak dikenal → 404 (tanpa membedakan). Diuji unit (NOT_FOUND) dan e2e.
- [x] V5 Validation, sanitization and encoding: all input validated; output encoded; no injection (SQL, OS, template) — Input lewat zod strict (layout), isIdShape (id), cleanName (NFC, tanpa kontrol/format, wajib terlihat, ≤ 80). Prisma terparameter; advisory lock memakai Prisma.sql tagged template. Output dirender React (escape bawaan).
- [x] V6 Stored cryptography: sensitive data at rest uses approved algorithms; keys are not in the code — N/A: tidak ada data rahasia baru yang disimpan.
- [x] V7 Error handling and logging: errors reveal no internals; security events are logged without secrets — Kode error tetap (INVALID/NOT_FOUND/LIMIT_REACHED/NAME_TAKEN/STALE/BUSY) dengan pesan Indonesia; error tak terduga → 503 tanpa detail, dicatat dengan label rute tanpa body.
- [x] V8 Data protection: personal/sensitive data is minimized, not cached or logged, and removable — N/A: dashboard hanya berisi nama dan tata letak; respons no-store; dashboard terhapus bersama widget (cascade).
- [x] V9 Communication: TLS for all external traffic; certificates validated — N/A: tidak ada lalu lintas eksternal baru.
- [x] V10 Malicious code: no backdoors, time bombs, or unexplained network calls; dependencies are trusted — Dependensi baru react-grid-layout 2.2.4 (dipin, MIT, npm audit 0 kerentanan); tidak ada panggilan jaringan tersembunyi.
- [x] V11 Business logic: flows cannot be abused (limits, ordering, replay, race conditions) — Batas 10 dashboard/dataset dan 50 widget/dashboard dihitung di bawah advisory lock; semua perubahan kanvas di bawah lock per dashboard dengan revisi wajib (STALE, tidak menimpa); urungkan satu langkah lewat API yang sama. Diuji unit + e2e lintas tab.
- [x] V12 Files and resources: uploads are type/size limited and stored safely; no path traversal or SSRF — N/A: tidak ada unggahan atau akses berkas di task ini.
- [x] V13 API and web service: API inputs/outputs are schema-validated; CORS and rate limits are deliberate — Rute JSON: Origin wajib = APP_URL, body ≤ 64 KB, skema zod, rate limit 600/10 menit per user, Cache-Control no-store; DELETE membawa baseRevision lewat query bernilai angka.
- [x] V14 Configuration: secure defaults, security headers, no debug in production, dependencies up to date — Tidak ada konfigurasi baru; header keamanan dan CSP dari T-001 tetap (e2e security-headers lulus).

## Evidence
<!-- Generated by aitk close. -->
- Check: `npm run check` → exit 0 at 2026-10-12T15:15:09Z (30954 ms)
- Acceptance criteria: 5/5 satisfied
- Commits: 00400de, 03d94b3, 0423efd, 0458545, 04e47a2, 0b3dbca, 0d4c16b, 13b3d0b, 15536b5, 183aee3, 1add773, 2170640, 2291c8a, 22b384e, 24e2978, 2653b85, 2725e19, 27bf134, 29f1080, 2a7eff2, 2b68a94, 2c2e6a4, 2c5ffeb, 30baa8d, 3107c1b, 316fa62, 327dde2, 37af03d, 38adbac, 3bf60b5, 3fd726f, 401b86a, 40c4360, 457220a, 471d15b, 4bff118, 4d5aa50, 4f751b8, 561f910, 5aeb313, 5d46f4b, 5def94f, 5f13bde, 608c247, 60938f4, 60ea826, 6248130, 626d6d6, 642bb4e, 64a8e95, 66ba1d5, 6c7cef8, 724603c, 76c40e2, 76e3600, 798158f, 7c5267b, 7d27e01, 7dddfc4, 7fa3c87, 8492031, 8963fe4, 8e072af, 915c9f1, 9558d66, 9835114, 9b2bfc6, 9cd6ff0, 9cee0e6, a02a7c0, a384931, ab9e083, ae491a6, b189cbc, b2a1115, b2d4c94, b330d22, b6d2610, bdc0360, bdd24f1, be956d7, bec0af8, c0a7685, c1db097, c51c2b5, c540736, c665ce6, c67c26b, ce6ecb7, d0e8dd2, d1fa24d, d363c9a, d6d03db, d85299c, d9f240b, dbe1056, ddf64a3, e1ff563, e28eb08, e3d5ef8, e3da62b, e541eb1, e56694e, e594327, e5a4396, f511b61, f8b7660, fbf5494, fe5861e
- Review pass 1 by claude-security-reviewer-subagen: 2 findings
- Review pass 2 by frontend-expert-design-reviewer: 6 findings
- Review pass 3 by claude-security-reviewer-subagen: 0 findings
- Review pass 4 by claude-security-reviewer-subagen: 0 findings
- Review pass 5 by frontend-expert-design-reviewer: 3 findings
- Review pass 6 by frontend-expert-design-reviewer: 2 findings
- Review pass 7 by frontend-expert-design-reviewer: 0 findings
