---
id: T-v42a
title: 'Kolom filter: editor yang kolomnya baru disembunyikan pemilik mendapat INVALID tanpa petunjuk muat ulang (Low review T-…'
status: done
profile: strict
created: "2026-11-17T10:49:59Z"
updated: "2026-11-17T14:59:05Z"
closed: "2026-11-17T14:59:05Z"
created_by: claude-code
workers:
  - claude-code
branch: claude/cool-babbage-t5yojt
base: c303ec215484004a4709075e3ab5387d9181f0db
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
      at: "2026-11-17T14:36:44Z"
      findings: 0
evidence:
  check:
    cmd: npm run check
    exit_code: 0
    duration_ms: 202357
    summary: |-
      …vice":"data-dashboard","check":"Renderer PDF","detail":"renderer tidak menjawab /healthz","msg":"health check gagal"}
      {"level":40,"time":1794927286671,"service":"data-dashboard","userId":"slow","err":"timeout","msg":"storage per akun gagal dihitung"}
      {"level":40,"time":1794927286675,"service":"data-dashboard","userId":"slow","err":"timeout","msg":"storage per akun gagal dihitung"}
      {"level":40,"time":1794927286677,"service":"data-dashboard","userId":"slow","err":"timeout","msg":"storage per akun gagal dihitung"}
      {"level":40,"time":1794927290259,"service":"data-dashboard","err":{"type":"Error","message":"NOPERM this user has no permissions to run the 'client' command","stack":"Error: NOPERM this user has no permissions to run the 'client' command\n    at Object.<anonymous> (/home/user/data-dashboard/tests/features/versions/queue-position.test.ts:71:17)\n    at Object.Mock [as getWorkers] (file:///home/user/data-dashboard/node_modules/vitest/dist/chunks/spy.DgMTfhrK.js:323:40)\n    at queueWorkerCount (/home/user/data-dashboard/src/lib/queue/versions.ts:102:40)\n    at ingestWorkerCount (/home/user/data-dashboard/src/lib/queue/versions.ts:124:10)\n    at /home/user/data-dashboard/tests/features/versions/queue-position.test.ts:69:13\n    at process.processTicksAndRejections (node:internal/process/task_queues:103:5)\n    at async file:///home/user/data-dashboard/node_modules/vitest/dist/chunks/run.BTlFXlnv.js:2783:20"},"msg":"jumlah worker gagal dibaca"}

       Test Files  259 passed | 1 skipped (260)
            Tests  3430 passed | 10 skipped (3440)
         Start at  14:52:42
         Duration  137.82s (tests 81%, import 16%, transform 3%)

          Isolate  260 workers spawned · ~106ms startup each (spawn + environment, per file)
                   at least ~9.08s faster with isolate: false — reuses workers across files instead of one per file


      > data-dashboard@1.24.0 audit
      > npm audit --audit-level=high --omit=dev && npm audit --audit-level=critical

      found 0 vulnerabilities
      found 0 vulnerabilities
    at: "2026-11-17T14:55:01Z"
    tree: 93bd308a34f9128a2f76e39ebd4cb12e6197d21a8aa6466d7655b5aef29f1d25
  commits:
    - 02321b3
    - "0380793"
    - 0f0bc44
    - 3b545e0
    - "4417829"
    - 5a11c1b
    - 6a6a591
    - 6afdb4b
    - 6e84221
    - 704c837
    - 9117b9d
    - b983cc0
    - bd83a2d
    - c303ec2
    - c54344a
    - cc9ca98
    - cdc3e64
    - d458bb6
    - e01b3d1
    - eff56c2
    - f18da97
    - f274c1e
    - f2f6133
  acceptance:
    total: 1
    done: 1
  audit:
    at: "2026-11-17T14:55:02Z"
    passed: true
    tree: 93bd308a34f9128a2f76e39ebd4cb12e6197d21a8aa6466d7655b5aef29f1d25
    results:
      - name: osv-scanner (dependencies, offline db)
        exit_code: 0
        summary: |-
          Scanning dir .
          Starting filesystem walk for root: /
          Scanned /home/user/data-dashboard/package-lock.json file and found 837 packages
          End status: 562 dirs visited, 6684 inodes visited, 1 Extract calls, 122.140978ms elapsed, 122.141112ms wall time
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
- [x] Editor yang menyimpan kolom filter yang baru disembunyikan pemilik mendapat petunjuk muat ulang; pesan sama untuk semua kolom tak tersedia (tanpa oracle nama tersembunyi)

## Risk
Impact: kecil, UI/pesan. Security (STRIDE): lihat checklist. Rollback: image sebelumnya. Validation: unit + e2e terkait.

## Notes

## Security checklist (OWASP ASVS 4.0.3)
<!-- Check each item when verified, or write "N/A: <reason>" after the text and check it. -->
- [x] V1 Architecture: trust boundaries and the components handling sensitive data are identified for this change — PATCH kolom filter (server)
- [x] V2 Authentication: credentials are verified server-side; no default, hard-coded, or weak secrets — N/A: autentikasi tidak berubah
- [x] V3 Session management: session tokens are random, protected, invalidated on logout and expiry — N/A: sesi tidak berubah
- [x] V4 Access control: every endpoint/action checks authorization server-side, deny by default (no IDOR) — tetap canEditWhere; pengecualian kolom tersimpan hanya pemilik
- [x] V5 Validation, sanitization and encoding: all input validated; output encoded; no injection (SQL, OS, template) — pesan galat menggemakan nama masukan, bukan nama tersembunyi; sama untuk semua kolom tak tersedia (tanpa oracle)
- [x] V6 Stored cryptography: sensitive data at rest uses approved algorithms; keys are not in the code — N/A: tanpa data tersimpan baru
- [x] V7 Error handling and logging: errors reveal no internals; security events are logged without secrets — pesan tanpa detail internal
- [x] V8 Data protection: personal/sensitive data is minimized, not cached or logged, and removable — N/A: tanpa data pribadi baru
- [x] V9 Communication: TLS for all external traffic; certificates validated — N/A: tanpa lalu lintas baru
- [x] V10 Malicious code: no backdoors, time bombs, or unexplained network calls; dependencies are trusted — tanpa dependensi/panggilan jaringan baru
- [x] V11 Business logic: flows cannot be abused (limits, ordering, replay, race conditions) — N/A
- [x] V12 Files and resources: uploads are type/size limited and stored safely; no path traversal or SSRF — N/A: tanpa file
- [x] V13 API and web service: API inputs/outputs are schema-validated; CORS and rate limits are deliberate — body divalidasi seperti sebelumnya
- [x] V14 Configuration: secure defaults, security headers, no debug in production, dependencies up to date — N/A: konfigurasi tidak berubah

## Evidence
<!-- Generated by aitk close. -->
- Check: `npm run check` → exit 0 at 2026-11-17T14:55:01Z (202357 ms)
- Acceptance criteria: 1/1 satisfied
- Commits: 02321b3, 0380793, 0f0bc44, 3b545e0, 4417829, 5a11c1b, 6a6a591, 6afdb4b, 6e84221, 704c837, 9117b9d, b983cc0, bd83a2d, c303ec2, c54344a, cc9ca98, cdc3e64, d458bb6, e01b3d1, eff56c2, f18da97, f274c1e, f2f6133
- Review pass 1 by claude-reviewer-subagent: 1 findings
- Review pass 2 by claude-reviewer-subagent: 0 findings
