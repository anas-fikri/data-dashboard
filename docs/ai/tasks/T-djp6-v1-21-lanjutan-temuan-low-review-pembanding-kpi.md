---
id: T-djp6
title: 'v1.21 lanjutan: temuan Low review pembanding KPI/kartu Server (target 0 saat baru dipilih, bawaan ukuran sama dengan ni…'
status: in_review
profile: strict
created: "2026-11-13T01:59:30Z"
updated: "2026-11-13T02:49:53Z"
created_by: claude-code
workers:
  - claude-code
branch: claude/cool-babbage-t5yojt
base: 76c1d1c5225db8cda4e07bc0a5094fa53e522e19
paths:
  - src/components/dashboards/config-sections.tsx
  - src/components/dashboards/kpi-compare-fields.tsx
  - src/components/dashboards/widget-config.tsx
  - src/components/render/print-card.tsx
  - src/components/widgets/kpi-compare.ts
  - src/components/widgets/kpi-view.tsx
  - src/components/widgets/widget-body.tsx
  - src/features/query/widget.ts
  - tests/components/kpi-compare.test.ts
  - tests/features/query/absent.test.ts
  - tests/features/query/widget-plan.test.ts
review:
  passes:
    - "n": 1
      by: claude-reviewer-subagent
      at: "2026-11-13T02:38:50Z"
      findings: 5
evidence:
  check:
    cmd: npm run check
    exit_code: 0
    duration_ms: 207527
    summary: |-
      …n't reach database server","msg":"sesi shell gagal dibaca"}
      {"level":40,"time":1794538170302,"service":"data-dashboard","check":"B","detail":"koneksi ditolak","msg":"health check gagal"}
      {"level":40,"time":1794538170325,"service":"data-dashboard","check":"Lambat","detail":"Lambat: timeout 20 ms","msg":"health check gagal"}
      {"level":40,"time":1794538170333,"service":"data-dashboard","check":"Y","detail":"mati","msg":"health check gagal"}
      {"level":40,"time":1794538170358,"service":"data-dashboard","check":"Renderer PDF","detail":"renderer tidak menjawab /healthz","msg":"health check gagal"}
      {"level":40,"time":1794538181052,"service":"data-dashboard","err":{"type":"Error","message":"NOPERM this user has no permissions to run the 'client' command","stack":"Error: NOPERM this user has no permissions to run the 'client' command\n    at Object.<anonymous> (/home/user/data-dashboard/tests/features/versions/queue-position.test.ts:71:17)\n    at Object.Mock [as getWorkers] (file:///home/user/data-dashboard/node_modules/vitest/dist/chunks/spy.DgMTfhrK.js:323:40)\n    at ingestWorkerCount (/home/user/data-dashboard/src/lib/queue/versions.ts:100:40)\n    at /home/user/data-dashboard/tests/features/versions/queue-position.test.ts:69:13\n    at process.processTicksAndRejections (node:internal/process/task_queues:103:5)\n    at async file:///home/user/data-dashboard/node_modules/vitest/dist/chunks/run.BTlFXlnv.js:2783:20"},"msg":"jumlah worker ingest gagal dibaca"}

       Test Files  253 passed | 1 skipped (254)
            Tests  3381 passed | 10 skipped (3391)
         Start at  02:47:32
         Duration  139.03s (tests 82%, import 16%, transform 3%)

          Isolate  254 workers spawned · ~108ms startup each (spawn + environment, per file)
                   at least ~9.00s faster with isolate: false — reuses workers across files instead of one per file


      > data-dashboard@1.21.0 audit
      > npm audit --audit-level=high --omit=dev && npm audit --audit-level=critical

      found 0 vulnerabilities
      found 0 vulnerabilities
    at: "2026-11-13T02:49:52Z"
    tree: aae2d6e1ddc6d6ea3e5fa1c7728aabb70f69e73d69ba531c69dc1b5a5c0baef1
  commits:
    - 1fa2a2b
    - 589ab6c
    - 76c1d1c
    - 8b7909f
    - a544a24
    - f7cf853
  acceptance:
    total: 2
    done: 2
  audit:
    at: "2026-11-13T02:42:23Z"
    passed: true
    tree: aae2d6e1ddc6d6ea3e5fa1c7728aabb70f69e73d69ba531c69dc1b5a5c0baef1
    results:
      - name: osv-scanner (dependencies, offline db)
        exit_code: 0
        summary: |-
          Scanning dir .
          Starting filesystem walk for root: /
          Scanned /home/user/data-dashboard/package-lock.json file and found 837 packages
          End status: 558 dirs visited, 5279 inodes visited, 1 Extract calls, 122.270677ms elapsed, 122.270875ms wall time
          Loaded npm local db from /root/.cache/osv-scanner/npm/all.zip
          No issues found
      - name: npm audit (prod high, dev critical)
        exit_code: 0
        summary: |-
          > data-dashboard@1.21.0 audit
          > npm audit --audit-level=high --omit=dev && npm audit --audit-level=critical

          found 0 vulnerabilities
          found 0 vulnerabilities
      - name: aitk secret scan (tracked files)
        exit_code: 0
---

## Objective
Merapikan sisa temuan review v1.21 pada pembanding KPI (target, ukuran pembanding) agar tidak menampilkan nilai/warna yang menyesatkan.

## Acceptance criteria
- [x] Target baru tidak tersimpan sebelum diisi; kolom pembanding tersembunyi/hilang tidak mematikan angka utama ('tidak tersedia')
- [x] Penilaian 'tanpa warna' → target netral; testid isian pembanding unik; uji unit + e2e kpi-drill

## Risk
Impact: tampilan + rencana query KPI saja. Security: tanpa permukaan baru. Rollback: tanpa migrasi. Validation: unit + e2e kpi-drill.

## Notes

- 2026-11-13T02:03:24Z Sisa review v1.21: L1 target 0 saat baru dipilih tampil hijau; L3 bawaan ukuran pembanding = nilai (100%); L5 kolom pembanding tersembunyi → COLUMN_UNAVAILABLE untuk seluruh KPI; L6 testid config-agg ganda; L7 penilaian 'tanpa warna' tetap mewarnai target; L8 tombol ciut tanpa data/angka basi; ubah format setelah target mengubah arti target; editor belum memeriksa ukuran pembanding (measureMismatch); uji unit absentNames KPI + target persen.

## Security checklist (OWASP ASVS 4.0.3)
<!-- Check each item when verified, or write "N/A: <reason>" after the text and check it. -->
- [x] V1 Architecture: trust boundaries and the components handling sensitive data are identified for this change — N/A: hanya tampilan/rencana query KPI, tanpa input/akses baru
- [x] V2 Authentication: credentials are verified server-side; no default, hard-coded, or weak secrets — N/A: hanya tampilan/rencana query KPI, tanpa input/akses baru
- [x] V3 Session management: session tokens are random, protected, invalidated on logout and expiry — N/A: hanya tampilan/rencana query KPI, tanpa input/akses baru
- [x] V4 Access control: every endpoint/action checks authorization server-side, deny by default (no IDOR) — N/A: hanya tampilan/rencana query KPI, tanpa input/akses baru
- [x] V5 Validation, sanitization and encoding: all input validated; output encoded; no injection (SQL, OS, template) — N/A: hanya tampilan/rencana query KPI, tanpa input/akses baru
- [x] V6 Stored cryptography: sensitive data at rest uses approved algorithms; keys are not in the code — N/A: hanya tampilan/rencana query KPI, tanpa input/akses baru
- [x] V7 Error handling and logging: errors reveal no internals; security events are logged without secrets — N/A: hanya tampilan/rencana query KPI, tanpa input/akses baru
- [x] V8 Data protection: personal/sensitive data is minimized, not cached or logged, and removable — N/A: hanya tampilan/rencana query KPI, tanpa input/akses baru
- [x] V9 Communication: TLS for all external traffic; certificates validated — N/A: hanya tampilan/rencana query KPI, tanpa input/akses baru
- [x] V10 Malicious code: no backdoors, time bombs, or unexplained network calls; dependencies are trusted — N/A: hanya tampilan/rencana query KPI, tanpa input/akses baru
- [x] V11 Business logic: flows cannot be abused (limits, ordering, replay, race conditions) — N/A: hanya tampilan/rencana query KPI, tanpa input/akses baru
- [x] V12 Files and resources: uploads are type/size limited and stored safely; no path traversal or SSRF — N/A: hanya tampilan/rencana query KPI, tanpa input/akses baru
- [x] V13 API and web service: API inputs/outputs are schema-validated; CORS and rate limits are deliberate — N/A: hanya tampilan/rencana query KPI, tanpa input/akses baru
- [x] V14 Configuration: secure defaults, security headers, no debug in production, dependencies up to date — N/A: hanya tampilan/rencana query KPI, tanpa input/akses baru

## Evidence
<!-- Generated by aitk close. -->
- Check: `npm run check` → exit 0 at 2026-11-13T02:49:52Z (207527 ms)
- Acceptance criteria: 2/2 satisfied
- Commits: 1fa2a2b, 589ab6c, 76c1d1c, 8b7909f, a544a24, f7cf853
- Review pass 1 by claude-reviewer-subagent: 5 findings
