---
id: T-r5tm
title: 'T-yw88 lanjutan: peringatan pemroses tidak aktif untuk pemetaan/koreksi skema/ekspor + alarm worker mati di luar worker'
status: done
profile: strict
created: "2026-11-11T11:00:57Z"
updated: "2026-11-13T04:53:27Z"
closed: "2026-11-13T04:53:27Z"
created_by: claude-code
workers:
  - claude-code
branch: claude/cool-babbage-t5yojt
base: 8b0a10fcb5104d36c2da2da4aa0a1ff7ec175f9f
paths:
  - src/app/api/datasets/[id]/mapping/[jobId]/route.ts
  - src/components/mapping/mapping-status.tsx
  - src/components/mapping/use-mapping-job.ts
  - src/components/schema/recast-banner.tsx
  - src/components/schema/use-recast.tsx
  - src/components/widgets/export-model.ts
  - src/components/widgets/export-status.tsx
  - src/features/exports/http.ts
  - src/features/exports/service.ts
  - src/features/schema/http.ts
  - src/instrumentation.ts
  - src/lib/health/worker-alarm-core.ts
  - src/lib/health/worker-alarm.ts
  - src/lib/queue/versions.ts
  - src/lib/worker-down-text.ts
  - tests/components/export-ui.test.ts
  - tests/features/exports/service-sheet.test.ts
  - tests/features/exports/service.test.ts
  - tests/features/versions/queue-position.test.ts
  - tests/lib/worker-alarm.test.ts
review:
  passes:
    - "n": 1
      by: claude-reviewer-subagent
      at: "2026-11-13T04:48:31Z"
      findings: 4
    - "n": 2
      by: claude-reviewer-subagent
      at: "2026-11-13T04:53:27Z"
      findings: 0
evidence:
  check:
    cmd: npm run check
    exit_code: 0
    duration_ms: 210394
    summary: |-
      …1794545284635,"service":"data-dashboard","check":"B","detail":"koneksi ditolak","msg":"health check gagal"}
      {"level":40,"time":1794545284657,"service":"data-dashboard","check":"Lambat","detail":"Lambat: timeout 20 ms","msg":"health check gagal"}
      {"level":40,"time":1794545284662,"service":"data-dashboard","check":"Y","detail":"mati","msg":"health check gagal"}
      {"level":40,"time":1794545284677,"service":"data-dashboard","check":"Renderer PDF","detail":"renderer tidak menjawab /healthz","msg":"health check gagal"}
      {"level":40,"time":1794545290897,"service":"data-dashboard","err":{"type":"Error","message":"NOPERM this user has no permissions to run the 'client' command","stack":"Error: NOPERM this user has no permissions to run the 'client' command\n    at Object.<anonymous> (/home/user/data-dashboard/tests/features/versions/queue-position.test.ts:71:17)\n    at Object.Mock [as getWorkers] (file:///home/user/data-dashboard/node_modules/vitest/dist/chunks/spy.DgMTfhrK.js:323:40)\n    at queueWorkerCount (/home/user/data-dashboard/src/lib/queue/versions.ts:102:40)\n    at ingestWorkerCount (/home/user/data-dashboard/src/lib/queue/versions.ts:124:10)\n    at /home/user/data-dashboard/tests/features/versions/queue-position.test.ts:69:13\n    at process.processTicksAndRejections (node:internal/process/task_queues:103:5)\n    at async file:///home/user/data-dashboard/node_modules/vitest/dist/chunks/run.BTlFXlnv.js:2783:20"},"msg":"jumlah worker gagal dibaca"}

       Test Files  252 passed | 3 skipped (255)
            Tests  3369 passed | 29 skipped (3398)
         Start at  04:46:02
         Duration  138.15s (tests 82%, import 15%, transform 2%)

          Isolate  255 workers spawned · ~107ms startup each (spawn + environment, per file)
                   at least ~9.00s faster with isolate: false — reuses workers across files instead of one per file


      > data-dashboard@1.21.2 audit
      > npm audit --audit-level=high --omit=dev && npm audit --audit-level=critical

      found 0 vulnerabilities
      found 0 vulnerabilities
    at: "2026-11-13T04:48:22Z"
    tree: 74ff41d95e0fd829ac8dfbba18816436fc203e518f7c462dab0226e464d85d28
  commits:
    - 0e6065c
    - 10be0fe
    - 1113f25
    - 139ea63
    - 170b893
    - 1777cf3
    - 1f127d7
    - 1fa2a2b
    - 24e0d05
    - 26454a6
    - "2762863"
    - 280999b
    - 2a4785d
    - 2b1c079
    - 320d807
    - 347467d
    - 3b6ad9e
    - 441a240
    - "4850467"
    - 4a2e710
    - 53b72de
    - 562459f
    - 56ac448
    - 5815e7e
    - 589ab6c
    - 5a2674d
    - 6237d6d
    - 648ad69
    - 64c3c85
    - "6574710"
    - 6aca388
    - 6af2ee7
    - 711beaf
    - 741a155
    - "76492e3"
    - 76c1d1c
    - 77a5cd1
    - 79246cf
    - 7ddd569
    - 7e67256
    - "8049e15"
    - 80cc079
    - 8325cf5
    - 86636d7
    - 8b0a10f
    - 8b7909f
    - 8c7f091
    - 8dc3860
    - 914b030
    - 957a6dd
    - "9803850"
    - 9cfda54
    - a04e7fb
    - a079f81
    - a18c5e1
    - a544a24
    - a70a59a
    - aa93391
    - ace71fc
    - b421bcc
    - b43e7d6
    - b4d9cbb
    - ba29099
    - c3eb267
    - c4eab09
    - c4f995f
    - c70623a
    - cb2bb63
    - cb50be9
    - d3794b5
    - d7d32e5
    - dd124a1
    - e1a05ba
    - e4b98f0
    - e6e94a4
    - eb11b82
    - ee21607
    - ef3422a
    - f7cf853
    - fd66af5
  acceptance:
    total: 3
    done: 3
  audit:
    at: "2026-11-13T04:48:41Z"
    passed: true
    tree: 74ff41d95e0fd829ac8dfbba18816436fc203e518f7c462dab0226e464d85d28
    results:
      - name: osv-scanner (dependencies, offline db)
        exit_code: 0
        summary: |-
          Scanning dir .
          Starting filesystem walk for root: /
          Scanned /home/user/data-dashboard/package-lock.json file and found 837 packages
          End status: 558 dirs visited, 5419 inodes visited, 1 Extract calls, 112.062335ms elapsed, 112.06256ms wall time
          Loaded npm local db from /root/.cache/osv-scanner/npm/all.zip
          No issues found
      - name: npm audit (prod high, dev critical)
        exit_code: 0
        summary: |-
          > data-dashboard@1.21.2 audit
          > npm audit --audit-level=high --omit=dev && npm audit --audit-level=critical

          found 0 vulnerabilities
          found 0 vulnerabilities
      - name: aitk secret scan (tracked files)
        exit_code: 0
---

## Objective
Peringatan "pemroses tidak aktif" untuk pemetaan, koreksi skema, dan ekspor, plus email admin dari app bila worker mati ≥ 10 menit (monitor email berjalan di worker sehingga tidak bisa melaporkan dirinya sendiri).

## Acceptance criteria
- [x] Status koreksi skema, pemetaan, dan ekspor CSV/XLSX/PDF yang antre/berjalan membawa workerDown bila antrean terkait tidak punya worker; panel menampilkan peringatan (tidak perlu mengulang)
- [x] App produksi memeriksa worker antrean tiap menit; 0 worker ≥ 10 menit → email admin aktif, ulang tiap 6 jam, sekali saat pulih; tanpa email ganda antar proses (lock Redis)
- [x] Tidak diketahui (CLIENT LIST ditolak/Redis lambat) tidak memicu peringatan atau email; uji unit keputusan alarm, hitung per antrean, reducer ekspor

## Risk
Impact: status endpoint koreksi skema/pemetaan/ekspor menambah satu field; app produksi memeriksa worker tiap menit (CLIENT LIST, di-cache) dan bisa mengirim email admin.
Security (STRIDE): Information disclosure — workerDown hanya boolean untuk job milik user; field internal `pdf` tidak dikirim ke klien. DoS — email dibatasi lock Redis + ulang 6 jam.
Rollback: deploy versi sebelumnya (tanpa migrasi).
Validation: uji unit alarm/hitung per antrean/reducer ekspor; aitk check hijau; review subagen.

## Notes
- 2026-11-11T11:01:11Z Dari review T-yw88 L8: worker mati juga membuat pemetaan (map-version di antrean recast), koreksi skema, dan ekspor diam tanpa peringatan; monitor email berjalan di dalam worker sehingga tidak bisa memberi tahu worker mati. Usul: pakai ingestWorkerCount-serupa per antrean (recast, export) di panel terkait; alarm dari app (mis. cron di service app/backup) bila /health baris Pemroses unggahan gagal > N menit.
- 2026-11-13T04:41:06Z Objective: peringatan pemroses tidak aktif juga untuk pemetaan/koreksi skema/ekspor + alarm worker mati dijalankan app (monitor email ada di worker). Alarm hanya NODE_ENV=production.

## Security checklist (OWASP ASVS 4.0.3)
<!-- Check each item when verified, or write "N/A: <reason>" after the text and check it. -->
- [x] V1 Architecture: trust boundaries and the components handling sensitive data are identified for this change — batas kepercayaan sama; app hanya membaca jumlah worker Redis
- [x] V2 Authentication: credentials are verified server-side; no default, hard-coded, or weak secrets — N/A — tidak ada kredensial baru
- [x] V3 Session management: session tokens are random, protected, invalidated on logout and expiry — N/A — sesi tidak berubah
- [x] V4 Access control: every endpoint/action checks authorization server-side, deny by default (no IDOR) — workerDown hanya ditambahkan setelah cek kepemilikan job yang sudah ada
- [x] V5 Validation, sanitization and encoding: all input validated; output encoded; no injection (SQL, OS, template) — N/A — tidak ada input baru
- [x] V6 Stored cryptography: sensitive data at rest uses approved algorithms; keys are not in the code — N/A
- [x] V7 Error handling and logging: errors reveal no internals; security events are logged without secrets — log tanpa rahasia (nama antrean + pesan galat)
- [x] V8 Data protection: personal/sensitive data is minimized, not cached or logged, and removable — email hanya ke admin aktif; isi tanpa data user
- [x] V9 Communication: TLS for all external traffic; certificates validated — SMTP memakai transport yang ada
- [x] V10 Malicious code: no backdoors, time bombs, or unexplained network calls; dependencies are trusted — tanpa dependensi baru
- [x] V11 Business logic: flows cannot be abused (limits, ordering, replay, race conditions) — email dibatasi lock Redis + ulang 6 jam
- [x] V12 Files and resources: uploads are type/size limited and stored safely; no path traversal or SSRF — N/A
- [x] V13 API and web service: API inputs/outputs are schema-validated; CORS and rate limits are deliberate — field internal pdf dibuang sebelum respons
- [x] V14 Configuration: secure defaults, security headers, no debug in production, dependencies up to date — alarm hanya NODE_ENV=production

## Evidence
<!-- Generated by aitk close. -->
- Check: `npm run check` → exit 0 at 2026-11-13T04:48:22Z (210394 ms)
- Acceptance criteria: 3/3 satisfied
- Commits: 0e6065c, 10be0fe, 1113f25, 139ea63, 170b893, 1777cf3, 1f127d7, 1fa2a2b, 24e0d05, 26454a6, 2762863, 280999b, 2a4785d, 2b1c079, 320d807, 347467d, 3b6ad9e, 441a240, 4850467, 4a2e710, 53b72de, 562459f, 56ac448, 5815e7e, 589ab6c, 5a2674d, 6237d6d, 648ad69, 64c3c85, 6574710, 6aca388, 6af2ee7, 711beaf, 741a155, 76492e3, 76c1d1c, 77a5cd1, 79246cf, 7ddd569, 7e67256, 8049e15, 80cc079, 8325cf5, 86636d7, 8b0a10f, 8b7909f, 8c7f091, 8dc3860, 914b030, 957a6dd, 9803850, 9cfda54, a04e7fb, a079f81, a18c5e1, a544a24, a70a59a, aa93391, ace71fc, b421bcc, b43e7d6, b4d9cbb, ba29099, c3eb267, c4eab09, c4f995f, c70623a, cb2bb63, cb50be9, d3794b5, d7d32e5, dd124a1, e1a05ba, e4b98f0, e6e94a4, eb11b82, ee21607, ef3422a, f7cf853, fd66af5
- Review pass 1 by claude-reviewer-subagent: 4 findings
- Review pass 2 by claude-reviewer-subagent: 0 findings
