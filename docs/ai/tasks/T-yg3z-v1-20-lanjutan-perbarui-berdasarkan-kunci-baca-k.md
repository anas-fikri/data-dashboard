---
id: T-yg3z
title: 'v1.20 lanjutan: Perbarui berdasarkan kunci — baca kolom kunci saja (tanpa unduh typed penuh), urutan baris kronologis s…'
status: done
profile: standard
created: "2026-11-12T07:02:22Z"
updated: "2026-11-13T03:26:33Z"
closed: "2026-11-13T03:26:33Z"
created_by: claude-code
workers:
  - claude-code
branch: claude/cool-babbage-t5yojt
base: 170b89311bfbe36b09367ff0c8266dd5cd1d3c8b
paths:
  - src/features/ingest/period-ingest.ts
  - src/features/ingest/period-keymerge.ts
  - src/features/ingest/period-plan.ts
  - src/features/ingest/period-upload-plan.ts
  - src/features/versions/period-commit.ts
  - tests/features/ingest/period-ingest.test.ts
review:
  passes:
    - "n": 1
      by: claude-reviewer-subagent
      at: "2026-11-13T03:19:02Z"
      findings: 4
evidence:
  check:
    cmd: npm run check
    exit_code: 0
    duration_ms: 197429
    summary: |-
      …n't reach database server","msg":"sesi shell gagal dibaca"}
      {"level":40,"time":1794540365078,"service":"data-dashboard","check":"B","detail":"koneksi ditolak","msg":"health check gagal"}
      {"level":40,"time":1794540365100,"service":"data-dashboard","check":"Lambat","detail":"Lambat: timeout 20 ms","msg":"health check gagal"}
      {"level":40,"time":1794540365104,"service":"data-dashboard","check":"Y","detail":"mati","msg":"health check gagal"}
      {"level":40,"time":1794540365117,"service":"data-dashboard","check":"Renderer PDF","detail":"renderer tidak menjawab /healthz","msg":"health check gagal"}
      {"level":40,"time":1794540382251,"service":"data-dashboard","err":{"type":"Error","message":"NOPERM this user has no permissions to run the 'client' command","stack":"Error: NOPERM this user has no permissions to run the 'client' command\n    at Object.<anonymous> (/home/user/data-dashboard/tests/features/versions/queue-position.test.ts:71:17)\n    at Object.Mock [as getWorkers] (file:///home/user/data-dashboard/node_modules/vitest/dist/chunks/spy.DgMTfhrK.js:323:40)\n    at ingestWorkerCount (/home/user/data-dashboard/src/lib/queue/versions.ts:100:40)\n    at /home/user/data-dashboard/tests/features/versions/queue-position.test.ts:69:13\n    at process.processTicksAndRejections (node:internal/process/task_queues:103:5)\n    at async file:///home/user/data-dashboard/node_modules/vitest/dist/chunks/run.BTlFXlnv.js:2783:20"},"msg":"jumlah worker ingest gagal dibaca"}

       Test Files  253 passed | 1 skipped (254)
            Tests  3382 passed | 10 skipped (3392)
         Start at  03:24:16
         Duration  134.42s (tests 81%, import 16%, transform 3%)

          Isolate  254 workers spawned · ~106ms startup each (spawn + environment, per file)
                   at least ~8.84s faster with isolate: false — reuses workers across files instead of one per file


      > data-dashboard@1.21.1 audit
      > npm audit --audit-level=high --omit=dev && npm audit --audit-level=critical

      found 0 vulnerabilities
      found 0 vulnerabilities
    at: "2026-11-13T03:26:32Z"
    tree: 41181bca74023c7a94a6636e6d90ac341903a4a02699b23a8a43b6bee9811139
  commits:
    - 1113f25
    - 170b893
    - 1fa2a2b
    - 24e0d05
    - 5815e7e
    - 589ab6c
    - 648ad69
    - 711beaf
    - 76c1d1c
    - 80cc079
    - 8b7909f
    - a544a24
    - b4d9cbb
    - cb2bb63
    - e1a05ba
    - eb11b82
    - ee21607
    - f7cf853
  acceptance:
    total: 3
    done: 3
  audit:
    at: "2026-11-13T03:19:06Z"
    passed: true
    tree: 41181bca74023c7a94a6636e6d90ac341903a4a02699b23a8a43b6bee9811139
    results:
      - name: osv-scanner (dependencies, offline db)
        exit_code: 0
        summary: |-
          Scanning dir .
          Starting filesystem walk for root: /
          Scanned /home/user/data-dashboard/package-lock.json file and found 837 packages
          End status: 558 dirs visited, 5328 inodes visited, 1 Extract calls, 143.083235ms elapsed, 143.083425ms wall time
          Loaded npm local db from /root/.cache/osv-scanner/npm/all.zip
          No issues found
      - name: npm audit (prod high, dev critical)
        exit_code: 0
        summary: |-
          > data-dashboard@1.21.1 audit
          > npm audit --audit-level=high --omit=dev && npm audit --audit-level=critical

          found 0 vulnerabilities
          found 0 vulnerabilities
      - name: aitk secret scan (tracked files)
        exit_code: 0
---

## Objective
Unggahan Perbarui berdasarkan kunci lebih ringan dan aman: kunci lama dibaca dari indeks lokal (tanpa unduh ulang file data periode yang tidak disentuh), kolom kunci dibekukan di rencana, dan rencana awal tidak menolak keliru.

## Acceptance criteria
- [x] Perbarui berikutnya tidak mengunduh ulang file data periode yang tidak disentuh (indeks kunci lokal ≤ 512 MB)
- [x] Kolom kunci dibekukan di rencana: berubah sebelum commit → proses ulang (worker) / Terapkan ditolak
- [x] Rencana awal tidak menolak Tambah/Perbarui dengan hitungan Ganti; uji unit + e2e period-*

## Risk
Impact: worker ingest periode (cache disk lokal ≤ 512 MB per container). Security: cache di tmp worker, tanpa data baru keluar. Rollback: tanpa migrasi; cache diabaikan versi lama. Validation: unit + e2e period-keys/review/upload.

## Notes
- 2026-11-12T07:02:34Z Dari review T-rbrb (2026-11-12): M5 unduh typed penuh semua segmen tiap Perbarui (baca kolom kunci via S3/httpfs atau berkas kunci per segmen); L2 urutan baris periode terbalik setelah pemadatan (alokasi rentang padat sebelum file); L6 kolom kunci tidak dibekukan di rencana (Terapkan setelah kunci diubah); L1 rencana awal (sebelum typing) memakai semantik Ganti; L2' penolakan PERIOD_OUT_OF_WINDOW untuk periode yang hanya kehilangan baris; L3 disk puncak Ganti (typed lokal ditahan sampai 5c); L7 Perbarui ditolak bila satu sheet data tanpa kunci; recast sheet satu segmen headerRow 0 (lihat T-zjwh); nama asal/uploader salinan padat hanya file pertama.
- 2026-11-13T03:19:03Z Tidak dikerjakan (diterima/didokumentasikan): urutan baris dalam periode setelah pemadatan (file terbaru lebih dulu), disk puncak mode Ganti, penolakan OUT_OF_WINDOW untuk periode yang hanya kehilangan baris, Perbarui ditolak bila satu sheet data tanpa kunci.

## Security checklist (OWASP ASVS 4.0.3)
<!-- Check each item when verified, or write "N/A: <reason>" after the text and check it. -->
- [x] V1 Architecture: trust boundaries and the components handling sensitive data are identified for this change — N/A: cache kunci lokal di worker + cek kunci di commit, tanpa input/akses baru
- [x] V2 Authentication: credentials are verified server-side; no default, hard-coded, or weak secrets — N/A: cache kunci lokal di worker + cek kunci di commit, tanpa input/akses baru
- [x] V3 Session management: session tokens are random, protected, invalidated on logout and expiry — N/A: cache kunci lokal di worker + cek kunci di commit, tanpa input/akses baru
- [x] V4 Access control: every endpoint/action checks authorization server-side, deny by default (no IDOR) — N/A: cache kunci lokal di worker + cek kunci di commit, tanpa input/akses baru
- [x] V5 Validation, sanitization and encoding: all input validated; output encoded; no injection (SQL, OS, template) — N/A: cache kunci lokal di worker + cek kunci di commit, tanpa input/akses baru
- [x] V6 Stored cryptography: sensitive data at rest uses approved algorithms; keys are not in the code — N/A: cache kunci lokal di worker + cek kunci di commit, tanpa input/akses baru
- [x] V7 Error handling and logging: errors reveal no internals; security events are logged without secrets — N/A: cache kunci lokal di worker + cek kunci di commit, tanpa input/akses baru
- [x] V8 Data protection: personal/sensitive data is minimized, not cached or logged, and removable — N/A: cache kunci lokal di worker + cek kunci di commit, tanpa input/akses baru
- [x] V9 Communication: TLS for all external traffic; certificates validated — N/A: cache kunci lokal di worker + cek kunci di commit, tanpa input/akses baru
- [x] V10 Malicious code: no backdoors, time bombs, or unexplained network calls; dependencies are trusted — N/A: cache kunci lokal di worker + cek kunci di commit, tanpa input/akses baru
- [x] V11 Business logic: flows cannot be abused (limits, ordering, replay, race conditions) — N/A: cache kunci lokal di worker + cek kunci di commit, tanpa input/akses baru
- [x] V12 Files and resources: uploads are type/size limited and stored safely; no path traversal or SSRF — N/A: cache kunci lokal di worker + cek kunci di commit, tanpa input/akses baru
- [x] V13 API and web service: API inputs/outputs are schema-validated; CORS and rate limits are deliberate — N/A: cache kunci lokal di worker + cek kunci di commit, tanpa input/akses baru
- [x] V14 Configuration: secure defaults, security headers, no debug in production, dependencies up to date — N/A: cache kunci lokal di worker + cek kunci di commit, tanpa input/akses baru

## Evidence
<!-- Generated by aitk close. -->
- Check: `npm run check` → exit 0 at 2026-11-13T03:26:32Z (197429 ms)
- Acceptance criteria: 3/3 satisfied
- Commits: 1113f25, 170b893, 1fa2a2b, 24e0d05, 5815e7e, 589ab6c, 648ad69, 711beaf, 76c1d1c, 80cc079, 8b7909f, a544a24, b4d9cbb, cb2bb63, e1a05ba, eb11b82, ee21607, f7cf853
- Review pass 1 by claude-reviewer-subagent: 4 findings
