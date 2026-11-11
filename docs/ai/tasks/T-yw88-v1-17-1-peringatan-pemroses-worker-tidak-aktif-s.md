---
id: T-yw88
title: 'v1.17.1: peringatan pemroses (worker) tidak aktif saat unggahan menunggu di antrean'
status: done
profile: strict
created: "2026-11-11T10:39:51Z"
updated: "2026-11-11T11:37:06Z"
closed: "2026-11-11T11:37:06Z"
created_by: claude-code
workers:
  - claude-code
branch: claude/cool-babbage-t5yojt
base: 8d5bf1d65a1e40cc28ff2c58009660abe1dafe23
paths:
  - CHANGELOG.md
  - content/panduan/03-unggah-data.md
  - docs/runbook-deploy.md
  - src/app/health/page.tsx
  - src/components/datasets/ingest-progress.tsx
  - src/features/schema/http.ts
  - src/features/schema/service.ts
  - src/features/whats-new/entries.ts
  - src/lib/health/worker-check.ts
  - src/lib/queue/versions.ts
  - tests/e2e/health.spec.ts
  - tests/e2e/schema.spec.ts
  - tests/features/versions/queue-position.test.ts
review:
  passes:
    - "n": 1
      by: claude-reviewer-subagent
      at: "2026-11-11T11:01:12Z"
      findings: 12
    - "n": 2
      by: claude-reviewer-subagent
      at: "2026-11-11T11:03:25Z"
      findings: 0
evidence:
  check:
    cmd: npm run check
    exit_code: 0
    duration_ms: 221182
    summary: |-
      …n't reach database server","msg":"sesi shell gagal dibaca"}
      {"level":40,"time":1794396758912,"service":"data-dashboard","check":"B","detail":"koneksi ditolak","msg":"health check gagal"}
      {"level":40,"time":1794396758935,"service":"data-dashboard","check":"Lambat","detail":"Lambat: timeout 20 ms","msg":"health check gagal"}
      {"level":40,"time":1794396758942,"service":"data-dashboard","check":"Y","detail":"mati","msg":"health check gagal"}
      {"level":40,"time":1794396758962,"service":"data-dashboard","check":"Renderer PDF","detail":"renderer tidak menjawab /healthz","msg":"health check gagal"}
      {"level":40,"time":1794396764209,"service":"data-dashboard","err":{"type":"Error","message":"NOPERM this user has no permissions to run the 'client' command","stack":"Error: NOPERM this user has no permissions to run the 'client' command\n    at Object.<anonymous> (/home/user/data-dashboard/tests/features/versions/queue-position.test.ts:71:17)\n    at Object.Mock [as getWorkers] (file:///home/user/data-dashboard/node_modules/vitest/dist/chunks/spy.DgMTfhrK.js:323:40)\n    at ingestWorkerCount (/home/user/data-dashboard/src/lib/queue/versions.ts:100:40)\n    at /home/user/data-dashboard/tests/features/versions/queue-position.test.ts:69:13\n    at process.processTicksAndRejections (node:internal/process/task_queues:103:5)\n    at async file:///home/user/data-dashboard/node_modules/vitest/dist/chunks/run.BTlFXlnv.js:2783:20"},"msg":"jumlah worker ingest gagal dibaca"}

       Test Files  246 passed | 1 skipped (247)
            Tests  3299 passed | 10 skipped (3309)
         Start at  11:30:28
         Duration  147.40s (tests 81%, import 16%, transform 3%)

          Isolate  247 workers spawned · ~121ms startup each (spawn + environment, per file)
                   at least ~9.87s faster with isolate: false — reuses workers across files instead of one per file


      > data-dashboard@1.17.0 audit
      > npm audit --audit-level=high --omit=dev && npm audit --audit-level=critical

      found 0 vulnerabilities
      found 0 vulnerabilities
    at: "2026-11-11T11:32:57Z"
    tree: 6346b764e585e9fb0b52b2baa3477250ca31134bb72754452c4b1f5f7895fb6b
  commits:
    - 0e6065c
    - 64c3c85
    - 8dc3860
    - ef7600f
  acceptance:
    total: 4
    done: 4
  audit:
    at: "2026-11-11T11:32:58Z"
    passed: true
    tree: 6346b764e585e9fb0b52b2baa3477250ca31134bb72754452c4b1f5f7895fb6b
    results:
      - name: osv-scanner (dependencies, offline db)
        exit_code: 0
        summary: |-
          Scanning dir .
          Starting filesystem walk for root: /
          Scanned /home/user/data-dashboard/package-lock.json file and found 837 packages
          End status: 543 dirs visited, 4196 inodes visited, 1 Extract calls, 98.038724ms elapsed, 98.03902ms wall time
          Loaded npm local db from /root/.cache/osv-scanner/npm/all.zip
          No issues found
      - name: npm audit (prod high, dev critical)
        exit_code: 0
        summary: |-
          > data-dashboard@1.17.0 audit
          > npm audit --audit-level=high --omit=dev && npm audit --audit-level=critical

          found 0 vulnerabilities
          found 0 vulnerabilities
      - name: aitk secret scan (tracked files)
        exit_code: 0
---

## Objective
Pemilik/pengunggah langsung tahu bila pemroses unggahan (service worker) tidak aktif: panel progres dataset
menampilkan "Pemroses unggahan sedang tidak aktif" (unggahan menunggu atau terhenti) dengan penjelasan bahwa file
aman di antrean, dan /health admin menampilkan baris "Pemroses unggahan". Pemicu: impor Billing 2026-11-11 menunggu
> 3 jam tanpa kabar karena worker masih dimatikan sejak insiden pagi.

## Acceptance criteria
- [x] Panel progres dataset menampilkan peringatan 'Pemroses unggahan sedang tidak aktif' saat unggahan menunggu/diproses dan tidak ada worker terhubung ke antrean ingest; teks menyebut file aman di antrean dan tidak perlu unggah ulang
- [x] Jumlah worker dibaca dari BullMQ (koneksi Worker bernama), di-cache 10 detik; gagal dibaca → tanpa peringatan (tidak ada alarm palsu)
- [x] /health admin menampilkan baris 'Pemroses unggahan' (OK/gagal + saran); status publik dan /api/health tidak berubah
- [x] Panduan 03, Yang baru 1.17, CHANGELOG, runbook §28 (diagnosa + menyalakan worker mode hemat + setelan 4 vCPU)

## Risk
Impact: route progres dataset (GET, polling) memanggil BullMQ getWorkersCount (CLIENT LIST) — di-cache 10 dtk per
proses app, batas waktu antrean; panel progres; halaman /health (admin). /api/health dan /api/health/core tidak
berubah (deploy.sh, healthcheck container, monitor email).
Security (STRIDE): Info disclosure — panel hanya menampilkan ada/tidaknya pemroses, tanpa nama host/jumlah; baris
/health detail hanya admin (publicView), pesan tanpa host. DoS — CLIENT LIST dibatasi cache 10 dtk; gagal → null.
Rollback: image ke v1.17.0 aman (tanpa migrasi; peringatan hilang).
Validation: unit queue-position (hitung + cache + gagal → null, teks, cek /health); e2e schema AC1 (unggah tanpa
worker → peringatan + workers=0 di API, lalu worker menyala → selesai), e2e health (baris admin).

## Notes
- 2026-11-11T11:01:13Z Review r1 (claude-reviewer-subagent): M1 live region (pengumuman lewat sr-only aria-live yang selalu ada), M2 kontras (teks foreground), M3 runbook --no-deps, M4 seed panduan; L1 cache 0 = 3 dtk + teks 'tampaknya terhenti', L2 teks tidak menjanjikan berlebihan, L3 hanya entri ber-rawname (CLIENT tidak tersedia → null), L4 data-status ikut baris worker, L5 Promise.all, L6 API hanya workerDown boolean, L7 runbook cek nproc (§2: 8 vCPU) + setelan sementara hilang saat up berikutnya — semua diperbaiki; L8 → T-r5tm.
- 2026-11-11T11:03:23Z Review r2 (claude-reviewer-subagent): 0 Critical/High/Medium; 3 Low diterima tanpa tindakan (dinilai reviewer tidak perlu): 'tampaknya terhenti' singkat saat worker berhenti graceful, risiko kecil flake e2e AC1 dari cache 10 dtk, peringatan terbaca dua kali saat menjelajah halaman (pola sama dengan teks tahap).
- 2026-11-11T11:29:15Z e2e penuh per proyek (ef7600f): 39 proyek lulus; data-view-a11y AC2 = T-7377 (sudah gagal di main). Setelah perbaikan review (0e6065c, digabung main 8dc3860): e2e schema AC1 + health lulus ulang. PR #22 digabung atas permintaan pemilik sebelum commit rilis; rilis v1.17.1 lewat PR terpisah.

## Security checklist (OWASP ASVS 4.0.3)
<!-- Check each item when verified, or write "N/A: <reason>" after the text and check it. -->
- [x] V1 Architecture: trust boundaries and the components handling sensitive data are identified for this change — Komponen: route progres (GET, pengguna yang berhak melihat dataset) dan /health (detail admin) membaca CLIENT LIST Redis lewat BullMQ; tidak ada input pengguna yang masuk ke perintah Redis
- [x] V2 Authentication: credentials are verified server-side; no default, hard-coded, or weak secrets — N/A: tidak disentuh perubahan ini
- [x] V3 Session management: session tokens are random, protected, invalidated on logout and expiry — N/A: tidak disentuh perubahan ini
- [x] V4 Access control: every endpoint/action checks authorization server-side, deny by default (no IDOR) — Route progres tetap memeriksa akses dataset (ingestStatus per userId); baris /health pemroses hanya untuk admin (isDetailed/publicView); /api/health publik tidak berubah
- [x] V5 Validation, sanitization and encoding: all input validated; output encoded; no injection (SQL, OS, template) — N/A: tidak disentuh perubahan ini
- [x] V6 Stored cryptography: sensitive data at rest uses approved algorithms; keys are not in the code — N/A: tidak disentuh perubahan ini
- [x] V7 Error handling and logging: errors reveal no internals; security events are logged without secrets — Galat Redis hanya dicatat log server (tanpa secret); panel tidak menampilkan detail internal; pesan /health lewat safeMessage
- [x] V8 Data protection: personal/sensitive data is minimized, not cached or logged, and removable — API progres hanya workerDown boolean (tanpa jumlah worker, nama klien, atau alamat dari CLIENT LIST)
- [x] V9 Communication: TLS for all external traffic; certificates validated — N/A: tidak disentuh perubahan ini
- [x] V10 Malicious code: no backdoors, time bombs, or unexplained network calls; dependencies are trusted — N/A: tidak disentuh perubahan ini
- [x] V11 Business logic: flows cannot be abused (limits, ordering, replay, race conditions) — CLIENT LIST dibatasi cache 10/3 dtk per proses app dan batas waktu antrean 5 dtk; posisi + worker dibaca paralel sehingga polling tidak menggantung > 5 dtk
- [x] V12 Files and resources: uploads are type/size limited and stored safely; no path traversal or SSRF — N/A: tidak disentuh perubahan ini
- [x] V13 API and web service: API inputs/outputs are schema-validated; CORS and rate limits are deliberate — N/A: tidak disentuh perubahan ini
- [x] V14 Configuration: secure defaults, security headers, no debug in production, dependencies up to date — N/A: tidak disentuh perubahan ini

## Evidence
<!-- Generated by aitk close. -->
- Check: `npm run check` → exit 0 at 2026-11-11T11:32:57Z (221182 ms)
- Acceptance criteria: 4/4 satisfied
- Commits: 0e6065c, 64c3c85, 8dc3860, ef7600f
- Review pass 1 by claude-reviewer-subagent: 12 findings
- Review pass 2 by claude-reviewer-subagent: 0 findings
