---
id: T-025
title: 'Fondasi UI via frontend-expert: arah desain, token preset, app shell, tema'
status: done
profile: strict
goal: G-2
depends_on:
  - T-001
created: "2026-10-11T14:49:24Z"
updated: "2026-10-11T16:26:46Z"
closed: "2026-10-11T16:26:46Z"
created_by: claude-code
workers:
  - claude-code
branch: worktree-t-001-scaffold
base: e1ff563fd1ec741570e77bee00b65ce59d049f41
paths:
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
  - prisma/migrations/migration_lock.toml
  - prisma/schema.prisma
  - prisma/seed.ts
  - public/brand/mark-dark.png
  - public/brand/mark.png
  - public/brand/pcp-logo-dark.png
  - public/brand/pcp-logo.png
  - scripts/gen-dev-env.mjs
  - scripts/perf.mjs
  - scripts/storage-init.mjs
  - src/app/(app)/admin/page.tsx
  - src/app/(app)/dashboards/page.tsx
  - src/app/(app)/datasets/page.tsx
  - src/app/(app)/layout.tsx
  - src/app/(app)/page.tsx
  - src/app/(app)/panduan/page.tsx
  - src/app/api/health/route.ts
  - src/app/favicon.ico
  - src/app/globals.css
  - src/app/health/page.tsx
  - src/app/layout.tsx
  - src/app/not-found.tsx
  - src/app/page.tsx
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
  - src/components/ui/input.tsx
  - src/components/ui/page-header.tsx
  - src/components/ui/select.tsx
  - src/features/auth/session.ts
  - src/instrumentation.ts
  - src/lib/db.ts
  - src/lib/env.ts
  - src/lib/health/checks.ts
  - src/lib/health/index.ts
  - src/lib/hooks/use-persisted-boolean.ts
  - src/lib/logger.ts
  - src/lib/mail.ts
  - src/lib/redis.ts
  - src/lib/storage/s3.ts
  - src/lib/utils.ts
  - src/styles/tokens.css
  - tests/e2e/health.spec.ts
  - tests/e2e/shell.spec.ts
  - tests/lib/env.test.ts
  - tests/lib/health.test.ts
  - tests/lib/seed.test.ts
  - tsconfig.json
  - vitest.config.mts
review:
  passes:
    - "n": 1
      by: claude-code
      at: "2026-10-11T16:19:44Z"
      findings: 19
    - "n": 2
      by: frontend-expert-design-reviewer
      at: "2026-10-11T16:25:12Z"
      findings: 3
    - "n": 3
      by: claude-code
      at: "2026-10-11T16:25:36Z"
      findings: 0
evidence:
  check:
    cmd: npm run check
    exit_code: 0
    duration_ms: 6047
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

      {"level":40,"time":1791735968969,"service":"data-dashboard","check":"B","detail":"koneksi ditolak","msg":"health check gagal"}
      {"level":40,"time":1791735968991,"service":"data-dashboard","check":"Lambat","detail":"Lambat: timeout 20 ms","msg":"health check gagal"}

       Test Files  3 passed (3)
            Tests  20 passed (20)
         Start at  23:26:08
         Duration  320ms (import 59%, transform 25%, tests 13%, worker 2%)


      > data-dashboard@0.1.0 audit
      > npm audit --audit-level=high --omit=dev && npm audit --audit-level=critical

      found 0 vulnerabilities
      found 0 vulnerabilities
    at: "2026-10-11T16:26:10Z"
    tree: 3610bbad5c987d5399947d0c979412416392267d22375b1f5e08e9e7039c99a7
  commits:
    - 0423efd
    - 15536b5
    - "9835114"
    - 9b2bfc6
    - 9cd6ff0
    - bec0af8
    - dbe1056
    - e1ff563
    - e56694e
    - e594327
    - f511b61
  acceptance:
    total: 5
    done: 5
  audit:
    at: "2026-10-11T16:26:27Z"
    passed: true
    tree: 3610bbad5c987d5399947d0c979412416392267d22375b1f5e08e9e7039c99a7
    results:
      - name: osv-scanner (dependencies, offline db)
        exit_code: 0
        summary: |-
          Scanning dir .
          Starting filesystem walk for root: /
          Scanned /Users/anasfikri/Documents/Projects/pcpexpress/data-dashboard/.claude/worktrees/t-001-scaffold/package-lock.json file and found 588 packages
          End status: 50 dirs visited, 187 inodes visited, 1 Extract calls, 43.099209ms elapsed, 43.1ms wall time
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
Jalankan rantai plugin frontend-expert untuk blank canvas: design-direction (tawarkan 2–3 arah ke user: hierarki/densitas/ekspresi untuk dashboard data internal; maks 2 pertanyaan) → design-foundations → tokens (decision tree; preset non-ungu, mis. zinc-blue/slate-cyan/stone-emerald, skor dicatat) → design-typography → app-shell (logo PCP Express, nama brand, utilities: bantuan + tema di topbar sebagai ikon, avatar → menu akun; sidebar collapse ≥768, drawer + backdrop <768; nav ≤7 item: Beranda, Dataset, Dashboard, Panduan, Admin) → responsive → accessibility. Icons: @tabler/icons-react sebagai waiver resmi atas default Reicon (kebijakan project). Hasil: tailwind.config + CSS custom properties dari preset terpilih, komponen shell (AppShell, Topbar, Sidebar, AccountMenu, ThemeToggle, EmptyState, PageHeader, Select kustom), halaman 404/403, docs/ai/design-system.md berisi arah terpilih, preset + skor, blok Conventions check, dan daftar waiver.

## Acceptance criteria
- [x] Given T-001 selesai, when design-direction dijalankan, then 2–3 arah dengan tradeoff dicatat di docs/ai/design-system.md dan satu arah dipilih user sebelum komponen dibuat
- [x] Given preset token terpilih, when komponen shell dibangun, then tidak ada hex mentah di komponen (grep lolos), warna/spasi/radius dari CSS custom properties, dan skor preset tercatat
- [x] Given app shell, when dicek pada lebar 320/768/1024/1440, then tidak ada scroll horizontal, sidebar menjadi drawer + backdrop di <768, tema sebagai ikon di topbar, avatar membuka menu akun, dan CTA utama full-width di <768
- [x] Given semua ikon shell, when diaudit, then semuanya dari @tabler/icons-react size 20 stroke 1.5, tidak ada Reicon/Lucide, dan waiver Icons tercatat di Conventions check
- [x] Given /frontend-expert:audit atas shell dan halaman 404, when dijalankan, then tidak ada temuan Critical/High dan blok Conventions check lengkap tersimpan di docs/ai/design-system.md

## Risk
Risk level: LOW–MEDIUM (fondasi visual dipakai semua task UI; tidak menyentuh data/auth)
Impact surface: src/styles/tokens.css, src/app/globals.css, src/components/ui/*, src/components/shell/*, src/app/layout.tsx, src/app/(app)/*, not-found, dependency radix-ui/next-themes/@tabler/icons-react.
Security (STRIDE): tidak ada endpoint/aksi tulis baru; getSessionUser() stub mengembalikan null (tidak ada klaim identitas palsu); nav Admin hanya tampil bila isAdmin tetapi otorisasi nyata di server (T-002/T-019); localStorage hanya preferensi UI; tidak ada HTML mentah.
Compatibility: Tailwind 4 (@theme inline, @custom-variant dark); React 19.3 aturan react-hooks baru (tanpa setState-dalam-effect → useSyncExternalStore); Next 16 Image untuk logo PNG.
Failure modes/edge cases: localStorage tidak tersedia (fallback default); hidrasi tema (suppressHydrationWarning di <html>); drawer terbuka saat layar melebar (ditutup via matchMedia); tanpa sesi (tombol Masuk); 404.
Rollback: revert commit T-025; tidak ada migrasi.
Validation: npm run check; e2e tests/e2e/shell.spec.ts (320/768/1024/1440, drawer+backdrop, CTA full-width, collapse persist, tema, 404); grep hex mentah; audit design-reviewer plugin.
Open risks/assumptions: pemilihan arah desain dilakukan AI atas delegasi user (dicatat di design-system.md §1); logo wordmark dipotong untuk mode ciut.

## Notes
- 2026-10-11T16:22:54Z Bukti: docs/ai/design-system.md (3 arah, Token score zinc-blue 24/24, Conventions check, waiver Tabler); arah dipilih AI atas delegasi user 2026-10-11. grep hex mentah di src/components+src/app = 0; ikon lucide/reicon = 0. e2e tests/e2e/shell.spec.ts 10/10 (320/768/1024/1440 tanpa scroll horizontal, drawer+backdrop <768, CTA full-width, collapse persist, tema di topbar, 404). Audit design-reviewer plugin: 0 Critical, 3 High, 7 Medium, 9 Low → semua diperbaiki (commit 0423efd); verifikasi ulang reviewer menyusul.
- 2026-10-11T16:25:36Z Verifikasi ulang design-reviewer: 18/19 OK, axe 0 pelanggaran di 6 keadaan; residual R-1 avatar (bg-primary text-primary-foreground), R-2 grid lg, R-3 favicon.ico dihapus → diperbaiki commit berikutnya. verdict akhir sebelum residual: Critical 0, High 0.

## Security checklist (OWASP ASVS 4.0.3)
<!-- Check each item when verified, or write "N/A: <reason>" after the text and check it. -->
- [x] V1 Architecture: trust boundaries and the components handling sensitive data are identified for this change — diverifikasi: hanya UI klien + stub getSessionUser() null; tidak ada data sensitif baru
- [x] V2 Authentication: credentials are verified server-side; no default, hard-coded, or weak secrets — N/A: tidak ada autentikasi (T-002)
- [x] V3 Session management: session tokens are random, protected, invalidated on logout and expiry — N/A: tidak ada sesi (T-002)
- [x] V4 Access control: every endpoint/action checks authorization server-side, deny by default (no IDOR) — diverifikasi: nav Admin hanya tampilan; otorisasi server di T-002/T-019; tidak ada endpoint baru
- [x] V5 Validation, sanitization and encoding: all input validated; output encoded; no injection (SQL, OS, template) — diverifikasi: tidak ada input pengguna yang diproses; tidak ada HTML mentah (tanpa dangerouslySetInnerHTML kecuali next-themes bawaan)
- [x] V6 Stored cryptography: sensitive data at rest uses approved algorithms; keys are not in the code — N/A: tidak ada data tersimpan selain preferensi UI di localStorage
- [x] V7 Error handling and logging: errors reveal no internals; security events are logged without secrets — diverifikasi: console.warn hanya dev; tidak ada log data pengguna
- [x] V8 Data protection: personal/sensitive data is minimized, not cached or logged, and removable — diverifikasi: tidak ada PII
- [x] V9 Communication: TLS for all external traffic; certificates validated — N/A: transport di T-027/T-023
- [x] V10 Malicious code: no backdoors, time bombs, or unexplained network calls; dependencies are trusted — diverifikasi: radix-ui, next-themes, @tabler/icons-react, clsx, tailwind-merge, cva dipin di lockfile; npm audit 0
- [x] V11 Business logic: flows cannot be abused (limits, ordering, replay, race conditions) — N/A: tidak ada alur bisnis
- [x] V12 Files and resources: uploads are type/size limited and stored safely; no path traversal or SSRF — N/A: tidak ada upload; aset logo statis dari repo
- [x] V13 API and web service: API inputs/outputs are schema-validated; CORS and rate limits are deliberate — N/A: tidak ada API baru
- [x] V14 Configuration: secure defaults, security headers, no debug in production, dependencies up to date — diverifikasi: devIndicators off hanya memengaruhi dev; tidak ada konfigurasi keamanan yang dilemahkan

## Evidence
<!-- Generated by aitk close. -->
- Check: `npm run check` → exit 0 at 2026-10-11T16:26:10Z (6047 ms)
- Acceptance criteria: 5/5 satisfied
- Commits: 0423efd, 15536b5, 9835114, 9b2bfc6, 9cd6ff0, bec0af8, dbe1056, e1ff563, e56694e, e594327, f511b61
- Review pass 1 by claude-code: 19 findings
- Review pass 2 by frontend-expert-design-reviewer: 3 findings
- Review pass 3 by claude-code: 0 findings
