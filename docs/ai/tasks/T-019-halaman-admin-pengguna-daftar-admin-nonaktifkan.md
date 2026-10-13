---
id: T-019
title: 'Halaman admin pengguna: daftar, admin, nonaktifkan, alihkan kepemilikan'
status: done
profile: strict
profile_pinned: true
goal: G-2
tags:
  - security
depends_on:
  - T-002
  - T-003
  - T-010
created: "2026-10-11T14:45:09Z"
updated: "2026-10-13T17:10:08Z"
closed: "2026-10-13T17:10:08Z"
created_by: claude-code
workers:
  - claude-code
branch: worktree-t-001-scaffold
base: 2ba4512ea154dcc1cf436b69e0a64bee2f376dec
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
  - src/lib/text.ts
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
  - tests/e2e/admin.spec.ts
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
  - tests/features/admin/actions.test.ts
  - tests/features/admin/fake-db.ts
  - tests/features/admin/service.test.ts
  - tests/features/auth/core.test.ts
  - tests/features/auth/denial-log.test.ts
  - tests/features/auth/rate-limit.test.ts
  - tests/features/auth/register.test.ts
  - tests/features/auth/session.test.ts
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
      at: "2026-10-13T14:32:41Z"
      findings: 19
    - "n": 2
      by: claude-verify-workflow
      at: "2026-10-13T15:34:02Z"
      findings: 9
    - "n": 3
      by: claude-verify-workflow
      at: "2026-10-13T16:21:30Z"
      findings: 4
    - "n": 4
      by: frontend-expert-design-reviewer
      at: "2026-10-13T16:41:56Z"
      findings: 4
    - "n": 5
      by: claude-verify-workflow
      at: "2026-10-13T17:08:14Z"
      findings: 0
evidence:
  check:
    cmd: npm run check
    exit_code: 0
    duration_ms: 33035
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

      {"level":40,"time":1791911386100,"service":"data-dashboard","check":"B","detail":"koneksi ditolak","msg":"health check gagal"}
      {"level":40,"time":1791911386124,"service":"data-dashboard","check":"Lambat","detail":"Lambat: timeout 20 ms","msg":"health check gagal"}

       Test Files  37 passed (37)
            Tests  673 passed (673)
         Start at  00:09:43
         Duration  23.41s (tests 89%, import 7%, transform 4%)


      > data-dashboard@0.1.0 audit
      > npm audit --audit-level=high --omit=dev && npm audit --audit-level=critical

      found 0 vulnerabilities
      found 0 vulnerabilities
    at: "2026-10-13T17:10:08Z"
    tree: 68907f5445374bf77b05542b560d6000406a92b3ff394598cb275ba7502d7021
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
    - 467b44d
    - 471d15b
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
    at: "2026-10-13T17:09:16Z"
    passed: true
    tree: 68907f5445374bf77b05542b560d6000406a92b3ff394598cb275ba7502d7021
    results:
      - name: osv-scanner (dependencies, offline db)
        exit_code: 0
        summary: |-
          Scanning dir .
          Starting filesystem walk for root: /
          Scanned /Users/anasfikri/Documents/Projects/pcpexpress/data-dashboard/.claude/worktrees/t-001-scaffold/package-lock.json file and found 723 packages
          End status: 132 dirs visited, 592 inodes visited, 1 Extract calls, 56.107583ms elapsed, 56.108ms wall time
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
/admin/pengguna untuk isAdmin: daftar user (email, admin, aktif, login terakhir), toggle admin, nonaktifkan/aktifkan (menaikkan sessionVersion → sesi putus, D1), alihkan semua dataset user nonaktif ke user lain. Larangan: menonaktifkan diri sendiri atau admin aktif terakhir.

## Acceptance criteria
- [x] Given admin menonaktifkan user B yang sedang login, when B mengirim permintaan berikutnya, then diarahkan ke /login dengan pesan akun nonaktif dan tidak bisa login lagi
- [x] Given hanya satu admin aktif, when ia mencoba mencabut admin dirinya atau menonaktifkan dirinya, then code LAST_ADMIN
- [x] Given user non-admin, when membuka /admin/pengguna atau memanggil Server Action-nya, then 404 / code NOT_FOUND tanpa perubahan
- [x] Given dataset milik B (nonaktif) dengan dashboard, when admin mengalihkan ke C, then C pemilik dan dashboard tetap berfungsi
- [x] Given halaman/komponen task ini selesai, when /frontend-expert:audit dijalankan (anti-slop-design, responsive 320/768/1024/1440, accessibility), then tidak ada temuan Critical/High dan blok Conventions check (Tokens: preset project; Icons: waiver @tabler/icons-react; States loading/empty/error; Responsive; A11y) dicatat sebagai note task
- [x] Given admin A mencabut peran admin B yang sedang login, when B mengirim permintaan admin berikutnya, then NOT_FOUND (toggle admin menaikkan sessionVersion dan isAdmin dibaca dari DB)
- [x] Given toggle admin, nonaktifkan, atau alih kepemilikan, when terjadi, then AuditLog tercatat dengan actor, target, dan ip

## Risk
- **Impact:**
  - Model baru AuditLog {actorId?, action, targetType, targetId, meta?, ip, at} (relasi User onDelete SetNull; indeks [targetType, targetId], [actorId], [at]); migrasi 20261013133022_audit_log hanya CREATE TABLE + indeks + FK, tanpa mengubah data. Dipakai ulang T-016/T-017 lewat recordAudit(tx, …) di src/features/audit/service.ts.
  - Modul baru src/features/admin (service, actions, types, transfer-names): listUsers (kata kunci + saring status all/active/inactive/unverified), searchTransferTargets, setUserAdmin, setUserActive, transferDatasets + Server Action setUserAdminAction, setUserActiveAction, transferDatasetsAction, searchTransferTargetsAction (cari calon pemilik baru di server, ≤ 20 per ketikan; halaman tidak lagi memuat daftar tujuan di depan).
  - Modul baru src/lib/text.ts (cleanLine/cleanName, looksLikeEmail, escapeLike), dipakai registrasi dan semua jalur baca admin.
  - Registrasi (T-002, src/features/auth/service.ts): nama dibersihkan dari \p{Cc}\p{Cf} (termasuk bidi U+202A–202E, U+2066–2069), spasi dirapikan, maks 80 code point; nama yang memuat @ ditolak dengan kode baru INVALID_NAME (pesan form-level; /api/auth/login memetakan kode itu ke 400 agar peta status tetap lengkap). Nama dari token lama ikut dibersihkan saat aktivasi.
  - Log keamanan: requireAdmin("page") mencatat penolakan non-admin (warn "akses halaman admin ditolak" { userId, path tanpa query }); AuthError membawa userId untuk log aksi.
  - scripts/dev-purge-test-data.mjs (global teardown e2e) kini juga menghapus akun buatan uniqueEmail setelah datasetnya dibersihkan; akun lain tidak disentuh. scripts/admin-restore.mjs baru untuk memulihkan admin terakhir.
  - Perilaku bersama yang berubah: requireUser("page") kini mengarahkan sesi akun nonaktif ke /login?next=…&reason=disabled (alasan lain tetap /login?next=…); loginUrl(next, reason?) mendapat parameter opsional; getSessionUser dan requireUser("action") tidak berubah. RULES mendapat "admin" (60/menit per admin).
  - Seed: SEED_ADMIN_EMAIL hanya diberi isAdmin/isActive saat akun DIBUAT; seed ulang tidak lagi mengaktifkan/mengangkat akun yang sudah ada (sebelumnya diam-diam membatalkan nonaktif/cabut admin). Memulihkan admin kini lewat admin lain, atau bila tidak ada admin yang bisa masuk lewat scripts/admin-restore.mjs <email> (--confirm wajib di produksi; menulis AuditLog user.admin.restore, actorId null, ip "cli"; runbook di README "Memulihkan admin terakhir").
  - Mencabut admin menaikkan sessionVersion target → target keluar dari semua perangkat (AC6); memberi admin TIDAK memutus sesi (isAdmin dibaca dari DB tiap permintaan, jadi langsung berlaku); pelaku yang mencabut perannya sendiri mendapat sesi baru di perangkat ini (selfDemoted, tanpa revalidate — UI yang mengarahkan keluar).
  - Alih kepemilikan memindahkan Dataset.ownerId (dashboard/widget ikut karena tidak punya kolom pemilik); hanya dataset yang namanya benar-benar bentrok (dengan milik pemilik baru atau dataset masuk lain) diberi akhiran " (n)" terkecil yang belum terpakai — dua putaran, deterministik, nama yang tetap dipakai dataset lain tidak pernah diambil; unggahan UPLOADING sumber ditandai FAILED dan multipart di-abort setelah commit. Kuota pemilik baru bisa penuh/terlampaui (quotaExceeded bila pemakaian ≥ kuota; unggahan berikutnya ditolak QUOTA_EXCEEDED oleh initUpload). Tujuan yang sudah 50 dataset → LIMIT_REACHED "Pengguna tujuan sudah memiliki batas maksimal 50 dataset."
  - Catatan T-003 (hapus user → objek storage): T-019 tidak menghapus user dan nonaktif tidak menghapus dataset, jadi deleteDatasetObjects tidak dipanggil di sini; tetap berlaku bila penghapusan user ditambahkan kelak.
- **Security (STRIDE):**
  - **Spoofing:**
    - Setiap Server Action memanggil requireAdmin("action") lebih dulu (isAdmin, isActive, sessionVersion dari DB); sesi yang sudah dicabut gagal di sana. Pelaku dicek ulang sebagai admin aktif di dalam transaksi di bawah lock 'admins' (peran bisa dicabut admin lain di antara cek dan tulis).
    - Nama tampilan tidak bisa menyamar sebagai email pengguna lain: registrasi membuang karakter kontrol/format (termasuk RLO U+202E dan isolat bidi) dan menolak nama yang memuat @; listUsers dan searchTransferTargets membersihkan nama yang sama untuk data lama; UI menampilkan email lebih dulu (identitas utama) dan tombol konfirmasi alih menyebut email tujuan.
  - **Tampering:**
    - Argumen action divalidasi server: id harus berbentuk cuid (isIdShape) atau NOT_FOUND; flag harus boolean atau INVALID; kata kunci pencarian NFC, tanpa karakter kontrol, ≤ 100, wildcard LIKE (`\`, `%`, `_`) di-escape (q="_" tidak lagi cocok dengan semua pengguna), Prisma terparameter; status di luar daftar → "all".
    - Aturan bisnis di server: admin aktif terakhir tidak bisa dicabut/dinonaktifkan (LAST_ADMIN), menonaktifkan diri sendiri FORBIDDEN, memberi admin ke akun nonaktif/belum verifikasi INVALID, alih hanya dari akun nonaktif ke akun aktif + terverifikasi lain.
  - **Repudiation:** AuditLog (actor, action, target, ip, at) ditulis di transaksi yang sama dengan perubahannya: tidak ada perubahan tanpa jejak. Alih kepemilikan mencatat meta { from, to, moved, datasetIds, renamed: [{ datasetId, from, to }], failedUploads }. ip dari clientIp(headers, TRUST_PROXY) ("local" di dev); keaslian ip (dan cek Origin Server Action) di produksi bergantung pada reverse proxy yang MENIMPA Host/X-Forwarded-Host/X-Real-IP — kewajiban konfigurasi itu milik T-023 (sudah dicatat di Notes T-023), bukan T-019. Pemulihan admin lewat CLI juga diaudit (user.admin.restore).
  - **Information disclosure:**
    - Non-admin, tanpa sesi, atau sesi dicabut → NOT_FOUND "Halaman tidak ditemukan." (D2) tanpa kueri tulis; halaman /admin/pengguna memakai requireAdmin() → 404.
    - reason=disabled hanya untuk JWT sah milik akun itu (pemegang cookie = pemilik akun) → bukan oracle enumerasi; login tetap hanya mengungkap ACCOUNT_DISABLED setelah password benar.
    - Error tak terduga → BUSY dengan pesan umum; detail hanya di log. Meta audit tanpa email, password, atau token.
    - Penolakan akses dicatat tanpa membocorkan apa pun ke klien: aksi → warn "aksi admin ditolak" { userId bila ada sesi, code, action } (termasuk pelaku yang dicabut di antara requireAdmin dan lock); halaman → warn "akses halaman admin ditolak"; LAST_ADMIN/FORBIDDEN/RATE_LIMITED → info "aksi admin ditolak aturan".
  - **DoS:** rate limit "admin" 60/menit per admin (Redis mati → aksi tetap jalan dan dicatat, agar menonaktifkan akun yang disalahgunakan tidak terhalang); listUsers dipaginasi 50; calon pemilik baru dicari di server (searchTransferTargetsAction, ≤ 20 hasil per kata kunci, hanya admin; tanpa jatah rate limit perubahan karena hanya baca) — tidak ada lagi daftar 1000 yang dipotong diam-diam; lock yang habis waktu (P2028) → BUSY.
  - **Elevation of privilege:**
    - Race "dua admin saling mencabut" ditutup pg_advisory_xact_lock(hashtext('admins')) + hitung admin aktif di dalam transaksi.
    - Alih kepemilikan memegang lock 'datasets:<tujuan>' dan 'uploads:<tujuan>' (sama dengan createDataset/initUpload) → batas 50 dataset dan kuota tidak bisa diakali paralel; semua-atau-tidak (rollback bila jumlah yang pindah tidak cocok; P2002 dari ganti nama bersamaan → BUSY).
    - CSRF: Server Actions Next memeriksa Origin bawaan; cookie SameSite=Lax.
- **Rollback:**
  - Revert commit T-019. Migrasi audit_log hanya menambah tabel; aman dibiarkan untuk kode lama. Untuk membuangnya: DROP TABLE "AuditLog" lalu hapus folder migrasi (jejak audit hilang).
  - Dataset yang sudah dialihkan tidak kembali otomatis. Pengembalian manual memakai meta AuditLog: meta.datasetIds untuk pemilik (ownerId kembali ke meta.from), meta.renamed[].datasetId + from untuk nama (dicocokkan per id, bukan per nama, jadi tetap benar meski nama sudah diganti lagi; nameKey dihitung ulang dengan nameKeyOf).
  - Revert seed mengembalikan perilaku lama (seed ulang mengaktifkan/mengangkat SEED_ADMIN_EMAIL).
- **Validation:**
  - tests/features/admin/service.test.ts (Prisma palsu dalam memori dengan rollback): LAST_ADMIN saat cabut/nonaktif diri sendiri, admin nonaktif tidak dihitung, FORBIDDEN nonaktif diri, sessionVersion naik saat cabut/nonaktif dan tetap saat beri/aktifkan, audit actor/target/ip, pelaku yang sudah dicabut → NOT_FOUND, alih: sumber aktif / tujuan tidak sah / tanpa dataset → INVALID, LIMIT_REACHED dengan jumlah yang muat, rename " (n)" termasuk nameKey lama, unggahan → FAILED + abort setelah commit, quotaExceeded, rollback penuh, P2002/P2028 → BUSY, listUsers/listTransferTargets.
  - tests/features/admin/actions.test.ts: non-admin dan sesi dicabut → NOT_FOUND tanpa tulis/rate limit/revalidate, redirect Next dilempar ulang, DB mati → BUSY, RATE_LIMITED, Redis mati, selfDemoted menerbitkan ulang sesi, revalidatePath, ip dari X-Real-IP saat TRUST_PROXY.
  - tests/features/auth/session.test.ts (reason=disabled hanya untuk akun nonaktif dengan JWT sah; mode action tetap AuthError) dan tests/lib/seed.test.ts (seed tidak mengubah akun yang sudah ada).
  - Perbaikan review putaran 1 (backend):
    - Spoofing nama: tests/lib/text.test.ts (RLO/isolat/ZW/soft hyphen dibuang, spasi dirapikan, NFC, potong per code point, deteksi @ termasuk lebar penuh) dan tests/features/auth/register.test.ts (nama berbentuk email → INVALID_NAME tanpa menulis/rate limit; nama dibersihkan sebelum disimpan di token); service.test.ts: nama data lama dibersihkan di listUsers dan searchTransferTargets.
    - Log penolakan: actions.test.ts (warn dengan userId/code/action untuk NOT_FOUND dan UNAUTHENTICATED, info untuk LAST_ADMIN dan FORBIDDEN), service.test.ts (pelaku dicabut di bawah lock → warn), session.test.ts (requireAdmin halaman → warn dengan path tanpa query; admin tidak dicatat; AuthError membawa userId).
    - Rename berantai: service.test.ts "rencana nama: rantai" ([X, X (2)] → tujuan [X] menjadi X (3) + X (2) tetap; [Data, Data (2), DATA (3)]; tabrakan antar dataset masuk; deterministik dan tanpa nama ganda) + transferDatasets end-to-end di Prisma palsu dengan meta.renamed ber-datasetId.
    - Low integritas: escape LIKE (unit + diverifikasi di Postgres dev: contains `_` = semua akun, `\_` = 0), quotaExceeded saat pemakaian = kuota, LIMIT_REACHED saat tujuan 50 dataset ("batas maksimal", bukan "hanya 0 lagi").
    - Saring status: service.test.ts (where per status, status tak dikenal → all, nonaktif urut jumlah dataset terbanyak, digabung dengan kata kunci).
    - Pencarian tujuan: service.test.ts + actions.test.ts (aktif + terverifikasi selain sumber, ≤ 20, q kosong → 20 pertama, id rusak → NOT_FOUND, non-admin → NOT_FOUND tanpa kueri, tidak memakai rate limit).
    - Pemulihan admin: scripts/admin-restore.mjs diuji manual di DB dev (tanpa email → exit 2; NODE_ENV=production tanpa --confirm → ditolak; email tidak ada → tanpa perubahan; akun uji terverifikasi → aktif + admin + AuditLog user.admin.restore ip cli).
    - Kebersihan dev: purge dijalankan 2026-10-13 → 913 akun uji dihapus (970 → 57 pengguna, admin aktif 46 → 3, calon tujuan 951 → 51); akun selain pola uniqueEmail (admin@, demo.admin@, audit-*, design-*, fixui19-*) tidak disentuh.
    - e2e: `npx playwright test tests/e2e/admin.spec.ts --project=admin --no-deps --reporter=line` 2026-10-13 di atas HEAD 467b44d + perubahan kerja (belum di-commit) → 5 passed (AC1, AC3, AC4 lewat pencarian server + tombol "Alihkan ke <email>", AC6, AC7); teardown: {"testUsers":39,"datasets":1,"objects":3,"accounts":4}.
  - Perbaikan review putaran 2 (backend), 2026-10-13:
    - Volume log penolakan: tests/features/auth/denial-log.test.ts (5 warn pertama per pengguna/anon + aksi per jendela 1 menit, lalu satu ringkasan "<n> penolakan ditekan" setelah jendela; jatah terpisah per pengguna/aksi/anon; Redis mati → setiap penolakan tetap dicatat; Redis putus sebelum ringkasan → ringkasan tanpa jumlah). actions.test.ts dan session.test.ts: penolakan aksi/halaman lewat logAccessDenied (halaman memakai satu jatah "page", bukan per path). Live di dev: non-admin 20× searchTransferTargets paralel + 8× GET /admin/pengguna → 5 + 5 warn, lalu "aksi admin ditolak: 15 penolakan ditekan" dan "akses halaman admin ditolak: 3 penolakan ditekan"; respons tetap NOT_FOUND / 404.
    - Nama ber-@ dari token lama: register.test.ts (verifyEmail tidak memasang "a@b.com" / @ lebar penuh, nama biasa tetap dibersihkan; resendVerification menyalin pendingName null).
    - Saringan "Belum verifikasi" = aktif + belum verifikasi: service.test.ts (where per status + tiap kombinasi aktif/nonaktif × verifikasi masuk tepat satu saringan). DB dev: semua 90 = aktif 53 + nonaktif 37 + belum verifikasi 0.
    - admin-restore.mjs diuji manual di DB dev: DATABASE_URL host db.internal / URL rusak tanpa --confirm → ditolak exit 1; NODE_ENV=production → ditolak; akun uji nonaktif terverifikasi → aktif + admin, sessionVersion 1 → 2, AuditLog meta {wasAdmin, wasActive, osUser, host}; dijalankan ulang → "sudah admin aktif", exit 0, sessionVersion tetap 2, tetap satu baris AuditLog. Akun uji dihapus setelahnya.
    - dev-purge-test-data.mjs --dry-run: jumlah akun = akun uniqueEmail yang tidak punya dataset selain yang akan dihapus (filter yang sama dengan jalur sungguhan); dijalankan → {"testUsers":36,"datasets":0,"objects":0,"accounts":1} (akun uji restore di atas).
  - e2e dan audit UI: lihat Notes (Conventions check) setelah halaman selesai.

## Notes
- 2026-10-11T14:49:25Z UI wajib lewat rantai frontend-expert: design-foundations → tokens (preset dari T-025) → (+forms/data-fetching/app-shell sesuai kebutuhan) → components → anti-slop-code → responsive → motion ringan → anti-slop-design → polish → accessibility. Skip design-direction karena arah sudah dipilih di T-025, kecuali layar baru yang ambigu. Chart via skill dataviz; filter/select pakai Select kustom dari T-025, bukan native.
- 2026-10-11T23:56:00Z Dari review T-003: Dataset.owner onDelete Cascade → menghapus user menghapus baris dataset tetapi tidak objek storage. Penghapusan/penonaktifan user oleh admin wajib memanggil deleteDatasetObjects per dataset (atau mencatat ke StorageCleanup).
- 2026-10-13T17:08:14Z Conventions check (AC5, audit /frontend-expert:audit lewat workflow review 3 lensa + konfirmasi bertahap, HEAD 2b68d11):
- Tokens: preset project (zinc-blue, src/styles/tokens.css); 0 warna mentah; tinggi kontrol dari --control-h/--control-h-lg, --topbar-h untuk scroll-padding; prefiks 'Status:' redup hanya saat diam (hover/fokus 14–17:1).
- Icons: waiver @tabler/icons-react (Tabler saja, ikon dekoratif aria-hidden, spinner motion-safe; 0 Lucide).
- States: loading (kerangka daftar, spinner baris/dialog, aria-busy), empty (tanpa pengguna, tanpa hasil cari, halaman di luar rentang, pemilih tanpa hasil), error (error.tsx + Coba lagi, galat aksi di dialog dengan fokus, galat pemilih + Coba lagi tanpa kehilangan fokus); sukses diumumkan role=status.
- Responsive: 320/375/768/1024/1280/1440 + tinggi pendek 320×256, 568×320, 320×568, 375×667; tabel ≥ 56rem kontainer, kartu di bawahnya; 0 scroll horizontal; dialog satu area gulir, tombol selalu terjangkau; CTA alih membungkus untuk email panjang; target sentuh 44 px; tombol full-width di ponsel.
- A11y: axe-core 4.14 (WCAG 2.2 AA + best-practice) ratusan run lintas putaran → serious/critical = 0 (sisa 'region' moderate di portal Radix → T-032); fokus tidak tertutup topbar (2.4.11), 930/930 langkah fokus dialog terlihat, tabel dengan caption/header, radiogroup berlabel di pemilih, live region untuk hasil.

## Security checklist (OWASP ASVS 4.0.3)
<!-- Check each item when verified, or write "N/A: <reason>" after the text and check it. -->
- [x] V1 Architecture: trust boundaries and the components handling sensitive data are identified for this change — Batas kepercayaan: browser → Server Actions admin (requireAdmin("action"), rate limit) → service admin (cek ulang pelaku + lock 'admins' + AuditLog dalam satu transaksi) → Postgres (User.isAdmin/isActive/sessionVersion, Dataset.ownerId, AuditLog) dan object storage (abort multipart). Data sensitif: peran/status akun dan jejak audit (ip). Dirinci di Risk.
- [x] V2 Authentication: credentials are verified server-side; no default, hard-coded, or weak secrets — Tidak ada kredensial baru. Akun nonaktif tetap ditolak login (ACCOUNT_DISABLED setelah password benar); seed tidak lagi mengaktifkan ulang SEED_ADMIN_EMAIL dan tetap tanpa password bawaan.
- [x] V3 Session management: session tokens are random, protected, invalidated on logout and expiry — Nonaktif dan cabut admin menaikkan sessionVersion target → semua sesinya ditolak di permintaan berikutnya (cek DB tiap permintaan, D1); aktifkan tidak menghidupkan token lama. Cabut admin diri sendiri menerbitkan ulang sesi perangkat ini lewat createSession (pola changePassword). Diuji unit.
- [x] V4 Access control: every endpoint/action checks authorization server-side, deny by default (no IDOR) — Keempat Server Action (termasuk searchTransferTargetsAction yang hanya baca) memanggil requireAdmin("action") sebelum apa pun; AuthError (non-admin/tanpa sesi/sesi dicabut) → NOT_FOUND tanpa kueri apa pun dan dicatat (diuji). Pelaku dicek ulang di dalam transaksi; isAdmin selalu dari DB. Halaman /admin/pengguna wajib requireAdmin() (404) — dibuktikan e2e UI (AC3/AC6, run 2026-10-13 di Validation).
- [x] V5 Validation, sanitization and encoding: all input validated; output encoded; no injection (SQL, OS, template) — id lewat isIdShape, flag harus boolean, kata kunci pencarian NFC tanpa karakter kontrol ≤ 100 dengan wildcard LIKE di-escape; nama pengguna dibersihkan dari karakter kontrol/bidi saat registrasi dan saat dibaca, nama berbentuk email ditolak; semua kueri Prisma terparameter; advisory lock lewat $executeRaw tagged template. Nama hasil rename dibangun dari nama yang sudah tervalidasi, ≤ 80 karakter, nameKey dihitung ulang dengan nameKeyOf. Output dirender React.
- [x] V6 Stored cryptography: sensitive data at rest uses approved algorithms; keys are not in the code — N/A: tidak ada data rahasia baru yang disimpan (AuditLog tanpa kredensial/token).
- [x] V7 Error handling and logging: errors reveal no internals; security events are logged without secrets — Kode tetap (NOT_FOUND/LAST_ADMIN/FORBIDDEN/INVALID/RATE_LIMITED/LIMIT_REACHED/BUSY) dengan pesan Indonesia; error tak terduga → BUSY dengan pesan umum, detail di log pino. Peristiwa keamanan (beri/cabut admin, nonaktif/aktif, alih, pemulihan admin lewat CLI) tercatat di AuditLog + log terstruktur tanpa rahasia. Keputusan akses yang gagal juga dicatat (ASVS V7.2.2): Server Action admin → warn "aksi admin ditolak" { userId bila ada sesi, code, action }, halaman /admin/* → warn "akses halaman admin ditolak" { userId, path tanpa query }, penolakan aturan LAST_ADMIN/FORBIDDEN/RATE_LIMITED → info. Diuji unit. Penolakan akses admin (aksi dan halaman) dicatat warn dengan userId/kode/aksi, dibatasi 5 per pengguna per aksi per menit lewat Redis (sisanya satu baris ringkasan 'N penolakan ditekan'; fail-open bila Redis mati).
- [x] V8 Data protection: personal/sensitive data is minimized, not cached or logged, and removable — Daftar pengguna hanya memilih kolom yang ditampilkan (tanpa passwordHash/sessionVersion); meta audit tanpa email; actorId SetNull bila akun pelaku dihapus. Halaman dinamis per permintaan (cookie), tidak di-cache.
- [x] V9 Communication: TLS for all external traffic; certificates validated — N/A: tidak ada lalu lintas eksternal baru (abort multipart memakai klien S3 yang ada).
- [x] V10 Malicious code: no backdoors, time bombs, or unexplained network calls; dependencies are trusted — Tidak ada dependensi baru; tidak ada jalur pintas admin (seed tidak lagi mengangkat ulang akun).
- [x] V11 Business logic: flows cannot be abused (limits, ordering, replay, race conditions) — Admin aktif terakhir dilindungi di bawah lock 'admins' (dua admin saling mencabut tidak bisa menghasilkan nol admin); alih kepemilikan semua-atau-tidak di bawah lock 'datasets:<tujuan>' + 'uploads:<tujuan>' dengan batas 50 dataset; aksi tanpa perubahan tidak menulis/mengaudit. Diuji unit dengan Prisma palsu (lock hanya dicatat, tidak disimulasikan); race-nya dibuktikan reviewer keamanan putaran 1 terhadap PostgreSQL scratch dengan service asli (saling cabut 15/15 menyisakan 1 admin, transfer vs createDataset/transfer 10/10 tepat 50 dataset). Tes regresi integrasi di repo masih tindak lanjut.
- [x] V12 Files and resources: uploads are type/size limited and stored safely; no path traversal or SSRF — Tidak ada unggahan baru; unggahan sumber yang belum selesai ditandai FAILED dan multipart di-abort/dihapus memakai sourceKey dari DB (bukan input klien).
- [x] V13 API and web service: API inputs/outputs are schema-validated; CORS and rate limits are deliberate — Hanya Server Actions (Origin dicek Next); argumen divalidasi bentuknya di service; rate limit "admin" 60/menit per admin untuk aksi yang mengubah data (fail-open bila Redis mati, disengaja dan dicatat); pencarian calon pemilik sengaja tanpa jatah itu (hanya baca, admin saja, ≤ 20 hasil) agar mengetik tidak menghabiskan jatah perubahan.
- [x] V14 Configuration: secure defaults, security headers, no debug in production, dependencies up to date — Tidak ada konfigurasi atau dependensi baru; seed kini aman secara bawaan (tidak membatalkan keputusan admin).

## Evidence
<!-- Generated by aitk close. -->
- Check: `npm run check` → exit 0 at 2026-10-13T17:10:08Z (33035 ms)
- Acceptance criteria: 7/7 satisfied
- Commits: 00400de, 0177afd, 03d94b3, 0423efd, 0458545, 04e47a2, 0727a63, 0a23305, 0b3dbca, 0d4c16b, 13b3d0b, 15536b5, 1663077, 17c1240, 183aee3, 1add773, 1d787d4, 2170640, 2291c8a, 22b384e, 24e2978, 2653b85, 2725e19, 27bf134, 29f1080, 2a7eff2, 2b68a94, 2b68d11, 2ba4512, 2c2e6a4, 2c5ffeb, 30baa8d, 3107c1b, 316fa62, 327dde2, 37af03d, 38adbac, 3bf60b5, 3c5143a, 3d486ab, 3fd726f, 401b86a, 40c4360, 457220a, 467b44d, 471d15b, 4bff118, 4c397a1, 4d5aa50, 4f751b8, 506e66d, 561f910, 59fa9e0, 5a7d2eb, 5aeb313, 5d46f4b, 5def94f, 5f13bde, 608c247, 60938f4, 60ea826, 6248130, 626d6d6, 642bb4e, 644c4db, 64a8e95, 66ba1d5, 6c02829, 6c7cef8, 70b7906, 724603c, 75c431f, 76c40e2, 76e3600, 798158f, 799df98, 7c5267b, 7d27e01, 7dddfc4, 7e58646, 7fa3c87, 841d6c1, 8492031, 8963fe4, 8e072af, 8fe24a0, 915c9f1, 9558d66, 9835114, 9b2bfc6, 9cd6ff0, 9cee0e6, 9dbbba2, a02a7c0, a1ea496, a384931, a5bd0e9, ab9e083, ae491a6, b189cbc, b2a1115, b2d4c94, b330d22, b6d2610, bdc0360, bdd24f1, be956d7, bec0af8, c0a7685, c1db097, c51c2b5, c540736, c665ce6, c67c26b, c6e50a2, ccfc959, cd5c936, ce6ecb7, cfc55cb, d0e8dd2, d1fa24d, d363c9a, d6d03db, d85299c, d9f240b, dbe1056, dd15a67, ddf64a3, e1ff563, e28eb08, e3d5ef8, e3da62b, e541eb1, e56694e, e594327, e5a4396, f511b61, f7101ee, f8b7660, fbf5494, fe5861e
- Review pass 1 by claude-verify-workflow: 19 findings
- Review pass 2 by claude-verify-workflow: 9 findings
- Review pass 3 by claude-verify-workflow: 4 findings
- Review pass 4 by frontend-expert-design-reviewer: 4 findings
- Review pass 5 by claude-verify-workflow: 0 findings
