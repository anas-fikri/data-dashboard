---
id: T-3xgk
title: 'CI GitHub Actions: lint, typecheck, unit test per PR'
status: done
profile: strict
tags:
  - ci
created: "2026-11-06T09:29:30Z"
updated: "2026-11-06T10:42:59Z"
closed: "2026-11-06T10:42:59Z"
created_by: claude-code
workers:
  - claude-code
branch: claude/cool-babbage-t5yojt
base: c0fdc24ef61ec27d14d6bc18e09c3577b7d03ac4
paths:
  - .github/workflows/ci.yml
  - Dockerfile
  - content/panduan/13-widget-pivot.md
  - deploy/backup.sh
  - docker-compose.prod.yml
  - docs/runbook-deploy.md
  - package-lock.json
  - package.json
  - playwright.config.ts
  - src/components/dashboards/config-sections.tsx
  - src/components/dashboards/pivot-config.tsx
  - src/components/dashboards/status-fields.tsx
  - src/components/dashboards/widget-config-model.ts
  - src/components/dashboards/widget-config.tsx
  - src/components/render/print-card.tsx
  - src/components/render/print-pivot.tsx
  - src/components/widgets/chart-option.ts
  - src/components/widgets/chart-widget.tsx
  - src/components/widgets/kpi-view.tsx
  - src/components/widgets/pivot-markup.tsx
  - src/components/widgets/pivot-view.tsx
  - src/components/widgets/status-legend.tsx
  - src/components/widgets/widget-body.tsx
  - src/features/query/spec.ts
  - src/features/widgets/bound.ts
  - src/features/widgets/spec.ts
  - src/features/widgets/status-color.ts
  - src/features/widgets/tone.ts
  - src/lib/monitor.ts
  - src/worker/index.ts
  - src/worker/monitor-job.ts
  - tests/e2e/status-colors.spec.ts
  - tests/features/widgets/bound.test.ts
  - tests/features/widgets/status-color.test.ts
  - tests/features/widgets/tone-schema.test.ts
  - tests/lib/monitor.test.ts
review:
  passes:
    - "n": 1
      by: claude-reviewer-subagent
      at: "2026-11-06T10:32:57Z"
      findings: 0
    - "n": 2
      by: claude-reviewer-subagent
      at: "2026-11-06T10:36:14Z"
      findings: 0
    - "n": 3
      by: claude-reviewer-subagent
      at: "2026-11-06T10:36:16Z"
      findings: 0
evidence:
  check:
    cmd: npm run check
    exit_code: 0
    duration_ms: 168289
    summary: |-
      …tolak NAS"}
      {"level":40,"time":1793961737427,"service":"data-dashboard","host":"127.0.0.1","port":42627,"step":"menulis file uji","code":4,"err":"Failure","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":40,"time":1793961753359,"service":"data-dashboard","check":"B","detail":"koneksi ditolak","msg":"health check gagal"}
      {"level":40,"time":1793961753382,"service":"data-dashboard","check":"Lambat","detail":"Lambat: timeout 20 ms","msg":"health check gagal"}
      {"level":40,"time":1793961753386,"service":"data-dashboard","check":"Y","detail":"mati","msg":"health check gagal"}
      {"level":40,"time":1793961753403,"service":"data-dashboard","check":"Renderer PDF","detail":"renderer tidak menjawab /healthz","msg":"health check gagal"}
      {"level":40,"time":1793961766096,"service":"data-dashboard","err":"Can't reach database server","msg":"sesi shell gagal dibaca"}
      {"level":40,"time":1793961766111,"service":"data-dashboard","err":"\nInvalid `db.datasetVersion.findMany()` invocation in\n/home/user/data-dashboard/src/features/uploads/quota.ts:92:23\n\n  89 \n  90 export async function userUsage(db: Db, userId: string): Promise<Usage> {\n  91   const [versions, refs, reserved] = await Promise.all([\n→ 92     db.datasetVersion.findMany(\nerror: Environment variable not found: DATABASE_URL.\n  -->  schema.prisma:9\n   | \n 8 |   provider = \"postgresql\"\n 9 |   url      = env(\"DATABASE_URL\")\n   | \n\nValidation Error Count: 1","msg":"kuota pengguna tidak terbaca"}

       Test Files  233 passed | 3 skipped (236)
            Tests  3122 passed | 29 skipped (3151)
         Start at  10:41:01
         Duration  116.12s (tests 82%, import 15%, transform 3%)

          Isolate  236 workers spawned · ~94ms startup each (spawn + environment, per file)
                   at least ~7.31s faster with isolate: false — reuses workers across files instead of one per file


      > data-dashboard@1.7.0 audit
      > npm audit --audit-level=high --omit=dev && npm audit --audit-level=critical

      found 0 vulnerabilities
      found 0 vulnerabilities
    at: "2026-11-06T10:42:58Z"
    tree: 46c668969c178af2fdd4ac9bf7771d9f4806ca322c4e523220b3054036cbe8f0
  commits:
    - 2b33214
    - 8124f7c
    - 850026f
    - 95b7bc9
    - 9ab9fd1
    - b1e545a
    - b714998
    - d271413
    - f68d56b
  acceptance:
    total: 1
    done: 1
  audit:
    at: "2026-11-06T10:36:39Z"
    passed: true
    tree: 46c668969c178af2fdd4ac9bf7771d9f4806ca322c4e523220b3054036cbe8f0
    results:
      - name: osv-scanner (dependencies, offline db)
        exit_code: 0
        summary: |-
          Scanning dir .
          Starting filesystem walk for root: /
          Scanned /home/user/data-dashboard/package-lock.json file and found 837 packages
          End status: 438 dirs visited, 2360 inodes visited, 1 Extract calls, 59.850558ms elapsed, 59.850716ms wall time
          Loaded npm local db from /root/.cache/osv-scanner/npm/all.zip
          No issues found
      - name: npm audit (prod high, dev critical)
        exit_code: 0
        summary: |-
          > data-dashboard@1.7.0 audit
          > npm audit --audit-level=high --omit=dev && npm audit --audit-level=critical

          found 0 vulnerabilities
          found 0 vulnerabilities
      - name: aitk secret scan (tracked files)
        exit_code: 0
---

## Objective
(describe the outcome in one paragraph)

## Acceptance criteria
- [x] Given PR ke main, when dibuka/di-push, then workflow menjalankan lint + typecheck + vitest dan gagal bila ada yang merah

## Risk
Impact: hanya CI (GitHub Actions); kode aplikasi tidak berubah.
Security (STRIDE): E — workflow berizin contents:read saja, tanpa secret, hanya event pull_request (fork tanpa akses secret) dan push main.
Rollback: hapus .github/workflows/ci.yml.
Validation: run pertama di PR #8 lulus (lint, typecheck, vitest) dalam 4 menit.

## Notes

- 2026-11-06T10:23:10Z CI berjalan di PR #8: job check lulus (4 menit) pada d271413.

## Security checklist (OWASP ASVS 4.0.3)
<!-- Check each item when verified, or write "N/A: <reason>" after the text and check it. -->
- [x] V1 Architecture: trust boundaries and the components handling sensitive data are identified for this change — N/A: tidak disentuh perubahan ini
- [x] V2 Authentication: credentials are verified server-side; no default, hard-coded, or weak secrets — N/A: tidak disentuh perubahan ini
- [x] V3 Session management: session tokens are random, protected, invalidated on logout and expiry — N/A: tidak disentuh perubahan ini
- [x] V4 Access control: every endpoint/action checks authorization server-side, deny by default (no IDOR) — N/A: tidak disentuh perubahan ini
- [x] V5 Validation, sanitization and encoding: all input validated; output encoded; no injection (SQL, OS, template) — N/A: tidak disentuh perubahan ini
- [x] V6 Stored cryptography: sensitive data at rest uses approved algorithms; keys are not in the code — N/A: tidak disentuh perubahan ini
- [x] V7 Error handling and logging: errors reveal no internals; security events are logged without secrets — N/A: tidak disentuh perubahan ini
- [x] V8 Data protection: personal/sensitive data is minimized, not cached or logged, and removable — N/A: tidak disentuh perubahan ini
- [x] V9 Communication: TLS for all external traffic; certificates validated — N/A: tidak disentuh perubahan ini
- [x] V10 Malicious code: no backdoors, time bombs, or unexplained network calls; dependencies are trusted — action resmi actions/checkout@v4 dan actions/setup-node@v4, npm ci dari lockfile
- [x] V11 Business logic: flows cannot be abused (limits, ordering, replay, race conditions) — N/A: tidak disentuh perubahan ini
- [x] V12 Files and resources: uploads are type/size limited and stored safely; no path traversal or SSRF — N/A: tidak disentuh perubahan ini
- [x] V13 API and web service: API inputs/outputs are schema-validated; CORS and rate limits are deliberate — N/A: tidak disentuh perubahan ini
- [x] V14 Configuration: secure defaults, security headers, no debug in production, dependencies up to date — permissions contents:read, concurrency membatalkan run lama

## Evidence
<!-- Generated by aitk close. -->
- Check: `npm run check` → exit 0 at 2026-11-06T10:42:58Z (168289 ms)
- Acceptance criteria: 1/1 satisfied
- Commits: 2b33214, 8124f7c, 850026f, 95b7bc9, 9ab9fd1, b1e545a, b714998, d271413, f68d56b
- Review pass 1 by claude-reviewer-subagent: 0 findings
- Review pass 2 by claude-reviewer-subagent: 0 findings
- Review pass 3 by claude-reviewer-subagent: 0 findings
