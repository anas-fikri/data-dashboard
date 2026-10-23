---
id: T-tpfh
title: Longgarkan batas uji kinerja render panduan (1000 → 1500 ms CPU)
status: in_review
profile: strict
tags:
  - test
created: "2026-10-23T14:04:45Z"
updated: "2026-10-23T14:14:52Z"
created_by: claude-code
workers:
  - claude-code
branch: claude/intelligent-albattani-fd1va8
base: e78523184b7790fa12557e76af535ed59646f0cb
paths:
  - deploy/release.sh
  - deploy/upgrade.sh
  - docs/runbook-deploy.md
  - src/components/admin/users-status-filter.tsx
  - src/components/dashboards/add-filter-column-menu.tsx
  - src/components/grid/grid-period-picker.tsx
  - src/components/grid/sheet-grid.tsx
  - src/components/mapping/mapping-picker.tsx
  - src/components/shell/app-shell.tsx
  - src/components/ui/menu-search.tsx
  - src/components/ui/select.tsx
  - tests/e2e/filters.spec.ts
  - tests/e2e/sharing.spec.ts
  - tests/e2e/shell.spec.ts
  - tests/features/guides/markdown.test.ts
  - tests/scripts/release.test.ts
  - tests/scripts/upgrade-gates.test.ts
evidence:
  check:
    cmd: npm run check
    exit_code: 0
    duration_ms: 270923
    summary: |-
      …asetId":"t072mvl1p6oeds000000","msg":"dataset dihapus"}
      {"level":40,"time":1792764509990,"service":"data-dashboard","host":"127.0.0.1","port":46451,"step":"membuka folder","code":2,"err":"No such file or directory","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":40,"time":1792764510056,"service":"data-dashboard","host":"127.0.0.1","port":39075,"err":"Unable to start subsystem: sftp","msg":"subsistem SFTP ditolak NAS"}
      {"level":40,"time":1792764510166,"service":"data-dashboard","host":"127.0.0.1","port":34121,"step":"menghapus file uji","code":4,"err":"Failure","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":40,"time":1792764510296,"service":"data-dashboard","host":"127.0.0.1","port":34083,"step":"menulis file uji","code":4,"err":"Failure","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":40,"time":1792764522898,"service":"data-dashboard","err":"Can't reach database server","msg":"sesi shell gagal dibaca"}
      {"level":40,"time":1792764537383,"service":"data-dashboard","check":"B","detail":"koneksi ditolak","msg":"health check gagal"}
      {"level":40,"time":1792764537410,"service":"data-dashboard","check":"Lambat","detail":"Lambat: timeout 20 ms","msg":"health check gagal"}
      {"level":40,"time":1792764537419,"service":"data-dashboard","check":"Y","detail":"mati","msg":"health check gagal"}
      {"level":40,"time":1792764537437,"service":"data-dashboard","check":"Renderer PDF","detail":"renderer tidak menjawab /healthz","msg":"health check gagal"}

       Test Files  229 passed | 1 skipped (230)
            Tests  3083 passed | 10 skipped (3093)
         Start at  14:06:30
         Duration  177.67s (tests 83%, import 14%, transform 3%)

          Isolate  230 workers spawned · ~158ms startup each (spawn + environment, per file)
                   at least ~11.95s faster with isolate: false — reuses workers across files instead of one per file


      > data-dashboard@1.4.1 audit
      > npm audit --audit-level=high --omit=dev && npm audit --audit-level=critical

      found 0 vulnerabilities
      found 0 vulnerabilities
    at: "2026-10-23T14:09:30Z"
    tree: 5e3b5e617865de30e084f621c2def146c3b8e40565ac983b73a9060461236530
  acceptance:
    total: 1
    done: 1
  audit:
    at: "2026-10-23T14:09:36Z"
    passed: true
    tree: 5e3b5e617865de30e084f621c2def146c3b8e40565ac983b73a9060461236530
    results:
      - name: osv-scanner (dependencies, offline db)
        exit_code: 0
        summary: |-
          Scanning dir .
          Starting filesystem walk for root: /
          Scanned /home/user/data-dashboard/package-lock.json file and found 836 packages
          End status: 491 dirs visited, 2584 inodes visited, 1 Extract calls, 86.583652ms elapsed, 86.584206ms wall time
          Loaded npm local db from /root/.cache/osv-scanner/npm/all.zip
          No issues found
      - name: npm audit (prod high, dev critical)
        exit_code: 0
        summary: |-
          > data-dashboard@1.4.1 audit
          > npm audit --audit-level=high --omit=dev && npm audit --audit-level=critical

          found 0 vulnerabilities
          found 0 vulnerabilities
      - name: aitk secret scan (tracked files)
        exit_code: 0
---

## Objective
Uji kinerja render panduan (CPU < 1000 ms) gagal 2× di VM sibuk (1077 ms) tanpa perubahan kode terkait; pemilik memilih melonggarkan batas. Dipilih 1300 ms agar regresi kuadratik terkecil (1,4 s) tetap tertangkap.

## Acceptance criteria
- [x] RENDER_MAX_MS di tests/features/guides/markdown.test.ts dilonggarkan (1300, bukan 1500: regresi terkecil yang dicari 1,4 s) dengan alasan beban mesin; aitk check lulus di VM sibuk (keputusan pemilik 2026-10-23)

## Risk
Impact: hanya batas waktu satu uji unit. Security (STRIDE): tidak ada perubahan kode produksi; uji DoS tetap menangkap regresi ≥ 1,4 s. Rollback: revert commit. Validation: aitk check lulus.

## Notes

## Security checklist (OWASP ASVS 4.0.3)
<!-- Check each item when verified, or write "N/A: <reason>" after the text and check it. -->
- [x] V1 Architecture: trust boundaries and the components handling sensitive data are identified for this change — N/A: hanya mengubah batas waktu uji unit, tanpa kode produksi
- [x] V2 Authentication: credentials are verified server-side; no default, hard-coded, or weak secrets — N/A: hanya mengubah batas waktu uji unit, tanpa kode produksi
- [x] V3 Session management: session tokens are random, protected, invalidated on logout and expiry — N/A: hanya mengubah batas waktu uji unit, tanpa kode produksi
- [x] V4 Access control: every endpoint/action checks authorization server-side, deny by default (no IDOR) — N/A: hanya mengubah batas waktu uji unit, tanpa kode produksi
- [x] V5 Validation, sanitization and encoding: all input validated; output encoded; no injection (SQL, OS, template) — N/A: hanya mengubah batas waktu uji unit, tanpa kode produksi
- [x] V6 Stored cryptography: sensitive data at rest uses approved algorithms; keys are not in the code — N/A: hanya mengubah batas waktu uji unit, tanpa kode produksi
- [x] V7 Error handling and logging: errors reveal no internals; security events are logged without secrets — N/A: hanya mengubah batas waktu uji unit, tanpa kode produksi
- [x] V8 Data protection: personal/sensitive data is minimized, not cached or logged, and removable — N/A: hanya mengubah batas waktu uji unit, tanpa kode produksi
- [x] V9 Communication: TLS for all external traffic; certificates validated — N/A: hanya mengubah batas waktu uji unit, tanpa kode produksi
- [x] V10 Malicious code: no backdoors, time bombs, or unexplained network calls; dependencies are trusted — N/A: hanya mengubah batas waktu uji unit, tanpa kode produksi
- [x] V11 Business logic: flows cannot be abused (limits, ordering, replay, race conditions) — N/A: hanya mengubah batas waktu uji unit, tanpa kode produksi
- [x] V12 Files and resources: uploads are type/size limited and stored safely; no path traversal or SSRF — N/A: hanya mengubah batas waktu uji unit, tanpa kode produksi
- [x] V13 API and web service: API inputs/outputs are schema-validated; CORS and rate limits are deliberate — N/A: hanya mengubah batas waktu uji unit, tanpa kode produksi
- [x] V14 Configuration: secure defaults, security headers, no debug in production, dependencies up to date — N/A: hanya mengubah batas waktu uji unit, tanpa kode produksi

## Evidence
<!-- Generated by aitk close. -->
- Check: `npm run check` → exit 0 at 2026-10-23T14:09:30Z (270923 ms)
- Acceptance criteria: 1/1 satisfied
