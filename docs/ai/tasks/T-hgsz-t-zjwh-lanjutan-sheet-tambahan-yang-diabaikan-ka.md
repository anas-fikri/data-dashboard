---
id: T-hgsz
title: 'T-zjwh lanjutan: sheet tambahan yang diabaikan karena sheet lain butuh pemetaan diberi alasan khusus; deteksi isi sheet…'
status: done
profile: strict
created: "2026-11-13T06:31:50Z"
updated: "2026-11-13T07:21:06Z"
closed: "2026-11-13T07:21:06Z"
created_by: claude-code
workers:
  - claude-code
branch: claude/cool-babbage-t5yojt
base: dcf39e5933767ceb20eddce3cbb1d772da10d231
paths:
  - CHANGELOG.md
  - docker-compose.prod.yml
  - docs/runbook-deploy.md
  - package.json
  - src/app/api/metrics/route.ts
  - src/components/admin/resources-panel.tsx
  - src/components/dashboards/config-sections.tsx
  - src/components/dashboards/widget-config-model.ts
  - src/components/dashboards/widget-config.tsx
  - src/components/datasets/period-review-form.tsx
  - src/components/metrics/server-card.tsx
  - src/components/shell/app-shell.tsx
  - src/components/ui/search-select.tsx
  - src/features/ingest/period-ingest-repo.ts
  - src/features/ingest/period-ingest.ts
  - src/features/ingest/period-plan.ts
  - src/features/ingest/period-upload-plan.ts
  - src/features/metrics/accounts.ts
  - src/features/metrics/view.ts
  - src/lib/metrics/host.ts
  - src/lib/metrics/sampler.ts
  - src/lib/metrics/store.ts
  - tests/components/widget-config.test.ts
  - tests/features/ingest/period-ingest.test.ts
  - tests/features/ingest/period-plan.test.ts
  - tests/features/metrics-accounts-jobs.test.ts
  - tests/lib/metrics.test.ts
review:
  passes:
    - "n": 1
      by: claude-reviewer-subagent
      at: "2026-11-13T07:12:25Z"
      findings: 1
    - "n": 2
      by: claude-reviewer-subagent
      at: "2026-11-13T07:12:52Z"
      findings: 0
evidence:
  check:
    cmd: npm run check
    exit_code: 0
    duration_ms: 228356
    summary: |-
      …ice":"data-dashboard","check":"Renderer PDF","detail":"renderer tidak menjawab /healthz","msg":"health check gagal"}
      {"level":40,"time":1794554449621,"service":"data-dashboard","err":{"type":"Error","message":"NOPERM this user has no permissions to run the 'client' command","stack":"Error: NOPERM this user has no permissions to run the 'client' command\n    at Object.<anonymous> (/home/user/data-dashboard/tests/features/versions/queue-position.test.ts:71:17)\n    at Object.Mock [as getWorkers] (file:///home/user/data-dashboard/node_modules/vitest/dist/chunks/spy.DgMTfhrK.js:323:40)\n    at queueWorkerCount (/home/user/data-dashboard/src/lib/queue/versions.ts:102:40)\n    at ingestWorkerCount (/home/user/data-dashboard/src/lib/queue/versions.ts:124:10)\n    at /home/user/data-dashboard/tests/features/versions/queue-position.test.ts:69:13\n    at process.processTicksAndRejections (node:internal/process/task_queues:103:5)\n    at async file:///home/user/data-dashboard/node_modules/vitest/dist/chunks/run.BTlFXlnv.js:2783:20"},"msg":"jumlah worker gagal dibaca"}
      {"level":40,"time":1794554454186,"service":"data-dashboard","userId":"slow","err":"timeout","msg":"storage per akun gagal dihitung"}
      {"level":40,"time":1794554454187,"service":"data-dashboard","userId":"slow","err":"timeout","msg":"storage per akun gagal dihitung"}
      {"level":40,"time":1794554454188,"service":"data-dashboard","userId":"slow","err":"timeout","msg":"storage per akun gagal dihitung"}

       Test Files  253 passed | 3 skipped (256)
            Tests  3379 passed | 29 skipped (3408)
         Start at  07:18:28
         Duration  155.11s (tests 81%, import 16%, transform 3%)

          Isolate  256 workers spawned · ~124ms startup each (spawn + environment, per file)
                   at least ~10.43s faster with isolate: false — reuses workers across files instead of one per file


      > data-dashboard@1.21.5 audit
      > npm audit --audit-level=high --omit=dev && npm audit --audit-level=critical

      found 0 vulnerabilities
      found 0 vulnerabilities
    at: "2026-11-13T07:21:04Z"
    tree: eb33ce13e3c65bad42e5ea2773715d394752a26e862637e43d9be56191a5aea6
  commits:
    - 18ad0a8
    - 1faf55a
    - 4299c61
    - 434c0b7
    - 480fe60
    - 683ea1f
    - "7336191"
    - 83c6e64
    - 95a30ac
    - 95f7b45
    - b1036b4
    - ba74587
    - bea7eec
    - bf81be6
    - dcf39e5
    - e85dcdd
    - ffc9089
  acceptance:
    total: 3
    done: 3
  audit:
    at: "2026-11-13T07:13:06Z"
    passed: true
    tree: eb33ce13e3c65bad42e5ea2773715d394752a26e862637e43d9be56191a5aea6
    results:
      - name: osv-scanner (dependencies, offline db)
        exit_code: 0
        summary: |-
          Scanning dir .
          Starting filesystem walk for root: /
          Scanned /home/user/data-dashboard/package-lock.json file and found 837 packages
          End status: 558 dirs visited, 5718 inodes visited, 1 Extract calls, 106.553598ms elapsed, 106.553806ms wall time
          Loaded npm local db from /root/.cache/osv-scanner/npm/all.zip
          No issues found
      - name: npm audit (prod high, dev critical)
        exit_code: 0
        summary: |-
          > data-dashboard@1.21.5 audit
          > npm audit --audit-level=high --omit=dev && npm audit --audit-level=critical

          found 0 vulnerabilities
          found 0 vulnerabilities
      - name: aitk secret scan (tracked files)
        exit_code: 0
---

## Objective
Layar tinjauan unggahan periode memberi alasan yang tepat untuk sheet yang diabaikan karena pemetaan kolom, dan memperingatkan sheet tergabung yang kemungkinan salinan (judul kolom + jumlah baris sama) agar baris tidak terhitung dua kali.

## Acceptance criteria
- [x] Sheet tambahan yang diabaikan karena sheet lain perlu pemetaan kolom diberi alasan khusus di layar tinjauan (bukan 'tidak cocok dengan sheet data mana pun')
- [x] Sheet tergabung dengan judul kolom + jumlah baris sama persis ditandai 'Kemungkinan salinan' di tinjauan
- [x] Rencana/periodMeta lama tanpa field baru tetap terbaca (default)

## Risk
Impact: rencana periode (field opsional ignoredForMapping, mergedSheets[].copies), ingest periode, layar tinjauan. Security (STRIDE): N/A — hanya teks peringatan dari nama sheet (dirender React, ter-escape). Rollback: versi sebelumnya; rencana dengan field baru tetap terbaca karena zod mengabaikan field tak dikenal? (versi lama: object strip → field baru dibuang, aman). Validation: uji ingest (salinan) + rencana (ignoredForMapping); aitk check.

## Notes

## Security checklist (OWASP ASVS 4.0.3)
<!-- Check each item when verified, or write "N/A: <reason>" after the text and check it. -->
- [x] V1 Architecture: trust boundaries and the components handling sensitive data are identified for this change — N/A — tidak tersentuh
- [x] V2 Authentication: credentials are verified server-side; no default, hard-coded, or weak secrets — N/A — tidak tersentuh
- [x] V3 Session management: session tokens are random, protected, invalidated on logout and expiry — N/A — tidak tersentuh
- [x] V4 Access control: every endpoint/action checks authorization server-side, deny by default (no IDOR) — N/A — tidak tersentuh
- [x] V5 Validation, sanitization and encoding: all input validated; output encoded; no injection (SQL, OS, template) — nama sheet ditampilkan lewat React (ter-escape); SQL sidik isi memakai lit() untuk path
- [x] V6 Stored cryptography: sensitive data at rest uses approved algorithms; keys are not in the code — N/A — tidak tersentuh
- [x] V7 Error handling and logging: errors reveal no internals; security events are logged without secrets — N/A — tidak tersentuh
- [x] V8 Data protection: personal/sensitive data is minimized, not cached or logged, and removable — N/A — tidak tersentuh
- [x] V9 Communication: TLS for all external traffic; certificates validated — N/A — tidak tersentuh
- [x] V10 Malicious code: no backdoors, time bombs, or unexplained network calls; dependencies are trusted — N/A — tidak tersentuh
- [x] V11 Business logic: flows cannot be abused (limits, ordering, replay, race conditions) — hanya peringatan, unggahan tidak diblokir
- [x] V12 Files and resources: uploads are type/size limited and stored safely; no path traversal or SSRF — membaca parquet lokal worker sendiri
- [x] V13 API and web service: API inputs/outputs are schema-validated; CORS and rate limits are deliberate — N/A — tidak tersentuh
- [x] V14 Configuration: secure defaults, security headers, no debug in production, dependencies up to date — N/A — tidak tersentuh

## Evidence
<!-- Generated by aitk close. -->
- Check: `npm run check` → exit 0 at 2026-11-13T07:21:04Z (228356 ms)
- Acceptance criteria: 3/3 satisfied
- Commits: 18ad0a8, 1faf55a, 4299c61, 434c0b7, 480fe60, 683ea1f, 7336191, 83c6e64, 95a30ac, 95f7b45, b1036b4, ba74587, bea7eec, bf81be6, dcf39e5, e85dcdd, ffc9089
- Review pass 1 by claude-reviewer-subagent: 1 findings
- Review pass 2 by claude-reviewer-subagent: 0 findings
