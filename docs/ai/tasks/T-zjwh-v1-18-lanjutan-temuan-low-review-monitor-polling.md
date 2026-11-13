---
id: T-zjwh
title: 'v1.18 lanjutan: temuan Low review monitor (polling ganda ponsel, menit hilang setelah jeda, bond/VLAN, cache ringkasan,…'
status: in_review
profile: standard
created: "2026-11-11T15:22:00Z"
updated: "2026-11-13T06:36:15Z"
created_by: claude-code
workers:
  - claude-code
branch: claude/cool-babbage-t5yojt
base: e7488c73ae6bc5d7aa55c2c13d9a8ae3cfd4c5ba
review:
  passes:
    - "n": 1
      by: claude-reviewer-subagent
      at: "2026-11-13T06:33:26Z"
      findings: 0
evidence:
  check:
    cmd: npm run check
    exit_code: 0
    duration_ms: 219529
    summary: |-
      …vice":"data-dashboard","check":"Renderer PDF","detail":"renderer tidak menjawab /healthz","msg":"health check gagal"}
      {"level":40,"time":1794551761697,"service":"data-dashboard","err":{"type":"Error","message":"NOPERM this user has no permissions to run the 'client' command","stack":"Error: NOPERM this user has no permissions to run the 'client' command\n    at Object.<anonymous> (/home/user/data-dashboard/tests/features/versions/queue-position.test.ts:71:17)\n    at Object.Mock [as getWorkers] (file:///home/user/data-dashboard/node_modules/vitest/dist/chunks/spy.DgMTfhrK.js:323:40)\n    at queueWorkerCount (/home/user/data-dashboard/src/lib/queue/versions.ts:102:40)\n    at ingestWorkerCount (/home/user/data-dashboard/src/lib/queue/versions.ts:124:10)\n    at /home/user/data-dashboard/tests/features/versions/queue-position.test.ts:69:13\n    at process.processTicksAndRejections (node:internal/process/task_queues:103:5)\n    at async file:///home/user/data-dashboard/node_modules/vitest/dist/chunks/run.BTlFXlnv.js:2783:20"},"msg":"jumlah worker gagal dibaca"}
      {"level":40,"time":1794551768691,"service":"data-dashboard","userId":"slow","err":"timeout","msg":"storage per akun gagal dihitung"}
      {"level":40,"time":1794551768693,"service":"data-dashboard","userId":"slow","err":"timeout","msg":"storage per akun gagal dihitung"}
      {"level":40,"time":1794551768694,"service":"data-dashboard","userId":"slow","err":"timeout","msg":"storage per akun gagal dihitung"}

       Test Files  253 passed | 3 skipped (256)
            Tests  3375 passed | 29 skipped (3404)
         Start at  06:33:47
         Duration  146.49s (tests 81%, import 16%, transform 2%)

          Isolate  256 workers spawned · ~117ms startup each (spawn + environment, per file)
                   at least ~9.89s faster with isolate: false — reuses workers across files instead of one per file


      > data-dashboard@1.21.4 audit
      > npm audit --audit-level=high --omit=dev && npm audit --audit-level=critical

      found 0 vulnerabilities
      found 0 vulnerabilities
    at: "2026-11-13T06:36:15Z"
    tree: 9a02ddec8653bd4da7f5d7b3b08d049c5cfe5d8222cf9d7dea62b14b621b83a0
---

## Objective
Merapikan temuan Low monitor sumber daya (v1.18) dan perkiraan per akun: tanpa polling ganda, grafik 24 jam tanpa lubang palsu, jaringan tanpa hitung ganda, beban Redis/DB lebih ringan, catatan keamanan ADR, serta pesan periode yang lebih jelas.

## Acceptance criteria
- [x] L1: kartu Server di <aside> tersembunyi (ponsel) tidak polling; satu sumber data untuk sidebar + drawer
- [x] L4: menit yang tidak teragregasi karena jeda ≥ 1 menit tetap dirata-rata dari titik 10 dtk (grafik 24 jam tanpa lubang palsu)
- [x] L7: laju jaringan per antarmuka; bond/anggota bond, VLAN, docker_gwbridge, tailscale/zt/vnet tidak dihitung ganda
- [x] L8: readSummary di-cache ± 5 dtk per proses (semua user polling 10 dtk)
- [x] L11: ADR-0010 diperjelas — port 127.0.0.1:19109 terbaca proses/container host network di VM; pids_limit relay
- [x] Status antrean tetap menyimpan jumlah worker walau getJobCounts timeout (waiting/active nullable) — review putaran 2 T-ee46 L2
- [x] Uji unit pemetaan job aktif → pemilik (jobsByUser: ingest/period-setup, recast vs map-version, export/pdf) — review putaran 2 T-qed9 L4
- [x] Uji accountRows mengunci TTL storage 5 menit (cek ± 4 menit tanpa hitung ulang) — konfirmasi review T-qed9 Low-1
- [x] Kegagalan userUsage per akun di-cache singkat (± 60 dtk) agar akun berat yang timeout tidak dihitung ulang tiap polling 10 dtk — konfirmasi review T-qed9 Low-2
- [x] v1.19 Low: pesan PERIOD_OUT_OF_WINDOW untuk periode yang dilewati; sheet tambahan yang diabaikan karena sheet lain butuh pemetaan diberi alasan khusus; isi sheet salinan (Data/Data (2)) dideteksi

## Risk
(Required for strict profile. Impact:, Security (STRIDE):, Rollback:, Validation:)

## Notes
- 2026-11-11T15:22:07Z Dari review T-ee46 putaran 1 (2026-11-11): 0 blocking; M1–M7 + L1(useId)/L2/L3/L5/L6/L9/L10 diperbaiki di a04e7fb/53b72de. Sisa Low di sini.
- 2026-11-13T06:32:20Z Butir 10: pesan PERIOD_OUT_OF_WINDOW selesai; alasan sheet diabaikan karena pemetaan + deteksi sheet salinan dipindah ke T-hgsz.
- 2026-11-13T06:33:25Z Review subagen: 0 blocking; Low: NIC mandiri di host ber-bond tidak dihitung (dikomentari), satu fetch ekstra saat hidrasi ponsel, dua sampler bersamaan bisa dobel menit (hanya bila >1 sampler), kartu tanpa hitungan saat antrean tidak terbaca.
