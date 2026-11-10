---
id: T-k6k0
title: 'Ctrl+K cari cepat: dataset, dashboard, panduan'
status: done
profile: strict
tags:
  - ui
created: "2026-11-10T01:17:11Z"
updated: "2026-11-10T03:12:44Z"
closed: "2026-11-10T03:12:44Z"
created_by: claude-code
workers:
  - claude-code
branch: claude/cool-babbage-t5yojt
base: 2dc0d7f261578ed2af821271cec71d047557d62e
paths:
  - CHANGELOG.md
  - content/panduan/01-mengenal-data-dashboard.md
  - content/panduan/06-susun-dashboard.md
  - content/panduan/09-viewer-lihat-filter-ekspor.md
  - docs/runbook-deploy.md
  - playwright.config.ts
  - prisma/migrations/20261110000000_dashboard_views/migration.sql
  - prisma/schema.prisma
  - src/app/(app)/dashboards/[id]/page.tsx
  - src/app/api/dashboards/[id]/views/[viewId]/route.ts
  - src/app/api/dashboards/[id]/views/route.ts
  - src/app/api/search/route.ts
  - src/app/globals.css
  - src/components/dashboards/auto-refresh.tsx
  - src/components/dashboards/bound-config-model.ts
  - src/components/dashboards/dashboard-canvas.tsx
  - src/components/dashboards/dashboard-more-menu.tsx
  - src/components/dashboards/filters/filter-bar.tsx
  - src/components/dashboards/filters/filter-context.tsx
  - src/components/dashboards/filters/filter-model.ts
  - src/components/dashboards/filters/saved-views.tsx
  - src/components/dashboards/tv-mode.tsx
  - src/components/shell/app-shell.tsx
  - src/components/shell/quick-search.tsx
  - src/components/ui/dropdown-menu.tsx
  - src/components/widgets/widget-query.ts
  - src/features/dashboards/actions.ts
  - src/features/dashboards/http.ts
  - src/features/dashboards/service.ts
  - src/features/dashboards/views.ts
  - src/features/datasets/validation.ts
  - src/features/search/service.ts
  - src/features/whats-new/entries.ts
  - tests/components/dashboard-page-access.test.ts
  - tests/e2e/dashboard-flex.spec.ts
  - tests/e2e/guide-roles.spec.ts
  - tests/features/dashboards/duplicate.test.ts
  - tests/features/dashboards/views.test.ts
  - tests/features/search/quick-search.test.ts
review:
  passes:
    - "n": 1
      by: claude-reviewer-subagent
      at: "2026-11-10T03:00:46Z"
      findings: 2
    - "n": 2
      by: claude-reviewer-subagent
      at: "2026-11-10T03:00:47Z"
      findings: 1
    - "n": 3
      by: claude-reviewer-subagent
      at: "2026-11-10T03:00:47Z"
      findings: 0
evidence:
  check:
    cmd: npm run check
    exit_code: 0
    duration_ms: 208044
    summary: |-
      …t":"127.0.0.1","port":42057,"step":"membuka folder","code":2,"err":"No such file or directory","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":40,"time":1794280074151,"service":"data-dashboard","host":"127.0.0.1","port":41303,"err":"Unable to start subsystem: sftp","msg":"subsistem SFTP ditolak NAS"}
      {"level":40,"time":1794280074265,"service":"data-dashboard","host":"127.0.0.1","port":45929,"step":"menghapus file uji","code":4,"err":"Failure","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":40,"time":1794280074392,"service":"data-dashboard","host":"127.0.0.1","port":40265,"step":"menulis file uji","code":4,"err":"Failure","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":30,"time":1794280075152,"service":"data-dashboard","datasetId":"t072mwa411u0ds000000","msg":"dataset dihapus"}
      {"level":40,"time":1794280087961,"service":"data-dashboard","err":"Can't reach database server","msg":"sesi shell gagal dibaca"}
      {"level":40,"time":1794280100899,"service":"data-dashboard","check":"B","detail":"koneksi ditolak","msg":"health check gagal"}
      {"level":40,"time":1794280100921,"service":"data-dashboard","check":"Lambat","detail":"Lambat: timeout 20 ms","msg":"health check gagal"}
      {"level":40,"time":1794280100925,"service":"data-dashboard","check":"Y","detail":"mati","msg":"health check gagal"}
      {"level":40,"time":1794280100939,"service":"data-dashboard","check":"Renderer PDF","detail":"renderer tidak menjawab /healthz","msg":"health check gagal"}

       Test Files  242 passed | 1 skipped (243)
            Tests  3246 passed | 10 skipped (3256)
         Start at  03:06:19
         Duration  142.17s (tests 80%, import 17%, transform 3%)

          Isolate  243 workers spawned · ~124ms startup each (spawn + environment, per file)
                   at least ~9.96s faster with isolate: false — reuses workers across files instead of one per file


      > data-dashboard@1.13.0 audit
      > npm audit --audit-level=high --omit=dev && npm audit --audit-level=critical

      found 0 vulnerabilities
      found 0 vulnerabilities
    at: "2026-11-10T03:08:42Z"
    tree: 5228be907608bd6341b77b8727a172f35bd43331a4014ef2f8730574a5165104
  commits:
    - 0f62982
    - 1a1a432
    - 2dc0d7f
    - 353960b
    - 355944b
    - 99eea5c
    - a725c7b
    - b7ddea3
    - bae5de1
    - c09567f
    - d7bc81b
    - f56c021
  acceptance:
    total: 3
    done: 3
  audit:
    at: "2026-11-10T03:08:51Z"
    passed: true
    tree: 5228be907608bd6341b77b8727a172f35bd43331a4014ef2f8730574a5165104
    results:
      - name: osv-scanner (dependencies, offline db)
        exit_code: 0
        summary: |-
          Scanning dir .
          Starting filesystem walk for root: /
          Scanned /home/user/data-dashboard/package-lock.json file and found 837 packages
          End status: 539 dirs visited, 3432 inodes visited, 1 Extract calls, 82.065146ms elapsed, 82.065446ms wall time
          Loaded npm local db from /root/.cache/osv-scanner/npm/all.zip
          No issues found
      - name: npm audit (prod high, dev critical)
        exit_code: 0
        summary: |-
          > data-dashboard@1.13.0 audit
          > npm audit --audit-level=high --omit=dev && npm audit --audit-level=critical

          found 0 vulnerabilities
          found 0 vulnerabilities
      - name: aitk secret scan (tracked files)
        exit_code: 0
---

## Objective
Pengguna membuka kotak cari cepat dengan Ctrl+K / Cmd+K (atau tombol cari di header) untuk melompat ke dataset, dashboard, atau panduan yang boleh dilihatnya, dengan papan ketik penuh.

## Acceptance criteria
- [x] Given pengguna masuk, when menekan Ctrl+K atau Cmd+K atau tombol Cari di header, then dialog cari terbuka dengan fokus di kotak input dan Esc menutupnya
- [x] Given pengguna mengetik, when hasil tampil, then hanya dataset, dashboard (milik/dibagikan), dan panduan sesuai perannya yang muncul, dikelompokkan, dan bisa dipilih dengan panah atas/bawah + Enter
- [x] Given pembaca layar, when dialog dibuka dan hasil berubah, then peran combobox/listbox benar dan jumlah hasil diumumkan

## Risk
Impact: cari cepat — GET /api/search (src/app/api/search/route.ts), service quickSearch (src/features/search/service.ts), dialog combobox di app-shell (src/components/shell/quick-search.tsx). Tanpa migrasi, hanya baca.
Security (STRIDE): Information disclosure — dataset milik user saja; dashboard dengan aturan yang sama dengan halaman Dashboard (milik, share langsung, share organisasi dari pemilik aktif); panduan lewat guideRolesFor/searchGuides sesuai peran; wildcard LIKE di-escape; respons no-store; Spoofing — requireUser (401 tanpa sesi).
Rollback: revert commit (tanpa data).
Validation: tests/features/search/quick-search.test.ts, e2e dashboard-flex T-k6k0 (combobox, Enter, Esc), axe tanpa pelanggaran serius di halaman berkepala (backup/period/pivot e2e).

## Notes

- 2026-11-10T03:05:07Z tests/features/search/quick-search.test.ts (akses dataset/dashboard/panduan, escape LIKE, kosong = terbaru); e2e dashboard-flex T-k6k0 (Ctrl+K, combobox fokus, Enter membuka, Esc menutup, status jumlah hasil aria-live). Bukti: e2e dashboard-flex 4/4 + suite per proyek lulus (e2e 85, widgets 27, sharing 39, filters 10, backup 7, pivot 11, pivot-lanjutan 8, period-*; Firefox/WebKit/pdf tidak tersedia di VM; data-view-a11y AC2 gagal juga tanpa v1.14 → T-7377). Review subagen 3 putaran → 0 temuan. aitk check + audit hijau.

## Security checklist (OWASP ASVS 4.0.3)
<!-- Check each item when verified, or write "N/A: <reason>" after the text and check it. -->
- [x] V1 Architecture: trust boundaries and the components handling sensitive data are identified for this change — Route baca baru di balik sesi yang sama; tanpa rahasia
- [x] V2 Authentication: credentials are verified server-side; no default, hard-coded, or weak secrets — N/A: tidak disentuh perubahan ini
- [x] V3 Session management: session tokens are random, protected, invalidated on logout and expiry — N/A: tidak disentuh perubahan ini
- [x] V4 Access control: every endpoint/action checks authorization server-side, deny by default (no IDOR) — Saringan akses di query (ownerId, aturan lihat dashboard yang sama dengan daftar, peran panduan); tidak ada id dari klien
- [x] V5 Validation, sanitization and encoding: all input validated; output encoded; no injection (SQL, OS, template) — Kata kunci lewat searchQuery (≤ 100, dibersihkan) + escapeLike; Prisma berparameter
- [x] V6 Stored cryptography: sensitive data at rest uses approved algorithms; keys are not in the code — N/A: tidak disentuh perubahan ini
- [x] V7 Error handling and logging: errors reveal no internals; security events are logged without secrets — Galat → 503 umum, detail hanya di log
- [x] V8 Data protection: personal/sensitive data is minimized, not cached or logged, and removable — N/A: tidak disentuh perubahan ini
- [x] V9 Communication: TLS for all external traffic; certificates validated — N/A: tidak disentuh perubahan ini
- [x] V10 Malicious code: no backdoors, time bombs, or unexplained network calls; dependencies are trusted — N/A: tidak disentuh perubahan ini
- [x] V11 Business logic: flows cannot be abused (limits, ordering, replay, race conditions) — N/A: tidak disentuh perubahan ini
- [x] V12 Files and resources: uploads are type/size limited and stored safely; no path traversal or SSRF — N/A: tidak disentuh perubahan ini
- [x] V13 API and web service: API inputs/outputs are schema-validated; CORS and rate limits are deliberate — GET ber-sesi, no-store; tanpa mutasi
- [x] V14 Configuration: secure defaults, security headers, no debug in production, dependencies up to date — N/A: tidak disentuh perubahan ini

## Evidence
<!-- Generated by aitk close. -->
- Check: `npm run check` → exit 0 at 2026-11-10T03:08:42Z (208044 ms)
- Acceptance criteria: 3/3 satisfied
- Commits: 0f62982, 1a1a432, 2dc0d7f, 353960b, 355944b, 99eea5c, a725c7b, b7ddea3, bae5de1, c09567f, d7bc81b, f56c021
- Review pass 1 by claude-reviewer-subagent: 2 findings
- Review pass 2 by claude-reviewer-subagent: 1 findings
- Review pass 3 by claude-reviewer-subagent: 0 findings
