---
id: T-rq35
title: 'Drawer ponsel: tautan Detail kartu Server saat sudah di Admin › Sumber daya tidak menutup drawer (Low review T-h807, su…'
status: done
profile: strict
created: "2026-11-17T13:53:46Z"
updated: "2026-11-17T14:59:02Z"
closed: "2026-11-17T14:59:02Z"
created_by: claude-code
workers:
  - claude-code
branch: claude/cool-babbage-t5yojt
base: 3b545e03522c0f6b39ae0acb5dff8a35ea6ccd5c
paths:
  - docs/runbook-deploy.md
  - src/components/dashboards/auto-title.ts
  - src/components/dashboards/filters/filter-context.tsx
  - src/components/dashboards/use-dashboard-editor.ts
  - src/components/dashboards/widget-card.tsx
  - src/components/dashboards/widget-panel.tsx
  - src/components/metrics/server-card.tsx
  - src/components/shell/app-shell.tsx
  - src/features/dashboards/filter-columns.ts
  - src/features/dashboards/service.ts
  - src/features/exports/pdf-filter.ts
  - src/features/exports/render-session.ts
  - tests/e2e/presence.spec.ts
  - tests/features/dashboards/filter-columns.test.ts
review:
  passes:
    - "n": 1
      by: claude-reviewer-subagent
      at: "2026-11-17T14:15:47Z"
      findings: 1
    - "n": 2
      by: claude-reviewer-subagent
      at: "2026-11-17T14:36:43Z"
      findings: 0
evidence:
  check:
    cmd: npm run check
    exit_code: 0
    duration_ms: 199775
    summary: |-
      …vice":"data-dashboard","check":"Renderer PDF","detail":"renderer tidak menjawab /healthz","msg":"health check gagal"}
      {"level":40,"time":1794926844507,"service":"data-dashboard","err":{"type":"Error","message":"NOPERM this user has no permissions to run the 'client' command","stack":"Error: NOPERM this user has no permissions to run the 'client' command\n    at Object.<anonymous> (/home/user/data-dashboard/tests/features/versions/queue-position.test.ts:71:17)\n    at Object.Mock [as getWorkers] (file:///home/user/data-dashboard/node_modules/vitest/dist/chunks/spy.DgMTfhrK.js:323:40)\n    at queueWorkerCount (/home/user/data-dashboard/src/lib/queue/versions.ts:102:40)\n    at ingestWorkerCount (/home/user/data-dashboard/src/lib/queue/versions.ts:124:10)\n    at /home/user/data-dashboard/tests/features/versions/queue-position.test.ts:69:13\n    at process.processTicksAndRejections (node:internal/process/task_queues:103:5)\n    at async file:///home/user/data-dashboard/node_modules/vitest/dist/chunks/run.BTlFXlnv.js:2783:20"},"msg":"jumlah worker gagal dibaca"}
      {"level":40,"time":1794926848814,"service":"data-dashboard","userId":"slow","err":"timeout","msg":"storage per akun gagal dihitung"}
      {"level":40,"time":1794926848817,"service":"data-dashboard","userId":"slow","err":"timeout","msg":"storage per akun gagal dihitung"}
      {"level":40,"time":1794926848820,"service":"data-dashboard","userId":"slow","err":"timeout","msg":"storage per akun gagal dihitung"}

       Test Files  259 passed | 1 skipped (260)
            Tests  3430 passed | 10 skipped (3440)
         Start at  14:45:18
         Duration  138.99s (tests 81%, import 16%, transform 3%)

          Isolate  260 workers spawned · ~106ms startup each (spawn + environment, per file)
                   at least ~9.07s faster with isolate: false — reuses workers across files instead of one per file


      > data-dashboard@1.24.0 audit
      > npm audit --audit-level=high --omit=dev && npm audit --audit-level=critical

      found 0 vulnerabilities
      found 0 vulnerabilities
    at: "2026-11-17T14:47:38Z"
    tree: 93bd308a34f9128a2f76e39ebd4cb12e6197d21a8aa6466d7655b5aef29f1d25
  commits:
    - 02321b3
    - 3b545e0
    - 5a11c1b
    - 6a6a591
    - 6afdb4b
    - 9117b9d
    - b983cc0
    - bd83a2d
    - c303ec2
    - f18da97
  acceptance:
    total: 1
    done: 1
  audit:
    at: "2026-11-17T14:47:39Z"
    passed: true
    tree: 93bd308a34f9128a2f76e39ebd4cb12e6197d21a8aa6466d7655b5aef29f1d25
    results:
      - name: osv-scanner (dependencies, offline db)
        exit_code: 0
        summary: |-
          Scanning dir .
          Starting filesystem walk for root: /
          Scanned /home/user/data-dashboard/package-lock.json file and found 837 packages
          End status: 562 dirs visited, 6684 inodes visited, 1 Extract calls, 124.744753ms elapsed, 124.745045ms wall time
          Loaded npm local db from /root/.cache/osv-scanner/npm/all.zip
          No issues found
      - name: npm audit (prod high, dev critical)
        exit_code: 0
        summary: |-
          > data-dashboard@1.24.0 audit
          > npm audit --audit-level=high --omit=dev && npm audit --audit-level=critical

          found 0 vulnerabilities
          found 0 vulnerabilities
      - name: aitk secret scan (tracked files)
        exit_code: 0
---

## Objective
Lihat judul task.

## Acceptance criteria
- [x] Tautan Detail di drawer ponsel menutup drawer walau sudah di Admin › Sumber daya; fokus kembali ke tombol menu; klik bertombol pengubah tidak menutup

## Risk
Impact: kecil, UI/pesan. Security (STRIDE): lihat checklist. Rollback: image sebelumnya. Validation: unit + e2e terkait.

## Notes

## Security checklist (OWASP ASVS 4.0.3)
<!-- Check each item when verified, or write "N/A: <reason>" after the text and check it. -->
- [x] V1 Architecture: trust boundaries and the components handling sensitive data are identified for this change — hanya UI drawer/kartu Server (klien)
- [x] V2 Authentication: credentials are verified server-side; no default, hard-coded, or weak secrets — N/A: autentikasi tidak berubah
- [x] V3 Session management: session tokens are random, protected, invalidated on logout and expiry — N/A: sesi tidak berubah
- [x] V4 Access control: every endpoint/action checks authorization server-side, deny by default (no IDOR) — N/A: tautan Detail tetap ke halaman admin yang dijaga requireAdmin
- [x] V5 Validation, sanitization and encoding: all input validated; output encoded; no injection (SQL, OS, template) — N/A: tanpa input baru
- [x] V6 Stored cryptography: sensitive data at rest uses approved algorithms; keys are not in the code — N/A: tanpa data tersimpan baru
- [x] V7 Error handling and logging: errors reveal no internals; security events are logged without secrets — N/A
- [x] V8 Data protection: personal/sensitive data is minimized, not cached or logged, and removable — N/A: tanpa data pribadi baru
- [x] V9 Communication: TLS for all external traffic; certificates validated — N/A: tanpa lalu lintas baru
- [x] V10 Malicious code: no backdoors, time bombs, or unexplained network calls; dependencies are trusted — tanpa dependensi/panggilan jaringan baru
- [x] V11 Business logic: flows cannot be abused (limits, ordering, replay, race conditions) — N/A
- [x] V12 Files and resources: uploads are type/size limited and stored safely; no path traversal or SSRF — N/A: tanpa file
- [x] V13 API and web service: API inputs/outputs are schema-validated; CORS and rate limits are deliberate — N/A: tanpa API baru
- [x] V14 Configuration: secure defaults, security headers, no debug in production, dependencies up to date — N/A: konfigurasi tidak berubah

## Evidence
<!-- Generated by aitk close. -->
- Check: `npm run check` → exit 0 at 2026-11-17T14:47:38Z (199775 ms)
- Acceptance criteria: 1/1 satisfied
- Commits: 02321b3, 3b545e0, 5a11c1b, 6a6a591, 6afdb4b, 9117b9d, b983cc0, bd83a2d, c303ec2, f18da97
- Review pass 1 by claude-reviewer-subagent: 1 findings
- Review pass 2 by claude-reviewer-subagent: 0 findings
