---
id: T-012
title: Filter global, slicer, rentang tanggal, cross-filter
status: done
profile: strict
profile_pinned: true
goal: G-4
tags:
  - security
depends_on:
  - T-011
created: "2026-10-11T14:45:09Z"
updated: "2026-10-14T05:35:09Z"
closed: "2026-10-14T05:35:09Z"
created_by: claude-code
workers:
  - claude-code
branch: worktree-t-001-scaffold
base: 098fc7793391d5395405eff5c73923297cb10705
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
  - prisma/migrations/20261013133022_audit_log/migration.sql
  - prisma/migrations/20261013172513_dashboard_filter_columns/migration.sql
  - prisma/migrations/migration_lock.toml
  - prisma/schema.prisma
  - prisma/seed.ts
  - public/brand/mark-dark.png
  - public/brand/mark.png
  - public/brand/pcp-logo-dark.png
  - public/brand/pcp-logo.png
  - scripts/admin-restore.mjs
  - scripts/bench-hostile.ts
  - scripts/bench-parsers.ts
  - scripts/bench/parser-duckdb-csv.ts
  - scripts/bench/parser-duckdb.ts
  - scripts/bench/parser-exceljs.ts
  - scripts/bench/parser-sax.ts
  - scripts/bench/types.ts
  - scripts/check-presign.mjs
  - scripts/dev-audit-log.mjs
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
  - scripts/perf-filters.ts
  - scripts/perf-ingest.ts
  - scripts/perf-query.ts
  - scripts/perf-table-wide.ts
  - scripts/perf-widget-table.ts
  - scripts/perf.mjs
  - scripts/smoke-prod-headers.mjs
  - scripts/storage-init.mjs
  - src/app/(app)/admin/page.tsx
  - src/app/(app)/admin/pengguna/error.tsx
  - src/app/(app)/admin/pengguna/page.tsx
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
  - src/app/api/dashboards/[id]/filter-columns/route.ts
  - src/app/api/dashboards/[id]/filter-values/route.ts
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
  - src/components/admin/admin-crumb.tsx
  - src/components/admin/admin-feedback.tsx
  - src/components/admin/admin-messages.tsx
  - src/components/admin/admin-revoked-notice.tsx
  - src/components/admin/email-text.tsx
  - src/components/admin/transfer-dialog.tsx
  - src/components/admin/transfer-picker.tsx
  - src/components/admin/user-badges.tsx
  - src/components/admin/user-row-actions.tsx
  - src/components/admin/user-row-menu.tsx
  - src/components/admin/users-pagination.tsx
  - src/components/admin/users-search.tsx
  - src/components/admin/users-skeleton.tsx
  - src/components/admin/users-status-filter.tsx
  - src/components/admin/users-table.tsx
  - src/components/admin/users-url.ts
  - src/components/auth/auth-card.tsx
  - src/components/auth/forgot-password-form.tsx
  - src/components/auth/form-alert.tsx
  - src/components/auth/login-form.tsx
  - src/components/auth/register-form.tsx
  - src/components/auth/reset-password-form.tsx
  - src/components/auth/security-settings.tsx
  - src/components/auth/use-focus-on-error.ts
  - src/components/auth/verify-form.tsx
  - src/components/dashboards/add-filter-column-menu.tsx
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
  - src/components/dashboards/edit-dashboard-link.tsx
  - src/components/dashboards/filter-columns-settings.tsx
  - src/components/dashboards/filters/cross-hint.tsx
  - src/components/dashboards/filters/date-panel.tsx
  - src/components/dashboards/filters/filter-bar.tsx
  - src/components/dashboards/filters/filter-chips.tsx
  - src/components/dashboards/filters/filter-context.tsx
  - src/components/dashboards/filters/filter-control.tsx
  - src/components/dashboards/filters/filter-model.ts
  - src/components/dashboards/filters/filter-sheet.tsx
  - src/components/dashboards/filters/filter-text.ts
  - src/components/dashboards/filters/number-panel.tsx
  - src/components/dashboards/filters/slicer-model.ts
  - src/components/dashboards/filters/slicer-option.tsx
  - src/components/dashboards/filters/slicer-panel.tsx
  - src/components/dashboards/filters/stale-store.ts
  - src/components/dashboards/filters/use-filter-values.ts
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
  - src/components/ui/badge.tsx
  - src/components/ui/button.tsx
  - src/components/ui/card.tsx
  - src/components/ui/confirm-dialog.tsx
  - src/components/ui/dropdown-menu.tsx
  - src/components/ui/empty-state.tsx
  - src/components/ui/field.tsx
  - src/components/ui/focus-notice.tsx
  - src/components/ui/input.tsx
  - src/components/ui/page-header.tsx
  - src/components/ui/password-input.tsx
  - src/components/ui/popover.tsx
  - src/components/ui/select.tsx
  - src/components/ui/switch.tsx
  - src/components/ui/textarea.tsx
  - src/components/widgets/body-state.ts
  - src/components/widgets/chart-option.ts
  - src/components/widgets/chart-series.ts
  - src/components/widgets/chart-table.tsx
  - src/components/widgets/chart-view.tsx
  - src/components/widgets/chart-widget.tsx
  - src/components/widgets/kpi-fit.ts
  - src/components/widgets/kpi-view.tsx
  - src/components/widgets/skipped-note.tsx
  - src/components/widgets/stale-label.tsx
  - src/components/widgets/table-view.tsx
  - src/components/widgets/use-box-size.ts
  - src/components/widgets/widget-body.tsx
  - src/components/widgets/widget-error.tsx
  - src/components/widgets/widget-query.ts
  - src/features/admin/actions.ts
  - src/features/admin/service.ts
  - src/features/admin/transfer-names.ts
  - src/features/admin/types.ts
  - src/features/audit/service.ts
  - src/features/auth/actions.ts
  - src/features/auth/denial-log.ts
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
  - src/features/dashboards/filter-columns.ts
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
  - src/features/query/filter-values.ts
  - src/features/query/filters.ts
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
  - src/lib/text.ts
  - src/lib/utils.ts
  - src/lib/xlsx/parser.ts
  - src/lib/xlsx/types.ts
  - src/proxy.ts
  - src/styles/tokens.css
  - src/worker/index.ts
  - tests/components/chart-round3.test.ts
  - tests/components/dashboard-filters-r1.test.ts
  - tests/components/dashboard-filters-r2.test.ts
  - tests/components/dashboard-filters-r3.test.ts
  - tests/components/dashboard-filters.test.ts
  - tests/components/layout-ops.test.ts
  - tests/components/widget-config.test.ts
  - tests/components/widget-views-round3.test.ts
  - tests/e2e/admin.spec.ts
  - tests/e2e/auth.spec.ts
  - tests/e2e/dashboards.spec.ts
  - tests/e2e/datasets.spec.ts
  - tests/e2e/filters.spec.ts
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
  - tests/features/admin/actions.test.ts
  - tests/features/admin/fake-db.ts
  - tests/features/admin/service.test.ts
  - tests/features/auth/core.test.ts
  - tests/features/auth/denial-log.test.ts
  - tests/features/auth/rate-limit.test.ts
  - tests/features/auth/register.test.ts
  - tests/features/auth/session.test.ts
  - tests/features/dashboards/dashboards.test.ts
  - tests/features/dashboards/filter-columns.test.ts
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
  - tests/features/query/dashboard-filters.test.ts
  - tests/features/query/filter-values-http.test.ts
  - tests/features/query/filter-values.test.ts
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
  - tests/lib/logger.test.ts
  - tests/lib/security-headers.test.ts
  - tests/lib/seed.test.ts
  - tests/lib/text.test.ts
  - tests/scripts/fixtures.test.ts
  - tests/scripts/parser-sax-edge.test.ts
  - tests/stubs/server-only.ts
  - tsconfig.json
  - vitest.config.mts
review:
  passes:
    - "n": 1
      by: claude-verify-workflow
      at: "2026-10-13T23:51:57Z"
      findings: 30
    - "n": 2
      by: claude-verify-workflow
      at: "2026-10-14T01:58:53Z"
      findings: 15
    - "n": 3
      by: frontend-expert-design-reviewer
      at: "2026-10-14T03:10:57Z"
      findings: 5
    - "n": 4
      by: frontend-expert-design-reviewer
      at: "2026-10-14T04:08:19Z"
      findings: 2
    - "n": 5
      by: claude-verify-workflow
      at: "2026-10-14T04:34:38Z"
      findings: 1
    - "n": 6
      by: frontend-expert-design-reviewer
      at: "2026-10-14T05:05:31Z"
      findings: 1
    - "n": 7
      by: claude-verify-workflow
      at: "2026-10-14T05:33:54Z"
      findings: 0
evidence:
  check:
    cmd: npm run check
    exit_code: 0
    duration_ms: 35026
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

      {"level":40,"time":1791956047691,"service":"data-dashboard","check":"B","detail":"koneksi ditolak","msg":"health check gagal"}
      {"level":40,"time":1791956047716,"service":"data-dashboard","check":"Lambat","detail":"Lambat: timeout 20 ms","msg":"health check gagal"}

       Test Files  46 passed (46)
            Tests  757 passed (757)
         Start at  12:34:04
         Duration  24.40s (tests 87%, import 8%, transform 5%)


      > data-dashboard@0.1.0 audit
      > npm audit --audit-level=high --omit=dev && npm audit --audit-level=critical

      found 0 vulnerabilities
      found 0 vulnerabilities
    at: "2026-10-14T05:34:29Z"
    tree: 111440b3df7771b1f0b53fde27cb2ffd4245d6ef5d241735563d75fbd4932549
  commits:
    - 00400de
    - 0177afd
    - 03d94b3
    - 03f863a
    - 0423efd
    - "0458545"
    - 04e47a2
    - 0727a63
    - 098fc77
    - 0a23305
    - 0b3dbca
    - 0d4c16b
    - 13b3d0b
    - 15536b5
    - "1663077"
    - 17c1240
    - 183aee3
    - 1add773
    - 1b6e65d
    - 1c4ecfb
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
    - 2b68d11
    - 2ba4512
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
    - 3d486ab
    - 3fd726f
    - 401b86a
    - 40c4360
    - 457220a
    - 460d650
    - 467b44d
    - 471d15b
    - 4a2154f
    - 4bff118
    - 4c397a1
    - 4d5aa50
    - 4f751b8
    - 506e66d
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
    - 75c431f
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
    - 8aff0f1
    - 8e072af
    - 8e4a34f
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
    - c940620
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
    total: 5
    done: 5
  audit:
    at: "2026-10-14T05:34:30Z"
    passed: true
    tree: 111440b3df7771b1f0b53fde27cb2ffd4245d6ef5d241735563d75fbd4932549
    results:
      - name: osv-scanner (dependencies, offline db)
        exit_code: 0
        summary: |-
          Scanning dir .
          Starting filesystem walk for root: /
          Scanned /Users/anasfikri/Documents/Projects/pcpexpress/data-dashboard/.claude/worktrees/t-001-scaffold/package-lock.json file and found 723 packages
          End status: 136 dirs visited, 638 inodes visited, 1 Extract calls, 64.627708ms elapsed, 64.629ms wall time
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
Bar filter dashboard: slicer multi-select dengan pencarian server-side (DISTINCT LIMIT 1000, peringatan > 1000), rentang tanggal preset (bulan ini, kuartal, YTD) dihitung Asia/Jakarta dan dibandingkan naive (D8), filter angka. Kolom filter yang diizinkan tersimpan di Dashboard. Klik elemen chart → cross-filter widget lain (bisa dimatikan per widget). Filter di URL.

## Acceptance criteria
- [x] Given slicer cabang dipilih 2 nilai, when dashboard dimuat ulang dengan URL sama, then kedua nilai terpilih dan semua widget terfilter
- [x] Given user klik batang 'Jakarta' pada chart A, when cross-filter aktif, then widget B dan C hanya data Jakarta dan tombol hapus filter muncul
- [x] Given hari ini 2026-10-11 Asia/Jakarta dan kolom DATE, when preset YTD, then filter 2026-01-01 ≤ tanggal ≤ 2026-10-11 tanpa pergeseran zona
- [x] Given kolom dengan 5.000 nilai unik, when slicer dibuka, then 1000 nilai pertama tampil, peringatan muncul, dan mengetik 3 huruf menyaring di server
- [x] Given halaman/komponen task ini selesai, when /frontend-expert:audit dijalankan (anti-slop-design, responsive 320/768/1024/1440, accessibility), then tidak ada temuan Critical/High dan blok Conventions check (Tokens: preset project; Icons: waiver @tabler/icons-react; States loading/empty/error; Responsive; A11y) dicatat sebagai note task

## Risk
- Impact: skema DB (kolom baru `Dashboard.filterColumns` JSONB default `[]`, migrasi `20261013172513_dashboard_filter_columns`, aditif); jalur query widget (`/api/query` menerima `dashboardFilters`, kunci cache hasil ditambah klausa kanonik — tanpa filter dashboard kunci lama tidak berubah); `getDashboard` membaca skema sheet versi aktif bila ada kolom filter/grafik (satu query tambahan); endpoint baru `POST /api/dashboards/[id]/filter-values` dan `PATCH /api/dashboards/[id]/filter-columns` (satu-satunya jalur ubah kolom filter; Server Action duplikat dihapus di review putaran 1); spec grafik menerima `crossFilter?: boolean`; redaksi log ditambah kunci `dashboardFilters/values/value/q/cross`. Review putaran 1: filter `not_in` ("semua kecuali"); filter berlaku hanya bila kelompok tipe kolom widget (teks | angka | waktu | boolean) sama dengan kolom sumbernya (kolom filter atau dimensi grafik cross-filter), lainnya dilewati; satu kolom filter per nama (nama sama dari sheet lain ditolak, data lama dengan nama ganda: entri pertama yang dipakai); tanggal saja pada kolom TIMESTAMP cocok sehari penuh; repo query `crossFilterColumns` → `filterSources` (nama + tipe, cache 30 detik per dashboard); `QueryEngine.exec` menerima AbortSignal. Review putaran 2: field `filters` posisional (T-011) dihapus dari body `/api/query` widget — body strict, jadi permintaan yang masih mengirimnya → 400 INVALID (klien T-012 sudah tidak mengirimnya; `widgetPlan` tidak lagi menerima filter klien, spec widget memang tidak punya filter sendiri); jalur viewer D6 menjadi `{widgetId, dashboardFilters}` (docs/flow-kerja.md D6 + bagian query, docs/ai/conventions.md, Objective + catatan T-016). Widget/dashboard lama tetap jalan tanpa perubahan data.
- Security (STRIDE): S — semua endpoint lewat requireUser + Origin = APP_URL. T — satu-satunya filter dari klien adalah `dashboardFilters` (kolom lewat nama; `filters` posisional lama dihapus di review putaran 2 → 400, sehingga tidak ada jalur yang melewati pemeriksaan kelompok tipe dan ketersediaan sumber), dibatasi `filterColumns` ∪ dimensi grafik cross-filter yang dihitung server (D6); filter bernama sama di sheet lain hanya berlaku bila kelompok tipenya sama dengan kolom sumber yang tersedia (sisa risiko: kolom bertipe sama dan bernama sama di sheet lain ikut tersaring — sesuai rancangan; pemilik yang memilih kolom filter, dan peringatan untuk dialog berbagi dicatat di T-016); nilai lewat parameter binding, identifier hanya `c<pos>` dari skema; preset dihitung server (bukan tanggal dari klien). R — perubahan kolom filter menaikkan `Dashboard.updatedAt`. I — dashboard/kolom milik orang lain → NOT_FOUND/404; kolom tersembunyi tidak pernah dipakai (filter dilewati, slicer → COLUMN_UNAVAILABLE) dan tampilan kolom filter yang tidak tersedia hanya membawa nama tersimpan + tipe netral; klien tidak lagi mengirim posisi kolom, jadi beda 400/409 tidak bisa dipakai menghitung lebar skema (termasuk kolom tersembunyi); nilai filter/kata cari tidak dicatat di log aplikasi (redaksi pino diuji). Pengecualian sadar: status filter ada di URL `?f=` (AC1), jadi nilainya bisa masuk riwayat browser, log request dev server, dan access log reverse proxy → T-023 wajib membuang query string dari access log (Caddy filter `request>uri` / nginx `$uri`, bukan `$request_uri`); Referer ke situs lain aman karena `strict-origin-when-cross-origin`. D — rate limit `filterValues` 300/menit/user terpisah, jatah query per user + global yang sama dengan widget, batas waktu slicer 10 detik, LIMIT 1001, body ≤ 8 KB / 64 KB, ≤ 20 filter × ≤ 500 nilai; hasil slicer di-cache (LRU berbatas byte) dengan kunci kata cari ternormalisasi (NFC, huruf kecil, tanpa aksen — "a"/"A"/"á" satu entri), daftar > 256 KB tidak di-cache, permintaan slicer yang dibatalkan klien tidak menjalankan DuckDB bila masih antre dan di-interrupt bila sedang berjalan. E — pengaturan kolom filter hanya pemilik (`dataset.ownerId`), validasi ulang terhadap versi aktif.
- Rollback: revert kode T-012; kolom `filterColumns` boleh dibiarkan (default `[]`, tidak dibaca kode lama) atau dihapus dengan migrasi `ALTER TABLE "Dashboard" DROP COLUMN "filterColumns"`. Spec widget dengan `crossFilter` akan ditolak schema strict versi lama → bersihkan dengan `UPDATE "Widget" SET spec = spec - 'crossFilter'` sebelum rollback kode.
- Keterbatasan yang diterima: nilai slicer yang panjangnya tepat 500 karakter dicocokkan lewat awalan 500 karakter (agar cross-filter dari label grafik yang dipotong tetap kena), sehingga teks lain yang lebih panjang dengan awalan sama ikut tersaring — butuh teks tepat 500 karakter + teks lebih panjang berawalan sama, jarang; dua dimensi grafik cross-filter bernama sama dengan tipe berbeda: filter berlaku untuk kedua kelompok tipe bila nilainya cocok dengan keduanya (mis. teks "2026-10-14"); nilai DECIMAL dari slicer dikirim sebagai number JS, jadi nilai dengan > 15 digit signifikan (atau 16–17 digit yang representasi terpendeknya beda dari nilai tersimpan, mis. 123456789012,123456 → 123456789012.12346) tidak bisa dicocokkan kembali: `in` → 0 baris (tampak janggal), dan `not_in` ("semua kecuali") tidak mengecualikan nilai itu sama sekali — barisnya tetap terhitung tanpa peringatan, padahal chip berbunyi "Semua kecuali …" (perbaikan nanti: kirim teks desimal persis dari slicer dan cast `$f` ke DECIMAL(38,6)); pencarian slicer mencocokkan teks nilai tersimpan, bukan label tampil: kolom durasi dicari dalam detik ("5400" ketemu, "1:30" / "1,5" tidak), dan DOUBLE sangat kecil/besar ditulis DuckDB dalam notasi ilmiah ("0,0000001" tidak menemukan 1e-07) — gejala sama dengan pencarian boolean sebelum putaran 1, nilai tetap bisa dipilih dari daftar tanpa kata cari.
- Validation: unit test DuckDB sungguhan `tests/features/query/dashboard-filters.test.ts` (in + kosong, `not_in` dengan/tanpa (Kosong) + awalan 500 + in∪not_in = semua baris, tanggal saja pada TIMESTAMP = sehari penuh untuk in/not_in, rentang DECIMAL/DOUBLE/tanggal, preset 2026-10-11 WIB pada DATE/TIMESTAMP, batas 2026-12-31 23:30 UTC, filter dilewati di sheet lain/tersembunyi/tipe nilai beda, kelompok tipe beda dengan sumber → dilewati (tanggal vs teks, angka vs teks, sumber dimensi cross-filter), kolom tidak diizinkan → INVALID tanpa query, `filters` posisional ditolak → INVALID tanpa membaca sumber filter/DuckDB, juga untuk kolom yang diizinkan, posisi tidak ada, dan bersama dashboardFilters sah — jawaban identik untuk semua posisi, kunci cache kanonik), `tests/features/query/widget-query.test.ts` (`filters` posisional → INVALID identik untuk posisi ada/tersembunyi/tidak ada tanpa menyebut nama kolom, dashboardFilters di luar kolom filter → INVALID, angka di luar ±2^53 → INVALID, kolom filter tersembunyi → dilewati), `tests/features/query/filter-values.test.ts` (5.000 nilai → 1000 + truncated, "jak" tanpa peka kapital/aksen, wildcard di-escape, boolean lewat "ya"/"tidak"/"true"/"false", angka "1.234,25"/"4.999", kunci cache ternormalisasi = satu query, daftar > 256 KB tidak di-cache, sinyal batal → tanpa DuckDB, NOT_FOUND bukan pemilik), `tests/features/query/filter-values-http.test.ts` (429 + Retry-After, 403/401, status per kode, sinyal permintaan diteruskan, log tanpa kata cari), `tests/features/dashboards/filter-columns.test.ts` (validasi pengaturan kolom filter termasuk nama sama dari sheet lain ditolak, tampilan tidak tersedia = nama tersimpan + tipe netral, sumber filter + tipe, kolom cross-filter), `tests/lib/logger.test.ts` (redaksi); E2E `tests/e2e/filters.spec.ts` (AC1–AC4); perf `docs/ai/perf/T-012.md` (1 juta baris, p95 widget 36 ms, slicer cari 31 ms).

## Notes
- 2026-10-11T14:49:25Z UI wajib lewat rantai frontend-expert: design-foundations → tokens (preset dari T-025) → (+forms/data-fetching/app-shell sesuai kebutuhan) → components → anti-slop-code → responsive → motion ringan → anti-slop-design → polish → accessibility. Skip design-direction karena arah sudah dipilih di T-025, kecuali layar baru yang ambigu. Chart via skill dataviz; filter/select pakai Select kustom dari T-025, bukan native.
- 2026-10-11T14:56:59Z allowedFilterColumns per dashboard disimpan server; filter di URL divalidasi terhadapnya; nilai filter tidak di-log (pino redaksi).
- 2026-10-14T05:33:54Z Conventions check (AC5, audit /frontend-expert:audit lewat workflow review 3 lensa + konfirmasi bertahap, HEAD 03f863a):
- Tokens: preset project (zinc-blue, src/styles/tokens.css); 0 warna mentah; garis progres bg-primary, forced-colors memakai warna sistem Highlight/CanvasText.
- Icons: waiver @tabler/icons-react (Tabler saja: IconLoader2, IconClick, IconFilterOff, dst.; aria-hidden; spinner motion-safe; 0 Lucide).
- States: loading (kerangka), memuat ulang (garis progres + aria-busy + ikon/teks 'Memperbarui…' + satu pengumuman 'Memperbarui N widget…'), kosong (slicer tanpa hasil, widget tanpa data), error (widget + 'Coba lagi' dengan fokus ke judul; tanggal tidak valid setelah ditetapkan; galat slicer + coba lagi), filter tidak berlaku (catatan + popover), kunci minimal satu nilai beserta alasan.
- Responsive: 320/375/768/1024/1280/1440, terang + gelap + forced-colors; bilah filter di desktop, lembar 'Filter (n)' di ponsel; 0 scroll horizontal; kepala kartu tidak meluap, tombol tidak keluar kartu (diam & saat memuat ulang); target sentuh 44 px. Kanvas 768–1023 (kartu 66 px) → T-031.
- A11y: axe-core 4.14 (WCAG 2.2 AA + best-practice) ratusan run → serious/critical = 0 (selain artefak emulasi forced-colors pada elemen di luar T-012); popover non-modal, radiogroup/checkbox berlabel, aria-disabled untuk kunci, live region tunggal, fokus stabil setelah aksi; cross-filter punya tombol keyboard (aria-pressed) + petunjuk aria-describedby.

## Security checklist (OWASP ASVS 4.0.3)
<!-- Check each item when verified, or write "N/A: <reason>" after the text and check it. -->
- [x] V1 Architecture: trust boundaries and the components handling sensitive data are identified for this change — batas: klien → Route Handler (`/api/query`, `/api/dashboards/[id]/filter-values`, `/filter-columns`) / Server Action → service (authz pemilik, validasi zod, izin kolom D6) → DuckDB (parameter binding). Data sensitif = nilai filter/kata cari (tidak di-log).
- [x] V2 Authentication: credentials are verified server-side; no default, hard-coded, or weak secrets — N/A: tidak mengubah autentikasi; endpoint baru memakai requireUser("action") yang ada (401 tanpa sesi, diuji).
- [x] V3 Session management: session tokens are random, protected, invalidated on logout and expiry — N/A: tidak mengubah sesi (JWT + sessionVersion T-002 tetap dipakai).
- [x] V4 Access control: every endpoint/action checks authorization server-side, deny by default (no IDOR) — filter-values: `dashboard.dataset.ownerId = user` (lainnya NOT_FOUND 404, diuji); setter kolom filter: `updateMany where {id, dataset:{ownerId}}` (NOT_FOUND, diuji); query widget: satu-satunya filter klien `dashboardFilters` — kolomnya hanya `filterColumns` ∪ dimensi cross-filter dari DB (INVALID tanpa DuckDB, diuji) dan hanya diterapkan ke kolom dengan kelompok tipe yang sama dengan sumbernya yang tersedia (diuji); `filters` posisional lama dihapus (body strict → 400, diuji), jadi tidak ada jalur filter yang melewati pemeriksaan ini; sheet selalu dari versi aktif dataset dashboard.
- [x] V5 Validation, sanitization and encoding: all input validated; output encoded; no injection (SQL, OS, template) — zod strict (`dashFilterSchema`, `widgetBodySchema` tanpa `filters`, `filterValuesBodySchema`, `filterColumnSchema`), tanggal kalender diperiksa, angka ±2^53; SQL: identifier `c<pos>` dari skema, nilai/kata cari lewat `$f`/`$q`, wildcard LIKE di-escape (diuji), cast DECIMAL lewat teks hasil decimal6.
- [x] V6 Stored cryptography: sensitive data at rest uses approved algorithms; keys are not in the code — N/A: tidak ada data rahasia baru yang disimpan (filterColumns hanya nama sheet/kolom).
- [x] V7 Error handling and logging: errors reveal no internals; security events are logged without secrets — error tak terduga → 503/BUSY tanpa detail; log aplikasi hanya userId + pesan error; kunci `dashboardFilters/values/value/q/cross/filters` diredaksi (tests/lib/logger.test.ts, filter-values-http.test.ts). Pengecualian sadar: nilai filter di `?f=` ikut tercatat di log request (dev server, access log proxy) — lihat V8.
- [x] V8 Data protection: personal/sensitive data is minimized, not cached or logged, and removable — nilai filter tidak di-log aplikasi; hasil query/slicer hanya di cache memori proses (LRU berbatas byte, TTL 24 jam, kunci memuat versi + schemaRevision; daftar slicer > 256 KB tidak di-cache); respons no-store; teks > 1000 karakter tidak dikirim ke slicer. **Pengecualian sadar (AC1 mewajibkan status filter di URL):** `?f=` bisa tersimpan di riwayat browser dan access log reverse proxy → tindak lanjut T-023: access log produksi tanpa query string (Caddy filter `request>uri` / nginx `$uri`); Referer lintas situs hanya origin.
- [x] V9 Communication: TLS for all external traffic; certificates validated — N/A: tidak ada lalu lintas eksternal baru (DuckDB in-process, PostgreSQL yang sama).
- [x] V10 Malicious code: no backdoors, time bombs, or unexplained network calls; dependencies are trusted — tidak ada dependensi baru; tidak ada panggilan jaringan baru.
- [x] V11 Business logic: flows cannot be abused (limits, ordering, replay, race conditions) — ≤ 8 kolom filter, ≤ 20 filter × ≤ 500 nilai, kata cari ≤ 100, LIMIT 1001, batas waktu slicer 10 detik, jatah query per user sama dengan widget; preset dari jam server (klien tidak bisa memilih "hari ini"); kolom filter yang tidak tersedia dilewati per widget, bukan error.
- [x] V12 Files and resources: uploads are type/size limited and stored safely; no path traversal or SSRF — N/A: tidak ada unggahan/path dari user; parquet tetap dari typedKey DB.
- [x] V13 API and web service: API inputs/outputs are schema-validated; CORS and rate limits are deliberate — body JSON berbatas + content-type JSON, Origin = APP_URL (403, diuji), rate limit `filterValues` 300/menit/user (429 + Retry-After, diuji) dan `dashboardEdit` untuk setter, `query` 600/menit untuk widget.
- [x] V14 Configuration: secure defaults, security headers, no debug in production, dependencies up to date — N/A: tidak mengubah konfigurasi/header; default kolom filter `[]` = tidak ada filter yang diizinkan selain cross-filter.

## Evidence
<!-- Generated by aitk close. -->
- Check: `npm run check` → exit 0 at 2026-10-14T05:34:29Z (35026 ms)
- Acceptance criteria: 5/5 satisfied
- Commits: 00400de, 0177afd, 03d94b3, 03f863a, 0423efd, 0458545, 04e47a2, 0727a63, 098fc77, 0a23305, 0b3dbca, 0d4c16b, 13b3d0b, 15536b5, 1663077, 17c1240, 183aee3, 1add773, 1b6e65d, 1c4ecfb, 1d787d4, 2170640, 2291c8a, 22b384e, 24e2978, 2653b85, 2725e19, 27bf134, 29f1080, 2a7eff2, 2b68a94, 2b68d11, 2ba4512, 2c2e6a4, 2c5ffeb, 30baa8d, 3107c1b, 316fa62, 327dde2, 37af03d, 38adbac, 3bf60b5, 3c5143a, 3d486ab, 3fd726f, 401b86a, 40c4360, 457220a, 460d650, 467b44d, 471d15b, 4a2154f, 4bff118, 4c397a1, 4d5aa50, 4f751b8, 506e66d, 561f910, 59fa9e0, 5a7d2eb, 5aeb313, 5d46f4b, 5def94f, 5f13bde, 608c247, 60938f4, 60ea826, 6248130, 626d6d6, 642bb4e, 644c4db, 64a8e95, 66ba1d5, 6c02829, 6c7cef8, 70b7906, 724603c, 75c431f, 76c40e2, 76e3600, 798158f, 799df98, 7c5267b, 7d27e01, 7dddfc4, 7e58646, 7fa3c87, 841d6c1, 8492031, 8963fe4, 8aff0f1, 8e072af, 8e4a34f, 8fe24a0, 915c9f1, 9558d66, 9835114, 9b2bfc6, 9cd6ff0, 9cee0e6, 9dbbba2, a02a7c0, a1ea496, a384931, a5bd0e9, ab9e083, ae491a6, b189cbc, b2a1115, b2d4c94, b330d22, b6d2610, bdc0360, bdd24f1, be956d7, bec0af8, c0a7685, c1db097, c51c2b5, c540736, c665ce6, c67c26b, c6e50a2, c940620, ccfc959, cd5c936, ce6ecb7, cfc55cb, d0e8dd2, d1fa24d, d363c9a, d6d03db, d85299c, d9f240b, dbe1056, dd15a67, ddf64a3, e1ff563, e28eb08, e3d5ef8, e3da62b, e541eb1, e56694e, e594327, e5a4396, f511b61, f7101ee, f8b7660, fbf5494, fe5861e
- Review pass 1 by claude-verify-workflow: 30 findings
- Review pass 2 by claude-verify-workflow: 15 findings
- Review pass 3 by frontend-expert-design-reviewer: 5 findings
- Review pass 4 by frontend-expert-design-reviewer: 2 findings
- Review pass 5 by claude-verify-workflow: 1 findings
- Review pass 6 by frontend-expert-design-reviewer: 1 findings
- Review pass 7 by claude-verify-workflow: 0 findings
