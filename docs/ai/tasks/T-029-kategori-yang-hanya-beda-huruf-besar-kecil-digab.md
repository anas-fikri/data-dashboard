---
id: T-029
title: Kategori yang hanya beda huruf besar/kecil digabung seperti pivot Excel
status: done
profile: strict
profile_pinned: true
created: "2026-10-12T23:39:16Z"
updated: "2026-10-16T18:04:47Z"
closed: "2026-10-16T18:04:47Z"
created_by: claude-code
workers:
  - claude-code
branch: worktree-t-001-scaffold
base: 41a5b3ac5db492718fdd9976209089362eb617ea
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
  - tests/components/schema-locale-ambiguous.test.ts
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
  - tests/e2e/kpi-fit.spec.ts
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
  - tests/features/query/case-insensitive.test.ts
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
      by: frontend-expert-test-engineer
      at: "2026-10-16T17:57:22Z"
      findings: 3
    - "n": 2
      by: claude-verify-workflow
      at: "2026-10-16T17:57:22Z"
      findings: 1
    - "n": 3
      by: claude-verify-workflow
      at: "2026-10-16T18:04:27Z"
      findings: 0
evidence:
  check:
    cmd: npm run check
    exit_code: 0
    duration_ms: 42019
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

      {"level":40,"time":1792173834576,"service":"data-dashboard","check":"B","detail":"koneksi ditolak","msg":"health check gagal"}
      {"level":40,"time":1792173834600,"service":"data-dashboard","check":"Lambat","detail":"Lambat: timeout 20 ms","msg":"health check gagal"}
      {"level":40,"time":1792173834605,"service":"data-dashboard","check":"Renderer PDF","detail":"renderer tidak menjawab /healthz","msg":"health check gagal"}

       Test Files  119 passed (119)
            Tests  1698 passed (1698)
         Start at  01:03:48
         Duration  28.38s (tests 76%, import 18%, transform 6%, worker 1%)

          Isolate  119 workers spawned · ~130ms startup each (spawn + environment, per file)
                   at least ~1.59s faster with isolate: false — reuses workers across files instead of one per file


      > data-dashboard@0.1.0 audit
      > npm audit --audit-level=high --omit=dev && npm audit --audit-level=critical

      found 0 vulnerabilities
      found 0 vulnerabilities
    at: "2026-10-16T18:04:18Z"
    tree: de5261c0d5b3a8a824edf0882bb67ebf365e2cd2712192eb313f93a25478fdb8
  commits:
    - 03f863a
    - "0469447"
    - "0568901"
    - 0712a9c
    - 0727a63
    - 0796bbf
    - 098fc77
    - 0a23305
    - 0ad2dbe
    - 0f862c9
    - 104dc4c
    - "1663077"
    - 17c1240
    - 19714b5
    - "1977286"
    - 1b6e65d
    - 1c4ecfb
    - 1d787d4
    - 2361fa1
    - "2496574"
    - 24af891
    - 24d5af2
    - 254f209
    - 2687b77
    - 26ac601
    - 2b68d11
    - 2ba4512
    - 33352bb
    - 3a7b69d
    - 3c5143a
    - 3d486ab
    - 3e91002
    - 41a5b3a
    - "42238e1"
    - 42f5428
    - 43acc6d
    - "4508626"
    - 460d650
    - "4647639"
    - 467b44d
    - "4874549"
    - 4a2154f
    - 4c397a1
    - 4f5f3fc
    - 506e66d
    - "5219784"
    - 544d726
    - 54d4ddc
    - 561dfa3
    - 56b7176
    - 58fa92d
    - 592bae9
    - 59fa9e0
    - 5b7e0dd
    - 61d6e8b
    - 6242a82
    - 644c4db
    - 6507eda
    - 67ad81e
    - 6bb6067
    - 75c431f
    - 799df98
    - 81eb135
    - 82de1b6
    - 841d6c1
    - 846c6be
    - 87afa6c
    - "8940158"
    - 8a5c605
    - 8aff0f1
    - 8c59cdc
    - 8e4a34f
    - 8ec9de3
    - 8fe24a0
    - 905fc9a
    - 930d1c4
    - 94df0a4
    - 978656b
    - 97b3218
    - 9b8693d
    - 9dbbba2
    - a01a9ef
    - a45de8e
    - a7d7de9
    - a9cc976
    - afc158d
    - b293f29
    - b2f77ed
    - b61a116
    - b6b0242
    - b6cbc3a
    - b7217d9
    - b96c635
    - bb18e9b
    - bf6e4c5
    - c291f06
    - c29fdcb
    - c47d177
    - c4eef6a
    - c6a3037
    - c6e50a2
    - c89ccc2
    - c93bb8b
    - c940620
    - ca648f6
    - ccfc959
    - ced0728
    - cfc55cb
    - d03c1fa
    - d8c6887
    - dc23b05
    - dd15a67
    - de87d25
    - e39d424
    - e547f3f
    - eab780e
    - ec8018f
    - efc6950
    - f0a7905
    - f14041f
    - f3b0946
    - f6be096
    - f7101ee
    - f7efe9a
    - f9bd074
  acceptance:
    total: 2
    done: 2
  audit:
    at: "2026-10-16T18:04:27Z"
    passed: true
    tree: de5261c0d5b3a8a824edf0882bb67ebf365e2cd2712192eb313f93a25478fdb8
    results:
      - name: osv-scanner (dependencies, offline db)
        exit_code: 0
        summary: |-
          Scanning dir .
          Starting filesystem walk for root: /
          Scanned /Users/anasfikri/Documents/Projects/pcpexpress/data-dashboard/.claude/worktrees/t-001-scaffold/package-lock.json file and found 736 packages
          End status: 162 dirs visited, 916 inodes visited, 1 Extract calls, 69.748333ms elapsed, 69.75ms wall time
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
Ditemukan verifikasi integritas T-011: GROUP BY pada dimensi teks memisahkan 'Bandung' dan 'BANDUNG', berbeda dari PivotTable/SUMIF/UNIQUE Excel yang tidak peka huruf besar/kecil. Putuskan perilaku bawaan (gabung tidak peka huruf) dan label tampil (nilai paling sering).

## Acceptance criteria
- [x] Given dataset dengan 'Bandung', 'bandung', 'BANDUNG', when widget batang dikelompokkan per kolom itu, then satu kategori dengan total gabungan dan label nilai yang paling sering
- [x] Given filter = 'bandung', when diterapkan, then baris ketiga variasi itu ikut

## Risk
Impact: lapisan query (src/features/query/sql.ts) untuk semua widget grafik, KPI berfilter, tabel berfilter, ekspor CSV/XLSX/PDF, dan daftar nilai slicer: dimensi teks dikelompokkan lower(...) dengan label variasi paling sering lewat histogram() (seri → urutan byte terkecil, deterministik lintas thread/row group; mode() DuckDB tidak — review T-029 TF3/INT-1); filter teks widget (in/not_in/eq/neq) dan dashboard (slicer, filter silang) dicocokkan lower di kedua sisi; jumlah kategori ikut digabung. Aksen dan spasi tetap membedakan (seperti Excel). Hasil cache lama (LRU memori, TTL) bisa tampil sampai kedaluwarsa. Tidak digabung: count_distinct kolom teks (PlanMeasure tanpa tipe kolom). Security (STRIDE): tidak ada permukaan baru — nilai tetap parameter ($p/$f), fungsi lower/histogram konstanta. Rollback: revert commit sql.ts. Validation: tes SQL builder di DuckDB sungguhan (grup, label, total kategori, filter widget/dashboard, not_in, slicer) gagal tanpa perbaikan; label seri diuji lintas 32 row group × 4 thread (10× sama); uji mutasi mode()/first() gagal. Biaya terukur (2 thread): 3 juta baris/100 ribu kategori 32 → 131 ms; 5 juta baris/4 juta kategori 0,30 → 1,17 s (di bawah batas waktu query, tetapi perlu diukur ulang terhadap target p95 < 3 s di T-024; optimasi: label hanya untuk N kategori teratas). e2e penuh 158/158.

## Notes

- 2026-10-16T18:04:27Z Keputusan: gabung tidak peka huruf besar/kecil seperti PivotTable Excel (aksen/spasi tetap membedakan); label = variasi paling sering, seri → urutan byte terkecil (deterministik). Review: test-engineer 3 temuan (TF1 label tak teruji, TF2 filter huruf kecil saja, TF3 mode() tidak deterministik), integritas r1 INT-1 (= TF3), r2 0 temuan. Performa terukur 10 juta baris/8 juta kategori: grafik ±2,4 s (sebelumnya ±1,0 s), dicatat ke T-024. Diterima non-blocking: count_distinct teks belum digabung, label bergantung filter aktif, dua dimensi teks via API, kunci cache peka huruf. e2e penuh 158/158 (b6cbc3a), filters 5/5 + widgets 7/7 (akhir).

## Security checklist (OWASP ASVS 4.0.3)
<!-- Check each item when verified, or write "N/A: <reason>" after the text and check it. -->
- [x] V1 Architecture: trust boundaries and the components handling sensitive data are identified for this change — perubahan hanya pembentuk SQL query (src/features/query/sql.ts); otorisasi, resolver spesifikasi, dan sandbox DuckDB tidak berubah
- [x] V2 Authentication: credentials are verified server-side; no default, hard-coded, or weak secrets — N/A: tidak menyentuh autentikasi
- [x] V3 Session management: session tokens are random, protected, invalidated on logout and expiry — N/A: tidak menyentuh sesi
- [x] V4 Access control: every endpoint/action checks authorization server-side, deny by default (no IDOR) — akses widget/dashboard tetap lewat resolver /api/query yang sama (D6); tidak ada endpoint baru
- [x] V5 Validation, sanitization and encoding: all input validated; output encoded; no injection (SQL, OS, template) — nilai filter tetap lewat parameter binding ($p/$f); lower()/mode() dan identifier c<pos> buatan program; tidak ada teks user di SQL
- [x] V6 Stored cryptography: sensitive data at rest uses approved algorithms; keys are not in the code — N/A: tidak ada data rahasia
- [x] V7 Error handling and logging: errors reveal no internals; security events are logged without secrets — N/A: jalur galat query tidak berubah
- [x] V8 Data protection: personal/sensitive data is minimized, not cached or logged, and removable — N/A: tidak ada data pribadi baru; jawaban per peran tidak berubah
- [x] V9 Communication: TLS for all external traffic; certificates validated — N/A: tidak ada lalu lintas jaringan baru
- [x] V10 Malicious code: no backdoors, time bombs, or unexplained network calls; dependencies are trusted — tidak ada dependensi baru; npm audit 0 kerentanan
- [x] V11 Business logic: flows cannot be abused (limits, ordering, replay, race conditions) — total per kategori kini sama dengan PivotTable/SUMIF Excel (variasi huruf besar/kecil digabung); filter 'bandung' mengenai semua variasi; batas waktu/slot query tidak berubah (biaya tambahan kecil, diukur)
- [x] V12 Files and resources: uploads are type/size limited and stored safely; no path traversal or SSRF — N/A: tidak menyentuh berkas
- [x] V13 API and web service: API inputs/outputs are schema-validated; CORS and rate limits are deliberate — bentuk jawaban /api/query dan nilai slicer tidak berubah (label = salah satu variasi asli)
- [x] V14 Configuration: secure defaults, security headers, no debug in production, dependencies up to date — N/A: tidak ada konfigurasi baru

## Evidence
<!-- Generated by aitk close. -->
- Check: `npm run check` → exit 0 at 2026-10-16T18:04:18Z (42019 ms)
- Acceptance criteria: 2/2 satisfied
- Commits: 03f863a, 0469447, 0568901, 0712a9c, 0727a63, 0796bbf, 098fc77, 0a23305, 0ad2dbe, 0f862c9, 104dc4c, 1663077, 17c1240, 19714b5, 1977286, 1b6e65d, 1c4ecfb, 1d787d4, 2361fa1, 2496574, 24af891, 24d5af2, 254f209, 2687b77, 26ac601, 2b68d11, 2ba4512, 33352bb, 3a7b69d, 3c5143a, 3d486ab, 3e91002, 41a5b3a, 42238e1, 42f5428, 43acc6d, 4508626, 460d650, 4647639, 467b44d, 4874549, 4a2154f, 4c397a1, 4f5f3fc, 506e66d, 5219784, 544d726, 54d4ddc, 561dfa3, 56b7176, 58fa92d, 592bae9, 59fa9e0, 5b7e0dd, 61d6e8b, 6242a82, 644c4db, 6507eda, 67ad81e, 6bb6067, 75c431f, 799df98, 81eb135, 82de1b6, 841d6c1, 846c6be, 87afa6c, 8940158, 8a5c605, 8aff0f1, 8c59cdc, 8e4a34f, 8ec9de3, 8fe24a0, 905fc9a, 930d1c4, 94df0a4, 978656b, 97b3218, 9b8693d, 9dbbba2, a01a9ef, a45de8e, a7d7de9, a9cc976, afc158d, b293f29, b2f77ed, b61a116, b6b0242, b6cbc3a, b7217d9, b96c635, bb18e9b, bf6e4c5, c291f06, c29fdcb, c47d177, c4eef6a, c6a3037, c6e50a2, c89ccc2, c93bb8b, c940620, ca648f6, ccfc959, ced0728, cfc55cb, d03c1fa, d8c6887, dc23b05, dd15a67, de87d25, e39d424, e547f3f, eab780e, ec8018f, efc6950, f0a7905, f14041f, f3b0946, f6be096, f7101ee, f7efe9a, f9bd074
- Review pass 1 by frontend-expert-test-engineer: 3 findings
- Review pass 2 by claude-verify-workflow: 1 findings
- Review pass 3 by claude-verify-workflow: 0 findings
