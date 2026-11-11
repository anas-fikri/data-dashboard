---
id: T-ee46
title: 'v1.18 fase 1: monitor sumber daya — node-exporter + relay, sampler app → Redis, kartu sidebar (semua user), halaman adm…'
status: in_review
profile: standard
created: "2026-11-11T14:35:09Z"
updated: "2026-11-11T15:33:47Z"
created_by: claude-code
workers:
  - claude-code
branch: claude/cool-babbage-t5yojt
base: 320d80782f5862b22eb381f8d959b8ff393bea5f
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
    duration_ms: 257699
    summary: |-
      …,"msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":40,"time":1794410708101,"service":"data-dashboard","host":"127.0.0.1","port":33401,"err":"Unable to start subsystem: sftp","msg":"subsistem SFTP ditolak NAS"}
      {"level":40,"time":1794410708199,"service":"data-dashboard","host":"127.0.0.1","port":33839,"step":"menghapus file uji","code":4,"err":"Failure","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":40,"time":1794410708307,"service":"data-dashboard","host":"127.0.0.1","port":39557,"step":"menulis file uji","code":4,"err":"Failure","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":40,"time":1794410720794,"service":"data-dashboard","err":{"type":"Error","message":"NOPERM this user has no permissions to run the 'client' command","stack":"Error: NOPERM this user has no permissions to run the 'client' command\n    at Object.<anonymous> (/home/user/data-dashboard/tests/features/versions/queue-position.test.ts:71:17)\n    at Object.Mock [as getWorkers] (file:///home/user/data-dashboard/node_modules/vitest/dist/chunks/spy.DgMTfhrK.js:323:40)\n    at ingestWorkerCount (/home/user/data-dashboard/src/lib/queue/versions.ts:100:40)\n    at /home/user/data-dashboard/tests/features/versions/queue-position.test.ts:69:13\n    at process.processTicksAndRejections (node:internal/process/task_queues:103:5)\n    at async file:///home/user/data-dashboard/node_modules/vitest/dist/chunks/run.BTlFXlnv.js:2783:20"},"msg":"jumlah worker ingest gagal dibaca"}

       Test Files  250 passed | 1 skipped (251)
            Tests  3328 passed | 10 skipped (3338)
         Start at  15:23:24
         Duration  189.54s (tests 79%, import 18%, transform 3%)

          Isolate  251 workers spawned · ~125ms startup each (spawn + environment, per file)
                   at least ~10.31s faster with isolate: false — reuses workers across files instead of one per file


      > data-dashboard@1.17.1 audit
      > npm audit --audit-level=high --omit=dev && npm audit --audit-level=critical

      found 0 vulnerabilities
      found 0 vulnerabilities
    at: "2026-11-11T15:26:35Z"
    tree: 0cf063eb873e94e086517d3fd2442ee94f2080bf6479c65266ba27626438cccd
---

## Objective
Pemilik dan semua user login bisa melihat sekilas beban server (CPU, RAM, disk, jaringan, status pemroses unggahan) di sidebar, dan admin bisa mencari penyebab server lambat (grafik 1 jam/24 jam, disk per mount, load per inti, iowait, pemakaian container app/worker) tanpa SSH — menjawab insiden 2026-11-11 (load 211 tanpa penyebab terlihat, worker mati > 3 jam tanpa kabar). Opt-in lewat profil compose `monitor` + METRICS_NODE_URL; tanpa itu tidak ada container baru dan kartu tidak tampil.

## Acceptance criteria
- [ ] node-exporter (dipin digest, host network + pid host, rootfs ro, 127.0.0.1:9100) + metrics-relay socat bersumber APP_SUBNETS (pola pg-relay) di compose produksi; runbook §29 pasang/verifikasi/rollback
- [ ] Sampler di proses app tiap 10 dtk (satu sampler lewat kunci Redis): CPU %, load, RAM/swap, disk, jaringan ↓↑ antarmuka fisik, antrean ingest + jumlah worker; riwayat 1 jam/10 dtk + 24 jam/1 menit; METRICS_NODE_URL kosong → mati dengan pesan
- [ ] Kartu sidebar untuk semua user login: angka + sparkline 1 jam, status pemroses + antrean, warna ambang, polling 10 dtk berhenti saat tab tersembunyi; sidebar diciutkan → ikon status
- [ ] Halaman Admin › Sumber daya: grafik 1 jam/24 jam + tabel per layanan (app, worker dari cgroup sendiri); API admin 403 untuk non-admin; API tidak memuat host/IP/nama antarmuka

## Risk
Impact: kartu baru di sidebar semua halaman (polling 10 dtk/user, berhenti saat tab tersembunyi atau monitor mati), dua container baru di VM bersama (node-exporter host network + pid host baca-saja, metrics-relay socat), sampler 1 permintaan HTTP/10 dtk di proses app, Redis ± 0,5 MB. Security (STRIDE): Information disclosure — API semua user hanya angka gabungan (tanpa host/IP/antarmuka/mount/jumlah worker), API admin 404 untuk non-admin; exporter hanya 127.0.0.1, relay hanya APP_SUBNETS, tanpa docker.sock, image dipin digest, cap_drop ALL + read_only + no-new-privileges; DoS — fetch timeout 3 dtk, kunci Redis satu sampler, daftar dipangkas. Rollback: tanpa migrasi; image v1.17.x aman, matikan profil monitor (runbook §29). Validation: unit (parser fixture node_exporter asli, hitung titik, Redis palsu, cgroup v1/v2, env), e2e metrics.spec (akses 401/404, kartu, ikon diciutkan, halaman admin), sampler nyata dengan node-exporter lokal mengisi Redis.

## Notes
- 2026-11-11T14:35:26Z Keputusan pemilik 2026-11-11: ringkasan server untuk semua user login (asumsi aman: per layanan + per akun admin saja), node_exporter boleh, per akun perkiraan. Rencana docs/ai/plans/2026-11-11-monitor-sumber-daya.md, ADR-0010 (proposed).
- 2026-11-11T15:09:26Z AC deviasi tercatat: port exporter 127.0.0.1:19109 (bukan 9100, agar tidak bentrok node_exporter aplikasi lain di VM bersama), relay 172.17.0.1:19100; API admin non-admin = 404 (pola requireAdmin proyek, bukan 403). Fallback cgroup v1 ditambah (sandbox v1).
- 2026-11-11T15:33:47Z Review subagen independen: putaran 1 = 0 blocking, 7 Medium + 11 Low (M1–M7, L1/L2/L3/L5/L6/L9/L10 diperbaiki a04e7fb/53b72de); putaran 2 = semua perbaikan terverifikasi, 0 blocking, 3 Low (2 diperbaiki e4b98f0, 1 → T-zjwh). Dicatat: --findings 7 (Medium putaran 1) lalu 0.
