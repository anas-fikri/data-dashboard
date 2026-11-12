---
id: T-ee46
title: 'v1.18 fase 1: monitor sumber daya — node-exporter + relay, sampler app → Redis, kartu sidebar (semua user), halaman adm…'
status: done
profile: strict
created: "2026-11-11T14:35:09Z"
updated: "2026-11-11T16:24:47Z"
closed: "2026-11-11T16:24:47Z"
created_by: claude-code
workers:
  - claude-code
branch: claude/cool-babbage-t5yojt
base: 320d80782f5862b22eb381f8d959b8ff393bea5f
paths:
  - .env.example
  - CHANGELOG.md
  - content/panduan/01-mengenal-data-dashboard.md
  - content/panduan/12-admin-email-dan-backup.md
  - deploy/deploy.sh
  - docker-compose.prod.yml
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
      at: "2026-11-11T15:33:43Z"
      findings: 7
    - "n": 2
      by: claude-reviewer-subagent
      at: "2026-11-11T15:33:44Z"
      findings: 0
evidence:
  check:
    cmd: npm run check
    exit_code: 0
    duration_ms: 218127
    summary: |-
      …'t reach database server","msg":"sesi shell gagal dibaca"}
      {"level":40,"time":1794413957796,"service":"data-dashboard","check":"B","detail":"koneksi ditolak","msg":"health check gagal"}
      {"level":40,"time":1794413957821,"service":"data-dashboard","check":"Lambat","detail":"Lambat: timeout 20 ms","msg":"health check gagal"}
      {"level":40,"time":1794413957825,"service":"data-dashboard","check":"Y","detail":"mati","msg":"health check gagal"}
      {"level":40,"time":1794413957838,"service":"data-dashboard","check":"Renderer PDF","detail":"renderer tidak menjawab /healthz","msg":"health check gagal"}
      {"level":40,"time":1794413972848,"service":"data-dashboard","err":{"type":"Error","message":"NOPERM this user has no permissions to run the 'client' command","stack":"Error: NOPERM this user has no permissions to run the 'client' command\n    at Object.<anonymous> (/home/user/data-dashboard/tests/features/versions/queue-position.test.ts:71:17)\n    at Object.Mock [as getWorkers] (file:///home/user/data-dashboard/node_modules/vitest/dist/chunks/spy.DgMTfhrK.js:323:40)\n    at ingestWorkerCount (/home/user/data-dashboard/src/lib/queue/versions.ts:100:40)\n    at /home/user/data-dashboard/tests/features/versions/queue-position.test.ts:69:13\n    at process.processTicksAndRejections (node:internal/process/task_queues:103:5)\n    at async file:///home/user/data-dashboard/node_modules/vitest/dist/chunks/run.BTlFXlnv.js:2783:20"},"msg":"jumlah worker ingest gagal dibaca"}

       Test Files  250 passed | 1 skipped (251)
            Tests  3328 passed | 10 skipped (3338)
         Start at  16:17:19
         Duration  146.26s (tests 80%, import 17%, transform 3%)

          Isolate  251 workers spawned · ~124ms startup each (spawn + environment, per file)
                   at least ~10.24s faster with isolate: false — reuses workers across files instead of one per file


      > data-dashboard@1.17.1 audit
      > npm audit --audit-level=high --omit=dev && npm audit --audit-level=critical

      found 0 vulnerabilities
      found 0 vulnerabilities
    at: "2026-11-11T16:19:46Z"
    tree: b1471083ad02b371ec3fc4011b4e908011c9f796b675961246a6a9b760a9d896
  commits:
    - 320d807
    - 53b72de
    - 562459f
    - 6237d6d
    - 77a5cd1
    - 7e67256
    - 914b030
    - 957a6dd
    - "9803850"
    - a04e7fb
    - b421bcc
    - d7d32e5
    - e4b98f0
    - ef3422a
  acceptance:
    total: 4
    done: 4
  audit:
    at: "2026-11-11T16:20:46Z"
    passed: true
    tree: b1471083ad02b371ec3fc4011b4e908011c9f796b675961246a6a9b760a9d896
    results:
      - name: osv-scanner (dependencies, offline db)
        exit_code: 0
        summary: |-
          Scanning dir .
          Starting filesystem walk for root: /
          Scanned /home/user/data-dashboard/package-lock.json file and found 837 packages
          End status: 550 dirs visited, 4516 inodes visited, 1 Extract calls, 107.149564ms elapsed, 107.14978ms wall time
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
Pemilik dan semua user login bisa melihat sekilas beban server (CPU, RAM, disk, jaringan, status pemroses unggahan) di sidebar, dan admin bisa mencari penyebab server lambat (grafik 1 jam/24 jam, disk per mount, load per inti, iowait, pemakaian container app/worker) tanpa SSH — menjawab insiden 2026-11-11 (load 211 tanpa penyebab terlihat, worker mati > 3 jam tanpa kabar). Opt-in lewat profil compose `monitor` + METRICS_NODE_URL; tanpa itu tidak ada container baru dan kartu tidak tampil.

## Acceptance criteria
- [x] node-exporter (dipin digest, host network + pid host, rootfs ro, 127.0.0.1:9100) + metrics-relay socat bersumber APP_SUBNETS (pola pg-relay) di compose produksi; runbook §29 pasang/verifikasi/rollback
- [x] Sampler di proses app tiap 10 dtk (satu sampler lewat kunci Redis): CPU %, load, RAM/swap, disk, jaringan ↓↑ antarmuka fisik, antrean ingest + jumlah worker; riwayat 1 jam/10 dtk + 24 jam/1 menit; METRICS_NODE_URL kosong → mati dengan pesan
- [x] Kartu sidebar untuk semua user login: angka + sparkline 1 jam, status pemroses + antrean, warna ambang, polling 10 dtk berhenti saat tab tersembunyi; sidebar diciutkan → ikon status
- [x] Halaman Admin › Sumber daya: grafik 1 jam/24 jam + tabel per layanan (app, worker dari cgroup sendiri); API admin 403 untuk non-admin; API tidak memuat host/IP/nama antarmuka

## Risk
Impact: kartu baru di sidebar semua halaman (polling 10 dtk/user, berhenti saat tab tersembunyi atau monitor mati), dua container baru di VM bersama (node-exporter host network + pid host baca-saja, metrics-relay socat), sampler 1 permintaan HTTP/10 dtk di proses app, Redis ± 0,5 MB. Security (STRIDE): Information disclosure — API semua user hanya angka gabungan (tanpa host/IP/antarmuka/mount/jumlah worker), API admin 404 untuk non-admin; exporter hanya 127.0.0.1, relay hanya APP_SUBNETS, tanpa docker.sock, image dipin digest, cap_drop ALL + read_only + no-new-privileges; DoS — fetch timeout 3 dtk, kunci Redis satu sampler, daftar dipangkas. Rollback: tanpa migrasi; image v1.17.x aman, matikan profil monitor (runbook §29). Validation: unit (parser fixture node_exporter asli, hitung titik, Redis palsu, cgroup v1/v2, env), e2e metrics.spec (akses 401/404, kartu, ikon diciutkan, halaman admin), sampler nyata dengan node-exporter lokal mengisi Redis.

## Notes
- 2026-11-11T14:35:26Z Keputusan pemilik 2026-11-11: ringkasan server untuk semua user login (asumsi aman: per layanan + per akun admin saja), node_exporter boleh, per akun perkiraan. Rencana docs/ai/plans/2026-11-11-monitor-sumber-daya.md, ADR-0010 (proposed).
- 2026-11-11T15:09:26Z AC deviasi tercatat: port exporter 127.0.0.1:19109 (bukan 9100, agar tidak bentrok node_exporter aplikasi lain di VM bersama), relay 172.17.0.1:19100; API admin non-admin = 404 (pola requireAdmin proyek, bukan 403). Fallback cgroup v1 ditambah (sandbox v1).
- 2026-11-11T15:33:47Z Review subagen independen: putaran 1 = 0 blocking, 7 Medium + 11 Low (M1–M7, L1/L2/L3/L5/L6/L9/L10 diperbaiki a04e7fb/53b72de); putaran 2 = semua perbaikan terverifikasi, 0 blocking, 3 Low (2 diperbaiki e4b98f0, 1 → T-zjwh). Dicatat: --findings 7 (Medium putaran 1) lalu 0.

## Security checklist (OWASP ASVS 4.0.3)
<!-- Check each item when verified, or write "N/A: <reason>" after the text and check it. -->
- [x] V1 Architecture: trust boundaries and the components handling sensitive data are identified for this change — batas kepercayaan: node-exporter (host, baca-saja) → relay hanya APP_SUBNETS → sampler app → Redis → API; ringkasan semua user vs detail admin (ADR-0010)
- [x] V2 Authentication: credentials are verified server-side; no default, hard-coded, or weak secrets — tidak ada kredensial baru; exporter tanpa auth tetapi hanya 127.0.0.1 + relay bersubnet; Redis tetap ber-password
- [x] V3 Session management: session tokens are random, protected, invalidated on logout and expiry — N/A: memakai sesi yang ada (requireUser/requireAdmin), tidak mengubah sesi
- [x] V4 Access control: every endpoint/action checks authorization server-side, deny by default (no IDOR) — /api/metrics withUser (401 tanpa sesi); /api/metrics/admin + halaman requireAdmin (404 non-admin, 401 tanpa sesi) — diuji e2e metrics.spec
- [x] V5 Validation, sanitization and encoding: all input validated; output encoded; no injection (SQL, OS, template) — API tanpa input pengguna (GET tanpa parameter); teks /metrics diurai hanya keluarga yang dikenal, angka divalidasi Number.isFinite; label tidak dirender sebagai HTML
- [x] V6 Stored cryptography: sensitive data at rest uses approved algorithms; keys are not in the code — N/A: tidak ada data sensitif tersimpan; Redis metrics:* hanya angka agregat
- [x] V7 Error handling and logging: errors reveal no internals; security events are logged without secrets — galat API → 503 tanpa detail; sampler gagal → log warn tanpa rahasia (pesan galat fetch saja); METRICS_NODE_URL tidak memuat kredensial
- [x] V8 Data protection: personal/sensitive data is minimized, not cached or logged, and removable — ringkasan semua user tanpa host/IP/antarmuka/mount/jumlah worker (diuji unit + e2e); riwayat 24 jam, kedaluwarsa/dipangkas
- [x] V9 Communication: TLS for all external traffic; certificates validated — lalu lintas exporter→relay→app hanya di host/bridge Docker lokal (tanpa jaringan luar); trafik pengguna tetap lewat Caddy TLS
- [x] V10 Malicious code: no backdoors, time bombs, or unexplained network calls; dependencies are trusted — image dipin digest (prom/node-exporter v1.8.2, alpine/socat 1.8.0.3 sama dengan pg-relay); tanpa dependensi npm baru; tanpa docker.sock
- [x] V11 Business logic: flows cannot be abused (limits, ordering, replay, race conditions) — satu sampler lewat SET NX + perpanjangan atomik Lua; penjaga tick ganda; daftar Redis dipangkas (LTRIM) dan ber-TTL; polling klien berhenti saat monitor mati/tab tersembunyi
- [x] V12 Files and resources: uploads are type/size limited and stored safely; no path traversal or SSRF — SSRF: METRICS_NODE_URL hanya dari env server (pemilik), bukan input pengguna; fetch timeout 3 dtk; tanpa unggahan file
- [x] V13 API and web service: API inputs/outputs are schema-validated; CORS and rate limits are deliberate — respons JSON no-store; tanpa CORS baru; polling 10 dtk per user dibatasi sesi (rate limit login yang ada); API admin 404 non-admin
- [x] V14 Configuration: secure defaults, security headers, no debug in production, dependencies up to date — opt-in profil compose monitor (bawaan mati); container cap_drop ALL, read_only, no-new-privileges, mem_limit; npm audit 0

## Evidence
<!-- Generated by aitk close. -->
- Check: `npm run check` → exit 0 at 2026-11-11T16:19:46Z (218127 ms)
- Acceptance criteria: 4/4 satisfied
- Commits: 320d807, 53b72de, 562459f, 6237d6d, 77a5cd1, 7e67256, 914b030, 957a6dd, 9803850, a04e7fb, b421bcc, d7d32e5, e4b98f0, ef3422a
- Review pass 1 by claude-reviewer-subagent: 7 findings
- Review pass 2 by claude-reviewer-subagent: 0 findings
