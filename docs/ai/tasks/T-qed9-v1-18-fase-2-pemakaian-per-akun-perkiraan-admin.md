---
id: T-qed9
title: 'v1.18 fase 2: pemakaian per akun (perkiraan, admin) — query berjalan, detik query 15 menit, job berjalan, kuota'
status: done
profile: strict
created: "2026-11-11T14:35:10Z"
updated: "2026-11-11T16:55:07Z"
closed: "2026-11-11T16:55:07Z"
created_by: claude-code
workers:
  - claude-code
branch: claude/cool-babbage-t5yojt
base: d7d32e50e0b64e7f7f47d56c4708a7e09c515aaf
paths:
  - .env.example
  - CHANGELOG.md
  - content/panduan/01-mengenal-data-dashboard.md
  - content/panduan/12-admin-email-dan-backup.md
  - deploy/deploy.sh
  - docker-compose.prod.yml
  - docs/catatan-kerja-claude.md
  - docs/runbook-deploy.md
  - src/app/(app)/admin/page.tsx
  - src/app/(app)/admin/sumber-daya/page.tsx
  - src/app/api/metrics/admin/route.ts
  - src/app/api/metrics/route.ts
  - src/components/admin/resources-panel.tsx
  - src/components/metrics/server-card.tsx
  - src/components/metrics/sparkline.tsx
  - src/components/shell/app-shell.tsx
  - src/features/metrics/accounts.ts
  - src/features/metrics/format.ts
  - src/features/metrics/view.ts
  - src/features/query/grid-gate.ts
  - src/features/query/grid-order.ts
  - src/features/query/order-build-user.ts
  - src/features/whats-new/entries.ts
  - src/instrumentation.ts
  - src/lib/duckdb/engine.ts
  - src/lib/env.ts
  - src/lib/hooks/use-polling.ts
  - src/lib/metrics/accounts.ts
  - src/lib/metrics/cgroup.ts
  - src/lib/metrics/host.ts
  - src/lib/metrics/sampler.ts
  - src/lib/metrics/store.ts
  - src/worker/index.ts
  - tests/components/server-card.test.ts
  - tests/e2e/metrics.spec.ts
  - tests/features/metrics/account-rows.test.ts
  - tests/fixtures/node-exporter/ne1.prom
  - tests/fixtures/node-exporter/ne2.prom
  - tests/lib/env.test.ts
  - tests/lib/metrics-accounts.test.ts
  - tests/lib/metrics-sampler.test.ts
  - tests/lib/metrics.test.ts
review:
  passes:
    - "n": 1
      by: claude-reviewer-subagent
      at: "2026-11-11T15:33:45Z"
      findings: 0
    - "n": 2
      by: claude-reviewer-subagent
      at: "2026-11-11T16:39:55Z"
      findings: 1
    - "n": 3
      by: claude-reviewer-subagent
      at: "2026-11-11T16:43:35Z"
      findings: 0
evidence:
  check:
    cmd: npm run check
    exit_code: 0
    duration_ms: 216055
    summary: |-
      …'t reach database server","msg":"sesi shell gagal dibaca"}
      {"level":40,"time":1794415852539,"service":"data-dashboard","check":"B","detail":"koneksi ditolak","msg":"health check gagal"}
      {"level":40,"time":1794415852563,"service":"data-dashboard","check":"Lambat","detail":"Lambat: timeout 20 ms","msg":"health check gagal"}
      {"level":40,"time":1794415852567,"service":"data-dashboard","check":"Y","detail":"mati","msg":"health check gagal"}
      {"level":40,"time":1794415852583,"service":"data-dashboard","check":"Renderer PDF","detail":"renderer tidak menjawab /healthz","msg":"health check gagal"}
      {"level":40,"time":1794415862936,"service":"data-dashboard","err":{"type":"Error","message":"NOPERM this user has no permissions to run the 'client' command","stack":"Error: NOPERM this user has no permissions to run the 'client' command\n    at Object.<anonymous> (/home/user/data-dashboard/tests/features/versions/queue-position.test.ts:71:17)\n    at Object.Mock [as getWorkers] (file:///home/user/data-dashboard/node_modules/vitest/dist/chunks/spy.DgMTfhrK.js:323:40)\n    at ingestWorkerCount (/home/user/data-dashboard/src/lib/queue/versions.ts:100:40)\n    at /home/user/data-dashboard/tests/features/versions/queue-position.test.ts:69:13\n    at process.processTicksAndRejections (node:internal/process/task_queues:103:5)\n    at async file:///home/user/data-dashboard/node_modules/vitest/dist/chunks/run.BTlFXlnv.js:2783:20"},"msg":"jumlah worker ingest gagal dibaca"}

       Test Files  251 passed | 1 skipped (252)
            Tests  3330 passed | 10 skipped (3340)
         Start at  16:48:43
         Duration  150.56s (tests 79%, import 17%, transform 3%)

          Isolate  252 workers spawned · ~129ms startup each (spawn + environment, per file)
                   at least ~10.68s faster with isolate: false — reuses workers across files instead of one per file


      > data-dashboard@1.17.1 audit
      > npm audit --audit-level=high --omit=dev && npm audit --audit-level=critical

      found 0 vulnerabilities
      found 0 vulnerabilities
    at: "2026-11-11T16:51:15Z"
    tree: b59a72576637df9c19c5f3769acd9a787e6a825745f0d0a53355029f0d969d10
  commits:
    - 10be0fe
    - 320d807
    - 4a2e710
    - 53b72de
    - 562459f
    - 5a2674d
    - 6237d6d
    - 77a5cd1
    - 7ddd569
    - 7e67256
    - 914b030
    - 957a6dd
    - "9803850"
    - a04e7fb
    - b421bcc
    - d7d32e5
    - e4b98f0
    - ef3422a
    - fd66af5
  acceptance:
    total: 1
    done: 1
  audit:
    at: "2026-11-11T16:51:21Z"
    passed: true
    tree: b59a72576637df9c19c5f3769acd9a787e6a825745f0d0a53355029f0d969d10
    results:
      - name: osv-scanner (dependencies, offline db)
        exit_code: 0
        summary: |-
          Scanning dir .
          Starting filesystem walk for root: /
          Scanned /home/user/data-dashboard/package-lock.json file and found 837 packages
          End status: 551 dirs visited, 4585 inodes visited, 1 Extract calls, 120.806368ms elapsed, 120.806669ms wall time
          Loaded npm local db from /root/.cache/osv-scanner/npm/all.zip
          No issues found
      - name: npm audit (prod high, dev critical)
        exit_code: 0
        summary: |-
          > data-dashboard@1.17.1 audit
          > npm audit --audit-level=high --omit=dev && npm audit --audit-level=critical

          found 0 vulnerabilities
          found 0 vulnerabilities
      - name: aitk secret scan (tracked files)
        exit_code: 0
---

## Objective
Admin melihat akun mana yang paling membebani server saat ini sebagai perkiraan: waktu eksekusi query DuckDB ± 15 menit terakhir, query yang sedang berjalan, pekerjaan worker yang berjalan (unggah, olah ulang/pemetaan, ekspor/PDF), dan storage terpakai — tanpa mengklaim CPU/RAM persis per user.

## Acceptance criteria
- [x] Tabel per akun (admin): query berjalan, detik query 15 menit terakhir, job unggah/ingest/ekspor/PDF berjalan, kuota storage terpakai — urut terberat

## Risk
Impact: instrumentasi QueryEngine.withUser/withGlobal dan GridGate.withUser (AsyncLocalStorage; tanpa mengubah urutan slot), pelapor app/worker menulis 1 hash + 1 ember menit per 10 dtk, API admin membaca job aktif (≤ 100/antrean) + userUsage ≤ 20 akun (cache 60 dtk). Security (STRIDE): Information disclosure — email/nama akun hanya di API admin (404 non-admin); tidak ada isi query/data. DoS — tabel dibatasi 20, gagal per akun tidak menjatuhkan halaman. Rollback: tanpa migrasi; kunci Redis metrics:acct:* kedaluwarsa sendiri. Validation: unit pelacak (ALS, idempoten, berjalan lintas snapshot), store (jendela 15 menit, proses basi), ranking, pemasangan di QueryEngine/GridGate nyata; e2e tabel per akun + kegagalan sebagian; suite query/lib 683 lulus.

## Notes
- 2026-11-11T15:33:49Z Review subagen independen (putaran 2 gabungan): 0 blocking, 7 Low; L1/L2/L3/L5/L6/L7 + konstanta MAP_VERSION_JOB diperbaiki e4b98f0; uji unit jobsByUser → T-zjwh.
- 2026-11-11T16:43:37Z Konfirmasi review 5a2674d: semua klaim benar, uji mutasi 12/13 tertangkap, 0 blocking; 2 Low → T-zjwh.

## Security checklist (OWASP ASVS 4.0.3)
<!-- Check each item when verified, or write "N/A: <reason>" after the text and check it. -->
- [x] V1 Architecture: trust boundaries and the components handling sensitive data are identified for this change — data per akun (email, nama, waktu query, job, storage) hanya lewat /api/metrics/admin; pelacak di proses app/worker menyimpan userId + angka ke Redis
- [x] V2 Authentication: credentials are verified server-side; no default, hard-coded, or weak secrets — N/A: tidak disentuh perubahan ini
- [x] V3 Session management: session tokens are random, protected, invalidated on logout and expiry — N/A: sesi tidak berubah
- [x] V4 Access control: every endpoint/action checks authorization server-side, deny by default (no IDOR) — requireAdmin pada API dan halaman (404 non-admin, 401 tanpa sesi); /api/metrics tidak memuat data akun (diuji)
- [x] V5 Validation, sanitization and encoding: all input validated; output encoded; no injection (SQL, OS, template) — tanpa input pengguna; id job/versi/ekspor dari BullMQ dipakai lewat Prisma (parameterized), bukan SQL mentah
- [x] V6 Stored cryptography: sensitive data at rest uses approved algorithms; keys are not in the code — N/A: tidak disentuh perubahan ini
- [x] V7 Error handling and logging: errors reveal no internals; security events are logged without secrets — kegagalan per akun → accounts null + log warn tanpa data pribadi; halaman tetap tampil
- [x] V8 Data protection: personal/sensitive data is minimized, not cached or logged, and removable — minimal: email/nama hanya untuk admin; tidak ada isi query/data; ember Redis kedaluwarsa 20 menit, hash proses ber-TTL 10 menit
- [x] V9 Communication: TLS for all external traffic; certificates validated — N/A: tidak disentuh perubahan ini
- [x] V10 Malicious code: no backdoors, time bombs, or unexplained network calls; dependencies are trusted — N/A: tidak disentuh perubahan ini
- [x] V11 Business logic: flows cannot be abused (limits, ordering, replay, race conditions) — tabel dibatasi 20 akun, job ≤ 100/antrean, userUsage 3 bersamaan + cache 5 menit; instrumentasi tidak mengubah urutan/slot query (diuji)
- [x] V12 Files and resources: uploads are type/size limited and stored safely; no path traversal or SSRF — N/A: tidak disentuh perubahan ini
- [x] V13 API and web service: API inputs/outputs are schema-validated; CORS and rate limits are deliberate — respons no-store; tanpa endpoint baru selain field di API admin yang ada
- [x] V14 Configuration: secure defaults, security headers, no debug in production, dependencies up to date — N/A: tidak disentuh perubahan ini

## Evidence
<!-- Generated by aitk close. -->
- Check: `npm run check` → exit 0 at 2026-11-11T16:51:15Z (216055 ms)
- Acceptance criteria: 1/1 satisfied
- Commits: 10be0fe, 320d807, 4a2e710, 53b72de, 562459f, 5a2674d, 6237d6d, 77a5cd1, 7ddd569, 7e67256, 914b030, 957a6dd, 9803850, a04e7fb, b421bcc, d7d32e5, e4b98f0, ef3422a, fd66af5
- Review pass 1 by claude-reviewer-subagent: 0 findings
- Review pass 2 by claude-reviewer-subagent: 1 findings
- Review pass 3 by claude-reviewer-subagent: 0 findings
