---
id: T-003
title: CRUD profil dataset dan model versi
status: done
profile: strict
profile_pinned: true
goal: G-2
tags:
  - security
depends_on:
  - T-002
  - T-025
created: "2026-10-11T14:45:08Z"
updated: "2026-10-12T01:11:33Z"
closed: "2026-10-12T01:11:33Z"
created_by: claude-code
workers:
  - claude-code
branch: worktree-t-001-scaffold
base: 66ba1d540b833c62b2ba8641dd7196ab53ff8fbb
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
  - prisma/migrations/migration_lock.toml
  - prisma/schema.prisma
  - prisma/seed.ts
  - public/brand/mark-dark.png
  - public/brand/mark.png
  - public/brand/pcp-logo-dark.png
  - public/brand/pcp-logo.png
  - scripts/dev-dataset-fixture.mjs
  - scripts/dev-expire-reset.mjs
  - scripts/dev-make-admin.mjs
  - scripts/dev-reset-ratelimit.mjs
  - scripts/gen-dev-env.mjs
  - scripts/perf.mjs
  - scripts/smoke-prod-headers.mjs
  - scripts/storage-init.mjs
  - src/app/(app)/admin/page.tsx
  - src/app/(app)/akun/keamanan/page.tsx
  - src/app/(app)/akun/page.tsx
  - src/app/(app)/dashboards/page.tsx
  - src/app/(app)/datasets/[id]/page.tsx
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
  - src/app/api/health/route.ts
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
  - src/components/datasets/dataset-form.tsx
  - src/components/datasets/dataset-list.tsx
  - src/components/datasets/delete-dataset.tsx
  - src/components/datasets/status-badge.tsx
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
  - src/features/datasets/actions.ts
  - src/features/datasets/label.ts
  - src/features/datasets/service.ts
  - src/features/datasets/validation.ts
  - src/instrumentation.ts
  - src/lib/db.ts
  - src/lib/env.ts
  - src/lib/health/checks.ts
  - src/lib/health/index.ts
  - src/lib/hooks/use-persisted-boolean.ts
  - src/lib/logger.ts
  - src/lib/mail.ts
  - src/lib/queue/versions.ts
  - src/lib/redis.ts
  - src/lib/security-headers.ts
  - src/lib/storage/objects.ts
  - src/lib/storage/s3.ts
  - src/lib/utils.ts
  - src/proxy.ts
  - src/styles/tokens.css
  - tests/e2e/auth.spec.ts
  - tests/e2e/datasets.spec.ts
  - tests/e2e/global-setup.ts
  - tests/e2e/health.spec.ts
  - tests/e2e/helpers.ts
  - tests/e2e/password.spec.ts
  - tests/e2e/security-headers.spec.ts
  - tests/e2e/shell.spec.ts
  - tests/e2e/zz-rate-limit.spec.ts
  - tests/features/auth/core.test.ts
  - tests/features/auth/rate-limit.test.ts
  - tests/features/datasets/create.test.ts
  - tests/features/datasets/delete.test.ts
  - tests/features/datasets/label.test.ts
  - tests/lib/env.test.ts
  - tests/lib/health.test.ts
  - tests/lib/security-headers.test.ts
  - tests/lib/seed.test.ts
  - tests/stubs/server-only.ts
  - tsconfig.json
  - vitest.config.mts
review:
  passes:
    - "n": 1
      by: claude-security-reviewer-subagen
      at: "2026-10-11T23:56:00Z"
      findings: 2
    - "n": 2
      by: claude-security-reviewer-subagen
      at: "2026-10-11T23:58:30Z"
      findings: 0
    - "n": 3
      by: frontend-expert-design-reviewer
      at: "2026-10-11T23:58:30Z"
      findings: 11
    - "n": 4
      by: frontend-expert-design-reviewer
      at: "2026-10-12T01:08:55Z"
      findings: 2
    - "n": 5
      by: frontend-expert-design-reviewer
      at: "2026-10-12T01:10:52Z"
      findings: 0
evidence:
  check:
    cmd: npm run check
    exit_code: 0
    duration_ms: 6857
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

      {"level":40,"time":1791767467827,"service":"data-dashboard","check":"B","detail":"koneksi ditolak","msg":"health check gagal"}
      {"level":40,"time":1791767467848,"service":"data-dashboard","check":"Lambat","detail":"Lambat: timeout 20 ms","msg":"health check gagal"}

       Test Files  9 passed (9)
            Tests  63 passed (63)
         Start at  08:11:07
         Duration  567ms (tests 38%, transform 30%, import 30%, worker 2%)


      > data-dashboard@0.1.0 audit
      > npm audit --audit-level=high --omit=dev && npm audit --audit-level=critical

      found 0 vulnerabilities
      found 0 vulnerabilities
    at: "2026-10-12T01:11:09Z"
    tree: c6f1b73b2b9593e4a91b6efa8d3d78dca9438f2b933e8e7e7ad4500256c46e0e
  commits:
    - 0423efd
    - 15536b5
    - 22b384e
    - 2653b85
    - 27bf134
    - 29f1080
    - 2b68a94
    - 2c5ffeb
    - 401b86a
    - 457220a
    - 471d15b
    - 4bff118
    - 4d5aa50
    - 5d46f4b
    - 60ea826
    - 64a8e95
    - 66ba1d5
    - 6c7cef8
    - 7c5267b
    - 9558d66
    - "9835114"
    - 9b2bfc6
    - 9cd6ff0
    - 9cee0e6
    - ab9e083
    - bec0af8
    - c0a7685
    - c51c2b5
    - d9f240b
    - dbe1056
    - e1ff563
    - e56694e
    - e594327
    - f511b61
    - fbf5494
    - fe5861e
  acceptance:
    total: 5
    done: 5
  audit:
    at: "2026-10-12T01:11:24Z"
    passed: true
    tree: c6f1b73b2b9593e4a91b6efa8d3d78dca9438f2b933e8e7e7ad4500256c46e0e
    results:
      - name: osv-scanner (dependencies, offline db)
        exit_code: 0
        summary: |-
          Scanning dir .
          Starting filesystem walk for root: /
          Scanned /Users/anasfikri/Documents/Projects/pcpexpress/data-dashboard/.claude/worktrees/t-001-scaffold/package-lock.json file and found 604 packages
          End status: 77 dirs visited, 292 inodes visited, 1 Extract calls, 41.165292ms elapsed, 41.166ms wall time
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
Model Dataset {name, description, ownerId, activeVersionId?} dan DatasetVersion {status: UPLOADING|UPLOADED|INGESTING|AWAITING_MAPPING|READY|FAILED, mode: REPLACE|APPEND, sourceKey, etag, sha256?, errorMessage?, ingestFinishedAt?}. Label profil diturunkan (kosong/siap + badge versi terbaru), bukan kolom (B5). Daftar hanya milik user atau yang dibagikan. Hapus = konfirmasi dua langkah; memanggil hook storage.deleteDatasetObjects (diimplementasikan penuh di T-004) dan queue.cancelVersionJobs.

## Acceptance criteria
- [x] Given user login, when membuat profil dataset dengan nama unik per pemilik, then profil muncul di daftar dengan label kosong
- [x] Given profil milik user lain yang tidak dibagikan, when user membuka URL-nya langsung atau memanggil Server Action-nya, then halaman 404 / code NOT_FOUND dan tidak ada perubahan
- [x] Given profil dengan versi READY aktif dan versi terbaru FAILED, when membuka daftar, then label siap dengan badge gagal beserta pesan
- [x] Given profil dataset, when user menghapus dengan konfirmasi dua langkah, then profil, versi, dan dashboard terkait hilang dan hook penghapusan storage serta pembatalan job terpanggil (diverifikasi test)
- [x] Given halaman/komponen task ini selesai, when /frontend-expert:audit dijalankan (anti-slop-design, responsive 320/768/1024/1440, accessibility), then tidak ada temuan Critical/High dan blok Conventions check (Tokens: preset project; Icons: waiver @tabler/icons-react; States loading/empty/error; Responsive; A11y) dicatat sebagai note task

## Risk
Risk level: MEDIUM-HIGH (model data inti + hapus kaskade: salah filter = kebocoran/kehilangan data antar user)
Impact surface: prisma (Dataset, DatasetVersion, Dashboard minimal untuk kaskade; enum status/mode), src/features/datasets/* (service, label, actions), src/lib/storage/objects.ts (hapus per prefix), src/lib/queue/versions.ts (pembatalan job, stub sampai BullMQ di T-006), halaman /datasets, /datasets/baru, /datasets/[id].
Security (STRIDE): Elevation/IDOR — setiap baca/ubah/hapus memakai where {id, ownerId: user.id}; tidak ada → NOT_FOUND/404 (D2), tidak membedakan 'tidak ada' dan 'bukan milik'. Tampering — hapus dua langkah dengan konfirmasi nama yang dicek server; input nama 1–80, deskripsi ≤ 500, di-trim. DoS — batas 50 dataset per user (LIMIT_REACHED). Information disclosure — label/badge hanya untuk pemilik; pesan error versi ditampilkan apa adanya ke pemilik (berasal dari worker, bukan input user lain).
Compatibility: Dashboard minimal (id, datasetId, name, layout) dibuat sekarang agar kaskade hapus teruji; T-010 menambah kolom. Status versi sesuai B5 (enum English, label UI Indonesia). activeVersionId relasi SetNull.
Failure modes/edge cases: nama duplikat per pemilik (case-insensitive, pakai nameKey) → NAME_TAKEN; hapus saat storage error → transaksi DB tetap jalan? Urutan: batalkan job → hapus DB (kaskade) → hapus objek storage best-effort dengan log (objek yatim dibersihkan job T-013/T-023); prefix storage selalu diakhiri '/'; id cuid validasi bentuk sebelum query.
Rollback: revert commit + migrasi drop tabel (belum ada data produksi).
Validation: unit deriveLabel (semua status), validasi input, deleteDataset memanggil hook storage + queue (deps diinjeksi); e2e: buat → daftar label kosong; nama duplikat ditolak; user lain → 404 halaman + NOT_FOUND action (replay); versi READY aktif + FAILED terbaru (skrip seed dev) → 'Siap' + badge gagal + pesan; hapus dua langkah → hilang dari daftar, versi/dashboard terhapus; batas 50; audit desain frontend-expert.
Open risks/assumptions: berbagi (T-016) belum ada → daftar hanya milik sendiri.

## Notes
- 2026-10-11T14:49:25Z UI wajib lewat rantai frontend-expert: design-foundations → tokens (preset dari T-025) → (+forms/data-fetching/app-shell sesuai kebutuhan) → components → anti-slop-code → responsive → motion ringan → anti-slop-design → polish → accessibility. Skip design-direction karena arah sudah dipilih di T-025, kecuali layar baru yang ambigu. Chart via skill dataviz; filter/select pakai Select kustom dari T-025, bukan native.
- 2026-10-11T14:56:59Z Hapus prefix storage selalu dengan '/' penutup (parquet/<datasetId>/) agar cuid berawalan sama tidak ikut terhapus. Batas 50 dataset per user (code LIMIT_REACHED).
- 2026-10-12T01:10:59Z Conventions check (audit frontend-expert pass 5, commit 29f1080: 0 Critical/High/Medium/Low). Tokens: preset project T-025 (zinc-blue, success/destructive/warning/primary tints, tanpa warna hardcode). Icons: waiver @tabler/icons-react (IconPlus, IconCircleCheck, IconCircleDashed, IconAlertTriangle, IconLoader2, IconUpload, IconRoute, IconFileSpreadsheet, IconTrash, IconChevronRight, IconLayoutDashboard), outline, size 20/stroke 1.5 default. States: loading (pending tombol form + dialog), empty (EmptyState daftar/beranda/kartu Data), error (FormAlert field + alert unggahan gagal dengan nama file + langkah), success (FocusNotice dibuat/dihapus menerima fokus). Responsive: 320/768/1024/1440 tanpa overflow, daftar @container (tabel @3xl, kartu di bawahnya), CTA w-full di ponsel. A11y: axe 0 pelanggaran di 34 pemeriksaan terang/gelap, ul>li>a dengan label sr-only, satu h1, fokus dialog ke input konfirmasi. Sisa kosmetik (bukan temuan): ruang bawah 20px di kartu Beranda, rapikan saat menyentuh Beranda lagi.

## Security checklist (OWASP ASVS 4.0.3)
<!-- Check each item when verified, or write "N/A: <reason>" after the text and check it. -->
- [x] V1 Architecture: trust boundaries and the components handling sensitive data are identified for this change — diverifikasi: batas kepercayaan = Server Action/halaman → service (ownerId dari sesi, bukan input); storage dan antrean dipanggil hanya dari service
- [x] V2 Authentication: credentials are verified server-side; no default, hard-coded, or weak secrets — N/A: tidak mengubah autentikasi; semua rute dataset di balik requireUser
- [x] V3 Session management: session tokens are random, protected, invalidated on logout and expiry — N/A: tidak mengubah sesi; memakai requireUser dengan cek sessionVersion
- [x] V4 Access control: every endpoint/action checks authorization server-side, deny by default (no IDOR) — diverifikasi: setiap baca/ubah/hapus where {id, ownerId}; user lain → 404 halaman dan NOT_FOUND action (e2e replay IDOR)
- [x] V5 Validation, sanitization and encoding: all input validated; output encoded; no injection (SQL, OS, template) — diverifikasi: nama 1–80, deskripsi ≤ 500, tolak karakter kontrol/format; bentuk id divalidasi sebelum query; query Prisma terparameter (advisory lock via tagged template); output di-escape React
- [x] V6 Stored cryptography: sensitive data at rest uses approved algorithms; keys are not in the code — N/A: tidak ada data kriptografis tersimpan baru
- [x] V7 Error handling and logging: errors reveal no internals; security events are logged without secrets — diverifikasi: P2028 → BUSY, unique → NAME_TAKEN, tanpa stack ke klien; log hanya datasetId; error storage dicatat tanpa kredensial
- [x] V8 Data protection: personal/sensitive data is minimized, not cached or logged, and removable — diverifikasi: hapus dataset menghapus versi, dashboard, dan objek storage; prefix gagal dicatat ke StorageCleanup untuk dibersihkan ulang
- [x] V9 Communication: TLS for all external traffic; certificates validated — N/A: tidak ada lalu lintas eksternal baru (storage internal, TLS produksi diatur T-023)
- [x] V10 Malicious code: no backdoors, time bombs, or unexplained network calls; dependencies are trusted — diverifikasi: tanpa dependency baru; npm audit dan aitk audit hijau
- [x] V11 Business logic: flows cannot be abused (limits, ordering, replay, race conditions) — diverifikasi: batas 50 dataset di bawah pg_advisory_xact_lock per pemilik (e2e 5 replay paralel → tetap 50); hapus wajib konfirmasi nama dicek server; urutan batal job → hapus DB → hapus storage (unit)
- [x] V12 Files and resources: uploads are type/size limited and stored safely; no path traversal or SSRF — N/A: belum ada upload (T-004); prefix storage selalu berakhiran '/' agar cuid berawalan sama tidak ikut terhapus
- [x] V13 API and web service: API inputs/outputs are schema-validated; CORS and rate limits are deliberate — diverifikasi: Server Action memvalidasi input di server; Origin asing ditolak Next (e2e T-027); tidak ada API publik baru
- [x] V14 Configuration: secure defaults, security headers, no debug in production, dependencies up to date — diverifikasi: tanpa konfigurasi debug baru; skrip fixture dev menolak NODE_ENV=production

## Evidence
<!-- Generated by aitk close. -->
- Check: `npm run check` → exit 0 at 2026-10-12T01:11:09Z (6857 ms)
- Acceptance criteria: 5/5 satisfied
- Commits: 0423efd, 15536b5, 22b384e, 2653b85, 27bf134, 29f1080, 2b68a94, 2c5ffeb, 401b86a, 457220a, 471d15b, 4bff118, 4d5aa50, 5d46f4b, 60ea826, 64a8e95, 66ba1d5, 6c7cef8, 7c5267b, 9558d66, 9835114, 9b2bfc6, 9cd6ff0, 9cee0e6, ab9e083, bec0af8, c0a7685, c51c2b5, d9f240b, dbe1056, e1ff563, e56694e, e594327, f511b61, fbf5494, fe5861e
- Review pass 1 by claude-security-reviewer-subagen: 2 findings
- Review pass 2 by claude-security-reviewer-subagen: 0 findings
- Review pass 3 by frontend-expert-design-reviewer: 11 findings
- Review pass 4 by frontend-expert-design-reviewer: 2 findings
- Review pass 5 by frontend-expert-design-reviewer: 0 findings
