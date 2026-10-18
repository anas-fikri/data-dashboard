---
id: T-c7wf
title: Admin menambah dan menghapus akun pengguna (undangan email), panduan dan video diperbarui
status: done
profile: strict
tags:
  - security
created: "2026-10-18T11:20:21Z"
updated: "2026-10-18T14:31:08Z"
closed: "2026-10-18T14:31:08Z"
created_by: claude-code
workers:
  - claude-code
branch: worktree-t-001-scaffold
base: aca91c95735c6685cebdde2fb5334114d7977a95
paths:
  - .dockerignore
  - .env.example
  - .gitignore
  - .npmrc
  - .nvmrc
  - .prettierignore
  - .prettierrc
  - Dockerfile
  - README.md
  - content/panduan/01-mengenal-data-dashboard.md
  - content/panduan/02-daftar-dan-masuk.md
  - content/panduan/03-unggah-data.md
  - content/panduan/04-periksa-skema.md
  - content/panduan/05-ganti-data-pemetaan.md
  - content/panduan/06-susun-dashboard.md
  - content/panduan/07-bagikan-dashboard.md
  - content/panduan/08-editor-ubah-dashboard.md
  - content/panduan/09-viewer-lihat-filter-ekspor.md
  - content/panduan/10-admin-kelola-pengguna.md
  - content/panduan/11-admin-tulis-panduan.md
  - demo/guide-videos/videos.json
  - deploy/Caddyfile
  - deploy/backup.sh
  - deploy/backup/Dockerfile
  - deploy/certs/.gitkeep
  - deploy/check-public-presign.mjs
  - deploy/convert-db-utf8.sh
  - deploy/deploy.sh
  - deploy/fingerprint.sh
  - deploy/host-db.sh
  - deploy/images.sh
  - deploy/isolated-env.sh
  - deploy/lan-cert.sh
  - deploy/offsite-key.sh
  - deploy/offsite-s3.sh
  - deploy/perf-stack.sh
  - deploy/pgenv.sh
  - deploy/restore-drill.sh
  - deploy/restore.sh
  - deploy/rotate-db-password.sh
  - deploy/set-smtp.sh
  - deploy/storage-iam.mjs
  - deploy/verify-backup.sh
  - docker-compose.dev.yml
  - docker-compose.prod.yml
  - docs/flow-kerja.md
  - docs/presentasi/Data-Dashboard-PCP-Express-Ringkasan.pptx
  - docs/presentasi/alur-data-dashboard.html
  - docs/runbook-deploy.md
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
  - prisma/migrations/20261016220416_t022_guide_reads/migration.sql
  - prisma/migrations/20261017104143_t_j9j6_guide_video_caption/migration.sql
  - prisma/migrations/migration_lock.toml
  - prisma/schema.prisma
  - prisma/seed.ts
  - public/brand/mark-dark.png
  - public/brand/mark.png
  - public/brand/pcp-logo-dark.png
  - public/brand/pcp-logo.png
  - renderer/Dockerfile
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
  - scripts/dev-share-fixture.mjs
  - scripts/dev-upload-fixture.mjs
  - scripts/fixtures/build-committed.ts
  - scripts/fixtures/make-hostile.ts
  - scripts/fixtures/model.ts
  - scripts/gen-dev-env.mjs
  - scripts/guide-assemble.mjs
  - scripts/guide-audio.mjs
  - scripts/guide-narration.json
  - scripts/guide-tts.mjs
  - scripts/guide-video-meta.mjs
  - scripts/make-fixture.ts
  - scripts/perf-e2e.mjs
  - scripts/perf-e2e.sh
  - scripts/perf-filters.ts
  - scripts/perf-ingest.ts
  - scripts/perf-query.ts
  - scripts/perf-segments.ts
  - scripts/perf-table-wide.ts
  - scripts/perf-tiers.sh
  - scripts/perf-widget-table.ts
  - scripts/perf.mjs
  - scripts/record-guide-videos.ts
  - scripts/seed-guides.ts
  - scripts/smoke-prod-headers.mjs
  - scripts/storage-init.mjs
  - scripts/with-demo-env.mjs
  - src/app/(app)/admin/backup/page.tsx
  - src/app/(app)/admin/page.tsx
  - src/app/(app)/admin/panduan/(daftar)/layout.tsx
  - src/app/(app)/admin/panduan/(daftar)/loading.tsx
  - src/app/(app)/admin/panduan/(daftar)/page.tsx
  - src/app/(app)/admin/panduan/[id]/page.tsx
  - src/app/(app)/admin/panduan/baru/page.tsx
  - src/app/(app)/admin/panduan/error.tsx
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
  - src/app/(app)/panduan/(daftar)/layout.tsx
  - src/app/(app)/panduan/(daftar)/loading.tsx
  - src/app/(app)/panduan/(daftar)/page.tsx
  - src/app/(app)/panduan/[slug]/page.tsx
  - src/app/(app)/panduan/error.tsx
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
  - src/app/api/guides/videos/[id]/sumber/route.ts
  - src/app/api/guides/videos/[id]/takarir/route.ts
  - src/app/api/guides/videos/route.ts
  - src/app/api/health/core/route.ts
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
  - src/components/admin/add-user-dialog.tsx
  - src/components/admin/admin-crumb.tsx
  - src/components/admin/admin-feedback.tsx
  - src/components/admin/admin-messages.tsx
  - src/components/admin/admin-revoked-notice.tsx
  - src/components/admin/backup-banner.tsx
  - src/components/admin/backup-status.tsx
  - src/components/admin/delete-user-dialog.tsx
  - src/components/admin/email-text.tsx
  - src/components/admin/offsite-fields.tsx
  - src/components/admin/offsite-form.tsx
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
  - src/components/dashboards/badge-fit.ts
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
  - src/components/dashboards/head-badge.tsx
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
  - src/components/guides/announce.tsx
  - src/components/guides/caption-upload.tsx
  - src/components/guides/guide-browse.tsx
  - src/components/guides/guide-editor.tsx
  - src/components/guides/guide-error.tsx
  - src/components/guides/guide-help.tsx
  - src/components/guides/guide-list.tsx
  - src/components/guides/guide-skeleton.tsx
  - src/components/guides/guide-videos.tsx
  - src/components/guides/help-sheet.tsx
  - src/components/guides/labels.ts
  - src/components/guides/mark-read-button.tsx
  - src/components/guides/start-here-card.tsx
  - src/components/guides/tab-strip.tsx
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
  - src/features/backup/actions.ts
  - src/features/backup/config.ts
  - src/features/backup/probe.ts
  - src/features/backup/service.ts
  - src/features/backup/types.ts
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
  - src/features/guides/content.ts
  - src/features/guides/markdown.tsx
  - src/features/guides/media.ts
  - src/features/guides/origins.ts
  - src/features/guides/reader-actions.ts
  - src/features/guides/reader.ts
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
  - src/features/ingest/xlsx-parallel.ts
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
  - src/features/query/warm-runtime.ts
  - src/features/query/warm.ts
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
  - src/lib/xlsx/parallel.ts
  - src/lib/xlsx/parser.ts
  - src/lib/xlsx/sheet-worker.ts
  - src/lib/xlsx/types.ts
  - src/proxy.ts
  - src/styles/tokens.css
  - src/worker/index.ts
  - tests/components/app-layout.test.ts
  - tests/components/badge-fit.test.ts
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
  - tests/components/guide-announce.test.ts
  - tests/components/guide-error.test.ts
  - tests/components/home-page.test.ts
  - tests/components/layout-ops.test.ts
  - tests/components/mapping-model.test.ts
  - tests/components/mapping-review-r2.test.ts
  - tests/components/page-header.test.ts
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
  - tests/components/start-here-card.test.ts
  - tests/components/upload-panel-state.test.ts
  - tests/components/version-history-busy.test.ts
  - tests/components/version-history-r2.test.ts
  - tests/components/version-history-status.test.ts
  - tests/components/video-player.test.ts
  - tests/components/video-upload.test.ts
  - tests/components/widget-absent.test.ts
  - tests/components/widget-config.test.ts
  - tests/components/widget-views-round3.test.ts
  - tests/e2e/admin.spec.ts
  - tests/e2e/auth.spec.ts
  - tests/e2e/backup.spec.ts
  - tests/e2e/chart-polish.spec.ts
  - tests/e2e/dashboards.spec.ts
  - tests/e2e/datasets.spec.ts
  - tests/e2e/exports.spec.ts
  - tests/e2e/filters.spec.ts
  - tests/e2e/global-setup.ts
  - tests/e2e/global-teardown.ts
  - tests/e2e/guide-content.spec.ts
  - tests/e2e/guide-roles.spec.ts
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
  - tests/features/backup/backup.test.ts
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
  - tests/features/guides/content.test.ts
  - tests/features/guides/markdown-guard.test.ts
  - tests/features/guides/markdown.test.ts
  - tests/features/guides/media.test.ts
  - tests/features/guides/reader.test.ts
  - tests/features/guides/service.test.ts
  - tests/features/guides/video-source.test.ts
  - tests/features/guides/videos-cleanup.test.ts
  - tests/features/ingest/absent.test.ts
  - tests/features/ingest/fakes.ts
  - tests/features/ingest/ingest-review.test.ts
  - tests/features/ingest/ingest.test.ts
  - tests/features/ingest/mapping.test.ts
  - tests/features/ingest/oom-worker.ts
  - tests/features/ingest/parallel.test.ts
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
  - tests/features/query/warm-runtime.test.ts
  - tests/features/query/warm.test.ts
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
  - tests/features/versions/queue-position.test.ts
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
  - tests/lib/no-enterprise-deps.test.ts
  - tests/lib/security-headers.test.ts
  - tests/lib/seed.test.ts
  - tests/lib/text.test.ts
  - tests/lib/use-polling.test.ts
  - tests/renderer/env.test.ts
  - tests/renderer/render.test.ts
  - tests/renderer/server.test.ts
  - tests/scripts/backup-offsite.test.ts
  - tests/scripts/fixtures.test.ts
  - tests/scripts/guide-assemble.test.ts
  - tests/scripts/guide-audio.test.ts
  - tests/scripts/parser-sax-edge.test.ts
  - tests/stubs/server-only.ts
  - tsconfig.json
  - vitest.config.mts
review:
  passes:
    - "n": 1
      by: claude-reviewer-subagent
      at: "2026-10-18T12:50:52Z"
      findings: 0
    - "n": 2
      by: claude-code
      at: "2026-10-18T14:29:42Z"
      findings: 1
    - "n": 3
      by: claude-code
      at: "2026-10-18T14:29:42Z"
      findings: 0
evidence:
  check:
    cmd: npm run check
    exit_code: 0
    duration_ms: 56691
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

      {"level":40,"time":1792333838580,"service":"data-dashboard","check":"B","detail":"koneksi ditolak","msg":"health check gagal"}
      {"level":40,"time":1792333838607,"service":"data-dashboard","check":"Lambat","detail":"Lambat: timeout 20 ms","msg":"health check gagal"}
      {"level":40,"time":1792333838610,"service":"data-dashboard","check":"Y","detail":"mati","msg":"health check gagal"}
      {"level":40,"time":1792333838617,"service":"data-dashboard","check":"Renderer PDF","detail":"renderer tidak menjawab /healthz","msg":"health check gagal"}
      {"level":40,"time":1792333840713,"service":"data-dashboard","err":"Can't reach database server","msg":"sesi shell gagal dibaca"}

       Test Files  147 passed (147)
            Tests  1914 passed (1914)
         Start at  21:30:26
         Duration  40.11s (tests 79%, import 16%, transform 5%)

          Isolate  147 workers spawned · ~149ms startup each (spawn + environment, per file)
                   at least ~2.28s faster with isolate: false — reuses workers across files instead of one per file


      > data-dashboard@0.1.0 audit
      > npm audit --audit-level=high --omit=dev && npm audit --audit-level=critical

      found 0 vulnerabilities
      found 0 vulnerabilities
    at: "2026-10-18T14:31:07Z"
    tree: 6e3877b9e712a53dd0bfb6fa7e781f3b6e1cdf05ab6bf1e50523c56ae60c5136
  commits:
    - "0851338"
    - 269f694
    - 3d6950e
    - 41511d7
    - 53aa107
    - 5848a06
    - 5dd61f3
    - 628e554
    - 64c868b
    - 796d2bd
    - 808a4ef
    - 9762b62
    - a7061c0
    - aca91c9
    - ba74968
    - c9e9ab4
    - d2a6ca2
    - e10cade
    - ed14e7c
    - f381e79
  acceptance:
    total: 4
    done: 4
  audit:
    at: "2026-10-18T14:29:52Z"
    passed: true
    tree: 6e3877b9e712a53dd0bfb6fa7e781f3b6e1cdf05ab6bf1e50523c56ae60c5136
    results:
      - name: osv-scanner (dependencies, offline db)
        exit_code: 0
        summary: |-
          Scanning dir .
          Starting filesystem walk for root: /
          Scanned /Users/anasfikri/Documents/Projects/pcpexpress/data-dashboard/.claude/worktrees/t-001-scaffold/package-lock.json file and found 821 packages
          End status: 208 dirs visited, 1358 inodes visited, 1 Extract calls, 85.760083ms elapsed, 85.76ms wall time
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
(describe the outcome in one paragraph)

## Acceptance criteria
- [x] Given admin di Admin › Pengguna, when menambah pengguna dengan email domain perusahaan, nama, dan peran, then akun terbuat terverifikasi tanpa password, email undangan berisi tautan buat password sekali pakai berlaku 72 jam terkirim, dan audit user.create tercatat; email di luar domain atau sudah terdaftar ditolak dengan pesan yang jelas
- [x] Given pengguna terundang membuka tautan undangan, when menetapkan password, then ia bisa masuk; tautan kedaluwarsa atau terpakai ditolak dan pengguna bisa meminta tautan baru lewat Lupa password
- [x] Given admin menghapus akun dengan konfirmasi mengetik email, then akun beserta sesi dan akses berbaginya terhapus dan audit user.delete (email di meta) tercatat; menghapus diri sendiri, admin aktif terakhir, atau akun yang masih punya dataset ditolak dengan pesan yang menunjuk langkah berikutnya
- [x] Given panduan admin, then artikel dan video Mengelola pengguna memuat tambah dan hapus akun, dan terpasang di produksi

## Risk
Impact: halaman Admin › Pengguna (tombol Tambah pengguna + dialog, item menu Hapus akun… + dialog ketik email), service/action admin (createUser, deleteUser), email undangan, halaman /reset-password (judul "Buat password" untuk akun tanpa password), AuditAction user.create/user.delete, seed-guides --only, artikel + video admin-kelola-pengguna. Tanpa migrasi skema. Alur daftar mandiri, lupa password, nonaktif, dan alih dataset tidak berubah perilakunya.
Security (STRIDE): Spoofing — tautan undangan = token RESET_PASSWORD 32 byte acak, hanya hash di DB, sekali pakai atomik, 72 jam, hanya dikirim ke kotak surat pengguna (tidak pernah dikembalikan ke admin atau dicatat di log); akun tanpa password tidak bisa login sampai tautan dipakai. Tampering — semua masukan divalidasi di server (normalizeEmail, domain whitelist persis, nama dibersihkan + tanpa @, isAdmin boolean, email konfirmasi hapus dicocokkan ulang di server). Repudiation — user.create (meta isAdmin) dan user.delete (meta email, wasAdmin, wasActive) ditulis di transaksi yang sama dengan perubahan; audit buatan akun terhapus tetap ada (actorId SetNull). Information disclosure — pesan "Email ini sudah terdaftar" hanya untuk admin (sudah bisa melihat daftar pengguna); tanpa PII di log (userId saja). DoS — rate limit perubahan per admin (asAdmin); lock admins + datasets:<id> mencegah balapan. Elevation — pelaku dicek ulang sebagai admin aktif di bawah lock (dicabut di tengah jalan → NOT_FOUND); hapus diri sendiri ditolak sehingga selalu tersisa admin aktif; akun pemilik dataset tidak bisa dihapus (data tidak ikut hilang tanpa sengaja).
Rollback: revert commit ba74968 (+ commit panduan/video); akun yang sudah dibuat tetap valid sebagai akun biasa, akun yang sudah dihapus tidak bisa dikembalikan (dicatat di audit dengan email agar bisa dibuat ulang/diundang lagi). Artikel produksi bisa dikembalikan lewat editor panduan admin.
Validation: 18 unit test service baru (fake Prisma: token hash + TTL 72 jam, domain/duplikat/nama, pelaku dicabut, gagal kirim email, hapus diri sendiri, konfirmasi salah, masih punya dataset, cascade token/share, audit); e2e admin.spec T-c7wf (undang → email Mailpit → Buat password → masuk → tautan sekali pakai → hapus dengan ketik email → sesi berakhir) + suite admin & password lulus; tangkapan layar 390/1440 px; aitk check.

## Notes

## Security checklist (OWASP ASVS 4.0.3)
<!-- Check each item when verified, or write "N/A: <reason>" after the text and check it. -->
- [x] V1 Architecture: trust boundaries and the components handling sensitive data are identified for this change — batas kepercayaan: Server Action asAdmin (requireAdmin + rate limit) → service (cek ulang admin aktif di bawah lock admins) → Prisma; token undangan hanya ke email pengguna
- [x] V2 Authentication: credentials are verified server-side; no default, hard-coded, or weak secrets — akun undangan tanpa password tidak bisa login; password dibuat lewat token sekali pakai 72 jam (hash SHA-256 di DB, argon2id untuk password); tanpa rahasia bawaan
- [x] V3 Session management: session tokens are random, protected, invalidated on logout and expiry — hapus akun → baris user hilang, getSession menolak sesi lama di permintaan berikutnya (diuji e2e); set password menaikkan sessionVersion (alur reset yang sudah ada)
- [x] V4 Access control: every endpoint/action checks authorization server-side, deny by default (no IDOR) — createUserAction/deleteUserAction lewat asAdmin (non-admin → NOT_FOUND) + actorIsActiveAdmin di transaksi; hapus diri sendiri FORBIDDEN; id divalidasi isIdShape
- [x] V5 Validation, sanitization and encoding: all input validated; output encoded; no injection (SQL, OS, template) — normalizeEmail + whitelist domain persis, cleanName (kontrol/bidi dibuang, 80 karakter, tanpa @), isAdmin boolean, email konfirmasi dicocokkan di server; Prisma terparameter; email HTML di-escape
- [x] V6 Stored cryptography: sensitive data at rest uses approved algorithms; keys are not in the code — token disimpan sebagai hash SHA-256 (hashToken yang sama dengan reset), token mentah tidak pernah disimpan atau dicatat
- [x] V7 Error handling and logging: errors reveal no internals; security events are logged without secrets — galat terduga → kode + pesan pengguna; galat lain → BUSY umum, detail di log; log hanya userId/actorId (tanpa email/token); penolakan akses dicatat warn
- [x] V8 Data protection: personal/sensitive data is minimized, not cached or logged, and removable — hapus akun menghapus token, share yang diterima, ekspor, catatan baca (cascade); email sasaran hanya di meta audit untuk jejak admin
- [x] V9 Communication: TLS for all external traffic; certificates validated — N/A — tidak ada lalu lintas eksternal baru; email lewat SMTP yang sudah dikonfigurasi, tautan dari APP_URL (bukan Host header)
- [x] V10 Malicious code: no backdoors, time bombs, or unexplained network calls; dependencies are trusted — tanpa dependensi baru, tanpa panggilan jaringan baru selain email undangan lewat mailer yang ada
- [x] V11 Business logic: flows cannot be abused (limits, ordering, replay, race conditions) — lock admins menyerialkan tambah/hapus; lock datasets:<id> mencegah dataset dibuat di antara hitung dan hapus; duplikat email → INVALID (balapan dengan registrasi → P2002 → BUSY); token sekali pakai atomik (updateMany usedAt null)
- [x] V12 Files and resources: uploads are type/size limited and stored safely; no path traversal or SSRF — N/A — tidak ada unggahan atau akses file baru di aplikasi; seed-guides --only hanya membatasi slug
- [x] V13 API and web service: API inputs/outputs are schema-validated; CORS and rate limits are deliberate — Server Action memvalidasi argumen di service (unknown → validasi); rate limit perubahan per admin berlaku untuk tambah/hapus
- [x] V14 Configuration: secure defaults, security headers, no debug in production, dependencies up to date — tanpa konfigurasi baru; INVITE_TTL_MS konstanta di kode; npm audit 0 kerentanan

## Evidence
<!-- Generated by aitk close. -->
- Check: `npm run check` → exit 0 at 2026-10-18T14:31:07Z (56691 ms)
- Acceptance criteria: 4/4 satisfied
- Commits: 0851338, 269f694, 3d6950e, 41511d7, 53aa107, 5848a06, 5dd61f3, 628e554, 64c868b, 796d2bd, 808a4ef, 9762b62, a7061c0, aca91c9, ba74968, c9e9ab4, d2a6ca2, e10cade, ed14e7c, f381e79
- Review pass 1 by claude-reviewer-subagent: 0 findings
- Review pass 2 by claude-code: 1 findings
- Review pass 3 by claude-code: 0 findings
