---
id: T-014
title: Pemetaan kolom saat skema versi baru tidak cocok
status: done
profile: strict
goal: G-5
depends_on:
  - T-013
created: "2026-10-11T14:45:09Z"
updated: "2026-10-15T01:36:52Z"
closed: "2026-10-15T01:36:52Z"
created_by: claude-code
workers:
  - claude-code
branch: worktree-t-001-scaffold
base: d03c1fa28b220019d844fc3fc017ed63278c1074
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
  - prisma/migrations/20261014182534_t014_sheet_alias/migration.sql
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
  - src/app/(app)/datasets/[id]/pemetaan/loading.tsx
  - src/app/(app)/datasets/[id]/pemetaan/page.tsx
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
  - src/app/api/datasets/[id]/mapping/[jobId]/route.ts
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
  - src/components/mapping/mapping-cast-fields.tsx
  - src/components/mapping/mapping-confirm.tsx
  - src/components/mapping/mapping-discard.tsx
  - src/components/mapping/mapping-extra.tsx
  - src/components/mapping/mapping-form.tsx
  - src/components/mapping/mapping-last.tsx
  - src/components/mapping/mapping-lowcast-row.tsx
  - src/components/mapping/mapping-missing-row.tsx
  - src/components/mapping/mapping-model.ts
  - src/components/mapping/mapping-pair.tsx
  - src/components/mapping/mapping-picker.tsx
  - src/components/mapping/mapping-review.tsx
  - src/components/mapping/mapping-save-bar.tsx
  - src/components/mapping/mapping-sheet.tsx
  - src/components/mapping/mapping-status.tsx
  - src/components/mapping/mapping-summary.tsx
  - src/components/mapping/mapping-types.ts
  - src/components/mapping/mapping-version.tsx
  - src/components/mapping/use-mapping-job.ts
  - src/components/mapping/use-pair-plans.ts
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
  - src/components/widgets/absent-note.tsx
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
  - src/features/ingest/mapping-input.ts
  - src/features/ingest/mapping.ts
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
  - src/features/versions/mapping.ts
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
  - tests/components/mapping-model.test.ts
  - tests/components/mapping-review-r2.test.ts
  - tests/components/upload-panel-state.test.ts
  - tests/components/version-history-busy.test.ts
  - tests/components/version-history-r2.test.ts
  - tests/components/version-history-status.test.ts
  - tests/components/widget-absent.test.ts
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
  - tests/e2e/mapping.spec.ts
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
  - tests/features/ingest/absent.test.ts
  - tests/features/ingest/fakes.ts
  - tests/features/ingest/ingest-review.test.ts
  - tests/features/ingest/ingest.test.ts
  - tests/features/ingest/mapping.test.ts
  - tests/features/ingest/pure.test.ts
  - tests/features/ingest/recast.test.ts
  - tests/features/ingest/recovery.test.ts
  - tests/features/ingest/refresh-ingest.test.ts
  - tests/features/ingest/refresh.test.ts
  - tests/features/ingest/typed.test.ts
  - tests/features/ingest/wide.test.ts
  - tests/features/query/absent.test.ts
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
  - tests/features/versions/mapping-queue.test.ts
  - tests/features/versions/mapping.test.ts
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
      at: "2026-10-14T18:25:26Z"
      findings: 15
    - "n": 2
      by: frontend-expert-design-reviewer
      at: "2026-10-14T23:02:28Z"
      findings: 13
    - "n": 3
      by: claude-verify-workflow
      at: "2026-10-14T23:46:47Z"
      findings: 4
    - "n": 4
      by: frontend-expert-design-reviewer
      at: "2026-10-15T01:15:27Z"
      findings: 4
    - "n": 5
      by: claude-verify-workflow
      at: "2026-10-15T01:33:00Z"
      findings: 0
evidence:
  check:
    cmd: npm run check
    exit_code: 0
    duration_ms: 38028
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

      {"level":40,"time":1792028179622,"service":"data-dashboard","check":"B","detail":"koneksi ditolak","msg":"health check gagal"}
      {"level":40,"time":1792028179646,"service":"data-dashboard","check":"Lambat","detail":"Lambat: timeout 20 ms","msg":"health check gagal"}

       Test Files  68 passed (68)
            Tests  1016 passed (1016)
         Start at  08:36:14
         Duration  25.64s (tests 84%, import 10%, transform 5%)


      > data-dashboard@0.1.0 audit
      > npm audit --audit-level=high --omit=dev && npm audit --audit-level=critical

      found 0 vulnerabilities
      found 0 vulnerabilities
    at: "2026-10-15T01:36:42Z"
    tree: c403ee8e6f2a830ab8b5e800fb4fa5e75b2b440405e279d3a2e22cce494ee744
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
    - 3e91002
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
    - 58fa92d
    - 59fa9e0
    - 5a7d2eb
    - 5aeb313
    - 5d46f4b
    - 5def94f
    - 5f13bde
    - 608c247
    - 60938f4
    - 60ea826
    - 6242a82
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
    - b7217d9
    - b96c635
    - bdc0360
    - bdd24f1
    - be956d7
    - bec0af8
    - c0a7685
    - c1db097
    - c29fdcb
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
    - ced0728
    - cfc55cb
    - d03c1fa
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
    - e547f3f
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
    at: "2026-10-15T01:36:42Z"
    passed: true
    tree: c403ee8e6f2a830ab8b5e800fb4fa5e75b2b440405e279d3a2e22cce494ee744
    results:
      - name: osv-scanner (dependencies, offline db)
        exit_code: 0
        summary: |-
          Scanning dir .
          Starting filesystem walk for root: /
          Scanned /Users/anasfikri/Documents/Projects/pcpexpress/data-dashboard/.claude/worktrees/t-001-scaffold/package-lock.json file and found 723 packages
          End status: 146 dirs visited, 725 inodes visited, 1 Extract calls, 64.791416ms elapsed, 64.792ms wall time
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
Versi refresh dengan kolom skema aktif yang tidak ditemukan atau cast < 98% → AWAITING_MAPPING. UI: petakan kolom baru → kolom lama, konfirmasi NULL untuk kolom hilang, kolom baru masuk tersembunyi. Simpan → re-cast typed versi baru dari raw-nya dengan skema hasil pemetaan → READY + aktif. Sampai selesai, versi aktif lama tetap tampil.

## Acceptance criteria
- [x] Given file baru dengan satu kolom berganti nama, when ingest selesai, then versi AWAITING_MAPPING, dashboard masih menampilkan versi lama, dan UI menunjukkan kolom yang tidak ditemukan
- [x] Given user memetakan kolom baru ke kolom lama dan menyimpan, when re-cast selesai, then versi READY dan aktif tanpa membaca file asli
- [x] Given kolom skema aktif hilang di file baru dan user mengonfirmasi NULL, when aktif, then widget yang memakai kolom itu menampilkan nilai kosong, bukan error
- [x] Given file baru punya kolom tambahan, when aktif, then kolom itu ada di skema sebagai hidden dan bisa ditampilkan dari halaman skema
- [x] Given halaman/komponen task ini selesai, when /frontend-expert:audit dijalankan (anti-slop-design, responsive 320/768/1024/1440, accessibility), then tidak ada temuan Critical/High dan blok Conventions check (Tokens: preset project; Icons: waiver @tabler/icons-react; States loading/empty/error; Responsive; A11y) dicatat sebagai note task

## Risk
- Impact: versi AWAITING_MAPPING (T-013) kini bisa diselesaikan: halaman /datasets/[id]/pemetaan, job map-version di
  antrean recast, commit + aktivasi versi, kolom NULL fisik (absent) yang ikut dibawa refresh/recast berikutnya,
  query widget menandai kolom kosong. Salah pemetaan = widget menampilkan kolom keliru; salah commit = versi aktif
  berganti tanpa persetujuan.
- Security (STRIDE): Spoofing/Elevation — aksi & route status hanya pemilik (NOT_FOUND bagi yang lain). Tampering —
  semua keputusan divalidasi server (status, base snapshot di bawah FOR UPDATE, satu-ke-satu, rentang posisi, batas
  16 384 kolom); worker hanya membaca raw.parquet milik versi itu. Repudiation — AuditLog dataset.version.map.
  Info disclosure — contoh nilai hanya ke pemilik. DoS — rate limit versionChange, satu job per versi (indeks Redis),
  payload hanya keputusan.
- Rollback: revert commit T-014; tanpa migrasi. Kolom absent di skema yang sudah aktif tetap terbaca kode lama sebagai
  kolom biasa (parquet punya kolom NULL bertipe).
- Validation: unit test pemetaan/validasi/kolom absent/carry-forward/recast; e2e: ganti nama kolom → petakan → aktif
  tanpa file asli (AC1–2), kolom hilang → kosongkan → widget "(kosong)" (AC3), kolom tambahan tersembunyi lalu
  ditampilkan di Skema (AC4); review 3 lensa sampai 0 temuan; audit frontend-expert (AC5).

## Notes
- 2026-10-14 Keputusan desain T-014 (standar, diambil lead; kontrak lengkap di tmp kerja): (1) isu dihitung ulang di app
  dari Sheet versi + skema aktif terkini; writeTyped menyimpan nonEmpty agar % cast tepat. (2) Keputusan per kolom aktif
  yang tampil dan hilang: kolom baru (satu-ke-satu) atau kosongkan (NULL); kolom aktif tersembunyi yang hilang tetap
  dibuang. Sheet aktif tanpa pasangan: pasangkan dengan sheet baru yang belum berpasangan, atau tidak dipakai lagi.
  (3) Kolom dipetakan mewarisi nama/tipe/format aktif; judul asli tetap judul file baru. (4) Kolom NULL = kolom fisik
  bertipe di akhir sheet, absent: true, judul asli = judul aktif; refresh berikutnya membawanya otomatis, recast
  mempertahankannya. (5) Job map-version di antrean recast; versi tetap AWAITING_MAPPING selama diterapkan; skema aktif
  berubah → STALE, pengguna memuat ulang. (6) Commit: FOR UPDATE, READY + aktivasi dengan peta sheet (widget ikut sheet
  yang ganti nama), audit dataset.version.map. (7) Widget menampilkan "(kosong)" + catatan untuk kolom absent.

- 2026-10-11T14:49:25Z UI wajib lewat rantai frontend-expert: design-foundations → tokens (preset dari T-025) → (+forms/data-fetching/app-shell sesuai kebutuhan) → components → anti-slop-code → responsive → motion ringan → anti-slop-design → polish → accessibility. Skip design-direction karena arah sudah dipilih di T-025, kecuali layar baru yang ambigu. Chart via skill dataviz; filter/select pakai Select kustom dari T-025, bukan native.
- 2026-10-15T01:33:30Z Conventions check (AC 5, /frontend-expert:audit lewat 5 putaran review dengan lensa frontend-expert:design-reviewer, render nyata 320/768/1024/1440 terang+gelap): Tokens: preset project zinc-blue (src/styles/tokens.css), tanpa hex mentah — pass. Icons: waiver @tabler/icons-react (Tabler saja; size 20/16 stroke 1.5, aria-hidden) — pass. States: loading (skeleton /pemetaan, rencana pasangan dimuat, Menyimpan pemetaan…), empty (Tidak ada file yang perlu dipetakan), error (FormAlert + Muat lagi/Muat ulang, galat per baris, hasil gagal terakhir), review (panel tinjau + persetujuan), success (FocusNotice ?mapped=1) — pass. Responsive: tanpa gulir horizontal (nama panjang membungkus), CTA lebar penuh < 768, container query baris — pass. A11y: axe-core WCAG 2.2 AA 0 serious/critical di semua putaran (kecuali kasus app-wide Radix Select terbuka, dicatat di T-032), fokus dikelola (simpan dengan keputusan terbuka, dialog NULL, panel tinjau, banner STALE, Muat lagi), bar simpan tidak menutup kontrol fokus (scroll-padding) — pass. Pass review terakhir 0 temuan.

## Security checklist (OWASP ASVS 4.0.3)
<!-- Check each item when verified, or write "N/A: <reason>" after the text and check it. -->
- [x] V1 Architecture: trust boundaries and the components handling sensitive data are identified for this change — batas kepercayaan: halaman/aksi pemetaan (pemilik) → job map-version di worker (data dimuat ulang dari DB) → commit di bawah kunci Dataset; route status hanya untuk job milik dataset pemilik
- [x] V2 Authentication: credentials are verified server-side; no default, hard-coded, or weak secrets — N/A: tidak ada perubahan autentikasi; aksi baru memakai requireUser('action')
- [x] V3 Session management: session tokens are random, protected, invalidated on logout and expiry — N/A: tidak ada perubahan sesi
- [x] V4 Access control: every endpoint/action checks authorization server-side, deny by default (no IDOR) — mappingView/pairPlanAction/submitMappingAction/mappingJobId/route status menguji Dataset.ownerId; sheet harus milik versi aktif / versi menunggu dataset itu; job id dicek nama job + datasetId (tanpa IDOR)
- [x] V5 Validation, sanitization and encoding: all input validated; output encoded; no injection (SQL, OS, template) — payload diskema zod ketat (posisi, enum tipe/format, satu-ke-satu, batas 16 384 kolom) + validateMapping ulang di worker; SQL DuckDB hanya memakai posisi c<pos> dan tipe dari enum (CAST NULL bertipe tetap); judul/contoh nilai dirender sebagai teks React
- [x] V6 Stored cryptography: sensitive data at rest uses approved algorithms; keys are not in the code — N/A: tidak ada data rahasia baru
- [x] V7 Error handling and logging: errors reveal no internals; security events are logged without secrets — aksi {ok:false,code,message} tanpa detail internal; kegagalan job tersimpan sebagai teks aman (mapping-last) 24 jam
- [x] V8 Data protection: personal/sensitive data is minimized, not cached or logged, and removable — contoh nilai kolom hanya ke pemilik; unggahan typed sisa dihapus (deleteObject) pada review/stale/gagal
- [x] V9 Communication: TLS for all external traffic; certificates validated — N/A: tidak ada lalu lintas eksternal baru
- [x] V10 Malicious code: no backdoors, time bombs, or unexplained network calls; dependencies are trusted — tanpa dependensi baru; npm audit + osv-scanner 0 kerentanan
- [x] V11 Business logic: flows cannot be abused (limits, ordering, replay, race conditions) — satu job per versi (SET NX + kunci per versi), batas job per pengguna bersama recast, snapshot skema dicek di bawah FOR UPDATE (STALE), status guard AWAITING_MAPPING, persetujuan eksplisit sebelum nilai tidak cocok dikosongkan, alias ambigu tidak ditebak
- [x] V12 Files and resources: uploads are type/size limited and stored safely; no path traversal or SSRF — worker hanya membaca raw.parquet versi itu (tanpa file asli); key typed divalidasi regex sebelum dihapus
- [x] V13 API and web service: API inputs/outputs are schema-validated; CORS and rate limits are deliberate — rate limit versionChange (submit) + query (rencana pasangan) sebelum kunci/pemuatan berat; cek bentuk payload dulu; ukuran halaman dibatasi (rencana pasangan sesuai permintaan)
- [x] V14 Configuration: secure defaults, security headers, no debug in production, dependencies up to date — migrasi hanya kolom nullable (Sheet.aliasName); job terdaftar di worker recast; next build produksi diverifikasi saat penutupan

## Evidence
<!-- Generated by aitk close. -->
- Check: `npm run check` → exit 0 at 2026-10-15T01:36:42Z (38028 ms)
- Acceptance criteria: 5/5 satisfied
- Commits: 00400de, 0177afd, 03d94b3, 03f863a, 0423efd, 0458545, 04e47a2, 0727a63, 098fc77, 0a23305, 0ad2dbe, 0b3dbca, 0d4c16b, 0f862c9, 13b3d0b, 15536b5, 1663077, 17c1240, 183aee3, 1977286, 1add773, 1b6e65d, 1c4ecfb, 1d787d4, 2170640, 2291c8a, 22b384e, 24d5af2, 24e2978, 2653b85, 2725e19, 27bf134, 29f1080, 2a7eff2, 2b68a94, 2b68d11, 2ba4512, 2c2e6a4, 2c5ffeb, 30baa8d, 3107c1b, 316fa62, 327dde2, 33352bb, 37af03d, 38adbac, 3a7b69d, 3bf60b5, 3c5143a, 3d486ab, 3e91002, 3fd726f, 401b86a, 40c4360, 457220a, 460d650, 467b44d, 471d15b, 4a2154f, 4bff118, 4c397a1, 4d5aa50, 4f5f3fc, 4f751b8, 506e66d, 5219784, 544d726, 561f910, 58fa92d, 59fa9e0, 5a7d2eb, 5aeb313, 5d46f4b, 5def94f, 5f13bde, 608c247, 60938f4, 60ea826, 6242a82, 6248130, 626d6d6, 642bb4e, 644c4db, 64a8e95, 66ba1d5, 6c02829, 6c7cef8, 70b7906, 724603c, 75c431f, 76c40e2, 76e3600, 798158f, 799df98, 7c5267b, 7d27e01, 7dddfc4, 7e58646, 7fa3c87, 841d6c1, 846c6be, 8492031, 8963fe4, 8aff0f1, 8e072af, 8e4a34f, 8ec9de3, 8fe24a0, 905fc9a, 915c9f1, 9558d66, 97b3218, 9835114, 9b2bfc6, 9cd6ff0, 9cee0e6, 9dbbba2, a02a7c0, a1ea496, a384931, a5bd0e9, ab9e083, ae491a6, b189cbc, b293f29, b2a1115, b2d4c94, b330d22, b6d2610, b7217d9, b96c635, bdc0360, bdd24f1, be956d7, bec0af8, c0a7685, c1db097, c29fdcb, c47d177, c4eef6a, c51c2b5, c540736, c665ce6, c67c26b, c6e50a2, c940620, ca648f6, ccfc959, cd5c936, ce6ecb7, ced0728, cfc55cb, d03c1fa, d0e8dd2, d1fa24d, d363c9a, d6d03db, d85299c, d8c6887, d9f240b, dbe1056, dc23b05, dd15a67, ddf64a3, e1ff563, e28eb08, e3d5ef8, e3da62b, e541eb1, e547f3f, e56694e, e594327, e5a4396, f14041f, f511b61, f7101ee, f8b7660, fbf5494, fe5861e
- Review pass 1 by claude-verify-workflow: 15 findings
- Review pass 2 by frontend-expert-design-reviewer: 13 findings
- Review pass 3 by claude-verify-workflow: 4 findings
- Review pass 4 by frontend-expert-design-reviewer: 4 findings
- Review pass 5 by claude-verify-workflow: 0 findings
