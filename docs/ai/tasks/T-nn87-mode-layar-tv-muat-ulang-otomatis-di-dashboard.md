---
id: T-nn87
title: Mode layar TV + muat ulang otomatis di dashboard
status: done
profile: strict
tags:
  - dashboards
  - ui
created: "2026-11-10T01:17:12Z"
updated: "2026-11-10T03:20:19Z"
closed: "2026-11-10T03:20:19Z"
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
      at: "2026-11-10T03:00:48Z"
      findings: 1
    - "n": 2
      by: claude-reviewer-subagent
      at: "2026-11-10T03:00:49Z"
      findings: 3
    - "n": 3
      by: claude-reviewer-subagent
      at: "2026-11-10T03:00:49Z"
      findings: 0
evidence:
  check:
    cmd: npm run check
    exit_code: 0
    duration_ms: 211592
    summary: |-
      …t":"127.0.0.1","port":45375,"step":"membuka folder","code":2,"err":"No such file or directory","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":30,"time":1794280543489,"service":"data-dashboard","datasetId":"t072mwa4b36wds000000","msg":"dataset dihapus"}
      {"level":40,"time":1794280543503,"service":"data-dashboard","host":"127.0.0.1","port":41397,"err":"Unable to start subsystem: sftp","msg":"subsistem SFTP ditolak NAS"}
      {"level":40,"time":1794280543598,"service":"data-dashboard","host":"127.0.0.1","port":35231,"step":"menghapus file uji","code":4,"err":"Failure","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":40,"time":1794280543728,"service":"data-dashboard","host":"127.0.0.1","port":40381,"step":"menulis file uji","code":4,"err":"Failure","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":40,"time":1794280559889,"service":"data-dashboard","err":"Can't reach database server","msg":"sesi shell gagal dibaca"}
      {"level":40,"time":1794280567777,"service":"data-dashboard","check":"B","detail":"koneksi ditolak","msg":"health check gagal"}
      {"level":40,"time":1794280567805,"service":"data-dashboard","check":"Lambat","detail":"Lambat: timeout 20 ms","msg":"health check gagal"}
      {"level":40,"time":1794280567811,"service":"data-dashboard","check":"Y","detail":"mati","msg":"health check gagal"}
      {"level":40,"time":1794280567832,"service":"data-dashboard","check":"Renderer PDF","detail":"renderer tidak menjawab /healthz","msg":"health check gagal"}

       Test Files  242 passed | 1 skipped (243)
            Tests  3246 passed | 10 skipped (3256)
         Start at  03:14:04
         Duration  142.68s (tests 80%, import 17%, transform 3%)

          Isolate  243 workers spawned · ~124ms startup each (spawn + environment, per file)
                   at least ~9.92s faster with isolate: false — reuses workers across files instead of one per file


      > data-dashboard@1.13.0 audit
      > npm audit --audit-level=high --omit=dev && npm audit --audit-level=critical

      found 0 vulnerabilities
      found 0 vulnerabilities
    at: "2026-11-10T03:16:28Z"
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
    at: "2026-11-10T03:16:29Z"
    passed: true
    tree: 5228be907608bd6341b77b8727a172f35bd43331a4014ef2f8730574a5165104
    results:
      - name: osv-scanner (dependencies, offline db)
        exit_code: 0
        summary: |-
          Scanning dir .
          Starting filesystem walk for root: /
          Scanned /home/user/data-dashboard/package-lock.json file and found 837 packages
          End status: 539 dirs visited, 3433 inodes visited, 1 Extract calls, 92.548819ms elapsed, 92.549209ms wall time
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
Dashboard bisa ditampilkan di monitor operasional/gudang: mode layar penuh tanpa menu dan bilah samping, data dimuat ulang otomatis pada interval yang dipilih (mis. 1/5/15 menit), tanpa memuat ulang seluruh halaman.

## Acceptance criteria
- [x] Given dashboard terbuka, when pengguna memilih Mode TV, then tampilan layar penuh tanpa sidebar/header/menu edit, filter aktif tetap berlaku, dan Esc/tombol Keluar kembali ke tampilan biasa
- [x] Given muat ulang otomatis diatur (Mati/1/5/15/30 menit), when interval lewat, then data semua widget diambil ulang tanpa memuat ulang halaman, waktu pembaruan terakhir tampil, dan pengaturan diingat browser
- [x] Given tab tidak terlihat atau koneksi putus, when interval lewat, then pengambilan ulang ditunda sampai tab terlihat lagi dan galat tidak menghapus data terakhir

## Risk
Impact: mode TV + muat ulang otomatis — auto-refresh.tsx (interval di localStorage, tick, penanda gagal), tv-mode.tsx, useWidgetQuery (tick), app-shell (data-shell-chrome) + globals.css, halaman dashboard (?tv=1). Tanpa migrasi; hanya klien.
Security (STRIDE): DoS — interval minimum 1 menit, tab tersembunyi ditunda, query server memakai cache yang sama; Information disclosure — tidak ada data baru, akses tetap dicek per query; Tampering — interval dari localStorage divalidasi terhadap daftar pilihan.
Rollback: revert commit (pilihan di localStorage diabaikan versi lama).
Validation: e2e dashboard-flex T-nn87 (tanpa chrome, jam palsu → refetch, gagal → peringatan + data terakhir, pulih, keluar), dashboard-page-access.test.ts (tv=1), suite e2e per proyek.

## Notes

- 2026-11-10T03:12:55Z e2e dashboard-flex T-nn87: Mode TV tanpa sidebar/header/bilah filter, layar penuh, interval bawaan 5 → 1 menit, jam palsu → semua widget mengambil ulang, /api/query diputus → 'gagal diperbarui' + data terakhir tetap, pulih → 'Diperbarui', keluar → normal + pilihan diingat, Mati lewat menu; dashboard-page-access.test.ts (?tv=1). Tab tersembunyi ditunda (visibilitychange). Bukti: suite e2e per proyek lulus (data-view-a11y AC2 → T-7377, bukan v1.14); review subagen 3 putaran → 0 temuan; aitk check + audit hijau.

## Security checklist (OWASP ASVS 4.0.3)
<!-- Check each item when verified, or write "N/A: <reason>" after the text and check it. -->
- [x] V1 Architecture: trust boundaries and the components handling sensitive data are identified for this change — Hanya perilaku klien; tanpa endpoint baru
- [x] V2 Authentication: credentials are verified server-side; no default, hard-coded, or weak secrets — N/A: tidak disentuh perubahan ini
- [x] V3 Session management: session tokens are random, protected, invalidated on logout and expiry — N/A: tidak disentuh perubahan ini
- [x] V4 Access control: every endpoint/action checks authorization server-side, deny by default (no IDOR) — N/A: tidak disentuh perubahan ini
- [x] V5 Validation, sanitization and encoding: all input validated; output encoded; no injection (SQL, OS, template) — Nilai interval dari localStorage hanya diterima bila termasuk REFRESH_OPTIONS
- [x] V6 Stored cryptography: sensitive data at rest uses approved algorithms; keys are not in the code — N/A: tidak disentuh perubahan ini
- [x] V7 Error handling and logging: errors reveal no internals; security events are logged without secrets — N/A: tidak disentuh perubahan ini
- [x] V8 Data protection: personal/sensitive data is minimized, not cached or logged, and removable — N/A: tidak disentuh perubahan ini
- [x] V9 Communication: TLS for all external traffic; certificates validated — N/A: tidak disentuh perubahan ini
- [x] V10 Malicious code: no backdoors, time bombs, or unexplained network calls; dependencies are trusted — N/A: tidak disentuh perubahan ini
- [x] V11 Business logic: flows cannot be abused (limits, ordering, replay, race conditions) — Muat ulang paling sering tiap 1 menit dan ditunda saat tab tersembunyi; kegagalan tidak menghapus data terakhir dan ditandai
- [x] V12 Files and resources: uploads are type/size limited and stored safely; no path traversal or SSRF — N/A: tidak disentuh perubahan ini
- [x] V13 API and web service: API inputs/outputs are schema-validated; CORS and rate limits are deliberate — N/A: tidak disentuh perubahan ini
- [x] V14 Configuration: secure defaults, security headers, no debug in production, dependencies up to date — N/A: tidak disentuh perubahan ini

## Evidence
<!-- Generated by aitk close. -->
- Check: `npm run check` → exit 0 at 2026-11-10T03:16:28Z (211592 ms)
- Acceptance criteria: 3/3 satisfied
- Commits: 0f62982, 1a1a432, 2dc0d7f, 353960b, 355944b, 99eea5c, a725c7b, b7ddea3, bae5de1, c09567f, d7bc81b, f56c021
- Review pass 1 by claude-reviewer-subagent: 1 findings
- Review pass 2 by claude-reviewer-subagent: 3 findings
- Review pass 3 by claude-reviewer-subagent: 0 findings
