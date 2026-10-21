---
id: T-w764
title: 'Perbaiki e2e kpi-fit halaman cetak: angka KPI noted w4 terpotong 1 px'
status: done
profile: strict
created: "2026-10-21T12:34:26Z"
updated: "2026-10-21T21:34:24Z"
closed: "2026-10-21T21:34:24Z"
created_by: claude-code
workers:
  - claude-code
branch: claude/intelligent-albattani-fd1va8
base: 62dfa2b97043bf3ab0c4429f296d7bc00fdb08ee
paths:
  - deploy/upgrade.sh
  - docs/runbook-deploy.md
  - playwright.config.ts
  - prisma/migrations/20261021170000_t072_saved_pivot/migration.sql
  - prisma/schema.prisma
  - scripts/dev-saved-pivot-fixture.mjs
  - scripts/perf-pivot-advanced.ts
  - scripts/perf.mjs
  - src/app/(app)/dashboards/[id]/page.tsx
  - src/app/(app)/datasets/[id]/page.tsx
  - src/app/(app)/datasets/[id]/pivot-tersimpan/[pivotId]/page.tsx
  - src/app/(app)/datasets/[id]/pivot-tersimpan/baru/page.tsx
  - src/components/dashboards/bound-config-model.ts
  - src/components/dashboards/bound-config.tsx
  - src/components/dashboards/calc-editor.tsx
  - src/components/dashboards/config-saves.ts
  - src/components/dashboards/dashboard-api.ts
  - src/components/dashboards/dashboard-canvas.tsx
  - src/components/dashboards/pivot-config.tsx
  - src/components/dashboards/pivot-saved-filters.tsx
  - src/components/dashboards/query-scope.ts
  - src/components/dashboards/use-dashboard-editor.ts
  - src/components/dashboards/widget-card.tsx
  - src/components/dashboards/widget-config.tsx
  - src/components/dashboards/widget-source.tsx
  - src/components/render/print-card.tsx
  - src/components/render/print-pivot.tsx
  - src/components/saved-pivots/saved-pivot-editor.tsx
  - src/components/saved-pivots/saved-pivot-list.tsx
  - src/components/saved-pivots/saved-pivot-page.tsx
  - src/components/ui/page-header.tsx
  - src/components/widgets/absent-note.tsx
  - src/components/widgets/body-state.ts
  - src/components/widgets/kpi-view.tsx
  - src/components/widgets/table-expand.tsx
  - src/components/widgets/widget-body.tsx
  - src/components/widgets/widget-query.ts
  - src/features/audit/service.ts
  - src/features/auth/rate-limit.ts
  - src/features/dashboards/http.ts
  - src/features/dashboards/service.ts
  - src/features/exports/job.ts
  - src/features/exports/schema.ts
  - src/features/exports/service.ts
  - src/features/query/runtime.ts
  - src/features/query/service.ts
  - src/features/query/widget.ts
  - src/features/saved-pivots/actions.ts
  - src/features/saved-pivots/service.ts
  - src/features/versions/activation.ts
  - src/features/widgets/bound.ts
  - tests/components/bound-config.test.ts
  - tests/components/calc-editor.test.ts
  - tests/components/kpi-line-height.test.ts
  - tests/components/native-undo-guard.test.ts
  - tests/components/page-header.test.ts
  - tests/components/pivot-filters.test.ts
  - tests/components/pivot-ui.test.ts
  - tests/components/saved-pivot-ui.test.ts
  - tests/components/widget-absent.test.ts
  - tests/e2e/bound-widgets.spec.ts
  - tests/e2e/dashboards.spec.ts
  - tests/e2e/pivot-lanjutan.spec.ts
  - tests/e2e/saved-pivot-widgets.spec.ts
  - tests/features/dashboards/dashboards.test.ts
  - tests/features/dashboards/http.test.ts
  - tests/features/exports/bound-export.test.ts
  - tests/features/query/__snapshots__/bound-legacy.test.ts.snap
  - tests/features/query/bound-legacy.test.ts
  - tests/features/query/bound-widgets.test.ts
  - tests/features/query/sharing-repo.test.ts
  - tests/features/saved-pivots/actions.test.ts
  - tests/features/saved-pivots/binding.db.test.ts
  - tests/features/saved-pivots/service.db.test.ts
  - tests/features/versions/activation.test.ts
  - tests/features/widgets/bound.test.ts
review:
  passes:
    - "n": 1
      by: claude-reviewer-subagent
      at: "2026-10-21T21:30:42Z"
      findings: 0
    - "n": 2
      by: claude-code
      at: "2026-10-21T21:30:42Z"
      findings: 0
evidence:
  check:
    cmd: npm run check
    exit_code: 0
    duration_ms: 192272
    summary: |-
      …t":"127.0.0.1","port":40609,"step":"membuka folder","code":2,"err":"No such file or directory","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":40,"time":1792618394643,"service":"data-dashboard","host":"127.0.0.1","port":46109,"err":"Unable to start subsystem: sftp","msg":"subsistem SFTP ditolak NAS"}
      {"level":40,"time":1792618394740,"service":"data-dashboard","host":"127.0.0.1","port":43263,"step":"menghapus file uji","code":4,"err":"Failure","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":40,"time":1792618394853,"service":"data-dashboard","host":"127.0.0.1","port":44147,"step":"menulis file uji","code":4,"err":"Failure","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":30,"time":1792618395245,"service":"data-dashboard","datasetId":"t072mvimphkqds000000","msg":"dataset dihapus"}
      {"level":40,"time":1792618404510,"service":"data-dashboard","err":"Can't reach database server","msg":"sesi shell gagal dibaca"}
      {"level":40,"time":1792618415507,"service":"data-dashboard","check":"B","detail":"koneksi ditolak","msg":"health check gagal"}
      {"level":40,"time":1792618415529,"service":"data-dashboard","check":"Lambat","detail":"Lambat: timeout 20 ms","msg":"health check gagal"}
      {"level":40,"time":1792618415532,"service":"data-dashboard","check":"Y","detail":"mati","msg":"health check gagal"}
      {"level":40,"time":1792618415553,"service":"data-dashboard","check":"Renderer PDF","detail":"renderer tidak menjawab /healthz","msg":"health check gagal"}

       Test Files  225 passed | 1 skipped (226)
            Tests  3021 passed | 10 skipped (3031)
         Start at  21:31:43
         Duration  131.23s (tests 83%, import 14%, transform 3%)

          Isolate  226 workers spawned · ~136ms startup each (spawn + environment, per file)
                   at least ~10.07s faster with isolate: false — reuses workers across files instead of one per file


      > data-dashboard@1.2.0 audit
      > npm audit --audit-level=high --omit=dev && npm audit --audit-level=critical

      found 0 vulnerabilities
      found 0 vulnerabilities
    at: "2026-10-21T21:33:55Z"
    tree: f9480a784dccb1da9af6a9704d003ab568fcc961a1814b3e4e26f5b69ba807e6
  commits:
    - 07b7bf2
    - 0a6567a
    - 17cb5cc
    - 1ad5b22
    - 21e6bd7
    - 3f0008e
    - 3f15210
    - 4115c8d
    - 460a7f3
    - 468e913
    - 52486eb
    - 594ca78
    - 5cf7246
    - 5f3cb82
    - 61111df
    - 62dfa2b
    - 693edf2
    - 6f54377
    - 764bbce
    - 7ccff4c
    - 864037d
    - a80b5ae
    - a821c13
    - b5206c2
    - bb53812
    - c4a56e5
    - c7bb4f1
    - ccb8465
    - d13f79e
    - d16ff25
    - d3820d7
    - d76daf2
    - e0ec8e7
    - e2c6cf1
    - e435538
    - eb70260
    - eb97953
    - ec22d22
    - ee2a976
    - f1bd517
  acceptance:
    total: 1
    done: 1
  audit:
    at: "2026-10-21T21:33:56Z"
    passed: true
    tree: f9480a784dccb1da9af6a9704d003ab568fcc961a1814b3e4e26f5b69ba807e6
    results:
      - name: osv-scanner (dependencies, offline db)
        exit_code: 0
        summary: |-
          Scanning dir .
          Starting filesystem walk for root: /
          Scanned /home/user/data-dashboard/package-lock.json file and found 836 packages
          End status: 528 dirs visited, 5295 inodes visited, 1 Extract calls, 217.830048ms elapsed, 217.830147ms wall time
          Loaded npm local db from /root/.cache/osv-scalibr/npm/all.zip

          No issues found
      - name: npm audit (prod high, dev critical)
        exit_code: 0
        summary: |-
          > data-dashboard@1.2.0 audit
          > npm audit --audit-level=high --omit=dev && npm audit --audit-level=critical

          found 0 vulnerabilities
          found 0 vulnerabilities
      - name: aitk secret scan (tracked files)
        exit_code: 0
---

## Objective
Ditemukan saat T-1zdf (gagal konsisten di HEAD 8ce72cf, 4/4 run): tests/e2e/kpi-fit.spec.ts "AC1: halaman cetak (viewport renderer 1047 px, media print)" — angka KPI kartu bercatatan w4 terpotong 1 px di bawah (28 px, kotak @container KPI), toleransi 0,5 px. Tentukan apakah ini bug nyata (kpiHeightPx/ukuran huruf di halaman cetak) lalu perbaiki dengan tes regresi; jangan melonggarkan toleransi.

## Acceptance criteria
- [x] Given project kpi-fit dijalankan utuh, then tes AC1 halaman cetak lulus (potongan angka <= 0,5 px) tanpa melonggarkan toleransi

## Risk
Impact: tinggi baris angka KPI kini benar-benar leading-tight (1,25) di layar dan kertas (sebelumnya 1,5
karena kelasnya terbuang); angka sedikit lebih rapat ke label, ukuran huruf tidak berubah.
Security (STRIDE): tidak ada permukaan baru (hanya urutan kelas CSS).
Rollback: revert commit T-w764.
Validation: tests/components/kpi-line-height.test.ts (gagal sebelum perbaikan); e2e --project=kpi-fit 6/6
(cetak: potongan 0 px), pdf, widgets.

## Notes
- Diagnosis T-075 (2026-10-21, belum diperbaiki): direproduksi (--project=kpi-fit, 5 lulus, AC1 cetak
  gagal: "angka noted w4 terpotong (28 px, bawah @container …)", potongan 1 px > 0,5). Kotak yang
  memotong = kotak KPI (kpi-view.tsx, overflow-hidden, pb-3). Ukuran 28 px berasal dari batas tinggi
  `kpiHeightPx` (kpi-fit.ts: angka boleh memakai padding bawah kecuali 2 px ekor huruf, tinggi baris
  leading-tight 1,25). Dugaan: kotak isi teks (Range) font halaman cetak lebih tinggi dari 1,25 em
  sehingga cadangan 2 px kurang ± 1 px; perlu ukur ascent/descent font di halaman cetak lalu ubah rumus
  (mis. cadangan dari metrik font, bukan konstanta) + uji unit kpiHeightPx — jangan longgarkan toleransi.
- Akar masalah (T-w764, 2026-10-21): bukan metrik font (Inter: kotak isi 34 px < baris 35 px di 28 px).
  Pengukuran di halaman cetak: tinggi <p> angka 42 px = 1,5 × 28 — `cn()` (tailwind-merge) membuang
  `leading-tight` karena kelas ukuran `text-[clamp(...)]`/`text-sm` sesudahnya (text-* membawa tinggi
  baris), jadi tinggi baris jatuh ke 1,5 warisan body sementara kpiHeightPx menganggap 1,25 → kotak teks
  turun 3,5 px dan terpotong 1 px. Perbaikan: `leading-tight` ditaruh sesudah kelas ukuran (kpi-view.tsx).
  Sesudahnya tinggi <p> 35 px, potongan 0 px di semua kartu; toleransi tidak diubah.

## Security checklist (OWASP ASVS 4.0.3)
<!-- Check each item when verified, or write "N/A: <reason>" after the text and check it. -->
- [x] V1 Architecture: trust boundaries and the components handling sensitive data are identified for this change — N/A: hanya urutan kelas CSS angka KPI; tidak ada input, data, endpoint, atau konfigurasi baru.
- [x] V2 Authentication: credentials are verified server-side; no default, hard-coded, or weak secrets — N/A: hanya urutan kelas CSS angka KPI; tidak ada input, data, endpoint, atau konfigurasi baru.
- [x] V3 Session management: session tokens are random, protected, invalidated on logout and expiry — N/A: hanya urutan kelas CSS angka KPI; tidak ada input, data, endpoint, atau konfigurasi baru.
- [x] V4 Access control: every endpoint/action checks authorization server-side, deny by default (no IDOR) — N/A: hanya urutan kelas CSS angka KPI; tidak ada input, data, endpoint, atau konfigurasi baru.
- [x] V5 Validation, sanitization and encoding: all input validated; output encoded; no injection (SQL, OS, template) — N/A: hanya urutan kelas CSS angka KPI; tidak ada input, data, endpoint, atau konfigurasi baru.
- [x] V6 Stored cryptography: sensitive data at rest uses approved algorithms; keys are not in the code — N/A: hanya urutan kelas CSS angka KPI; tidak ada input, data, endpoint, atau konfigurasi baru.
- [x] V7 Error handling and logging: errors reveal no internals; security events are logged without secrets — N/A: hanya urutan kelas CSS angka KPI; tidak ada input, data, endpoint, atau konfigurasi baru.
- [x] V8 Data protection: personal/sensitive data is minimized, not cached or logged, and removable — N/A: hanya urutan kelas CSS angka KPI; tidak ada input, data, endpoint, atau konfigurasi baru.
- [x] V9 Communication: TLS for all external traffic; certificates validated — N/A: hanya urutan kelas CSS angka KPI; tidak ada input, data, endpoint, atau konfigurasi baru.
- [x] V10 Malicious code: no backdoors, time bombs, or unexplained network calls; dependencies are trusted — N/A: hanya urutan kelas CSS angka KPI; tidak ada input, data, endpoint, atau konfigurasi baru.
- [x] V11 Business logic: flows cannot be abused (limits, ordering, replay, race conditions) — N/A: hanya urutan kelas CSS angka KPI; tidak ada input, data, endpoint, atau konfigurasi baru.
- [x] V12 Files and resources: uploads are type/size limited and stored safely; no path traversal or SSRF — N/A: hanya urutan kelas CSS angka KPI; tidak ada input, data, endpoint, atau konfigurasi baru.
- [x] V13 API and web service: API inputs/outputs are schema-validated; CORS and rate limits are deliberate — N/A: hanya urutan kelas CSS angka KPI; tidak ada input, data, endpoint, atau konfigurasi baru.
- [x] V14 Configuration: secure defaults, security headers, no debug in production, dependencies up to date — N/A: hanya urutan kelas CSS angka KPI; tidak ada input, data, endpoint, atau konfigurasi baru.

## Evidence
<!-- Generated by aitk close. -->
- Check: `npm run check` → exit 0 at 2026-10-21T21:33:55Z (192272 ms)
- Acceptance criteria: 1/1 satisfied
- Commits: 07b7bf2, 0a6567a, 17cb5cc, 1ad5b22, 21e6bd7, 3f0008e, 3f15210, 4115c8d, 460a7f3, 468e913, 52486eb, 594ca78, 5cf7246, 5f3cb82, 61111df, 62dfa2b, 693edf2, 6f54377, 764bbce, 7ccff4c, 864037d, a80b5ae, a821c13, b5206c2, bb53812, c4a56e5, c7bb4f1, ccb8465, d13f79e, d16ff25, d3820d7, d76daf2, e0ec8e7, e2c6cf1, e435538, eb70260, eb97953, ec22d22, ee2a976, f1bd517
- Review pass 1 by claude-reviewer-subagent: 0 findings
- Review pass 2 by claude-code: 0 findings
