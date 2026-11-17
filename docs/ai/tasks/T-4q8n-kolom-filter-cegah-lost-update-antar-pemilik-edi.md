---
id: T-4q8n
title: 'Kolom filter: cegah lost update antar pemilik/editor + rapikan batas editor'
status: in_review
profile: standard
tags:
  - security
  - ui
created: "2026-10-22T10:45:53Z"
updated: "2026-11-17T10:56:31Z"
created_by: claude-code
workers:
  - claude-code
branch: claude/cool-babbage-t5yojt
base: 32e2388f3dcd86785e85f1f20adcf500381b4cd1
review:
  passes:
    - "n": 1
      by: claude-reviewer-subagent
      at: "2026-11-17T10:42:59Z"
      findings: 7
    - "n": 2
      by: claude-reviewer-subagent
      at: "2026-11-17T10:49:58Z"
      findings: 2
    - "n": 3
      by: claude-reviewer-subagent
      at: "2026-11-17T10:56:30Z"
      findings: 0
evidence:
  check:
    cmd: npm run check
    exit_code: 0
    duration_ms: 218644
    summary: |-
      …level":40,"time":1794911963831,"service":"data-dashboard","userId":"slow","err":"timeout","msg":"storage per akun gagal dihitung"}
      {"level":40,"time":1794911963833,"service":"data-dashboard","userId":"slow","err":"timeout","msg":"storage per akun gagal dihitung"}
      {"level":40,"time":1794911963835,"service":"data-dashboard","userId":"slow","err":"timeout","msg":"storage per akun gagal dihitung"}
      {"level":40,"time":1794911965146,"service":"data-dashboard","err":{"type":"Error","message":"NOPERM this user has no permissions to run the 'client' command","stack":"Error: NOPERM this user has no permissions to run the 'client' command\n    at Object.<anonymous> (/home/user/data-dashboard/tests/features/versions/queue-position.test.ts:71:17)\n    at Object.Mock [as getWorkers] (file:///home/user/data-dashboard/node_modules/vitest/dist/chunks/spy.DgMTfhrK.js:323:40)\n    at queueWorkerCount (/home/user/data-dashboard/src/lib/queue/versions.ts:102:40)\n    at ingestWorkerCount (/home/user/data-dashboard/src/lib/queue/versions.ts:124:10)\n    at /home/user/data-dashboard/tests/features/versions/queue-position.test.ts:69:13\n    at process.processTicksAndRejections (node:internal/process/task_queues:103:5)\n    at async file:///home/user/data-dashboard/node_modules/vitest/dist/chunks/run.BTlFXlnv.js:2783:20"},"msg":"jumlah worker gagal dibaca"}
      {"level":30,"time":1794911975614,"service":"data-dashboard","datasetId":"t072mwkk8uunds000000","msg":"dataset dihapus"}

       Test Files  257 passed | 1 skipped (258)
            Tests  3419 passed | 10 skipped (3429)
         Start at  10:37:08
         Duration  146.90s (tests 81%, import 16%, transform 3%)

          Isolate  258 workers spawned · ~114ms startup each (spawn + environment, per file)
                   at least ~9.67s faster with isolate: false — reuses workers across files instead of one per file


      > data-dashboard@1.23.0 audit
      > npm audit --audit-level=high --omit=dev && npm audit --audit-level=critical

      found 0 vulnerabilities
      found 0 vulnerabilities
    at: "2026-11-17T10:39:36Z"
    tree: 0bdb12c5a3e63858ec1fdf34f77df85dd8be9f6eef5f74c21ff55c56cace60fd
---

## Objective
Lanjutan review T-k2ec (temuan non-blokir). Simpan kolom filter memakai revisi/lock sehingga tab basi tidak menimpa perubahan orang lain, baca-tulis kolom tersembunyi dalam satu transaksi, penghitung editor ikut kolom tersembunyi, pemilik bisa menambah kolom saat ada kolom tidak tersedia, dan peringatan tumpang-tindih sheet untuk editor.

## Acceptance criteria
- [x] Simpan kolom filter dari daftar basi → CONFLICT/STALE dengan pesan muat ulang, bukan menimpa diam-diam (review T-k2ec #1)
- [x] Baca kolom tersimpan + tulis dalam satu transaksi lockDashboard (review T-k2ec #2)
- [x] Penghitung/batas penuh editor menghitung kolom tersembunyi yang dipertahankan (review T-k2ec #3)
- [x] Pemilik bisa menambah kolom walau ada kolom tersimpan tidak tersedia yang tidak diubah (review T-k2ec #4)
- [x] Editor diberi tahu bila kolom filter yang ditambahkan menyaring lebih dari satu sheet (review T-k2ec #6)
- [x] Pemilik bisa menyimpan filter bawaan walau ada kolom filter tidak tersedia (review T-vb7q #2)
- [x] Cadangan PDF saat status filter belum diterbitkan memakai filter bawaan (review T-vb7q #3)
- [x] Bawaan basi (tipe kolom diubah) ditandai di pengaturan sebelum terhapus saat simpan berikutnya (review T-vb7q pass 2 #1)

## Risk
Impact: simpan kolom filter (pemilik/editor) dan filter bawaan; cadangan filter ekspor PDF/PNG/HTML. Tanpa migrasi. Security (STRIDE): Tampering — simpan basi ditolak STALE (tanpa lost update); akses dibaca setelah kunci dashboard (tanpa TOCTOU); editor tetap tidak menerima nama kolom tak tersedia (hanya jumlahnya). Rollback: image sebelumnya; klien lama tanpa `expected` tetap diterima (tanpa cek basi). Validation: uji unit filter-columns/pdf-export-ui/multisheet, e2e sharing + filters + exports.

## Notes
- 2026-11-17T09:23:29Z AC1/AC2: expected + transaksi lockDashboard; unit + e2e sharing/filters lulus.
- 2026-11-17T10:56:31Z Review 3 putaran (7 Low → diperbaiki; R2 1 Medium lost update → diperbaiki, 1 Low → T-v42a; R3 0). Unit 1117 + e2e sharing/filters 49 lulus.

## Security checklist (OWASP ASVS 4.0.3)
<!-- Check each item when verified, or write "N/A: <reason>" after the text and check it. -->
- [x] V1 Architecture: trust boundaries and the components handling sensitive data are identified for this change — batas kepercayaan tetap: browser → PATCH /api/dashboards/[id]/filter-columns → transaksi Postgres
- [x] V2 Authentication: credentials are verified server-side; no default, hard-coded, or weak secrets — N/A: tidak ada perubahan autentikasi
- [x] V3 Session management: session tokens are random, protected, invalidated on logout and expiry — N/A: sesi tidak berubah
- [x] V4 Access control: every endpoint/action checks authorization server-side, deny by default (no IDOR) — canEditWhere dibaca setelah lockDashboard di transaksi yang sama; editor hanya menerima jumlah kolom tak tersedia, bukan namanya
- [x] V5 Validation, sanitization and encoding: all input validated; output encoded; no injection (SQL, OS, template) — `expected` diurai lewat storedFilterColumns (zod, entri rusak dibuang); daftar baru tetap lewat checkFilterColumns
- [x] V6 Stored cryptography: sensitive data at rest uses approved algorithms; keys are not in the code — N/A: tanpa data rahasia baru
- [x] V7 Error handling and logging: errors reveal no internals; security events are logged without secrets — STALE = 409 dengan pesan muat ulang, tanpa detail internal
- [x] V8 Data protection: personal/sensitive data is minimized, not cached or logged, and removable — N/A: hanya pengaturan dashboard
- [x] V9 Communication: TLS for all external traffic; certificates validated — N/A: tanpa lalu lintas baru
- [x] V10 Malicious code: no backdoors, time bombs, or unexplained network calls; dependencies are trusted — tanpa dependensi atau panggilan jaringan baru
- [x] V11 Business logic: flows cannot be abused (limits, ordering, replay, race conditions) — lost update dicegah (STALE + kunci dashboard); batas 8 kolom termasuk kolom tersembunyi
- [x] V12 Files and resources: uploads are type/size limited and stored safely; no path traversal or SSRF — N/A: tanpa file
- [x] V13 API and web service: API inputs/outputs are schema-validated; CORS and rate limits are deliberate — body PATCH divalidasi; `expected` opsional untuk klien lama
- [x] V14 Configuration: secure defaults, security headers, no debug in production, dependencies up to date — N/A: konfigurasi tidak berubah
