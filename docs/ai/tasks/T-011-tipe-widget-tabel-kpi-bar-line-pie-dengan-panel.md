---
id: T-011
title: Tipe widget tabel, KPI, bar, line, pie dengan panel konfigurasi
status: done
profile: strict
profile_pinned: true
goal: G-4
tags:
  - security
depends_on:
  - T-009
  - T-010
created: "2026-10-11T14:45:09Z"
updated: "2026-10-13T13:18:00Z"
closed: "2026-10-13T13:18:00Z"
created_by: claude-code
workers:
  - claude-code
branch: worktree-t-001-scaffold
base: 5a7d2eb0f7922bb6c2dfa8951ec497d0b7545d0d
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
  - scripts/perf-table-wide.ts
  - scripts/perf-widget-table.ts
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
  - src/components/dashboards/config-fields.tsx
  - src/components/dashboards/config-focus.ts
  - src/components/dashboards/config-sections.tsx
  - src/components/dashboards/dashboard-api.ts
  - src/components/dashboards/dashboard-canvas.tsx
  - src/components/dashboards/dashboard-form.tsx
  - src/components/dashboards/dashboard-list.tsx
  - src/components/dashboards/dashboard-settings.tsx
  - src/components/dashboards/layout-ops.ts
  - src/components/dashboards/use-dashboard-editor.ts
  - src/components/dashboards/use-media-query.ts
  - src/components/dashboards/widget-card-model.ts
  - src/components/dashboards/widget-card.tsx
  - src/components/dashboards/widget-config-model.ts
  - src/components/dashboards/widget-config.tsx
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
  - src/components/widgets/body-state.ts
  - src/components/widgets/chart-option.ts
  - src/components/widgets/chart-series.ts
  - src/components/widgets/chart-table.tsx
  - src/components/widgets/chart-view.tsx
  - src/components/widgets/chart-widget.tsx
  - src/components/widgets/kpi-fit.ts
  - src/components/widgets/kpi-view.tsx
  - src/components/widgets/table-view.tsx
  - src/components/widgets/use-box-size.ts
  - src/components/widgets/widget-body.tsx
  - src/components/widgets/widget-query.ts
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
  - src/features/query/history-cache.ts
  - src/features/query/http.ts
  - src/features/query/local-parquet.ts
  - src/features/query/runtime.ts
  - src/features/query/service.ts
  - src/features/query/spec.ts
  - src/features/query/sql.ts
  - src/features/query/table.ts
  - src/features/query/widget.ts
  - src/features/schema/http.ts
  - src/features/schema/runtime.ts
  - src/features/schema/service.ts
  - src/features/uploads/client.ts
  - src/features/uploads/http.ts
  - src/features/uploads/parts.ts
  - src/features/uploads/service.ts
  - src/features/uploads/sniff.ts
  - src/features/widgets/format.ts
  - src/features/widgets/id-like.ts
  - src/features/widgets/remap.ts
  - src/features/widgets/spec.ts
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
  - tests/components/chart-round3.test.ts
  - tests/components/layout-ops.test.ts
  - tests/components/widget-config.test.ts
  - tests/components/widget-views-round3.test.ts
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
  - tests/e2e/widgets.spec.ts
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
  - tests/features/query/history-cache.test.ts
  - tests/features/query/query.test.ts
  - tests/features/query/widget-query.test.ts
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
      at: "2026-10-12T22:52:45Z"
      findings: 2
    - "n": 2
      by: frontend-expert-design-reviewer
      at: "2026-10-12T22:52:45Z"
      findings: 13
    - "n": 3
      by: frontend-expert-design-reviewer
      at: "2026-10-12T23:43:27Z"
      findings: 8
    - "n": 4
      by: claude-security-reviewer-subagen
      at: "2026-10-12T23:43:27Z"
      findings: 1
    - "n": 5
      by: claude-verify-workflow
      at: "2026-10-13T01:32:49Z"
      findings: 32
    - "n": 6
      by: claude-verify-workflow
      at: "2026-10-13T02:11:42Z"
      findings: 21
    - "n": 7
      by: claude-verify-workflow
      at: "2026-10-13T03:15:56Z"
      findings: 13
    - "n": 8
      by: claude-verify-workflow
      at: "2026-10-13T04:46:22Z"
      findings: 6
    - "n": 9
      by: frontend-expert-design-reviewer
      at: "2026-10-13T05:24:21Z"
      findings: 4
    - "n": 10
      by: frontend-expert-design-reviewer
      at: "2026-10-13T05:47:12Z"
      findings: 2
    - "n": 11
      by: frontend-expert-design-reviewer
      at: "2026-10-13T07:21:47Z"
      findings: 4
    - "n": 12
      by: frontend-expert-design-reviewer
      at: "2026-10-13T07:40:58Z"
      findings: 1
    - "n": 13
      by: frontend-expert-design-reviewer
      at: "2026-10-13T07:54:10Z"
      findings: 1
    - "n": 14
      by: frontend-expert-design-reviewer
      at: "2026-10-13T08:07:45Z"
      findings: 1
    - "n": 15
      by: frontend-expert-design-reviewer
      at: "2026-10-13T08:27:50Z"
      findings: 2
    - "n": 16
      by: frontend-expert-design-reviewer
      at: "2026-10-13T09:00:08Z"
      findings: 2
    - "n": 17
      by: frontend-expert-design-reviewer
      at: "2026-10-13T10:10:08Z"
      findings: 1
    - "n": 18
      by: frontend-expert-design-reviewer
      at: "2026-10-13T13:03:38Z"
      findings: 1
    - "n": 19
      by: frontend-expert-design-reviewer
      at: "2026-10-13T13:16:05Z"
      findings: 0
evidence:
  check:
    cmd: npm run check
    exit_code: 0
    duration_ms: 32330
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

      {"level":40,"time":1791897376247,"service":"data-dashboard","check":"B","detail":"koneksi ditolak","msg":"health check gagal"}
      {"level":40,"time":1791897376271,"service":"data-dashboard","check":"Lambat","detail":"Lambat: timeout 20 ms","msg":"health check gagal"}

       Test Files  31 passed (31)
            Tests  594 passed (594)
         Start at  20:16:13
         Duration  23.04s (tests 90%, import 6%, transform 4%)


      > data-dashboard@0.1.0 audit
      > npm audit --audit-level=high --omit=dev && npm audit --audit-level=critical

      found 0 vulnerabilities
      found 0 vulnerabilities
    at: "2026-10-13T13:16:38Z"
    tree: ad519dd586f6170b7285246852aa2e728b8a83d08faceeebbfd929156e070dcf
  commits:
    - 00400de
    - 0177afd
    - 03d94b3
    - 0423efd
    - "0458545"
    - 04e47a2
    - 0727a63
    - 0a23305
    - 0b3dbca
    - 0d4c16b
    - 13b3d0b
    - 15536b5
    - "1663077"
    - 17c1240
    - 183aee3
    - 1add773
    - 1d787d4
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
    - 3c5143a
    - 3fd726f
    - 401b86a
    - 40c4360
    - 457220a
    - 471d15b
    - 4bff118
    - 4d5aa50
    - 4f751b8
    - 561f910
    - 59fa9e0
    - 5a7d2eb
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
    - 644c4db
    - 64a8e95
    - 66ba1d5
    - 6c02829
    - 6c7cef8
    - 70b7906
    - 724603c
    - 76c40e2
    - 76e3600
    - 798158f
    - 799df98
    - 7c5267b
    - 7d27e01
    - 7dddfc4
    - 7e58646
    - 7fa3c87
    - 841d6c1
    - "8492031"
    - 8963fe4
    - 8e072af
    - 8fe24a0
    - 915c9f1
    - 9558d66
    - "9835114"
    - 9b2bfc6
    - 9cd6ff0
    - 9cee0e6
    - 9dbbba2
    - a02a7c0
    - a1ea496
    - a384931
    - a5bd0e9
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
    - c6e50a2
    - ccfc959
    - cd5c936
    - ce6ecb7
    - cfc55cb
    - d0e8dd2
    - d1fa24d
    - d363c9a
    - d6d03db
    - d85299c
    - d9f240b
    - dbe1056
    - dd15a67
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
    - f7101ee
    - f8b7660
    - fbf5494
    - fe5861e
  acceptance:
    total: 7
    done: 7
  audit:
    at: "2026-10-13T13:16:42Z"
    passed: true
    tree: ad519dd586f6170b7285246852aa2e728b8a83d08faceeebbfd929156e070dcf
    results:
      - name: osv-scanner (dependencies, offline db)
        exit_code: 0
        summary: |-
          Scanning dir .
          Starting filesystem walk for root: /
          Scanned /Users/anasfikri/Documents/Projects/pcpexpress/data-dashboard/.claude/worktrees/t-001-scaffold/package-lock.json file and found 723 packages
          End status: 126 dirs visited, 547 inodes visited, 1 Extract calls, 60.9715ms elapsed, 60.972ms wall time
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
Panel konfigurasi: sheet, dimensi, ukuran + agregasi (sum/avg/count/min/max/count distinct), sort, top-N, format angka (ribuan ID, persen, Rp dengan spasi biasa, D11). Spec tersimpan di Widget. /api/query menerima {widgetId, filters} dan mengambil spec dari widget (pemilik dulu; non-pemilik diaktifkan T-016). Render ECharts (skill dataviz). Tabel: paginasi server 100 baris, sort kolom. Kolom hidden/hilang → pesan di widget, widget lain tetap jalan.

## Acceptance criteria
- [x] Given widget bar dimensi cabang + sum(omzet) pada fixture kecil, when dirender, then nilai sama dengan SUMIF yang dihitung test dari fixture
- [x] Given widget KPI format Rp dengan nilai 1234567.5, when dirender, then teks tepat 'Rp 1.234.568' dengan spasi U+0020
- [x] Given widget tabel, when user sort kolom dan pindah halaman, then hanya 100 baris per halaman dikirim dan urutan sesuai
- [x] Given kolom yang dirujuk widget disembunyikan di skema, when dashboard dibuka, then widget itu menampilkan pesan kolom tidak tersedia dan widget lain berfungsi
- [x] Given widget tabel atas sheet 1 juta baris (perf), when sort + pindah halaman, then respons < 2 detik; bukti di docs/ai/perf/T-011.md
- [x] Given halaman/komponen task ini selesai, when /frontend-expert:audit dijalankan (anti-slop-design, responsive 320/768/1024/1440, accessibility), then tidak ada temuan Critical/High dan blok Conventions check (Tokens: preset project; Icons: waiver @tabler/icons-react; States loading/empty/error; Responsive; A11y) dicatat sebagai note task
- [x] Given nilai sel atau nama kolom berisi '<img src=x onerror=alert(1)>', when tooltip/label/tabel dirender, then tampil sebagai teks (tooltip renderMode richText atau escape wajib di formatter)

## Risk
- **Impact:**
  - Widget mendapat isi: tipe table/kpi/bar/line/pie + spec (Widget.type/spec, kolom JSON yang sudah ada sejak T-010; tanpa migrasi).
  - /api/query menerima bentuk kedua `{ widgetId, filters?, page?, sort? }` (spec diambil dari widget di DB); bentuk T-009 `{ datasetId, spec }` tetap.
  - PATCH /api/dashboards/[id]/widgets/[widgetId] menerima `{ type, spec }`; tambah widget (urungkan hapus) menerima tipe + spec.
  - Mesin query DuckDB: jatah per user kini antre (maks. 8 penunggu, total antre ≤ queueWaitMs) alih-alih langsung QUERY_BUSY; jatah user dipegang sebelum menyewa file parquet (penunggu tidak menahan file); tetap tidak melebihi jatah.
  - /api/query: rate limit 600/menit per user (429 + Retry-After).
  - Grafik widget: query total terpisah (jumlah kategori + total Total/Jumlah baris) dibatasi 5 s; pai maks. 5 irisan + "Lainnya", hanya Total/Jumlah baris.
  - Halaman tabel: materialisasi terlambat (urut + OFFSET hanya kolom urut dan _row), halaman dijepit ke halaman terakhir, urutan teks COLLATE nocase.noaccent (seperti Excel).
  - Data diganti (unggahan baru langsung aktif): spec widget dipetakan ke versi aktif saat dibaca (sheet lewat nama, atau satu-satunya sheet hanya bila versi lama juga satu sheet; kolom lewat nama, kolom yang hilang → COLUMN_UNAVAILABLE menyebut nama lamanya; features/widgets/remap.ts); disimpan permanen saat user menyimpan widget (T-013 akan memindahkan ke aktivasi versi).
  - Komponen bersama: ui/select.tsx (dropdown dibatasi layar, opsi membungkus, 44 px di ponsel).
  - Dependensi baru ECharts 6.1.0 (+ zrender 6.1.0), dimuat malas hanya bila ada grafik.
  - Token warna grafik --chart-1…6 diganti palet kategori (terang + gelap); sebelumnya tidak dipakai di mana pun.
- **Security (STRIDE):**
  - **Spoofing:** semua rute memakai sesi server; tanpa sesi → 401.
  - **Tampering:**
    - Spec widget divalidasi zod ketat per tipe dan terhadap skema aktif (kolom ada, tidak disembunyikan, agregasi cocok) saat disimpan, dan diulang saat query.
    - Kolom dirujuk lewat posisi → nama → kolom fisik c<pos> buatan program; nilai filter lewat parameter binding (angka dibatasi ±2^53); urutan tabel hanya kolom milik tabel itu (indeks), halaman dibatasi 0–100.000 dan dijepit ke data.
    - Pemetaan versi baru hanya membaca sheet dataset yang sama (where version.datasetId) — tidak lintas tenant; cache riwayat (features/query/history-cache.ts) dibatasi 500 entri dan 100.000 kolom skema, entri kedaluwarsa (30 s) dibuang saat menulis, skema target selalu dibaca segar.
    - PATCH judul + isi: judul divalidasi lebih dulu, tidak ada bagian yang tersimpan bila yang lain ditolak.
  - **Repudiation:** perubahan widget tidak diaudit per langkah (bukan data sensitif); kegagalan query dicatat dengan userId tanpa body.
  - **Information disclosure:**
    - Widget di-resolve lewat dashboard.dataset.ownerId; milik orang lain = tidak ada → 404 (tanpa oracle). Non-pemilik baru di T-016.
    - Cache hasil memakai kunci dataset/versi/sheet/revisi skema/spec; pemeriksaan pemilik terjadi sebelum cache.
    - Nilai sel dan nama kolom ditampilkan sebagai teks: React meng-escape; ECharts tooltip renderMode "richText" + formatter teks biasa; label sumbu/pai lewat formatter fungsi (AC 7).
    - Error tak terduga → 500 tanpa detail. Nama kolom tersembunyi tidak disebut untuk kolom filter dari klien.
  - **DoS:**
    - Query per user dibatasi slot DuckDB (antre maks. 8, ≤ 10 s, lalu QUERY_BUSY) + rate limit 600/menit; klien maks. 2 query widget bersamaan per halaman dengan coba ulang bertahap.
    - Halaman tabel 100 baris dengan materialisasi terlambat (halaman terakhir tabel 20 kolom teks 1 juta baris ± 0,75 s, sebelumnya 17 s), teks sel ≤ 500 karakter, hasil ≤ 5 MB, timeout bersama count + halaman, cache negatif untuk timeout.
    - Total grafik: query terpisah tanpa GROUP BY/window, maks. 5 s; gagal → grafik tanpa total (pai memberi catatan persen parsial), hasil itu di-cache 30 s saja.
    - Perubahan widget: rate limit dashboardEdit 600/10 menit, body ≤ 64 KB.
  - **Elevation:** CSRF — semua POST/PATCH wajib Origin = APP_URL (403).
- **Rollback:**
  - Revert commit T-011. Tidak ada migrasi skema; widget yang sudah diatur akan tampil kosong lagi di kode lama (kolom type/spec diabaikan).
  - Antrean per user di mesin query bisa dikembalikan ke penolakan langsung tanpa perubahan data.
  - Pemetaan versi saat dibaca tidak menulis apa pun; mematikannya mengembalikan perilaku "Sheet tidak ada di data aktif".
- **Validation:**
  - Unit: tests/features/query/widget-query.test.ts (DuckDB sungguhan: batang = SUMIF, total grafik termasuk ukuran tanggal, tabel 100 baris + urut + halaman + jepit, COLUMN_UNAVAILABLE, SHEET_UNAVAILABLE, NOT_FOUND, pemetaan versi baru, format Rp/otomatis/durasi), tests/features/dashboards/dashboards.test.ts (simpan/pulihkan spec, spec usang dipulihkan kosong), tests/features/query/query.test.ts (antrean per user + batas antrean), tests/components/widget-config.test.ts (pilihan awal, opsi grafik richText, sumbu waktu UTC, persen = 100, label), tests/lib/api-route.test.ts. Putaran verifikasi 2–4: tests/components/chart-round3.test.ts (sumbu periode + isi celah, urutan garis, durasi, pai Lainnya/toleransi/parsial, chartFit kartu kecil, tabel data grafik, cap waktu), tests/components/widget-views-round3.test.ts (KPI fallback, kolom mirip ID, tombol data, sentinel kolom hilang), tests/features/query/history-cache.test.ts (batas cache riwayat), widget-config.test.ts (Maks. Tab, kolom hilang, label urut, ukuran tanggal grafik).
  - e2e: tests/e2e/widgets.spec.ts (project widgets, worker sungguhan) — AC 1, 2, 3, 4, 7 + data diganti (unggah ulang → widget tampil angka baru). + kolom diganti namanya di unggahan baru → widget menyebut kolom lama (7 test).
  - Perf: docs/ai/perf/T-011.md — 1 juta baris p95 94 ms; 20 kolom teks maks 791 ms (AC 5); scripts/perf-widget-table.ts, scripts/perf-table-wide.ts.
  - Review: 3 lensa (desain/a11y, keamanan, integritas data) lewat workflow multi-agen; CSP produksi diperiksa (chunk ECharts tanpa eval). Verifikasi diulang 4 putaran (desain/a11y + keamanan + integritas + kritikus kelengkapan) sampai tanpa Critical/High; sisa Low/Info dicatat ke T-031 dan T-032.

## Notes
- 2026-10-11T14:49:25Z UI wajib lewat rantai frontend-expert: design-foundations → tokens (preset dari T-025) → (+forms/data-fetching/app-shell sesuai kebutuhan) → components → anti-slop-code → responsive → motion ringan → anti-slop-design → polish → accessibility. Skip design-direction karena arah sudah dipilih di T-025, kecuali layar baru yang ambigu. Chart via skill dataviz; filter/select pakai Select kustom dari T-025, bukan native.
- 2026-10-11T14:56:59Z Kolom sort tabel divalidasi terhadap kolom widget, bukan seluruh skema.
- 2026-10-12T14:28:33Z Dari review T-010 (L6): urungkan hapus widget saat ini memulihkan judul dan posisi saja karena widget masih kosong. Begitu widget punya type/spec, urungkan hapus wajib memulihkan type dan spec juga (dikirim di body restore, validasi sama dengan buat).
- 2026-10-13T05:07:29Z Ukuran minimum widget tabel 3x4 (verifikasi putaran 4–6): dijaga di kanvas (resize, ubah jenis → simpan tata letak), di server pada getDashboard/addWidget/deleteWidget/saveLayout (fitMinSizes). configureWidget sengaja tidak menulis tata letak (menaikkan revisi di luar editor akan memicu STALE); kanvas menyimpan tata letak yang sudah diperbesar setelah ubah jenis dan semua jalur baca memperbesar, jadi selisih simpan-vs-tampil hanya sementara dan tidak terlihat pengguna.
- 2026-10-13T13:16:05Z Conventions check (AC6, audit /frontend-expert:audit lewat workflow verifikasi multi-lensa, putaran 2–5 penuh + konfirmasi 6–16 terarah, HEAD 1d787d4):
- Tokens: preset project (zinc-blue, src/styles/tokens.css); 0 warna mentah di src; palet grafik dari --chart-1..6/--foreground/--muted-foreground/--border/--card; kontras terukur muted-foreground 4,86 (terang)/6,94 (gelap), chart-1..6 3,44–5,44/4,88–8,92, ikon toggle aktif 4,74/4,09.
- Icons: waiver @tabler/icons-react (Tabler saja, 0 import lucide); toggle data IconTable ↔ IconChartBar/Line/Pie.
- States: loading (skeleton + aria-busy + teks sr 'Memuat data widget…', tombol data aria-disabled), empty ('Tidak ada data untuk ditampilkan.', KPI Rp 0/(kosong), tabel header saja), error (COLUMN_UNAVAILABLE kolom disembunyikan / hilang setelah unggah ulang, INVALID ukuran tanggal di grafik, RATE_LIMITED) sebagai region terlabel yang bisa difokus; total gagal → catatan 'jumlah keseluruhan tidak tersedia'.
- Responsive: 320/375/768/1024/1280/1440, terang+gelap, lihat/edit (panel menempel ≥1280, dialog 768–1279, sheet <768), sentuh 1024/1280; 0 scroll horizontal halaman, 0 teks sumbu di luar SVG, 0 nilai terpotong di tabel data (kecuali kartu 66–67 px di 768 → T-031), daftar peringkat 0 luapan (sweep tinggi 128–650 px); tombol 44 px di layar sentuh. Ditunda: T-031 (kanvas 768–1023), T-032 (polish kartu sangat kecil).
- A11y: axe-core 4.14 (WCAG 2.0/2.1/2.2 A+AA + best-practice) ratusan run lintas putaran: serious/critical = 0 (total pelanggaran 0); keyboard: semua tab stop punya ring fokus, region tabel/legenda/pesan bisa difokus dan digulir panah.

## Security checklist (OWASP ASVS 4.0.3)
<!-- Check each item when verified, or write "N/A: <reason>" after the text and check it. -->
- [x] V1 Architecture: trust boundaries and the components handling sensitive data are identified for this change — Batas kepercayaan: browser → PATCH widget (simpan tipe/spec) dan POST /api/query { widgetId } (sesi server) → service widget/query (pemilik lewat dashboard.dataset.ownerId) → Postgres (Widget.type/spec, skema sheet) → cache parquet lokal + DuckDB sandbox (enable_external_access=false, allowed_directories). Dirinci di Risk.
- [x] V2 Authentication: credentials are verified server-side; no default, hard-coded, or weak secrets — N/A: tidak mengubah autentikasi; memakai sesi yang ada (requireUser).
- [x] V3 Session management: session tokens are random, protected, invalidated on logout and expiry — N/A: tidak mengubah sesi.
- [x] V4 Access control: every endpoint/action checks authorization server-side, deny by default (no IDOR) — Widget dan dashboard selalu dicari dengan where dataset.ownerId = user (query, simpan, pulihkan, sumber data panel); sheet harus milik versi aktif dataset widget. Bukan pemilik/tidak ada → 404 yang sama. Diuji unit (NOT_FOUND) dan e2e.
- [x] V5 Validation, sanitization and encoding: all input validated; output encoded; no injection (SQL, OS, template) — Spec zod ketat per tipe + validasi terhadap skema aktif; SQL hanya identifier c<pos>/_row buatan program, fungsi/arah dari enum tertutup, nilai lewat parameter; output React ter-escape, ECharts tooltip richText + formatter teks (AC 7).
- [x] V6 Stored cryptography: sensitive data at rest uses approved algorithms; keys are not in the code — N/A: tidak ada data rahasia baru yang disimpan.
- [x] V7 Error handling and logging: errors reveal no internals; security events are logged without secrets — Kode error tetap (INVALID, NOT_FOUND, NOT_READY, COLUMN_UNAVAILABLE, SHEET_UNAVAILABLE, QUERY_BUSY, QUERY_TIMEOUT, …) dengan pesan Indonesia yang bisa ditindak; error tak terduga → 500 tanpa detail, dicatat dengan userId tanpa body/SQL.
- [x] V8 Data protection: personal/sensitive data is minimized, not cached or logged, and removable — Hasil query no-store; cache hasil di memori proses dengan kunci per dataset/versi/revisi skema; tidak ada data baru yang dicatat di log.
- [x] V9 Communication: TLS for all external traffic; certificates validated — N/A: tidak ada lalu lintas eksternal baru (ECharts dibundel, bukan CDN).
- [x] V10 Malicious code: no backdoors, time bombs, or unexplained network calls; dependencies are trusted — Dependensi baru echarts 6.1.0 + zrender 6.1.0 (Apache-2.0, dipin persis, rilis 2026-05-19), npm audit 0 kerentanan; dimuat dari bundel sendiri.
- [x] V11 Business logic: flows cannot be abused (limits, ordering, replay, race conditions) — Satu user tidak bisa memegang lebih dari jatah slot query (antrean berbatas waktu); halaman tabel dibatasi; urutan hanya kolom tabel; spec yang tidak lagi cocok dengan skema memberi pesan per widget tanpa mengganggu widget lain.
- [x] V12 Files and resources: uploads are type/size limited and stored safely; no path traversal or SSRF — N/A: tidak ada unggahan baru; path parquet hanya dari kunci typedKey di DB (parameter, dibatasi allowed_directories).
- [x] V13 API and web service: API inputs/outputs are schema-validated; CORS and rate limits are deliberate — Body /api/query dan PATCH widget divalidasi zod ketat (kunci tak dikenal ditolak), ≤ 64 KB, Origin wajib = APP_URL, Cache-Control no-store; perubahan widget dibatasi rate limit dashboardEdit.
- [x] V14 Configuration: secure defaults, security headers, no debug in production, dependencies up to date — Tidak ada konfigurasi baru; header keamanan dan CSP tetap (ECharts tanpa eval/inline script, renderer SVG).

## Evidence
<!-- Generated by aitk close. -->
- Check: `npm run check` → exit 0 at 2026-10-13T13:16:38Z (32330 ms)
- Acceptance criteria: 7/7 satisfied
- Commits: 00400de, 0177afd, 03d94b3, 0423efd, 0458545, 04e47a2, 0727a63, 0a23305, 0b3dbca, 0d4c16b, 13b3d0b, 15536b5, 1663077, 17c1240, 183aee3, 1add773, 1d787d4, 2170640, 2291c8a, 22b384e, 24e2978, 2653b85, 2725e19, 27bf134, 29f1080, 2a7eff2, 2b68a94, 2c2e6a4, 2c5ffeb, 30baa8d, 3107c1b, 316fa62, 327dde2, 37af03d, 38adbac, 3bf60b5, 3c5143a, 3fd726f, 401b86a, 40c4360, 457220a, 471d15b, 4bff118, 4d5aa50, 4f751b8, 561f910, 59fa9e0, 5a7d2eb, 5aeb313, 5d46f4b, 5def94f, 5f13bde, 608c247, 60938f4, 60ea826, 6248130, 626d6d6, 642bb4e, 644c4db, 64a8e95, 66ba1d5, 6c02829, 6c7cef8, 70b7906, 724603c, 76c40e2, 76e3600, 798158f, 799df98, 7c5267b, 7d27e01, 7dddfc4, 7e58646, 7fa3c87, 841d6c1, 8492031, 8963fe4, 8e072af, 8fe24a0, 915c9f1, 9558d66, 9835114, 9b2bfc6, 9cd6ff0, 9cee0e6, 9dbbba2, a02a7c0, a1ea496, a384931, a5bd0e9, ab9e083, ae491a6, b189cbc, b2a1115, b2d4c94, b330d22, b6d2610, bdc0360, bdd24f1, be956d7, bec0af8, c0a7685, c1db097, c51c2b5, c540736, c665ce6, c67c26b, c6e50a2, ccfc959, cd5c936, ce6ecb7, cfc55cb, d0e8dd2, d1fa24d, d363c9a, d6d03db, d85299c, d9f240b, dbe1056, dd15a67, ddf64a3, e1ff563, e28eb08, e3d5ef8, e3da62b, e541eb1, e56694e, e594327, e5a4396, f511b61, f7101ee, f8b7660, fbf5494, fe5861e
- Review pass 1 by claude-security-reviewer-subagen: 2 findings
- Review pass 2 by frontend-expert-design-reviewer: 13 findings
- Review pass 3 by frontend-expert-design-reviewer: 8 findings
- Review pass 4 by claude-security-reviewer-subagen: 1 findings
- Review pass 5 by claude-verify-workflow: 32 findings
- Review pass 6 by claude-verify-workflow: 21 findings
- Review pass 7 by claude-verify-workflow: 13 findings
- Review pass 8 by claude-verify-workflow: 6 findings
- Review pass 9 by frontend-expert-design-reviewer: 4 findings
- Review pass 10 by frontend-expert-design-reviewer: 2 findings
- Review pass 11 by frontend-expert-design-reviewer: 4 findings
- Review pass 12 by frontend-expert-design-reviewer: 1 findings
- Review pass 13 by frontend-expert-design-reviewer: 1 findings
- Review pass 14 by frontend-expert-design-reviewer: 1 findings
- Review pass 15 by frontend-expert-design-reviewer: 2 findings
- Review pass 16 by frontend-expert-design-reviewer: 2 findings
- Review pass 17 by frontend-expert-design-reviewer: 1 findings
- Review pass 18 by frontend-expert-design-reviewer: 1 findings
- Review pass 19 by frontend-expert-design-reviewer: 0 findings
