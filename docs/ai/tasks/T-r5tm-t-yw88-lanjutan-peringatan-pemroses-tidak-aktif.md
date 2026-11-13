---
id: T-r5tm
title: 'T-yw88 lanjutan: peringatan pemroses tidak aktif untuk pemetaan/koreksi skema/ekspor + alarm worker mati di luar worker'
status: in_review
profile: standard
created: "2026-11-11T11:00:57Z"
updated: "2026-11-13T04:48:40Z"
created_by: claude-code
workers:
  - claude-code
branch: claude/cool-babbage-t5yojt
base: 8b0a10fcb5104d36c2da2da4aa0a1ff7ec175f9f
review:
  passes:
    - "n": 1
      by: claude-reviewer-subagent
      at: "2026-11-13T04:48:31Z"
      findings: 4
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
