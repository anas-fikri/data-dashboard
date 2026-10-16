---
id: T-021
title: 'Video panduan: upload, validasi, poster dari browser, streaming'
status: done
profile: strict
profile_pinned: true
goal: G-4
tags:
  - security
depends_on:
  - T-020
  - T-004
created: "2026-10-11T14:45:09Z"
updated: "2026-10-16T22:03:20Z"
closed: "2026-10-16T22:03:20Z"
created_by: claude-code
workers:
  - claude-code
branch: worktree-t-001-scaffold
base: aab1818da86ed40fc91314d56151f602ee14076a
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
  - prisma/migrations/20261016195525_t020_guide_articles/migration.sql
  - prisma/migrations/20261016212224_t021_guide_videos/migration.sql
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
  - src/app/(app)/admin/panduan/[id]/page.tsx
  - src/app/(app)/admin/panduan/baru/page.tsx
  - src/app/(app)/admin/panduan/page.tsx
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
  - src/app/api/guides/videos/[id]/complete/route.ts
  - src/app/api/guides/videos/[id]/parts/route.ts
  - src/app/api/guides/videos/[id]/poster/route.ts
  - src/app/api/guides/videos/[id]/route.ts
  - src/app/api/guides/videos/route.ts
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
  - src/components/guides/guide-editor.tsx
  - src/components/guides/guide-list.tsx
  - src/components/guides/guide-videos.tsx
  - src/components/guides/labels.ts
  - src/components/guides/video-player.tsx
  - src/components/guides/video-probe.ts
  - src/components/guides/video-upload.tsx
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
  - src/components/widgets/use-scroll-focus.ts
  - src/components/widgets/widget-body.tsx
  - src/components/widgets/widget-error.tsx
  - src/components/widgets/widget-query.ts
  - src/features/admin/actions.ts
  - src/features/admin/guard.ts
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
  - src/features/guides/actions.ts
  - src/features/guides/markdown.tsx
  - src/features/guides/media.ts
  - src/features/guides/origins.ts
  - src/features/guides/service.ts
  - src/features/guides/validation.ts
  - src/features/guides/videos.ts
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
  - src/lib/storage/guides.ts
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
  - tests/components/chart-badge.test.ts
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
  - tests/e2e/chart-polish.spec.ts
  - tests/e2e/dashboards.spec.ts
  - tests/e2e/datasets.spec.ts
  - tests/e2e/exports.spec.ts
  - tests/e2e/filters.spec.ts
  - tests/e2e/global-setup.ts
  - tests/e2e/global-teardown.ts
  - tests/e2e/guide-videos.spec.ts
  - tests/e2e/guides.spec.ts
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
  - tests/features/guides/actions.test.ts
  - tests/features/guides/markdown.test.ts
  - tests/features/guides/media.test.ts
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
  - tests/features/ingest/repo-finish.test.ts
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
      by: frontend-expert-design-reviewer
      at: "2026-10-16T21:53:57Z"
      findings: 3
    - "n": 2
      by: claude-verify-workflow
      at: "2026-10-16T21:53:58Z"
      findings: 1
    - "n": 3
      by: claude-verify-workflow
      at: "2026-10-16T22:02:08Z"
      findings: 0
evidence:
  check:
    cmd: npm run check
    exit_code: 0
    duration_ms: 42874
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

      {"level":40,"time":1792188167186,"service":"data-dashboard","check":"B","detail":"koneksi ditolak","msg":"health check gagal"}
      {"level":40,"time":1792188167209,"service":"data-dashboard","check":"Lambat","detail":"Lambat: timeout 20 ms","msg":"health check gagal"}
      {"level":40,"time":1792188167217,"service":"data-dashboard","check":"Renderer PDF","detail":"renderer tidak menjawab /healthz","msg":"health check gagal"}

       Test Files  124 passed (124)
            Tests  1723 passed (1723)
         Start at  05:02:40
         Duration  29.01s (tests 74%, import 18%, transform 7%)

          Isolate  124 workers spawned · ~128ms startup each (spawn + environment, per file)
                   at least ~1.63s faster with isolate: false — reuses workers across files instead of one per file


      > data-dashboard@0.1.0 audit
      > npm audit --audit-level=high --omit=dev && npm audit --audit-level=critical

      found 0 vulnerabilities
      found 0 vulnerabilities
    at: "2026-10-16T22:03:10Z"
    tree: e266ddf9081704511addde2518c4661e1f1dfcb95bb6cef6a5760e4c4b1d3e3a
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
    - 0d77bf5
    - 0f862c9
    - 104dc4c
    - 10ed698
    - 13b3d0b
    - 15536b5
    - 16375df
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
    - 2687b77
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
    - 41a5b3a
    - "42238e1"
    - 42f5428
    - 43acc6d
    - "4508626"
    - 457220a
    - 460d650
    - "4647639"
    - 467b44d
    - 471d15b
    - 474aa11
    - "4874549"
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
    - 56b7176
    - 58fa92d
    - 592bae9
    - 59fa9e0
    - 5a7d2eb
    - 5aeb313
    - 5b7e0dd
    - 5d46f4b
    - 5dcfd88
    - 5def94f
    - 5f13bde
    - 5fee32e
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
    - 657762f
    - 66ba1d5
    - 67ad81e
    - 6bb6067
    - 6c02829
    - 6c7cef8
    - 701a3aa
    - 70b7906
    - 724603c
    - 75c431f
    - 76c40e2
    - 76e3600
    - 798158f
    - 799df98
    - 7b59767
    - 7c5267b
    - 7d27e01
    - 7dddfc4
    - 7e58646
    - 7f8b180
    - 7fa3c87
    - 81eb135
    - 82de1b6
    - 841d6c1
    - 846c6be
    - "8492031"
    - 87afa6c
    - "8940158"
    - 8963fe4
    - 8a5c605
    - 8aff0f1
    - 8b18ca6
    - 8c59cdc
    - 8e072af
    - 8e4a34f
    - 8ec9de3
    - 8fe24a0
    - 905fc9a
    - 915c9f1
    - 930d1c4
    - 94df0a4
    - 9558d66
    - 95bc294
    - 978656b
    - 97b3218
    - "9835114"
    - 9b2bfc6
    - 9b8693d
    - 9cd6ff0
    - 9cee0e6
    - 9dbbba2
    - a01a9ef
    - a02a7c0
    - a1ea496
    - a384931
    - a45de8e
    - a5bd0e9
    - a7d7de9
    - a9cc976
    - aab1818
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
    - b6cbc3a
    - b6d2610
    - b7217d9
    - b96c635
    - bb18e9b
    - bdc0360
    - bdd24f1
    - be956d7
    - bec0af8
    - bf6e4c5
    - c03b05f
    - c0a7685
    - c1db097
    - c291f06
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
    - d015a22
    - d03c1fa
    - d0e8dd2
    - d1fa24d
    - d363c9a
    - d6d03db
    - d6e2a2e
    - d85299c
    - d8c6887
    - d9f240b
    - dbe1056
    - dc23b05
    - dd15a67
    - dd4b27f
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
    - eab780e
    - ec8018f
    - ed0fdcd
    - efc6950
    - f0a7905
    - f14041f
    - f3b0946
    - f511b61
    - f6be096
    - f7101ee
    - f7efe9a
    - f86bdb7
    - f8b7660
    - f9bd074
    - fb26036
    - fbf5494
    - fe5861e
  acceptance:
    total: 5
    done: 5
  audit:
    at: "2026-10-16T22:02:17Z"
    passed: true
    tree: e266ddf9081704511addde2518c4661e1f1dfcb95bb6cef6a5760e4c4b1d3e3a
    results:
      - name: osv-scanner (dependencies, offline db)
        exit_code: 0
        summary: |-
          Scanning dir .
          Starting filesystem walk for root: /
          Scanned /Users/anasfikri/Documents/Projects/pcpexpress/data-dashboard/.claude/worktrees/t-001-scaffold/package-lock.json file and found 818 packages
          End status: 176 dirs visited, 974 inodes visited, 1 Extract calls, 76.225375ms elapsed, 76.226ms wall time
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
GuideVideo {articleId, title, objectKey, posterKey, durationSec}. Upload multipart B2 untuk mp4/webm ≤ 500 MB; signature dengan offset (mp4 ftyp byte 4–8, webm 1A45DFA3). Durasi dan poster diambil di browser (loadedmetadata + canvas → PNG) lalu diunggah (D12). Pemutar <video> via presigned 1 jam dengan Range.

## Acceptance criteria
- [x] Given admin memilih mp4 valid, when upload selesai, then durasi tersimpan, poster PNG ada di MinIO, dan video tampil di pratinjau
- [x] Given file .mkv diganti ekstensi .mp4 atau video > 500 MB, when upload, then ditolak sebelum tersimpan dengan code INVALID_FORMAT / FILE_TOO_LARGE
- [x] Given user menekan putar dan melompat ke menit ke-5, when video berlanjut, then permintaan ke MinIO menjawab 206 Partial Content tanpa unduh penuh
- [x] Given halaman/komponen task ini selesai, when /frontend-expert:audit dijalankan (anti-slop-design, responsive 320/768/1024/1440, accessibility), then tidak ada temuan Critical/High dan blok Conventions check (Tokens: preset project; Icons: waiver @tabler/icons-react; States loading/empty/error; Responsive; A11y) dicatat sebagai note task
- [x] Given poster PNG dari browser, when diunggah, then lewat Route Handler yang memeriksa signature PNG 8 byte dan ukuran ≤ 2 MB, ContentType ditetapkan server; given file bukan PNG, then INVALID_FORMAT

## Risk
Impact: tabel baru GuideVideo (migrasi t021_guide_videos, cascade dari GuideArticle); Route Handler /api/guides/videos (init), /[id]/parts, /[id]/complete, /[id] (DELETE), /[id]/poster (PNG biner); bagian Video di editor /admin/panduan/[id] dan pemutar di /panduan; mesin unggah multipart klien diekstrak menjadi runMultipart (dipakai unggah dataset — e2e uploads 9/9 tetap lulus); MultipartStorage.create menerima Content-Type dari server; proxyClientMaxBodySize 1 → 3 MB; hapus artikel kini juga menghapus objek video/poster; skrip purge dev ikut menghapus objek video artikel uji. Security (STRIDE): Spoofing/EoP — semua route admin aktif saja (selain itu 404), Origin = APP_URL, rate limit per user; Tampering — signature dibaca server setelah complete (mp4 ftyp, webm EBML+DocType; .mkv ditolak), ukuran part diverifikasi, Content-Type objek dari server, kunci objek pola ketat; Info disclosure — objek privat, presigned GET 1 jam; DoS — ≤ 500 MB per video, ≤ 5 video per artikel, poster ≤ 2 MB dengan baca berbatas, unggahan basi > 24 jam dibuang; Repudiation — AuditLog guide.video.add/delete. Rollback: revert commit + migrasi turun (drop GuideVideo) + hapus prefix guides/ di storage; proxyClientMaxBodySize kembali 1 MB. Validation: unit media (signature mp4/webm/mkv/PNG, batas ukuran, format durasi); e2e guide-videos (unggah mp4 6 menit → durasi 6:00 + poster PNG di storage + video tampil; .mkv→.mp4 ditolak di browser dan server setelah complete, baris hilang; > 500 MB → 413; poster bukan PNG → 422, > 2 MB → 413; non-admin 404; /panduan putar + lompat menit 5 → semua respons storage 206 dengan rentang mulai > 4 MB); e2e guides 5/5, uploads 9/9; mutasi signature/PNG membuat uji gagal.

## Notes
- 2026-10-11T14:49:26Z UI wajib lewat rantai frontend-expert: design-foundations → tokens (preset dari T-025) → (+forms/data-fetching/app-shell sesuai kebutuhan) → components → anti-slop-code → responsive → motion ringan → anti-slop-design → polish → accessibility. Skip design-direction karena arah sudah dipilih di T-025, kecuali layar baru yang ambigu. Chart via skill dataviz; filter/select pakai Select kustom dari T-025, bukan native.
- 2026-10-11T14:57:00Z ContentType video ditetapkan server saat createMultipartUpload (video/mp4|webm), bukan dari klien.
- 2026-10-16T21:54:36Z AC4 Conventions check (audit frontend-expert:design-reviewer, app nyata localhost:3100, 320/700/768/1024/1440 terang+gelap): Tokens: preset project (zinc-blue), tanpa warna mentah/gradien. Icons: waiver @tabler/icons-react (Tabler 20px stroke 1.5; tombol ikon bernama). States: loading = membaca/mengunggah/memeriksa + progressbar (aria-valuetext) + status diumumkan per 25%; empty = EmptyState 'Belum ada video'; error = galat kolom (judul/file) difokus bila pengguna di form, galat form FormAlert; sukses/batal = FormAlert status; hapus = FocusNotice. Responsive: tanpa overflow horizontal; tombol utama full-width 44 px < 640 (dialog < 768); input 16 px di ponsel; pemutar 16:9 tanpa pergeseran tata letak. A11y: WCAG 2.2 AA; axe 0 pelanggaran di editor (default/galat/progres), dialog hapus, /panduan (320 & 1440, terang+gelap); keyboard: fokus ke Batalkan saat unggah, tidak merebut fokus dari kolom lain saat selesai, fokus kembali setelah dialog. Video tanpa takarir: rekaman layar tanpa suara, alternatif teks = isi artikel (takarir VTT → T-j9j6). Not verified: pembaca layar nyata, Safari/Firefox + H.264, zoom 200/400%, forced-colors, perangkat sentuh.
- 2026-10-16T22:02:08Z Review putaran 2 (fb26036, design-reviewer di app nyata): 0 temuan blocking; D-H1/D-H2/D-H3/F1 terverifikasi (balapan 2 dan 3 complete paralel berakhir tepat 5 video, yang kalah LIMIT_REACHED dengan objek+baris terhapus); regresi unggah/hapus/batal/mkv/pemutar 206/axe 0 serious lulus. Non-blocking → T-z5nq.

## Security checklist (OWASP ASVS 4.0.3)
<!-- Check each item when verified, or write "N/A: <reason>" after the text and check it. -->
- [x] V1 Architecture: trust boundaries and the components handling sensitive data are identified for this change — batas kepercayaan: browser admin (file video lokal, durasi/poster hasil browser) → Route Handler /api/guides/videos* (penentu: ukuran, signature, PNG) → storage S3 (multipart presigned, endpoint publik D5) → pembaca /panduan (presigned GET 1 jam)
- [x] V2 Authentication: credentials are verified server-side; no default, hard-coded, or weak secrets — sesi yang ada (requireUser action: sessionVersion dicek, isAdmin dari DB); tanpa kredensial baru
- [x] V3 Session management: session tokens are random, protected, invalidated on logout and expiry — N/A: tidak mengubah sesi
- [x] V4 Access control: every endpoint/action checks authorization server-side, deny by default (no IDOR) — semua route video: admin aktif saja, selain itu NOT_FOUND/404 tanpa menyentuh data (diuji e2e B → 404 untuk init/parts/complete/delete); Origin wajib sama dengan APP_URL; rate limit per user (uploadInit/uploadSign); pembaca hanya mendapat video artikel terbit yang boleh ia lihat (artikel Admin hanya admin)
- [x] V5 Validation, sanitization and encoding: all input validated; output encoded; no injection (SQL, OS, template) — ekstensi .mp4/.webm, ukuran 1..500 MB saat init; signature 64 byte awal dibaca server setelah complete (mp4 ftyp byte 4–8, webm EBML + DocType webm sehingga .mkv ditolak) → gagal: objek + baris dihapus (INVALID_FORMAT); part diverifikasi ukuran (signed Content-Length + ListParts + HeadObject); poster: body ≤ 2 MB (Content-Length + baca berbatas, proxyClientMaxBodySize 3 MB agar tidak terpotong diam-diam), signature PNG 8 byte; judul ≤ 120; durasi diterima hanya 0 < d ≤ 6 jam
- [x] V6 Stored cryptography: sensitive data at rest uses approved algorithms; keys are not in the code — N/A: tidak ada data rahasia
- [x] V7 Error handling and logging: errors reveal no internals; security events are logged without secrets — galat storage → 503 tanpa detail (detail di log pino dengan videoId); AuditLog guide.video.add/guide.video.delete {videoId}; video ditolak dicatat warn
- [x] V8 Data protection: personal/sensitive data is minimized, not cached or logged, and removable — video panduan bukan data pribadi; objek privat di bucket, diakses lewat presigned GET 1 jam
- [x] V9 Communication: TLS for all external traffic; certificates validated — presigned URL ditandatangani endpoint publik (HTTPS di produksi, T-023); CSP media-src/img-src hanya self + origin storage
- [x] V10 Malicious code: no backdoors, time bombs, or unexplained network calls; dependencies are trusted — tanpa dependensi baru (ffmpeg hanya untuk fixture e2e lokal)
- [x] V11 Business logic: flows cannot be abused (limits, ordering, replay, race conditions) — ≤ 5 video per artikel; unggahan UPLOADING > 24 jam dibuang (abort multipart) saat init berikutnya; hapus artikel → objek video/poster ikut dihapus; complete idempoten untuk video yang sudah READY
- [x] V12 Files and resources: uploads are type/size limited and stored safely; no path traversal or SSRF — Content-Type objek ditetapkan server (video/mp4|webm saat createMultipartUpload, image/png saat PutObject), bukan dari klien; kunci objek dari id server dengan pola ketat guides/videos|posters/<id>; isi tidak pernah dieksekusi/diproses server selain baca 64 byte
- [x] V13 API and web service: API inputs/outputs are schema-validated; CORS and rate limits are deliberate — Route Handler JSON ≤ 8 KB (uploadRoute) + poster biner; kode galat HTTP 400/404/409/413/422/429/503
- [x] V14 Configuration: secure defaults, security headers, no debug in production, dependencies up to date — proxyClientMaxBodySize 1 → 3 MB (poster ≤ 2 MB tidak terpotong); tanpa env baru

## Evidence
<!-- Generated by aitk close. -->
- Check: `npm run check` → exit 0 at 2026-10-16T22:03:10Z (42874 ms)
- Acceptance criteria: 5/5 satisfied
- Commits: 00400de, 0177afd, 03d94b3, 03f863a, 0423efd, 0458545, 0469447, 04e47a2, 0568901, 0712a9c, 0727a63, 0796bbf, 098fc77, 0a23305, 0ad2dbe, 0b3dbca, 0d4c16b, 0d77bf5, 0f862c9, 104dc4c, 10ed698, 13b3d0b, 15536b5, 16375df, 1663077, 17c1240, 183aee3, 19714b5, 1977286, 1add773, 1b6e65d, 1c4ecfb, 1d787d4, 2170640, 2291c8a, 22b384e, 2361fa1, 2496574, 24af891, 24d5af2, 24e2978, 254f209, 2653b85, 2687b77, 26ac601, 2725e19, 27bf134, 29f1080, 2a7eff2, 2b68a94, 2b68d11, 2ba4512, 2c2e6a4, 2c5ffeb, 30baa8d, 3107c1b, 316fa62, 327dde2, 33352bb, 37af03d, 38adbac, 3a7b69d, 3bf60b5, 3c5143a, 3d486ab, 3e91002, 3fd726f, 401b86a, 40c4360, 41a5b3a, 42238e1, 42f5428, 43acc6d, 4508626, 457220a, 460d650, 4647639, 467b44d, 471d15b, 474aa11, 4874549, 4a2154f, 4bff118, 4c397a1, 4d5aa50, 4f5f3fc, 4f751b8, 506e66d, 5219784, 544d726, 54d4ddc, 561dfa3, 561f910, 56b7176, 58fa92d, 592bae9, 59fa9e0, 5a7d2eb, 5aeb313, 5b7e0dd, 5d46f4b, 5dcfd88, 5def94f, 5f13bde, 5fee32e, 608c247, 60938f4, 60ea826, 61d6e8b, 6242a82, 6248130, 626d6d6, 642bb4e, 644c4db, 64a8e95, 6507eda, 657762f, 66ba1d5, 67ad81e, 6bb6067, 6c02829, 6c7cef8, 701a3aa, 70b7906, 724603c, 75c431f, 76c40e2, 76e3600, 798158f, 799df98, 7b59767, 7c5267b, 7d27e01, 7dddfc4, 7e58646, 7f8b180, 7fa3c87, 81eb135, 82de1b6, 841d6c1, 846c6be, 8492031, 87afa6c, 8940158, 8963fe4, 8a5c605, 8aff0f1, 8b18ca6, 8c59cdc, 8e072af, 8e4a34f, 8ec9de3, 8fe24a0, 905fc9a, 915c9f1, 930d1c4, 94df0a4, 9558d66, 95bc294, 978656b, 97b3218, 9835114, 9b2bfc6, 9b8693d, 9cd6ff0, 9cee0e6, 9dbbba2, a01a9ef, a02a7c0, a1ea496, a384931, a45de8e, a5bd0e9, a7d7de9, a9cc976, aab1818, ab9e083, ae491a6, afc158d, b189cbc, b293f29, b2a1115, b2d4c94, b2f77ed, b330d22, b61a116, b6b0242, b6cbc3a, b6d2610, b7217d9, b96c635, bb18e9b, bdc0360, bdd24f1, be956d7, bec0af8, bf6e4c5, c03b05f, c0a7685, c1db097, c291f06, c29fdcb, c47d177, c4eef6a, c51c2b5, c540736, c665ce6, c67c26b, c6a3037, c6e50a2, c89ccc2, c93bb8b, c940620, ca648f6, ccfc959, cd5c936, ce6ecb7, ced0728, cfc55cb, d015a22, d03c1fa, d0e8dd2, d1fa24d, d363c9a, d6d03db, d6e2a2e, d85299c, d8c6887, d9f240b, dbe1056, dc23b05, dd15a67, dd4b27f, ddf64a3, de87d25, e1ff563, e28eb08, e39d424, e3d5ef8, e3da62b, e541eb1, e547f3f, e56694e, e594327, e5a4396, eab780e, ec8018f, ed0fdcd, efc6950, f0a7905, f14041f, f3b0946, f511b61, f6be096, f7101ee, f7efe9a, f86bdb7, f8b7660, f9bd074, fb26036, fbf5494, fe5861e
- Review pass 1 by frontend-expert-design-reviewer: 3 findings
- Review pass 2 by claude-verify-workflow: 1 findings
- Review pass 3 by claude-verify-workflow: 0 findings
