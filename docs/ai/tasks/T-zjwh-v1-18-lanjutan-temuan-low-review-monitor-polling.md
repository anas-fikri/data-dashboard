---
id: T-zjwh
title: 'v1.18 lanjutan: temuan Low review monitor (polling ganda ponsel, menit hilang setelah jeda, bond/VLAN, cache ringkasan,…'
status: done
profile: strict
created: "2026-11-11T15:22:00Z"
updated: "2026-11-13T06:48:55Z"
closed: "2026-11-13T06:48:55Z"
created_by: claude-code
workers:
  - claude-code
branch: claude/cool-babbage-t5yojt
base: e7488c73ae6bc5d7aa55c2c13d9a8ae3cfd4c5ba
paths:
  - docker-compose.prod.yml
  - src/app/api/metrics/route.ts
  - src/components/admin/resources-panel.tsx
  - src/components/metrics/server-card.tsx
  - src/components/shell/app-shell.tsx
  - src/features/ingest/period-plan.ts
  - src/features/metrics/accounts.ts
  - src/features/metrics/view.ts
  - src/lib/metrics/host.ts
  - src/lib/metrics/sampler.ts
  - src/lib/metrics/store.ts
  - tests/features/ingest/period-plan.test.ts
  - tests/features/metrics-accounts-jobs.test.ts
  - tests/lib/metrics.test.ts
review:
  passes:
    - "n": 1
      by: claude-reviewer-subagent
      at: "2026-11-13T06:33:26Z"
      findings: 0
    - "n": 2
      by: claude-reviewer-subagent
      at: "2026-11-13T06:41:05Z"
      findings: 0
evidence:
  check:
    cmd: npm run check
    exit_code: 0
    duration_ms: 215932
    summary: |-
      …ice":"data-dashboard","check":"Renderer PDF","detail":"renderer tidak menjawab /healthz","msg":"health check gagal"}
      {"level":40,"time":1794552520075,"service":"data-dashboard","err":{"type":"Error","message":"NOPERM this user has no permissions to run the 'client' command","stack":"Error: NOPERM this user has no permissions to run the 'client' command\n    at Object.<anonymous> (/home/user/data-dashboard/tests/features/versions/queue-position.test.ts:71:17)\n    at Object.Mock [as getWorkers] (file:///home/user/data-dashboard/node_modules/vitest/dist/chunks/spy.DgMTfhrK.js:323:40)\n    at queueWorkerCount (/home/user/data-dashboard/src/lib/queue/versions.ts:102:40)\n    at ingestWorkerCount (/home/user/data-dashboard/src/lib/queue/versions.ts:124:10)\n    at /home/user/data-dashboard/tests/features/versions/queue-position.test.ts:69:13\n    at process.processTicksAndRejections (node:internal/process/task_queues:103:5)\n    at async file:///home/user/data-dashboard/node_modules/vitest/dist/chunks/run.BTlFXlnv.js:2783:20"},"msg":"jumlah worker gagal dibaca"}
      {"level":40,"time":1794552523709,"service":"data-dashboard","userId":"slow","err":"timeout","msg":"storage per akun gagal dihitung"}
      {"level":40,"time":1794552523714,"service":"data-dashboard","userId":"slow","err":"timeout","msg":"storage per akun gagal dihitung"}
      {"level":40,"time":1794552523714,"service":"data-dashboard","userId":"slow","err":"timeout","msg":"storage per akun gagal dihitung"}

       Test Files  253 passed | 3 skipped (256)
            Tests  3375 passed | 29 skipped (3404)
         Start at  06:46:27
         Duration  146.39s (tests 81%, import 16%, transform 2%)

          Isolate  256 workers spawned · ~121ms startup each (spawn + environment, per file)
                   at least ~10.23s faster with isolate: false — reuses workers across files instead of one per file


      > data-dashboard@1.21.4 audit
      > npm audit --audit-level=high --omit=dev && npm audit --audit-level=critical

      found 0 vulnerabilities
      found 0 vulnerabilities
    at: "2026-11-13T06:48:54Z"
    tree: aa2812b201f9d1737291417c4801846eea132278111f91395c71ee4ffc332abf
  commits:
    - 000f2ab
    - 10be0fe
    - 1113f25
    - 139ea63
    - 170b893
    - 1777cf3
    - 1fa2a2b
    - 24e0d05
    - 26454a6
    - "2762863"
    - 280999b
    - 2a4785d
    - 3171ffa
    - 347467d
    - 3b6ad9e
    - 441a240
    - "4850467"
    - 4a2e710
    - 52d859a
    - 56ac448
    - 5815e7e
    - 589ab6c
    - 5a2674d
    - 6237d6d
    - 648ad69
    - "6574710"
    - 681c251
    - 683ea1f
    - 6aca388
    - 6af2ee7
    - 711beaf
    - 741a155
    - "76492e3"
    - 76c1d1c
    - 77a5cd1
    - 79246cf
    - 7ddd569
    - "8049e15"
    - 80cc079
    - 8325cf5
    - 856bae9
    - 86636d7
    - 8b0a10f
    - 8b7909f
    - 8c7f091
    - 92ee216
    - 95f55db
    - 9b62f18
    - 9cfda54
    - a079f81
    - a12fcfb
    - a18c5e1
    - a544a24
    - a70a59a
    - aa93391
    - ace71fc
    - b1036b4
    - b421bcc
    - b43e7d6
    - b4d9cbb
    - ba29099
    - bea7eec
    - bf81be6
    - c3eb267
    - c4eab09
    - c4f995f
    - c7ca1a6
    - cb2bb63
    - cb50be9
    - d7d32e5
    - dd124a1
    - e1a05ba
    - e4b98f0
    - e6e94a4
    - e7488c7
    - e85dcdd
    - eb11b82
    - ee21607
    - ee92331
    - ef3422a
    - f256b4d
    - f7cf853
    - fd66af5
    - ff2deb1
  acceptance:
    total: 10
    done: 10
  audit:
    at: "2026-11-13T06:41:05Z"
    passed: true
    tree: aa2812b201f9d1737291417c4801846eea132278111f91395c71ee4ffc332abf
    results:
      - name: osv-scanner (dependencies, offline db)
        exit_code: 0
        summary: |-
          Scanning dir .
          Starting filesystem walk for root: /
          Scanned /home/user/data-dashboard/package-lock.json file and found 837 packages
          End status: 558 dirs visited, 5593 inodes visited, 1 Extract calls, 157.016958ms elapsed, 157.01712ms wall time
          Loaded npm local db from /root/.cache/osv-scanner/npm/all.zip
          No issues found
      - name: npm audit (prod high, dev critical)
        exit_code: 0
        summary: |-
          > data-dashboard@1.21.4 audit
          > npm audit --audit-level=high --omit=dev && npm audit --audit-level=critical

          found 0 vulnerabilities
          found 0 vulnerabilities
      - name: aitk secret scan (tracked files)
        exit_code: 0
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
Impact: monitor sumber daya (kartu Server, Admin › Sumber daya), perkiraan per akun, pesan tolak periode; compose metrics-relay (pids_limit). Security (STRIDE): DoS — pids_limit relay + cache ringkasan/storage mengurangi beban; Information disclosure — ADR mencatat port 127.0.0.1:19109 terbaca host network (angka host saja). Rollback: versi sebelumnya; data Redis metrik kompatibel (laju jaringan null sekali). Validation: uji unit store/host/akun/pesan periode; aitk check; review subagen 0 blocking.

## Notes
- 2026-11-11T15:22:07Z Dari review T-ee46 putaran 1 (2026-11-11): 0 blocking; M1–M7 + L1(useId)/L2/L3/L5/L6/L9/L10 diperbaiki di a04e7fb/53b72de. Sisa Low di sini.
- 2026-11-13T06:32:20Z Butir 10: pesan PERIOD_OUT_OF_WINDOW selesai; alasan sheet diabaikan karena pemetaan + deteksi sheet salinan dipindah ke T-hgsz.
- 2026-11-13T06:33:25Z Review subagen: 0 blocking; Low: NIC mandiri di host ber-bond tidak dihitung (dikomentari), satu fetch ekstra saat hidrasi ponsel, dua sampler bersamaan bisa dobel menit (hanya bila >1 sampler), kartu tanpa hitungan saat antrean tidak terbaca.

## Security checklist (OWASP ASVS 4.0.3)
<!-- Check each item when verified, or write "N/A: <reason>" after the text and check it. -->
- [x] V1 Architecture: trust boundaries and the components handling sensitive data are identified for this change — batas kepercayaan dicatat di ADR-0010
- [x] V2 Authentication: credentials are verified server-side; no default, hard-coded, or weak secrets — N/A — tidak tersentuh
- [x] V3 Session management: session tokens are random, protected, invalidated on logout and expiry — N/A — tidak tersentuh
- [x] V4 Access control: every endpoint/action checks authorization server-side, deny by default (no IDOR) — endpoint metrik tetap withUser/admin seperti sebelumnya
- [x] V5 Validation, sanitization and encoding: all input validated; output encoded; no injection (SQL, OS, template) — N/A — tidak tersentuh
- [x] V6 Stored cryptography: sensitive data at rest uses approved algorithms; keys are not in the code — N/A — tidak tersentuh
- [x] V7 Error handling and logging: errors reveal no internals; security events are logged without secrets — log tanpa rahasia
- [x] V8 Data protection: personal/sensitive data is minimized, not cached or logged, and removable — N/A — tidak tersentuh
- [x] V9 Communication: TLS for all external traffic; certificates validated — N/A — tidak tersentuh
- [x] V10 Malicious code: no backdoors, time bombs, or unexplained network calls; dependencies are trusted — tanpa dependensi baru
- [x] V11 Business logic: flows cannot be abused (limits, ordering, replay, race conditions) — cache singkat + batas PID relay
- [x] V12 Files and resources: uploads are type/size limited and stored safely; no path traversal or SSRF — N/A — tidak tersentuh
- [x] V13 API and web service: API inputs/outputs are schema-validated; CORS and rate limits are deliberate — N/A — tidak tersentuh
- [x] V14 Configuration: secure defaults, security headers, no debug in production, dependencies up to date — pids_limit relay; tanpa debug

## Evidence
<!-- Generated by aitk close. -->
- Check: `npm run check` → exit 0 at 2026-11-13T06:48:54Z (215932 ms)
- Acceptance criteria: 10/10 satisfied
- Commits: 000f2ab, 10be0fe, 1113f25, 139ea63, 170b893, 1777cf3, 1fa2a2b, 24e0d05, 26454a6, 2762863, 280999b, 2a4785d, 3171ffa, 347467d, 3b6ad9e, 441a240, 4850467, 4a2e710, 52d859a, 56ac448, 5815e7e, 589ab6c, 5a2674d, 6237d6d, 648ad69, 6574710, 681c251, 683ea1f, 6aca388, 6af2ee7, 711beaf, 741a155, 76492e3, 76c1d1c, 77a5cd1, 79246cf, 7ddd569, 8049e15, 80cc079, 8325cf5, 856bae9, 86636d7, 8b0a10f, 8b7909f, 8c7f091, 92ee216, 95f55db, 9b62f18, 9cfda54, a079f81, a12fcfb, a18c5e1, a544a24, a70a59a, aa93391, ace71fc, b1036b4, b421bcc, b43e7d6, b4d9cbb, ba29099, bea7eec, bf81be6, c3eb267, c4eab09, c4f995f, c7ca1a6, cb2bb63, cb50be9, d7d32e5, dd124a1, e1a05ba, e4b98f0, e6e94a4, e7488c7, e85dcdd, eb11b82, ee21607, ee92331, ef3422a, f256b4d, f7cf853, fd66af5, ff2deb1
- Review pass 1 by claude-reviewer-subagent: 0 findings
- Review pass 2 by claude-reviewer-subagent: 0 findings
