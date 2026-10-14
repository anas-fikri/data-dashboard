---
id: T-013
title: 'Versi dataset: ganti data, aktivasi, rollback, retensi'
status: done
profile: strict
profile_pinned: true
goal: G-5
tags:
  - security
depends_on:
  - T-008
  - T-011
created: "2026-10-11T14:45:09Z"
updated: "2026-10-14T16:37:41Z"
closed: "2026-10-14T16:37:41Z"
created_by: claude-code
workers:
  - claude-code
branch: worktree-t-001-scaffold
base: 3a7b69d955891663b7e7b95b8db03c2b138b806a
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
  - prisma/migrations/20261014054628_t013_dataset_versions/migration.sql
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
  - src/components/dashboards/config-saves.ts
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
  - src/components/datasets/dataset-activity.tsx
  - src/components/datasets/dataset-data-summary.tsx
  - src/components/datasets/dataset-form.tsx
  - src/components/datasets/dataset-list.tsx
  - src/components/datasets/delete-dataset.tsx
  - src/components/datasets/ingest-progress.tsx
  - src/components/datasets/status-badge.tsx
  - src/components/datasets/upload-panel-state.ts
  - src/components/datasets/upload-panel.tsx
  - src/components/datasets/version-history-actions.tsx
  - src/components/datasets/version-history-confirm.tsx
  - src/components/datasets/version-history-mapping.tsx
  - src/components/datasets/version-history-row.tsx
  - src/components/datasets/version-history-status.ts
  - src/components/datasets/version-history.tsx
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
  - src/features/ingest/active-lock.ts
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
  - src/features/ingest/refresh.ts
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
  - src/features/versions/actions.ts
  - src/features/versions/activation.ts
  - src/features/versions/cleanup.ts
  - src/features/versions/retention.ts
  - src/features/versions/service.ts
  - src/features/versions/types.ts
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
  - tests/components/config-saves.test.ts
  - tests/components/dashboard-filters-r1.test.ts
  - tests/components/dashboard-filters-r2.test.ts
  - tests/components/dashboard-filters-r3.test.ts
  - tests/components/dashboard-filters.test.ts
  - tests/components/layout-ops.test.ts
  - tests/components/upload-panel-state.test.ts
  - tests/components/version-history-busy.test.ts
  - tests/components/version-history-r2.test.ts
  - tests/components/version-history-status.test.ts
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
  - tests/e2e/versions.spec.ts
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
  - tests/features/ingest/refresh-ingest.test.ts
  - tests/features/ingest/refresh.test.ts
  - tests/features/ingest/typed.test.ts
  - tests/features/ingest/wide.test.ts
  - tests/features/query/dashboard-filters.test.ts
  - tests/features/query/filter-values-http.test.ts
  - tests/features/query/filter-values.test.ts
  - tests/features/query/history-cache.test.ts
  - tests/features/query/query.test.ts
  - tests/features/query/widget-query.test.ts
  - tests/features/schema/schema.test.ts
  - tests/features/uploads/client-abort.test.ts
  - tests/features/uploads/pure.test.ts
  - tests/features/uploads/service.test.ts
  - tests/features/versions/activation.test.ts
  - tests/features/versions/cleanup.test.ts
  - tests/features/versions/retention.test.ts
  - tests/features/versions/service.test.ts
  - tests/features/widgets/remap.test.ts
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
  - tests/lib/use-polling.test.ts
  - tests/scripts/fixtures.test.ts
  - tests/scripts/parser-sax-edge.test.ts
  - tests/stubs/server-only.ts
  - tsconfig.json
  - vitest.config.mts
review:
  passes:
    - "n": 1
      by: claude-verify-workflow
      at: "2026-10-14T07:09:12Z"
      findings: 5
    - "n": 2
      by: frontend-expert-design-reviewer
      at: "2026-10-14T07:32:12Z"
      findings: 6
    - "n": 3
      by: claude-verify-workflow
      at: "2026-10-14T08:07:20Z"
      findings: 5
    - "n": 4
      by: frontend-expert-design-reviewer
      at: "2026-10-14T08:45:44Z"
      findings: 6
    - "n": 5
      by: claude-verify-workflow
      at: "2026-10-14T09:25:26Z"
      findings: 9
    - "n": 6
      by: frontend-expert-design-reviewer
      at: "2026-10-14T10:27:13Z"
      findings: 4
    - "n": 7
      by: claude-verify-workflow
      at: "2026-10-14T11:47:07Z"
      findings: 3
    - "n": 8
      by: frontend-expert-design-reviewer
      at: "2026-10-14T12:59:11Z"
      findings: 1
    - "n": 9
      by: claude-verify-workflow
      at: "2026-10-14T13:35:09Z"
      findings: 5
    - "n": 10
      by: frontend-expert-design-reviewer
      at: "2026-10-14T14:27:12Z"
      findings: 4
    - "n": 11
      by: claude-verify-workflow
      at: "2026-10-14T15:24:53Z"
      findings: 6
    - "n": 12
      by: frontend-expert-design-reviewer
      at: "2026-10-14T16:00:24Z"
      findings: 2
    - "n": 13
      by: claude-verify-workflow
      at: "2026-10-14T16:31:35Z"
      findings: 0
evidence:
  check:
    cmd: npm run check
    exit_code: 0
    duration_ms: 34747
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

      {"level":40,"time":1791995810305,"service":"data-dashboard","check":"B","detail":"koneksi ditolak","msg":"health check gagal"}
      {"level":40,"time":1791995810332,"service":"data-dashboard","check":"Lambat","detail":"Lambat: timeout 20 ms","msg":"health check gagal"}

       Test Files  60 passed (60)
            Tests  888 passed (888)
         Start at  23:36:46
         Duration  24.42s (tests 84%, import 9%, transform 6%)


      > data-dashboard@0.1.0 audit
      > npm audit --audit-level=high --omit=dev && npm audit --audit-level=critical

      found 0 vulnerabilities
      found 0 vulnerabilities
    at: "2026-10-14T16:37:12Z"
    tree: 6758250cb55843dedd7224fb42e66adce6b7d99589d09f6dada87c45af3084b5
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
    - 0ad2dbe
    - 0b3dbca
    - 0d4c16b
    - 0f862c9
    - 13b3d0b
    - 15536b5
    - "1663077"
    - 17c1240
    - 183aee3
    - "1977286"
    - 1add773
    - 1b6e65d
    - 1c4ecfb
    - 1d787d4
    - "2170640"
    - 2291c8a
    - 22b384e
    - 24d5af2
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
    - 33352bb
    - 37af03d
    - 38adbac
    - 3a7b69d
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
    - 4f5f3fc
    - 4f751b8
    - 506e66d
    - "5219784"
    - 544d726
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
    - 846c6be
    - "8492031"
    - 8963fe4
    - 8aff0f1
    - 8e072af
    - 8e4a34f
    - 8ec9de3
    - 8fe24a0
    - 905fc9a
    - 915c9f1
    - 9558d66
    - 97b3218
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
    - b293f29
    - b2a1115
    - b2d4c94
    - b330d22
    - b6d2610
    - b96c635
    - bdc0360
    - bdd24f1
    - be956d7
    - bec0af8
    - c0a7685
    - c1db097
    - c47d177
    - c4eef6a
    - c51c2b5
    - c540736
    - c665ce6
    - c67c26b
    - c6e50a2
    - c940620
    - ca648f6
    - ccfc959
    - cd5c936
    - ce6ecb7
    - cfc55cb
    - d0e8dd2
    - d1fa24d
    - d363c9a
    - d6d03db
    - d85299c
    - d8c6887
    - d9f240b
    - dbe1056
    - dc23b05
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
    - f14041f
    - f511b61
    - f7101ee
    - f8b7660
    - fbf5494
    - fe5861e
  acceptance:
    total: 5
    done: 5
  audit:
    at: "2026-10-14T16:37:32Z"
    passed: true
    tree: 6758250cb55843dedd7224fb42e66adce6b7d99589d09f6dada87c45af3084b5
    results:
      - name: osv-scanner (dependencies, offline db)
        exit_code: 0
        summary: |-
          Scanning dir .
          Starting filesystem walk for root: /
          Scanned /Users/anasfikri/Documents/Projects/pcpexpress/data-dashboard/.claude/worktrees/t-001-scaffold/package-lock.json file and found 723 packages
          End status: 141 dirs visited, 678 inodes visited, 1 Extract calls, 62.49425ms elapsed, 62.495ms wall time
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
Mode REPLACE. Ingest versi refresh men-cast raw dengan skema aktif per nama asli tanpa inferensi (D4); cocok → READY + aktif. Rollback: pemilik mengaktifkan salah satu dari 2 versi READY sebelumnya. Retensi 3 versi READY; job pembersihan menghapus metadata + Parquet versi lebih lama dan file asli > 7 hari sejak ingestFinishedAt. Jalur AWAITING_MAPPING di T-014.

## Acceptance criteria
- [x] Given file baru dengan kolom sama (nama asli cocok setelah normalisasi spasi/kapital), when ingest REPLACE selesai, then versi baru aktif dan semua widget menampilkan data baru tanpa konfigurasi ulang; tipe yang dipaksa user di skema aktif tetap berlaku
- [x] Given ingest versi baru gagal, when user membuka dashboard, then data versi aktif lama tampil dan badge gagal terlihat di profil
- [x] Given 3 versi READY, when versi ke-4 READY, then versi tertua dihapus beserta Parquet-nya; when pemilik memilih rollback ke versi sebelumnya, then activeVersionId berpindah dan cache miss
- [x] Given file asli berumur > 7 hari sejak ingestFinishedAt (sukses atau gagal), when job pembersihan berjalan, then file asli terhapus dan dashboard tetap berfungsi
- [x] Given halaman/komponen task ini selesai, when /frontend-expert:audit dijalankan (anti-slop-design, responsive 320/768/1024/1440, accessibility), then tidak ada temuan Critical/High dan blok Conventions check (Tokens: preset project; Icons: waiver @tabler/icons-react; States loading/empty/error; Responsive; A11y) dicatat sebagai note task

## Risk
- Impact: jalur ingest (finish tidak lagi selalu mengaktifkan), aktivasi versi (spec widget disimpan ulang),
  penghapusan data (retensi versi, file asli 7 hari, StorageCleanup), halaman profil dataset, panel unggah,
  worker maintenance. Salah hapus = kehilangan data pengguna; salah aktivasi = dashboard menampilkan versi keliru.
- Security (STRIDE): Spoofing/Elevation — aktivasi/rollback/buang versi hanya pemilik (Dataset.ownerId saat ini),
  non-pemilik NOT_FOUND. Tampering — prefix StorageCleanup divalidasi regex (raw|parquet)/<cuid>/(<cuid>/)? dan
  dicek terhadap baris Dataset/versi yang masih hidup sebelum dihapus; id dari baris DB, bukan dari input.
  Repudiation — AuditLog dataset.version.activate. Info disclosure — daftar versi owner-scoped, pesan tanpa
  detail internal. DoS — rate limit aksi, batch job ≤ 50/100 per putaran, backoff + batas attempts.
- Rollback: revert commit T-013 + migrasi 20261014054628 hanya menambah kolom nullable/berdefault (aman
  dibiarkan). Versi yang sudah dihapus retensi tidak bisa dipulihkan (sesuai keputusan A4: simpan 3 READY).
- Validation: unit test logika murni (pencocokan kolom/sheet/baris judul, verdict ≥ 98%, retensi, validasi
  prefix + keputusan aman, backoff, cutoff 7 hari); e2e ganti data (AC1), gagal (AC2), 4 versi + rollback
  (AC3), file asli > 7 hari (AC4), kolom tidak cocok → menunggu pemetaan + buang versi; review 3 lensa sampai
  0 temuan; audit frontend-expert (AC5).

## Notes
- 2026-10-11T14:49:25Z UI wajib lewat rantai frontend-expert: design-foundations → tokens (preset dari T-025) → (+forms/data-fetching/app-shell sesuai kebutuhan) → components → anti-slop-code → responsive → motion ringan → anti-slop-design → polish → accessibility. Skip design-direction karena arah sudah dipilih di T-025, kecuali layar baru yang ambigu. Chart via skill dataviz; filter/select pakai Select kustom dari T-025, bukan native.
- 2026-10-11T14:56:59Z Aktivasi/rollback hanya pemilik; job pembersihan menghapus prefix dengan '/' penutup; retensi raw 7 hari dan typed lama via job (MinIO lifecycle granularitas hari).
- 2026-10-11T23:58:30Z Dari review T-003: job pembersihan StorageCleanup wajib memvalidasi bentuk prefix (raw|parquet)/<cuid>/ sebelum menghapus, menaikkan attempts, dan menghapus baris setelah sukses.
- 2026-10-12T07:59:19Z Dari T-007: saat ini setiap versi yang selesai ingest diinferensi tipenya lalu langsung READY + aktif (finish di src/features/ingest/repo.ts). Jalur refresh T-013 harus menggantinya dengan cast memakai skema aktif per nama asli (tanpa inferensi), dan memperbarui kriteria macet bila menambah tahap.
- 2026-10-12T23:39:26Z Dari verifikasi T-011: setiap unggahan baru langsung aktif dengan id sheet baru. T-011 memetakan spec widget saat DIBACA (src/features/widgets/remap.ts: sheet lewat nama/satu-satunya sheet, kolom lewat nama; dipakai runWidgetQuery dan getDashboard). Saat aktivasi versi (dan sebelum retensi menghapus sheet lama), petakan lalu SIMPAN spec widget ke versi aktif agar tidak bergantung pada baris Sheet versi lama; widget yang kolomnya tidak ketemu ditandai untuk T-014.

- 2026-10-14 Keputusan desain T-013 (standar, diambil lead): (1) versi refresh = ingest saat dataset sudah punya
  versi aktif; versi pertama tetap inferensi. (2) Sheet dicocokkan lewat nama ternormalisasi (fallback satu↔satu);
  sheet baru tambahan diinferensi; sheet aktif yang hilang = tidak cocok. (3) Kolom dicocokkan lewat
  normName(nama asli) + urutan kemunculan (nama kembar/kosong); pilihan user (tipe, format, locale, nama tampil,
  sembunyi) dibawa sebagai override; kolom baru ikut tapi disembunyikan. (4) Baris judul aktif dicoba lebih dulu.
  (5) Cocok = semua sheet aktif ketemu, semua kolom aktif yang TAMPIL ketemu, cast ≥ 98%; kolom tersembunyi yang
  hilang tidak menghalangi. Tidak cocok → AWAITING_MAPPING + alasan; sementara T-014 belum ada, pemilik bisa
  "Buang versi ini". (6) Skema aktif berubah selama ingest → finish "stale" → BullMQ mengulang; recast/metadata
  hanya menulis ke versi yang masih aktif. (7) Aktivasi menyimpan spec widget ke sheet versi aktif bila
  semua kolom ketemu (kolom dicocokkan lewat judul asli + urutan, nama tampil hanya cadangan). Ada kolom hilang:
  spec dibiarkan di sheet lama (roll-forward memulihkannya) dan namanya dicatat di Widget.missingColumns —
  kecuali versi lama itu ikut dihapus retensi: spec disimpan ke sheet aktif dengan penanda kolom hilang. Widget
  yang sheet-nya tak terpetakan diarahkan (hanya tampilan) ke satu-satunya sheet aktif agar bisa diperbaiki. (8) Retensi saat aktivasi: simpan 3 READY terbaru + aktif; FAILED yang
  lebih tua dari READY terbaru dihapus; baris langsung dihapus, prefix storage dihapus job setelah ≥ 1 jam.
  (9) Rollback/roll-forward ke versi READY mana pun yang tersimpan; ditolak DATASET_BUSY selama ada versi non-terminal.
- 2026-10-14T16:32:53Z Conventions check (AC 5, /frontend-expert:audit lewat 13 putaran review dengan lensa frontend-expert:design-reviewer, render nyata): Tokens: preset project zinc-blue (src/styles/tokens.css), tanpa hex mentah — pass. Icons: waiver @tabler/icons-react (Tabler saja; size 20/16 stroke 1.5, aria-hidden; filled hanya untuk status Aktif) — pass. States: loading (pending tombol, Memproses/Menyimpan…), empty (kartu Riwayat versi disembunyikan bila kosong), error (FormAlert/FocusNotice dalam dialog, baris status error menempel di panel widget), success (FocusNotice berkunci), sibuk (catatan per keadaan) — pass. Responsive: 320/375/390/768/1024/1440/1920 terang+gelap, tanpa gulir horizontal, CTA lebar penuh < 768, tabel >= @3xl dan kartu di bawahnya — pass. A11y: axe-core WCAG 2.2 AA 0 serious/critical di semua putaran (riwayat versi, dialog aktifkan/buang, panel unggah, panel widget), fokus kembali ke pemicu, notifikasi menerima fokus, Tab berputar di lembar ponsel terlihat, kontrol fokus tidak tertutup baris menempel — pass. Tidak ada temuan Critical/High tersisa; pass review terakhir 0 temuan.

## Security checklist (OWASP ASVS 4.0.3)
<!-- Check each item when verified, or write "N/A: <reason>" after the text and check it. -->
- [x] V1 Architecture: trust boundaries and the components handling sensitive data are identified for this change — batas kepercayaan: Server Action aktifkan/buang versi (pemilik), worker (finish/retensi/job pembersihan), storage S3 — penghapusan hanya dari id DB tervalidasi
- [x] V2 Authentication: credentials are verified server-side; no default, hard-coded, or weak secrets — N/A: tidak ada perubahan autentikasi; aksi baru memakai requireUser('action') yang ada
- [x] V3 Session management: session tokens are random, protected, invalidated on logout and expiry — N/A: tidak ada perubahan sesi; sesi nonaktif/dicabut ditolak requireUser
- [x] V4 Access control: every endpoint/action checks authorization server-side, deny by default (no IDOR) — listVersions/activateVersion/discardVersion menguji Dataset.ownerId di bawah kunci baris; versionId dataset lain → NOT_FOUND (tanpa IDOR); worker hanya menyentuh id dari DB
- [x] V5 Validation, sanitization and encoding: all input validated; output encoded; no injection (SQL, OS, template) — id lewat isIdShape; prefix StorageCleanup regex ^(raw|parquet)/<cuid>/(<cuid>/)?$ + cek baris hidup; SQL mentah berparameter; nama kolom/sheet dari file hanya dirender sebagai teks React
- [x] V6 Stored cryptography: sensitive data at rest uses approved algorithms; keys are not in the code — N/A: tidak ada data rahasia baru yang disimpan
- [x] V7 Error handling and logging: errors reveal no internals; security events are logged without secrets — aksi mengembalikan {ok:false,code,message} tanpa detail internal; galat tak terduga → pesan umum, detail hanya di log pino
- [x] V8 Data protection: personal/sensitive data is minimized, not cached or logged, and removable — retensi 3 versi + file asli 7 hari menghapus data lama; uploadedBy (email) tidak dikirim ke klien; missingColumns tidak masuk WidgetView
- [x] V9 Communication: TLS for all external traffic; certificates validated — N/A: tidak ada lalu lintas eksternal baru (S3 internal yang sama)
- [x] V10 Malicious code: no backdoors, time bombs, or unexplained network calls; dependencies are trusted — tanpa dependensi baru; npm audit + osv-scanner 0 kerentanan
- [x] V11 Business logic: flows cannot be abused (limits, ordering, replay, race conditions) — DATASET_BUSY saat versi non-terminal; snapshot skema dicek di bawah FOR UPDATE (stale → ulang); recast/metadata hanya ke versi aktif (FOR SHARE); retensi tidak pernah menghapus versi aktif; rate limit versionChange; batch job ≤ 50/100 + backoff + batas attempts
- [x] V12 Files and resources: uploads are type/size limited and stored safely; no path traversal or SSRF — penghapusan storage hanya prefix tervalidasi milik baris yang sudah hilang/FAILED (tanpa path traversal); raw dihapus 7 hari; abort multipart sebelum hapus raw
- [x] V13 API and web service: API inputs/outputs are schema-validated; CORS and rate limits are deliberate — Server Action dengan cek Origin/Host bawaan Next; rate limit per pengguna; input diskema
- [x] V14 Configuration: secure defaults, security headers, no debug in production, dependencies up to date — migrasi hanya kolom nullable/berdefault; job maintenance terjadwal di worker; next build produksi bersih

## Evidence
<!-- Generated by aitk close. -->
- Check: `npm run check` → exit 0 at 2026-10-14T16:37:12Z (34747 ms)
- Acceptance criteria: 5/5 satisfied
- Commits: 00400de, 0177afd, 03d94b3, 03f863a, 0423efd, 0458545, 04e47a2, 0727a63, 098fc77, 0a23305, 0ad2dbe, 0b3dbca, 0d4c16b, 0f862c9, 13b3d0b, 15536b5, 1663077, 17c1240, 183aee3, 1977286, 1add773, 1b6e65d, 1c4ecfb, 1d787d4, 2170640, 2291c8a, 22b384e, 24d5af2, 24e2978, 2653b85, 2725e19, 27bf134, 29f1080, 2a7eff2, 2b68a94, 2b68d11, 2ba4512, 2c2e6a4, 2c5ffeb, 30baa8d, 3107c1b, 316fa62, 327dde2, 33352bb, 37af03d, 38adbac, 3a7b69d, 3bf60b5, 3c5143a, 3d486ab, 3fd726f, 401b86a, 40c4360, 457220a, 460d650, 467b44d, 471d15b, 4a2154f, 4bff118, 4c397a1, 4d5aa50, 4f5f3fc, 4f751b8, 506e66d, 5219784, 544d726, 561f910, 59fa9e0, 5a7d2eb, 5aeb313, 5d46f4b, 5def94f, 5f13bde, 608c247, 60938f4, 60ea826, 6248130, 626d6d6, 642bb4e, 644c4db, 64a8e95, 66ba1d5, 6c02829, 6c7cef8, 70b7906, 724603c, 75c431f, 76c40e2, 76e3600, 798158f, 799df98, 7c5267b, 7d27e01, 7dddfc4, 7e58646, 7fa3c87, 841d6c1, 846c6be, 8492031, 8963fe4, 8aff0f1, 8e072af, 8e4a34f, 8ec9de3, 8fe24a0, 905fc9a, 915c9f1, 9558d66, 97b3218, 9835114, 9b2bfc6, 9cd6ff0, 9cee0e6, 9dbbba2, a02a7c0, a1ea496, a384931, a5bd0e9, ab9e083, ae491a6, b189cbc, b293f29, b2a1115, b2d4c94, b330d22, b6d2610, b96c635, bdc0360, bdd24f1, be956d7, bec0af8, c0a7685, c1db097, c47d177, c4eef6a, c51c2b5, c540736, c665ce6, c67c26b, c6e50a2, c940620, ca648f6, ccfc959, cd5c936, ce6ecb7, cfc55cb, d0e8dd2, d1fa24d, d363c9a, d6d03db, d85299c, d8c6887, d9f240b, dbe1056, dc23b05, dd15a67, ddf64a3, e1ff563, e28eb08, e3d5ef8, e3da62b, e541eb1, e56694e, e594327, e5a4396, f14041f, f511b61, f7101ee, f8b7660, fbf5494, fe5861e
- Review pass 1 by claude-verify-workflow: 5 findings
- Review pass 2 by frontend-expert-design-reviewer: 6 findings
- Review pass 3 by claude-verify-workflow: 5 findings
- Review pass 4 by frontend-expert-design-reviewer: 6 findings
- Review pass 5 by claude-verify-workflow: 9 findings
- Review pass 6 by frontend-expert-design-reviewer: 4 findings
- Review pass 7 by claude-verify-workflow: 3 findings
- Review pass 8 by frontend-expert-design-reviewer: 1 findings
- Review pass 9 by claude-verify-workflow: 5 findings
- Review pass 10 by frontend-expert-design-reviewer: 4 findings
- Review pass 11 by claude-verify-workflow: 6 findings
- Review pass 12 by frontend-expert-design-reviewer: 2 findings
- Review pass 13 by claude-verify-workflow: 0 findings
