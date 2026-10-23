---
id: T-tzxt
title: Tampilkan versi aplikasi di footer
status: done
profile: strict
tags:
  - ui
created: "2026-10-23T11:22:16Z"
updated: "2026-10-23T14:24:28Z"
closed: "2026-10-23T14:24:28Z"
created_by: claude-code
workers:
  - claude-code
branch: claude/intelligent-albattani-fd1va8
base: 96102f23dd68e2dbff5959b955f7112f94450ec3
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
review:
  passes:
    - "n": 1
      by: claude-reviewer-subagent
      at: "2026-10-23T13:41:54Z"
      findings: 2
    - "n": 2
      by: claude-reviewer-subagent
      at: "2026-10-23T13:42:40Z"
      findings: 0
evidence:
  check:
    cmd: npm run check
    exit_code: 0
    duration_ms: 267405
    summary: |-
      …asetId":"t072mvl2253vds000000","msg":"dataset dihapus"}
      {"level":40,"time":1792765113630,"service":"data-dashboard","host":"127.0.0.1","port":46159,"step":"membuka folder","code":2,"err":"No such file or directory","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":40,"time":1792765113693,"service":"data-dashboard","host":"127.0.0.1","port":34425,"err":"Unable to start subsystem: sftp","msg":"subsistem SFTP ditolak NAS"}
      {"level":40,"time":1792765113798,"service":"data-dashboard","host":"127.0.0.1","port":39747,"step":"menghapus file uji","code":4,"err":"Failure","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":40,"time":1792765113922,"service":"data-dashboard","host":"127.0.0.1","port":42047,"step":"menulis file uji","code":4,"err":"Failure","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":40,"time":1792765125837,"service":"data-dashboard","err":"Can't reach database server","msg":"sesi shell gagal dibaca"}
      {"level":40,"time":1792765139494,"service":"data-dashboard","check":"B","detail":"koneksi ditolak","msg":"health check gagal"}
      {"level":40,"time":1792765139517,"service":"data-dashboard","check":"Lambat","detail":"Lambat: timeout 20 ms","msg":"health check gagal"}
      {"level":40,"time":1792765139522,"service":"data-dashboard","check":"Y","detail":"mati","msg":"health check gagal"}
      {"level":40,"time":1792765139539,"service":"data-dashboard","check":"Renderer PDF","detail":"renderer tidak menjawab /healthz","msg":"health check gagal"}

       Test Files  229 passed | 1 skipped (230)
            Tests  3083 passed | 10 skipped (3093)
         Start at  14:16:35
         Duration  175.58s (tests 82%, import 14%, transform 3%)

          Isolate  230 workers spawned · ~159ms startup each (spawn + environment, per file)
                   at least ~12.00s faster with isolate: false — reuses workers across files instead of one per file


      > data-dashboard@1.4.1 audit
      > npm audit --audit-level=high --omit=dev && npm audit --audit-level=critical

      found 0 vulnerabilities
      found 0 vulnerabilities
    at: "2026-10-23T14:19:33Z"
    tree: 5e3b5e617865de30e084f621c2def146c3b8e40565ac983b73a9060461236530
  commits:
    - 083808b
    - 30e4fd7
    - 6c4bc8b
    - 8ce4cc3
    - 96102f2
    - 9b88ac2
    - a085d62
    - b75d6d8
    - d0d1fdf
    - d44e938
    - d97c497
    - e675445
    - e785231
    - f6049ca
  acceptance:
    total: 1
    done: 1
  audit:
    at: "2026-10-23T14:19:34Z"
    passed: true
    tree: 5e3b5e617865de30e084f621c2def146c3b8e40565ac983b73a9060461236530
    results:
      - name: osv-scanner (dependencies, offline db)
        exit_code: 0
        summary: |-
          Scanning dir .
          Starting filesystem walk for root: /
          Scanned /home/user/data-dashboard/package-lock.json file and found 836 packages
          End status: 491 dirs visited, 2585 inodes visited, 1 Extract calls, 80.689442ms elapsed, 80.689939ms wall time
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
Versi aplikasi tampil di footer setiap halaman setelah login ("Data Dashboard · Versi x.y.z"), dari satu sumber package.json (src/lib/version.ts → prop AppShell), hanya untuk pengguna yang sudah masuk seperti menu akun (T-066).

## Acceptance criteria
- [x] Setiap halaman aplikasi (setelah login) menampilkan versi (mis. 'Versi 1.4.1') di footer dari satu sumber package.json lewat src/lib/version.ts; tidak menggeser tata letak di ponsel

## Risk
Impact: shell aplikasi (footer di bawah main). Security (STRIDE): Information disclosure — versi tidak ditampilkan saat user null (sesi tidak sah/DB mati), sesuai T-066. Rollback: revert commit. Validation: e2e shell 11/11, grid/data-view-scroll/data-view-a11y/kpi-fit lulus, review 2 putaran (2 → 0).

## Notes

## Security checklist (OWASP ASVS 4.0.3)
<!-- Check each item when verified, or write "N/A: <reason>" after the text and check it. -->
- [x] V1 Architecture: trust boundaries and the components handling sensitive data are identified for this change
- [x] V2 Authentication: credentials are verified server-side; no default, hard-coded, or weak secrets — N/A: tidak mengubah autentikasi
- [x] V3 Session management: session tokens are random, protected, invalidated on logout and expiry — N/A: tidak mengubah sesi
- [x] V4 Access control: every endpoint/action checks authorization server-side, deny by default (no IDOR) — versi hanya dirender bila user terautentikasi
- [x] V5 Validation, sanitization and encoding: all input validated; output encoded; no injection (SQL, OS, template) — N/A: tanpa input
- [x] V6 Stored cryptography: sensitive data at rest uses approved algorithms; keys are not in the code — N/A
- [x] V7 Error handling and logging: errors reveal no internals; security events are logged without secrets — N/A
- [x] V8 Data protection: personal/sensitive data is minimized, not cached or logged, and removable — versi aplikasi saja, hanya untuk pengguna masuk
- [x] V9 Communication: TLS for all external traffic; certificates validated — N/A
- [x] V10 Malicious code: no backdoors, time bombs, or unexplained network calls; dependencies are trusted — N/A
- [x] V11 Business logic: flows cannot be abused (limits, ordering, replay, race conditions) — N/A
- [x] V12 Files and resources: uploads are type/size limited and stored safely; no path traversal or SSRF — N/A
- [x] V13 API and web service: API inputs/outputs are schema-validated; CORS and rate limits are deliberate — N/A
- [x] V14 Configuration: secure defaults, security headers, no debug in production, dependencies up to date — N/A

## Evidence
<!-- Generated by aitk close. -->
- Check: `npm run check` → exit 0 at 2026-10-23T14:19:33Z (267405 ms)
- Acceptance criteria: 1/1 satisfied
- Commits: 083808b, 30e4fd7, 6c4bc8b, 8ce4cc3, 96102f2, 9b88ac2, a085d62, b75d6d8, d0d1fdf, d44e938, d97c497, e675445, e785231, f6049ca
- Review pass 1 by claude-reviewer-subagent: 2 findings
- Review pass 2 by claude-reviewer-subagent: 0 findings
