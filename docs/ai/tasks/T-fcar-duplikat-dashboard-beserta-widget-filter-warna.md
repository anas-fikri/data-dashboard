---
id: T-fcar
title: Duplikat dashboard (beserta widget, filter, warna)
status: done
profile: strict
tags:
  - dashboards
created: "2026-11-10T01:17:10Z"
updated: "2026-11-10T03:04:56Z"
closed: "2026-11-10T03:04:56Z"
created_by: claude-code
workers:
  - claude-code
branch: claude/cool-babbage-t5yojt
base: 9ca8a2a2e934ddf919c38e97484957f7a84f7b2e
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
      at: "2026-11-10T03:00:44Z"
      findings: 0
    - "n": 2
      by: claude-reviewer-subagent
      at: "2026-11-10T03:00:45Z"
      findings: 0
evidence:
  check:
    cmd: npm run check
    exit_code: 0
    duration_ms: 203025
    summary: |-
      …t":"127.0.0.1","port":42763,"step":"membuka folder","code":2,"err":"No such file or directory","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":40,"time":1794279498438,"service":"data-dashboard","host":"127.0.0.1","port":34047,"err":"Unable to start subsystem: sftp","msg":"subsistem SFTP ditolak NAS"}
      {"level":40,"time":1794279498547,"service":"data-dashboard","host":"127.0.0.1","port":36953,"step":"menghapus file uji","code":4,"err":"Failure","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":40,"time":1794279498658,"service":"data-dashboard","host":"127.0.0.1","port":41521,"step":"menulis file uji","code":4,"err":"Failure","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":30,"time":1794279499929,"service":"data-dashboard","datasetId":"t072mwa3oq13ds000000","msg":"dataset dihapus"}
      {"level":40,"time":1794279514001,"service":"data-dashboard","err":"Can't reach database server","msg":"sesi shell gagal dibaca"}
      {"level":40,"time":1794279520255,"service":"data-dashboard","check":"B","detail":"koneksi ditolak","msg":"health check gagal"}
      {"level":40,"time":1794279520277,"service":"data-dashboard","check":"Lambat","detail":"Lambat: timeout 20 ms","msg":"health check gagal"}
      {"level":40,"time":1794279520282,"service":"data-dashboard","check":"Y","detail":"mati","msg":"health check gagal"}
      {"level":40,"time":1794279520297,"service":"data-dashboard","check":"Renderer PDF","detail":"renderer tidak menjawab /healthz","msg":"health check gagal"}

       Test Files  242 passed | 1 skipped (243)
            Tests  3246 passed | 10 skipped (3256)
         Start at  02:56:46
         Duration  134.12s (tests 80%, import 17%, transform 3%)

          Isolate  243 workers spawned · ~118ms startup each (spawn + environment, per file)
                   at least ~9.40s faster with isolate: false — reuses workers across files instead of one per file


      > data-dashboard@1.13.0 audit
      > npm audit --audit-level=high --omit=dev && npm audit --audit-level=critical

      found 0 vulnerabilities
      found 0 vulnerabilities
    at: "2026-11-10T02:59:01Z"
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
    at: "2026-11-10T03:00:59Z"
    passed: true
    tree: 5228be907608bd6341b77b8727a172f35bd43331a4014ef2f8730574a5165104
    results:
      - name: osv-scanner (dependencies, offline db)
        exit_code: 0
        summary: |-
          Scanning dir .
          Starting filesystem walk for root: /
          Scanned /home/user/data-dashboard/package-lock.json file and found 837 packages
          End status: 539 dirs visited, 3431 inodes visited, 1 Extract calls, 90.365837ms elapsed, 90.366102ms wall time
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
Pemilik/editor menyalin dashboard dalam satu klik untuk dijadikan template cabang/periode lain: salinan berisi widget (tata letak + pengaturan), kolom filter + filter bawaan, dan warna dashboard; pemilik salinan = yang menyalin, tanpa ikut berbagi dari dashboard asal.

## Acceptance criteria
- [x] Given pemilik dashboard (dashboard selalu berada di dataset pemiliknya, jadi editor/viewer tidak bisa membuat salinan di dataset orang lain), when memilih Duplikat dan memberi nama, then dashboard baru di dataset yang sama dibuat dengan semua widget, tata letak, kolom filter, filter bawaan, dan warna yang sama, lalu dibuka
- [x] Given dashboard asal dibagikan ke orang lain, when diduplikat, then salinan TIDAK ikut dibagikan dan perubahan di salinan tidak mengubah dashboard asal
- [x] Given pengguna tanpa akses (404) atau editor/viewer (403), when meminta duplikat, then ditolak tanpa membocorkan isi; batas 10 dashboard per dataset tetap berlaku

## Risk
Impact: duplikat dashboard — service duplicateDashboard/suggestCopyName (src/features/dashboards/service.ts), aksi duplicateDashboardAction, dialog di menu Lainnya (dashboard-more-menu.tsx), copyName dipindah ke features/datasets/validation. Tanpa migrasi; menulis Dashboard + Widget baru di dataset pemilik.
Security (STRIDE): Elevation/IDOR — pemilik saja (ownedWhere, dicek ulang di dalam transaksi), editor/viewer 403, orang lain 404 (denied); Tampering — salinan tidak membawa orgShared/share; DoS — batas 10 dashboard per dataset di bawah advisory lock yang sama dengan buat dashboard; integritas — FOR SHARE menunggu aktivasi versi yang berjalan, id tata letak dipetakan, item yatim dibuang.
Rollback: revert commit; salinan yang sudah dibuat tetap dashboard biasa (hapus manual bila perlu).
Validation: tests/features/dashboards/duplicate.test.ts (6), dashboard-page-access.test.ts, e2e dashboard-flex T-fcar, suite e2e per proyek.

## Notes

- 2026-11-10T02:59:22Z Bukti: tests/features/dashboards/duplicate.test.ts (6: salinan lengkap + id tata letak dipetakan, nama otomatis/diisi, batas/NAME_TAKEN/BUSY, editor/viewer FORBIDDEN, orang lain NOT_FOUND, hilang di bawah lock), tests/components/dashboard-page-access.test.ts (Lainnya: copyName pemilik saja), e2e dashboard-flex T-fcar. e2e: dashboard-flex 4/4, suite per proyek lulus (e2e 85, widgets 27, sharing 39, filters 10, backup 7, pivot 11, pivot-lanjutan 8, period-* lulus; Firefox/WebKit/pdf tidak tersedia di VM). data-view-a11y AC2 gagal juga tanpa v1.14 (uji banding) → T-7377. Review subagen 2 putaran: 0 Critical/High; 2 Medium + 4 Low (r1) dan 4 Low (r2) diperbaiki.

## Security checklist (OWASP ASVS 4.0.3)
<!-- Check each item when verified, or write "N/A: <reason>" after the text and check it. -->
- [x] V1 Architecture: trust boundaries and the components handling sensitive data are identified for this change — Tanpa batas kepercayaan baru: Server Action + service yang sama dengan buat dashboard
- [x] V2 Authentication: credentials are verified server-side; no default, hard-coded, or weak secrets — N/A: tidak disentuh perubahan ini
- [x] V3 Session management: session tokens are random, protected, invalidated on logout and expiry — N/A: tidak disentuh perubahan ini
- [x] V4 Access control: every endpoint/action checks authorization server-side, deny by default (no IDOR) — Pemilik saja: ownedWhere di luar dan di dalam transaksi; denied() → 404/403 tanpa membocorkan isi
- [x] V5 Validation, sanitization and encoding: all input validated; output encoded; no injection (SQL, OS, template) — Nama lewat cleanName (karakter kontrol/format ditolak, ≤ 80); id lewat isIdShape
- [x] V6 Stored cryptography: sensitive data at rest uses approved algorithms; keys are not in the code — N/A: tidak disentuh perubahan ini
- [x] V7 Error handling and logging: errors reveal no internals; security events are logged without secrets — N/A: tidak disentuh perubahan ini
- [x] V8 Data protection: personal/sensitive data is minimized, not cached or logged, and removable — N/A: tidak disentuh perubahan ini
- [x] V9 Communication: TLS for all external traffic; certificates validated — N/A: tidak disentuh perubahan ini
- [x] V10 Malicious code: no backdoors, time bombs, or unexplained network calls; dependencies are trusted — N/A: tidak disentuh perubahan ini
- [x] V11 Business logic: flows cannot be abused (limits, ordering, replay, race conditions) — Batas 10 dashboard per dataset dihitung di bawah pg_advisory_xact_lock yang sama; nama unik (P2002 → NAME_TAKEN); FOR SHARE terhadap aktivasi versi
- [x] V12 Files and resources: uploads are type/size limited and stored safely; no path traversal or SSRF — N/A: tidak disentuh perubahan ini
- [x] V13 API and web service: API inputs/outputs are schema-validated; CORS and rate limits are deliberate — Server Action dengan pemeriksaan origin bawaan Next; hasil DashboardResult
- [x] V14 Configuration: secure defaults, security headers, no debug in production, dependencies up to date — N/A: tidak disentuh perubahan ini

## Evidence
<!-- Generated by aitk close. -->
- Check: `npm run check` → exit 0 at 2026-11-10T02:59:01Z (203025 ms)
- Acceptance criteria: 3/3 satisfied
- Commits: 0f62982, 1a1a432, 2dc0d7f, 353960b, 355944b, 99eea5c, a725c7b, b7ddea3, bae5de1, c09567f, d7bc81b, f56c021
- Review pass 1 by claude-reviewer-subagent: 0 findings
- Review pass 2 by claude-reviewer-subagent: 0 findings
