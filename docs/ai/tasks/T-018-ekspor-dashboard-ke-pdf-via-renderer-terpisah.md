---
id: T-018
title: Ekspor dashboard ke PDF via renderer terpisah
status: done
profile: strict
profile_pinned: true
goal: G-4
tags:
  - security
depends_on:
  - T-016
created: "2026-10-11T14:45:09Z"
updated: "2026-10-16T15:20:32Z"
closed: "2026-10-16T15:20:32Z"
created_by: claude-code
workers:
  - claude-code
branch: worktree-t-001-scaffold
base: 2496574ef8c25e79908d5c853085d7b7f22fd9ca
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
  - prisma/migrations/20261015015926_t016_dashboard_shares/migration.sql
  - prisma/migrations/20261015153006_t017_exports/migration.sql
  - prisma/migrations/migration_lock.toml
  - prisma/schema.prisma
  - prisma/seed.ts
  - public/brand/mark-dark.png
  - public/brand/mark.png
  - public/brand/pcp-logo-dark.png
  - public/brand/pcp-logo.png
  - renderer/README.md
  - renderer/env.ts
  - renderer/loader.mjs
  - renderer/render.ts
  - renderer/renderer.ts
  - renderer/seccomp_profile.json
  - renderer/server.ts
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
  - scripts/dev-expire-export.mjs
  - scripts/dev-expire-reset.mjs
  - scripts/dev-make-admin.mjs
  - scripts/dev-purge-test-data.mjs
  - scripts/dev-render-token.mjs
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
  - src/app/api/exports/[id]/download/route.ts
  - src/app/api/exports/[id]/route.ts
  - src/app/api/exports/route.ts
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
  - src/app/render/[token]/route.ts
  - src/app/render/layout.tsx
  - src/app/render/page.tsx
  - src/app/render/print.css
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
  - src/components/dashboards/dashboard-pdf-export.tsx
  - src/components/dashboards/dashboard-settings.tsx
  - src/components/dashboards/edit-dashboard-link.tsx
  - src/components/dashboards/filter-columns-settings.tsx
  - src/components/dashboards/filters/applied-store.ts
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
  - src/components/dashboards/widget-card-head.tsx
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
  - src/components/render/print-card.tsx
  - src/components/render/print-dashboard.tsx
  - src/components/render/print-layout.ts
  - src/components/render/print-table.tsx
  - src/components/render/render-ready.tsx
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
  - src/components/sharing/access-badge.tsx
  - src/components/sharing/role-select.tsx
  - src/components/sharing/share-add.tsx
  - src/components/sharing/share-dialog.tsx
  - src/components/sharing/share-grants.tsx
  - src/components/sharing/share-model.ts
  - src/components/sharing/share-options.tsx
  - src/components/sharing/share-org.tsx
  - src/components/sharing/share-panel.tsx
  - src/components/sharing/share-picker.tsx
  - src/components/sharing/share-warnings.tsx
  - src/components/sharing/shared-dashboard-list.tsx
  - src/components/sharing/use-share-state.ts
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
  - src/components/widgets/access-refresh.tsx
  - src/components/widgets/body-state.ts
  - src/components/widgets/chart-option.ts
  - src/components/widgets/chart-series.ts
  - src/components/widgets/chart-table.tsx
  - src/components/widgets/chart-view.tsx
  - src/components/widgets/chart-widget.tsx
  - src/components/widgets/export-menu.tsx
  - src/components/widgets/export-model.ts
  - src/components/widgets/export-status.tsx
  - src/components/widgets/export-store.ts
  - src/components/widgets/export-user.tsx
  - src/components/widgets/kpi-fit.ts
  - src/components/widgets/kpi-view.tsx
  - src/components/widgets/skipped-note.tsx
  - src/components/widgets/stale-label.tsx
  - src/components/widgets/table-view.tsx
  - src/components/widgets/use-box-size.ts
  - src/components/widgets/use-export-job.ts
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
  - src/features/dashboards/tx-conflict.ts
  - src/features/dashboards/validation.ts
  - src/features/datasets/actions.ts
  - src/features/datasets/label.ts
  - src/features/datasets/service.ts
  - src/features/datasets/validation.ts
  - src/features/exports/cleanup.ts
  - src/features/exports/csv.ts
  - src/features/exports/filename.ts
  - src/features/exports/http.ts
  - src/features/exports/job.ts
  - src/features/exports/pdf-filter.ts
  - src/features/exports/pdf-job.ts
  - src/features/exports/render-data.ts
  - src/features/exports/render-route.ts
  - src/features/exports/render-session.ts
  - src/features/exports/render-token.ts
  - src/features/exports/renderer-client.ts
  - src/features/exports/repo.ts
  - src/features/exports/schema.ts
  - src/features/exports/service.ts
  - src/features/exports/sql.ts
  - src/features/exports/types.ts
  - src/features/exports/xlsx.ts
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
  - src/features/sharing/access.ts
  - src/features/sharing/actions.ts
  - src/features/sharing/service.ts
  - src/features/sharing/types.ts
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
  - src/lib/download-navigation.ts
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
  - src/lib/storage/exports.ts
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
  - tests/components/dashboard-page-access.test.ts
  - tests/components/editor-access.test.ts
  - tests/components/export-review-r1.test.ts
  - tests/components/export-review-r2.test.ts
  - tests/components/export-review-r3.test.ts
  - tests/components/export-ui.test.ts
  - tests/components/home-page.test.ts
  - tests/components/layout-ops.test.ts
  - tests/components/mapping-model.test.ts
  - tests/components/mapping-review-r2.test.ts
  - tests/components/pdf-export-ui.test.ts
  - tests/components/print-chart.test.ts
  - tests/components/print-dashboard.test.ts
  - tests/components/print-layout.test.ts
  - tests/components/render-ready.test.ts
  - tests/components/sharing-history-soft-nav.test.ts
  - tests/components/sharing-review-r1.test.ts
  - tests/components/sharing-review-r2.test.ts
  - tests/components/sharing-review-r3.test.ts
  - tests/components/sharing-review-r4.test.ts
  - tests/components/sharing-review-r5.test.ts
  - tests/components/sharing-review-r6.test.ts
  - tests/components/sharing-review-r7.test.ts
  - tests/components/sharing-ui.test.ts
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
  - tests/e2e/exports.spec.ts
  - tests/e2e/filters.spec.ts
  - tests/e2e/global-setup.ts
  - tests/e2e/global-teardown.ts
  - tests/e2e/health.spec.ts
  - tests/e2e/helpers.ts
  - tests/e2e/ingest.spec.ts
  - tests/e2e/mapping.spec.ts
  - tests/e2e/password.spec.ts
  - tests/e2e/pdf.spec.ts
  - tests/e2e/schema.spec.ts
  - tests/e2e/security-headers.spec.ts
  - tests/e2e/sharing.spec.ts
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
  - tests/features/dashboards/http.test.ts
  - tests/features/dashboards/roles.test.ts
  - tests/features/datasets/create.test.ts
  - tests/features/datasets/delete.test.ts
  - tests/features/datasets/label.test.ts
  - tests/features/exports/cleanup.test.ts
  - tests/features/exports/csv.test.ts
  - tests/features/exports/filename.test.ts
  - tests/features/exports/fixtures.ts
  - tests/features/exports/http.test.ts
  - tests/features/exports/job.test.ts
  - tests/features/exports/pdf-job.test.ts
  - tests/features/exports/render-route.test.ts
  - tests/features/exports/render-session.test.ts
  - tests/features/exports/render-token.test.ts
  - tests/features/exports/renderer-client.test.ts
  - tests/features/exports/row-group.test.ts
  - tests/features/exports/service-pdf.test.ts
  - tests/features/exports/service.test.ts
  - tests/features/exports/xlsx.test.ts
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
  - tests/features/query/query-http.test.ts
  - tests/features/query/query.test.ts
  - tests/features/query/resolve-widget.test.ts
  - tests/features/query/sharing-fixtures.ts
  - tests/features/query/sharing-repo.test.ts
  - tests/features/query/sharing.test.ts
  - tests/features/query/widget-plan.test.ts
  - tests/features/query/widget-query.test.ts
  - tests/features/schema/schema.test.ts
  - tests/features/sharing/access.test.ts
  - tests/features/sharing/actions.test.ts
  - tests/features/sharing/fake-db.ts
  - tests/features/sharing/service.test.ts
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
  - tests/lib/download-navigation.test.ts
  - tests/lib/env.test.ts
  - tests/lib/health.test.ts
  - tests/lib/http-body.test.ts
  - tests/lib/logger.test.ts
  - tests/lib/security-headers.test.ts
  - tests/lib/seed.test.ts
  - tests/lib/text.test.ts
  - tests/lib/use-polling.test.ts
  - tests/renderer/env.test.ts
  - tests/renderer/render.test.ts
  - tests/renderer/server.test.ts
  - tests/scripts/fixtures.test.ts
  - tests/scripts/parser-sax-edge.test.ts
  - tests/stubs/server-only.ts
  - tsconfig.json
  - vitest.config.mts
review:
  passes:
    - "n": 1
      by: claude-verify-workflow
      at: "2026-10-15T23:54:44Z"
      findings: 9
    - "n": 2
      by: claude-verify-workflow
      at: "2026-10-16T01:45:24Z"
      findings: 1
    - "n": 3
      by: claude-verify-workflow
      at: "2026-10-16T02:05:22Z"
      findings: 3
    - "n": 4
      by: claude-verify-workflow
      at: "2026-10-16T02:52:53Z"
      findings: 5
    - "n": 5
      by: claude-verify-workflow
      at: "2026-10-16T03:40:40Z"
      findings: 3
    - "n": 6
      by: claude-verify-workflow
      at: "2026-10-16T04:30:21Z"
      findings: 4
    - "n": 7
      by: claude-verify-workflow
      at: "2026-10-16T05:32:05Z"
      findings: 2
    - "n": 8
      by: claude-verify-workflow
      at: "2026-10-16T06:12:30Z"
      findings: 2
    - "n": 9
      by: claude-verify-workflow
      at: "2026-10-16T07:34:34Z"
      findings: 3
    - "n": 10
      by: claude-verify-workflow
      at: "2026-10-16T08:25:35Z"
      findings: 2
    - "n": 11
      by: claude-verify-workflow
      at: "2026-10-16T09:07:09Z"
      findings: 2
    - "n": 12
      by: claude-verify-workflow
      at: "2026-10-16T09:56:59Z"
      findings: 3
    - "n": 13
      by: claude-verify-workflow
      at: "2026-10-16T10:38:43Z"
      findings: 2
    - "n": 14
      by: claude-verify-workflow
      at: "2026-10-16T11:24:21Z"
      findings: 1
    - "n": 15
      by: claude-verify-workflow
      at: "2026-10-16T13:24:02Z"
      findings: 2
    - "n": 16
      by: frontend-expert-design-reviewer
      at: "2026-10-16T14:52:47Z"
      findings: 0
    - "n": 17
      by: claude-verify-workflow
      at: "2026-10-16T14:52:47Z"
      findings: 1
    - "n": 18
      by: claude-verify-workflow
      at: "2026-10-16T15:09:42Z"
      findings: 0
evidence:
  check:
    cmd: npm run check
    exit_code: 0
    duration_ms: 46311
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

      {"level":40,"time":1792163991271,"service":"data-dashboard","check":"B","detail":"koneksi ditolak","msg":"health check gagal"}
      {"level":40,"time":1792163991292,"service":"data-dashboard","check":"Lambat","detail":"Lambat: timeout 20 ms","msg":"health check gagal"}
      {"level":40,"time":1792163991299,"service":"data-dashboard","check":"Renderer PDF","detail":"renderer tidak menjawab /healthz","msg":"health check gagal"}

       Test Files  117 passed (117)
            Tests  1681 passed (1681)
         Start at  22:19:42
         Duration  28.82s (tests 73%, import 20%, transform 6%, worker 1%)

          Isolate  117 workers spawned · ~184ms startup each (spawn + environment, per file)
                   at least ~2.21s faster with isolate: false — reuses workers across files instead of one per file


      > data-dashboard@0.1.0 audit
      > npm audit --audit-level=high --omit=dev && npm audit --audit-level=critical

      found 0 vulnerabilities
      found 0 vulnerabilities
    at: "2026-10-16T15:20:12Z"
    tree: b7a9066d2be58b5d966dbdbac4693eecbfd07344f00d10d8b331c4631116fa09
  commits:
    - 00400de
    - 0177afd
    - 03d94b3
    - 03f863a
    - 0423efd
    - "0458545"
    - "0469447"
    - 04e47a2
    - "0568901"
    - 0712a9c
    - 0727a63
    - 0796bbf
    - 098fc77
    - 0a23305
    - 0ad2dbe
    - 0b3dbca
    - 0d4c16b
    - 0f862c9
    - 104dc4c
    - 13b3d0b
    - 15536b5
    - "1663077"
    - 17c1240
    - 183aee3
    - 19714b5
    - "1977286"
    - 1add773
    - 1b6e65d
    - 1c4ecfb
    - 1d787d4
    - "2170640"
    - 2291c8a
    - 22b384e
    - 2361fa1
    - "2496574"
    - 24af891
    - 24d5af2
    - 24e2978
    - 254f209
    - 2653b85
    - 26ac601
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
    - "42238e1"
    - 42f5428
    - 43acc6d
    - "4508626"
    - 457220a
    - 460d650
    - "4647639"
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
    - 54d4ddc
    - 561dfa3
    - 561f910
    - 58fa92d
    - 592bae9
    - 59fa9e0
    - 5a7d2eb
    - 5aeb313
    - 5b7e0dd
    - 5d46f4b
    - 5def94f
    - 5f13bde
    - 608c247
    - 60938f4
    - 60ea826
    - 61d6e8b
    - 6242a82
    - "6248130"
    - 626d6d6
    - 642bb4e
    - 644c4db
    - 64a8e95
    - 6507eda
    - 66ba1d5
    - 6bb6067
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
    - 81eb135
    - 82de1b6
    - 841d6c1
    - 846c6be
    - "8492031"
    - "8940158"
    - 8963fe4
    - 8aff0f1
    - 8e072af
    - 8e4a34f
    - 8ec9de3
    - 8fe24a0
    - 905fc9a
    - 915c9f1
    - 930d1c4
    - 94df0a4
    - 9558d66
    - 978656b
    - 97b3218
    - "9835114"
    - 9b2bfc6
    - 9cd6ff0
    - 9cee0e6
    - 9dbbba2
    - a02a7c0
    - a1ea496
    - a384931
    - a45de8e
    - a5bd0e9
    - a9cc976
    - ab9e083
    - ae491a6
    - afc158d
    - b189cbc
    - b293f29
    - b2a1115
    - b2d4c94
    - b2f77ed
    - b330d22
    - b61a116
    - b6b0242
    - b6d2610
    - b7217d9
    - b96c635
    - bb18e9b
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
    - c6a3037
    - c6e50a2
    - c89ccc2
    - c93bb8b
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
    - de87d25
    - e1ff563
    - e28eb08
    - e39d424
    - e3d5ef8
    - e3da62b
    - e541eb1
    - e547f3f
    - e56694e
    - e594327
    - e5a4396
    - ec8018f
    - efc6950
    - f14041f
    - f3b0946
    - f511b61
    - f7101ee
    - f7efe9a
    - f8b7660
    - fbf5494
    - fe5861e
  acceptance:
    total: 6
    done: 6
  audit:
    at: "2026-10-16T15:14:25Z"
    passed: true
    tree: b7a9066d2be58b5d966dbdbac4693eecbfd07344f00d10d8b331c4631116fa09
    results:
      - name: osv-scanner (dependencies, offline db)
        exit_code: 0
        summary: |-
          Scanning dir .
          Starting filesystem walk for root: /
          Scanned /Users/anasfikri/Documents/Projects/pcpexpress/data-dashboard/.claude/worktrees/t-001-scaffold/package-lock.json file and found 736 packages
          End status: 162 dirs visited, 907 inodes visited, 1 Extract calls, 77.441625ms elapsed, 77.442ms wall time
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
Layanan renderer (Chromium/Playwright) terpisah dari app dan worker. App menerbitkan token render sekali pakai 60 detik terikat (dashboardId, userId, filter); renderer membuka /render/<token> yang hanya menerima token itu, mencetak A4 landscape, menyimpan ke exports/, presigned 1 jam.

## Acceptance criteria
- [x] Given dashboard 6 widget dengan filter aktif, when ekspor PDF, then PDF memuat semua widget dengan nilai sama seperti layar
- [x] Given token render sudah dipakai atau > 60 detik, when /render/<token> dibuka, then 404
- [x] Given renderer mati, when user ekspor PDF, then user melihat code RENDERER_UNAVAILABLE dalam ≤ 10 detik, bukan hang
- [x] Given halaman/komponen task ini selesai, when /frontend-expert:audit dijalankan (anti-slop-design, responsive 320/768/1024/1440, accessibility), then tidak ada temuan Critical/High dan blok Conventions check (Tokens: preset project; Icons: waiver @tabler/icons-react; States loading/empty/error; Responsive; A11y) dicatat sebagai note task
- [x] Given permintaan ke renderer tanpa header RENDERER_SECRET yang benar, when dikirim, then ditolak; renderer hanya menerima {token} dan membuka APP_INTERNAL_URL/render/<token> sendiri (tidak menerima URL)
- [x] Given halaman render mencoba memuat resource di luar origin app, when Chromium meminta, then diblokir oleh route allowlist; Chromium berjalan non-root dengan seccomp profile Playwright

## Risk
Impact: komponen baru renderer (Chromium) + halaman /render publik bertoken + antrean/worker `pdf`; jalur ekspor T-017 diperluas ke format PDF (Export tanpa widget, kunci .pdf, audit dashboard.export). Ketergantungan baru playwright-core (runtime) dan pdfjs-dist (dev). Dokumen flow-kerja/conventions/T-023 diselaraskan (pemanggil = worker, jaringan render).
Security (STRIDE): S — token render acak sekali pakai 60 detik (hash di Redis, GETDEL) ditukar cookie Path=/render sekali pakai; renderer hanya menerima {token} + header RENDERER_SECRET (timingSafeEqual), tidak pernah URL. T — data widget diambil di server lewat resolver yang sama dengan /api/query (D6, filter disanitasi saat buat dan saat render); renderer tidak bisa menulis ke storage (worker yang mengunggah setelah cek %PDF- + batas ukuran). R — AuditLog dashboard.export saat unduh. I — akses dashboard dicek ulang di worker dan halaman render; token tidak pernah memberi akses /api; path /render/<token> diredaksi dari log; CSP /render tanpa upgrade-insecure-requests, Referrer-Policy no-referrer, noindex, no-store. D — rate limit 10/10 menit + maks 2 ekspor berjalan per user, semaphore renderer (503), timeout render 60 s, PDF_MAX_BYTES. E — Chromium non-root + seccomp Playwright + cap_drop ALL + read_only di jaringan internal `render` tanpa egress; allowlist rute hanya origin app, 3xx dan origin lain diblokir (menutup bypass redirect).
Rollback: revert commit T-018; hapus service/jaringan renderer dari compose; antrean `pdf` di Redis boleh dihapus; baris Export PDF lama dibersihkan sapuan ekspor (tidak ada migrasi baru).
Validation: unit (token mint/exchange/consume + kedaluwarsa, klien renderer timeout → RENDERER_UNAVAILABLE, job PDF, pageBands, CSP /render, redaksi log, env refine host HSTS, validasi body/secret/allowlist renderer termasuk 3xx), e2e (AC1 nilai PDF = layar via pdfjs, AC2 token dipakai/kedaluwarsa 404, AC3 renderer mati → RENDERER_UNAVAILABLE ≤ 10 s, AC5 tanpa secret 401 / {url} 400), bukti docker non-root + seccomp (AC6), review adversarial berulang sampai 0 temuan + design-reviewer, next build.

## Notes
- 2026-10-11T14:49:25Z UI wajib lewat rantai frontend-expert: design-foundations → tokens (preset dari T-025) → (+forms/data-fetching/app-shell sesuai kebutuhan) → components → anti-slop-code → responsive → motion ringan → anti-slop-design → polish → accessibility. Skip design-direction karena arah sudah dipilih di T-025, kecuali layar baru yang ambigu. Chart via skill dataviz; filter/select pakai Select kustom dari T-025, bukan native.
- 2026-10-11T14:57:00Z Token dipindah dari URL ke cookie render-scope pada respons pertama; path /render/* diredaksi dari access log proxy dan pino; renderer hanya di network frontend (tidak bisa mencapai minio/redis/postgres).
- 2026-10-16T15:09:51Z Conventions check (AC 4, /frontend-expert:audit lewat putaran review dengan lensa frontend-expert:design-reviewer: UI aplikasi 320/768/1024/1440 terang+gelap untuk pemilik/editor/viewer + PDF nyata lewat renderer): Tokens: preset project zinc-blue, tanpa hex mentah; cetak memakai token yang sama (bg-card, border, text-muted-foreground), warna terang saja — pass. Icons: waiver @tabler/icons-react (FileTypePdf, Loader2, AlertTriangle, ChartBar, CircleOff, FilterOff; stroke 1.5, aria-hidden) — pass. States: tombol idle, Menyiapkan PDF… (aria-live), siap + unduh otomatis sekali + Unduh lagi (cek status), galat FormAlert + 'Kode: X' (RENDERER_UNAVAILABLE ≤ 10 s, EXPORT_TIMEOUT, RATE_LIMITED, EXPORT_BUSY), akses hilang, panel tertutup (spinner, titik galat, pengumuman); cetak: widget galat (pesan + kode), widget kosong, Tidak ada data, catatan filter/kolom kosong membungkus, 'Menampilkan X dari N baris' + kolom tidak muat — pass. Responsive: tombol header penuh lebar < 768 (44 px), panel di dalam viewport 320–1440, tanpa gulir horizontal; halaman cetak lebar tetap 277 mm (waiver: halaman khusus renderer); angka KPI dibatasi lebar dan tinggi kotak (layar + cetak) — pass. A11y: axe WCAG 2.2 AA 0 pelanggaran di semua kombinasi/keadaan, fokus tetap/kembali ke pemicu, live region, PDF ber-tag (H1/H2, Table, L/LI, Lang id, judul dokumen = nama dashboard, outline per widget) — pass. Putaran review: 18 pass (putaran r1–r17; dua terakhir 0 temuan: frontend-expert:design-reviewer r16, integritas r17 — konfirmasi perbaikan R16-INT-1 cache dingin 24af891).

## Security checklist (OWASP ASVS 4.0.3)
<!-- Check each item when verified, or write "N/A: <reason>" after the text and check it. -->
- [x] V1 Architecture: trust boundaries and the components handling sensitive data are identified for this change — batas kepercayaan (ADR-0006): POST /api/exports {dashboardId, format pdf, f} (sesi + Origin + rate limit) → tabel Export → antrean BullMQ `pdf` → worker cek akses ulang + cetak token → renderer (jaringan internal `render`, hanya {token} + header secret) → Chromium membuka APP_INTERNAL_URL/render/<token> → cookie sesi render → halaman /render mengambil data di server lewat resolver /api/query → PDF kembali ke worker (cek %PDF- + ukuran) → S3 exports/<userId>/<id>.pdf → presigned 5 menit; data sensitif = nilai widget terfilter, token/sesi render, RENDERER_SECRET
- [x] V2 Authentication: credentials are verified server-side; no default, hard-coded, or weak secrets — route app memakai requireUser (sesi aktif + terverifikasi); renderer menolak tanpa x-renderer-secret yang benar (401, timingSafeEqual atas digest sha256); RENDERER_SECRET ≥ 32 karakter, dicek placeholder, masuk SENSITIVE_VARS, dibangkitkan gen-dev-env (tidak ada secret bawaan/hard-coded)
- [x] V3 Session management: session tokens are random, protected, invalidated on logout and expiry — token render 32 byte acak (base64url 43), disimpan hanya sebagai sha256 di Redis SET NX PX 60000, GETDEL sekali pakai; ditukar sesi render (sisa TTL) → cookie dd.render HttpOnly SameSite=Strict Path=/render Max-Age ≤ 60 (Secure bila https); halaman /render GETDEL sesi (sekali pakai); HEAD tidak mengonsumsi; token tidak pernah memberi akses /api/* (diuji e2e AC2: dipakai/kedaluwarsa → 404)
- [x] V4 Access control: every endpoint/action checks authorization server-side, deny by default (no IDOR) — akses dashboard dicek saat buat, di worker, di halaman render (pengguna aktif + akses belum dicabut), saat status dan unduh; ekspor hanya milik pemilik (404 untuk lainnya); viewer/editor/pemilik memakai jalur role-shaped yang sama dengan /api/query (D6 400); render tanpa cookie/pemakaian kedua/user lain → 404 polos
- [x] V5 Validation, sanitization and encoding: all input validated; output encoded; no injection (SQL, OS, template) — body zod strict (dashboardId, format, f ≤ 60 000 karakter); filter disanitasi terhadap kolom filter + cross-filter dashboard saat buat DAN saat render; renderer: content-type JSON, body ≤ 1 KB, {token} strict /^[A-Za-z0-9_-]{43}$/, kunci lain (mis. url) → 400; identifier SQL tetap c<pos>, nilai di-bind; teks PDF dirender React (escape); nama file disanitasi (ASCII + RFC 5987)
- [x] V6 Stored cryptography: sensitive data at rest uses approved algorithms; keys are not in the code — token/sesi render disimpan hanya sebagai sha256 (bukan nilai mentah) dan kedaluwarsa ≤ 60 detik; RENDERER_SECRET hanya dari env, tidak di kode; tidak ada data rahasia baru at rest
- [x] V7 Error handling and logging: errors reveal no internals; security events are logged without secrets — renderer log hanya {requestId, ms, bytes, outcome}; galat ke user berupa kode (RENDERER_UNAVAILABLE, EXPORT_TIMEOUT, EXPORT_FAILED) tanpa galat mentah Chromium/S3; pino meredaksi /render/<token> di nilai string + kunci token, logger next dev mengabaikan /render/; AuditLog dashboard.export {exportId, format pdf, role} saat unduh
- [x] V8 Data protection: personal/sensitive data is minimized, not cached or logged, and removable — objek PDF kedaluwarsa 60 menit lalu dihapus oleh mekanisme T-017 (job + sapuan + lifecycle 1 hari); /render: Cache-Control no-store, Referrer-Policy no-referrer, X-Robots-Tag noindex; presigned 5 menit attachment; renderer tidak punya akses storage/DB/Redis
- [x] V9 Communication: TLS for all external traffic; certificates validated — N/A: tidak ada lalu lintas eksternal baru — app ↔ renderer ↔ app hanya di jaringan internal `render` tanpa egress (TLS publik diterminasi reverse proxy, T-023); route allowlist Chromium memblokir origin lain
- [x] V10 Malicious code: no backdoors, time bombs, or unexplained network calls; dependencies are trusted — dependensi baru dipin exact: playwright-core 1.64.0 (runtime renderer) dan pdfjs-dist (dev, verifikasi e2e); seccomp profile divendor dari repo Playwright tag v1.64.0 dengan catatan provenans; npm audit 0 kerentanan; Chromium tanpa unduhan (acceptDownloads false), service worker diblokir, websocket hanya dev HMR
- [x] V11 Business logic: flows cannot be abused (limits, ordering, replay, race conditions) — rate limit ekspor PDF 10/10 menit + maks 2 ekspor berjalan per user (dibagi dengan T-017, advisory lock); token sekali pakai 60 detik (replay → 404); semaphore renderer → 503 dicoba ulang dengan token baru; renderer mati → RENDERER_UNAVAILABLE ≤ 10 detik tanpa retry (precheck /healthz ≤ 3 s di app + probe di worker); timeout render → EXPORT_TIMEOUT; PDF_MAX_BYTES
- [x] V12 Files and resources: uploads are type/size limited and stored safely; no path traversal or SSRF — renderer tidak pernah menerima URL (hanya token; membuka APP_INTERNAL_URL sendiri — menutup SSRF); allowlist rute hanya origin app lewat route.fetch maxRedirects 0, 3xx dan origin lain di-abort (fail closed); APP_INTERNAL_URL di-refine (host HSTS-preload ditolak); hapus objek dijaga EXPORT_KEY ^exports/<id>/<id>\.(csv|xlsx|pdf)$ + MIME application/pdf; Chromium non-root (uid 1001) + seccomp Playwright + cap_drop ALL (cap SYS_CHROOT untuk sandbox, ADR-0006) + read_only + no-new-privileges
- [x] V13 API and web service: API inputs/outputs are schema-validated; CORS and rate limits are deliberate — kontrak HTTP POST /api/exports 202/400/404/429/503 + no-store, Origin same-origin; renderer API GET /healthz → {ok:true} saja, POST /render 401/400/404/405/503; status/unduh tidak berubah bentuk (pemilik saja)
- [x] V14 Configuration: secure defaults, security headers, no debug in production, dependencies up to date — env app (RENDERER_URL/SECRET/RENDER_TIMEOUT_MS/PDF_MAX_BYTES) dan renderer (env zod sendiri, tidak mengimpor src/lib/env.ts) divalidasi; CSP /render per-route tanpa upgrade-insecure-requests dan tanpa origin storage + form-action 'none'; flag dev LNA hanya saat ALLOW_DEV_WEBSOCKET; service compose renderer di profile `renderer` (seccomp + no-new-privileges + cap_drop ALL + read_only + tmpfs + mem_limit); next build produksi diverifikasi saat penutupan

## Evidence
<!-- Generated by aitk close. -->
- Check: `npm run check` → exit 0 at 2026-10-16T15:20:12Z (46311 ms)
- Acceptance criteria: 6/6 satisfied
- Commits: 00400de, 0177afd, 03d94b3, 03f863a, 0423efd, 0458545, 0469447, 04e47a2, 0568901, 0712a9c, 0727a63, 0796bbf, 098fc77, 0a23305, 0ad2dbe, 0b3dbca, 0d4c16b, 0f862c9, 104dc4c, 13b3d0b, 15536b5, 1663077, 17c1240, 183aee3, 19714b5, 1977286, 1add773, 1b6e65d, 1c4ecfb, 1d787d4, 2170640, 2291c8a, 22b384e, 2361fa1, 2496574, 24af891, 24d5af2, 24e2978, 254f209, 2653b85, 26ac601, 2725e19, 27bf134, 29f1080, 2a7eff2, 2b68a94, 2b68d11, 2ba4512, 2c2e6a4, 2c5ffeb, 30baa8d, 3107c1b, 316fa62, 327dde2, 33352bb, 37af03d, 38adbac, 3a7b69d, 3bf60b5, 3c5143a, 3d486ab, 3e91002, 3fd726f, 401b86a, 40c4360, 42238e1, 42f5428, 43acc6d, 4508626, 457220a, 460d650, 4647639, 467b44d, 471d15b, 4a2154f, 4bff118, 4c397a1, 4d5aa50, 4f5f3fc, 4f751b8, 506e66d, 5219784, 544d726, 54d4ddc, 561dfa3, 561f910, 58fa92d, 592bae9, 59fa9e0, 5a7d2eb, 5aeb313, 5b7e0dd, 5d46f4b, 5def94f, 5f13bde, 608c247, 60938f4, 60ea826, 61d6e8b, 6242a82, 6248130, 626d6d6, 642bb4e, 644c4db, 64a8e95, 6507eda, 66ba1d5, 6bb6067, 6c02829, 6c7cef8, 70b7906, 724603c, 75c431f, 76c40e2, 76e3600, 798158f, 799df98, 7c5267b, 7d27e01, 7dddfc4, 7e58646, 7fa3c87, 81eb135, 82de1b6, 841d6c1, 846c6be, 8492031, 8940158, 8963fe4, 8aff0f1, 8e072af, 8e4a34f, 8ec9de3, 8fe24a0, 905fc9a, 915c9f1, 930d1c4, 94df0a4, 9558d66, 978656b, 97b3218, 9835114, 9b2bfc6, 9cd6ff0, 9cee0e6, 9dbbba2, a02a7c0, a1ea496, a384931, a45de8e, a5bd0e9, a9cc976, ab9e083, ae491a6, afc158d, b189cbc, b293f29, b2a1115, b2d4c94, b2f77ed, b330d22, b61a116, b6b0242, b6d2610, b7217d9, b96c635, bb18e9b, bdc0360, bdd24f1, be956d7, bec0af8, c0a7685, c1db097, c29fdcb, c47d177, c4eef6a, c51c2b5, c540736, c665ce6, c67c26b, c6a3037, c6e50a2, c89ccc2, c93bb8b, c940620, ca648f6, ccfc959, cd5c936, ce6ecb7, ced0728, cfc55cb, d03c1fa, d0e8dd2, d1fa24d, d363c9a, d6d03db, d85299c, d8c6887, d9f240b, dbe1056, dc23b05, dd15a67, ddf64a3, de87d25, e1ff563, e28eb08, e39d424, e3d5ef8, e3da62b, e541eb1, e547f3f, e56694e, e594327, e5a4396, ec8018f, efc6950, f14041f, f3b0946, f511b61, f7101ee, f7efe9a, f8b7660, fbf5494, fe5861e
- Review pass 1 by claude-verify-workflow: 9 findings
- Review pass 2 by claude-verify-workflow: 1 findings
- Review pass 3 by claude-verify-workflow: 3 findings
- Review pass 4 by claude-verify-workflow: 5 findings
- Review pass 5 by claude-verify-workflow: 3 findings
- Review pass 6 by claude-verify-workflow: 4 findings
- Review pass 7 by claude-verify-workflow: 2 findings
- Review pass 8 by claude-verify-workflow: 2 findings
- Review pass 9 by claude-verify-workflow: 3 findings
- Review pass 10 by claude-verify-workflow: 2 findings
- Review pass 11 by claude-verify-workflow: 2 findings
- Review pass 12 by claude-verify-workflow: 3 findings
- Review pass 13 by claude-verify-workflow: 2 findings
- Review pass 14 by claude-verify-workflow: 1 findings
- Review pass 15 by claude-verify-workflow: 2 findings
- Review pass 16 by frontend-expert-design-reviewer: 0 findings
- Review pass 17 by claude-verify-workflow: 1 findings
- Review pass 18 by claude-verify-workflow: 0 findings
