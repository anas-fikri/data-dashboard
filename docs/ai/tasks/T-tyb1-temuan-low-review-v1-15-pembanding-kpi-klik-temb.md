---
id: T-tyb1
title: Temuan Low review v1.15 (pembanding KPI + klik-tembus)
status: done
profile: strict
tags:
  - widgets
created: "2026-11-10T04:56:45Z"
updated: "2026-11-13T14:57:36Z"
closed: "2026-11-13T14:57:36Z"
created_by: claude-code
workers:
  - claude-code
branch: claude/cool-babbage-t5yojt
base: f5246f00ce1bab4a89610c53fe3e2b81575cba7d
paths:
  - src/components/dashboards/config-sections.tsx
  - src/components/dashboards/filters/cross-hint.tsx
  - src/components/dashboards/filters/filter-context.tsx
  - src/components/dashboards/kpi-compare-fields.tsx
  - src/components/dashboards/widget-config-model.ts
  - src/components/dashboards/widget-config.tsx
  - src/components/widgets/kpi-compare.ts
  - src/features/query/service.ts
  - src/features/query/spec.ts
  - src/features/query/sql.ts
  - tests/components/kpi-compare.test.ts
  - tests/components/widget-config.test.ts
  - tests/features/query/widget-query.test.ts
review:
  passes:
    - "n": 1
      by: claude-reviewer-subagent
      at: "2026-11-13T14:45:17Z"
      findings: 0
    - "n": 2
      by: claude-reviewer-subagent
      at: "2026-11-13T14:49:08Z"
      findings: 0
evidence:
  check:
    cmd: npm run check
    exit_code: 0
    duration_ms: 235397
    summary: |-
      …ice":"data-dashboard","check":"Renderer PDF","detail":"renderer tidak menjawab /healthz","msg":"health check gagal"}
      {"level":40,"time":1794581840645,"service":"data-dashboard","err":{"type":"Error","message":"NOPERM this user has no permissions to run the 'client' command","stack":"Error: NOPERM this user has no permissions to run the 'client' command\n    at Object.<anonymous> (/home/user/data-dashboard/tests/features/versions/queue-position.test.ts:71:17)\n    at Object.Mock [as getWorkers] (file:///home/user/data-dashboard/node_modules/vitest/dist/chunks/spy.DgMTfhrK.js:323:40)\n    at queueWorkerCount (/home/user/data-dashboard/src/lib/queue/versions.ts:102:40)\n    at ingestWorkerCount (/home/user/data-dashboard/src/lib/queue/versions.ts:124:10)\n    at /home/user/data-dashboard/tests/features/versions/queue-position.test.ts:69:13\n    at process.processTicksAndRejections (node:internal/process/task_queues:103:5)\n    at async file:///home/user/data-dashboard/node_modules/vitest/dist/chunks/run.BTlFXlnv.js:2783:20"},"msg":"jumlah worker gagal dibaca"}
      {"level":40,"time":1794581840926,"service":"data-dashboard","userId":"slow","err":"timeout","msg":"storage per akun gagal dihitung"}
      {"level":40,"time":1794581840928,"service":"data-dashboard","userId":"slow","err":"timeout","msg":"storage per akun gagal dihitung"}
      {"level":40,"time":1794581840929,"service":"data-dashboard","userId":"slow","err":"timeout","msg":"storage per akun gagal dihitung"}

       Test Files  253 passed | 3 skipped (256)
            Tests  3385 passed | 29 skipped (3414)
         Start at  14:54:51
         Duration  162.60s (tests 80%, import 17%, transform 3%)

          Isolate  256 workers spawned · ~137ms startup each (spawn + environment, per file)
                   at least ~11.55s faster with isolate: false — reuses workers across files instead of one per file


      > data-dashboard@1.21.8 audit
      > npm audit --audit-level=high --omit=dev && npm audit --audit-level=critical

      found 0 vulnerabilities
      found 0 vulnerabilities
    at: "2026-11-13T14:57:35Z"
    tree: 5e39cf818be4fdd7f1f8f5d4796b2b94493e8ea8412287b20e7f31241dab3f2e
  commits:
    - 000f2ab
    - 06f26ff
    - 0c43f39
    - 0e6065c
    - 0f5241b
    - 10be0fe
    - 1113f25
    - 1146ff1
    - 139ea63
    - 170b893
    - 1777cf3
    - 1892c10
    - 18ad0a8
    - 19af165
    - 1f127d7
    - 1f34fb1
    - 1fa2a2b
    - 1faf55a
    - 202826f
    - 226f64b
    - 23f1d09
    - "2472318"
    - 24e0d05
    - 26454a6
    - "2762863"
    - 280999b
    - 2a3404c
    - 2a4785d
    - 2b1c079
    - 3171ffa
    - 320d807
    - 347467d
    - 3b06bc5
    - 3b6ad9e
    - 4084a12
    - 41ef202
    - 4299c61
    - 434c0b7
    - 441a240
    - 45146c1
    - 4530e0b
    - 480fe60
    - "4850467"
    - 4a2e710
    - 4fa9ec8
    - 515f654
    - 51f63b2
    - 51fa41a
    - 52d859a
    - 53b72de
    - 562459f
    - 56ac448
    - 5815e7e
    - 589ab6c
    - 58fd0d2
    - 5931b03
    - 5a2674d
    - 5b25e15
    - 5d23aff
    - 5d77b85
    - 6237d6d
    - 63a7f03
    - 648ad69
    - 64c3c85
    - "6574710"
    - 669a30f
    - 681c251
    - 683ea1f
    - "6981253"
    - 6aca388
    - 6af2ee7
    - 6b5c285
    - 7012c26
    - 711beaf
    - 7288cca
    - "7336191"
    - 741a155
    - 7552f30
    - "76492e3"
    - 76c1d1c
    - 77a5cd1
    - 77df3bc
    - 79246cf
    - "79e0222"
    - 7dc7885
    - 7ddd569
    - 7e67256
    - 803bb7b
    - "8049e15"
    - 80cc079
    - 8325cf5
    - 83c6e64
    - 84ba18e
    - 85626d5
    - 856bae9
    - 86636d7
    - 8741bf3
    - 8b0a10f
    - 8b7909f
    - 8c7f091
    - 8d5bf1d
    - 8dc3860
    - 914b030
    - 92ee216
    - "9416e47"
    - 957a6dd
    - 95a30ac
    - 95f55db
    - 95f7b45
    - 973f5ad
    - "9803850"
    - "9980959"
    - 9b62f18
    - 9ba7b00
    - 9cfda54
    - 9e468f4
    - 9ef1150
    - a04e7fb
    - a079f81
    - a12fcfb
    - a18c5e1
    - a489cb3
    - a544a24
    - a5b5bfa
    - a70a59a
    - aa93391
    - ace71fc
    - b1036b4
    - b37b39c
    - b421bcc
    - b43e7d6
    - b4d9cbb
    - b81d108
    - ba29099
    - ba74587
    - be7c569
    - bea7eec
    - bf81be6
    - c290537
    - c3eb267
    - c4eab09
    - c4f995f
    - c5f372b
    - c70623a
    - c7ca1a6
    - cb2bb63
    - cb50be9
    - cc560e5
    - d3794b5
    - d56a607
    - d6d31c9
    - d7d32e5
    - dcf39e5
    - dd124a1
    - dd94740
    - e1a05ba
    - e4b98f0
    - e6e94a4
    - e7488c7
    - e82f68a
    - e85dcdd
    - e9978ed
    - ea05d98
    - eaa3c13
    - eb11b82
    - ee21607
    - ee92331
    - ef3422a
    - ef7600f
    - f256b4d
    - f5246f0
    - f7cf853
    - fd66af5
    - ff2deb1
    - ffc9089
  acceptance:
    total: 4
    done: 4
  audit:
    at: "2026-11-13T14:49:09Z"
    passed: true
    tree: 5e39cf818be4fdd7f1f8f5d4796b2b94493e8ea8412287b20e7f31241dab3f2e
    results:
      - name: osv-scanner (dependencies, offline db)
        exit_code: 0
        summary: |-
          Scanning dir .
          Starting filesystem walk for root: /
          Scanned /home/user/data-dashboard/package-lock.json file and found 837 packages
          End status: 558 dirs visited, 5888 inodes visited, 1 Extract calls, 165.392701ms elapsed, 165.392954ms wall time
          Loaded npm local db from /root/.cache/osv-scanner/npm/all.zip
          No issues found
      - name: npm audit (prod high, dev critical)
        exit_code: 0
        summary: |-
          > data-dashboard@1.21.8 audit
          > npm audit --audit-level=high --omit=dev && npm audit --audit-level=critical

          found 0 vulnerabilities
          found 0 vulnerabilities
      - name: aitk secret scan (tracked files)
        exit_code: 0
---

## Objective
Sisa temuan Low review v1.15 (subagen, putaran 1) yang tidak memblokir rilis: kolom klik-tembus/pembanding yang disembunyikan setelah disimpan memblokir simpan otomatis widget dengan pesan umum (perlu tombol perbaiki/buang otomatis seperti kolom tabel); petunjuk filter silang dashboard masih 'pilih kategori…' untuk grafik berklik-tembus; panel Angka tidak menyebut bahwa warna ▲/▼ mengikuti penilaian bawaan dashboard; periode terakhir biasanya belum penuh (pertimbangkan catatan 's.d. <tanggal>' atau membandingkan rentang hari yang sama); 3 query pembanding bisa digabung.

## Acceptance criteria
- [x] Given kolom klik-tembus atau kolom tanggal pembanding disembunyikan setelah disimpan, when panel widget dibuka, then ada tindakan perbaikan (buang kolom / matikan) dan simpan otomatis tidak diam-diam terhenti
- [x] Given grafik berklik-tembus, when petunjuk filter silang tampil, then teksnya menyebut klik membuka baris data (dan saring lewat tombol di tabel itu)
- [x] Given Angka berpembanding tanpa penilaian sendiri dan dashboard punya penilaian bawaan, when panel dibuka, then petunjuk menyebut warna ▲/▼ mengikuti penilaian bawaan dashboard
- [x] Given periode terakhir belum penuh, when KPI berpembanding tampil, then label/keterangan menjelaskan rentang yang dibandingkan (keputusan desain dicatat)

## Risk
Impact: panel widget (perbaikan kolom klik-tembus/pembanding, petunjuk warna), petunjuk filter silang, query batas periode KPI (+1 kolom tanggal terakhir), teks pembanding KPI. Security: N/A (tanpa input/endpoint baru). Rollback: versi sebelumnya (field latest opsional). Validation: uji unit widget-config, kpi-compare, widget-query (DuckDB); aitk check.

## Notes
- 2026-11-10T05:01:05Z Dari review v1.15 r2: file ekspor KPI berpembanding belum menyebut periodenya (tambah kolom/label periode).
- 2026-11-13T14:44:39Z Keputusan desain AC4: tetap membandingkan periode pembanding penuh dengan periode berjalan; keterangan 's.d. <tanggal data terakhir>' di baris pembanding + kalimat lengkap (title/pembaca layar). Membandingkan rentang hari yang sama ditunda (mengubah angka yang sudah dipakai pemilik). Catatan ekspor KPI tanpa label periode: tidak dikerjakan (Low).
- 2026-11-13T14:45:18Z Review: 0 blocking. Low: withoutMissingExtras dihitung 2×/render; hasDrill memeriksa semua widget (bukan hanya grafik bersaring silang); tanpa uji unit latest = hari terakhir (diuji di widget-query lewat data 31 Mar).

## Security checklist (OWASP ASVS 4.0.3)
<!-- Check each item when verified, or write "N/A: <reason>" after the text and check it. -->
- [x] V1 Architecture: trust boundaries and the components handling sensitive data are identified for this change — N/A — tidak tersentuh
- [x] V2 Authentication: credentials are verified server-side; no default, hard-coded, or weak secrets — N/A — tidak tersentuh
- [x] V3 Session management: session tokens are random, protected, invalidated on logout and expiry — N/A — tidak tersentuh
- [x] V4 Access control: every endpoint/action checks authorization server-side, deny by default (no IDOR) — endpoint query widget tetap memeriksa akses seperti sebelumnya
- [x] V5 Validation, sanitization and encoding: all input validated; output encoded; no injection (SQL, OS, template) — SQL batas periode: kolom lewat ident(), tanpa input user baru; teks dirender React
- [x] V6 Stored cryptography: sensitive data at rest uses approved algorithms; keys are not in the code — N/A — tidak tersentuh
- [x] V7 Error handling and logging: errors reveal no internals; security events are logged without secrets — N/A — tidak tersentuh
- [x] V8 Data protection: personal/sensitive data is minimized, not cached or logged, and removable — N/A — tidak tersentuh
- [x] V9 Communication: TLS for all external traffic; certificates validated — N/A — tidak tersentuh
- [x] V10 Malicious code: no backdoors, time bombs, or unexplained network calls; dependencies are trusted — N/A — tidak tersentuh
- [x] V11 Business logic: flows cannot be abused (limits, ordering, replay, race conditions) — N/A — tidak tersentuh
- [x] V12 Files and resources: uploads are type/size limited and stored safely; no path traversal or SSRF — N/A — tidak tersentuh
- [x] V13 API and web service: API inputs/outputs are schema-validated; CORS and rate limits are deliberate — field latest opsional, bentuk 'YYYY-MM-DD' dari DuckDB
- [x] V14 Configuration: secure defaults, security headers, no debug in production, dependencies up to date — N/A — tidak tersentuh

## Evidence
<!-- Generated by aitk close. -->
- Check: `npm run check` → exit 0 at 2026-11-13T14:57:35Z (235397 ms)
- Acceptance criteria: 4/4 satisfied
- Commits: 000f2ab, 06f26ff, 0c43f39, 0e6065c, 0f5241b, 10be0fe, 1113f25, 1146ff1, 139ea63, 170b893, 1777cf3, 1892c10, 18ad0a8, 19af165, 1f127d7, 1f34fb1, 1fa2a2b, 1faf55a, 202826f, 226f64b, 23f1d09, 2472318, 24e0d05, 26454a6, 2762863, 280999b, 2a3404c, 2a4785d, 2b1c079, 3171ffa, 320d807, 347467d, 3b06bc5, 3b6ad9e, 4084a12, 41ef202, 4299c61, 434c0b7, 441a240, 45146c1, 4530e0b, 480fe60, 4850467, 4a2e710, 4fa9ec8, 515f654, 51f63b2, 51fa41a, 52d859a, 53b72de, 562459f, 56ac448, 5815e7e, 589ab6c, 58fd0d2, 5931b03, 5a2674d, 5b25e15, 5d23aff, 5d77b85, 6237d6d, 63a7f03, 648ad69, 64c3c85, 6574710, 669a30f, 681c251, 683ea1f, 6981253, 6aca388, 6af2ee7, 6b5c285, 7012c26, 711beaf, 7288cca, 7336191, 741a155, 7552f30, 76492e3, 76c1d1c, 77a5cd1, 77df3bc, 79246cf, 79e0222, 7dc7885, 7ddd569, 7e67256, 803bb7b, 8049e15, 80cc079, 8325cf5, 83c6e64, 84ba18e, 85626d5, 856bae9, 86636d7, 8741bf3, 8b0a10f, 8b7909f, 8c7f091, 8d5bf1d, 8dc3860, 914b030, 92ee216, 9416e47, 957a6dd, 95a30ac, 95f55db, 95f7b45, 973f5ad, 9803850, 9980959, 9b62f18, 9ba7b00, 9cfda54, 9e468f4, 9ef1150, a04e7fb, a079f81, a12fcfb, a18c5e1, a489cb3, a544a24, a5b5bfa, a70a59a, aa93391, ace71fc, b1036b4, b37b39c, b421bcc, b43e7d6, b4d9cbb, b81d108, ba29099, ba74587, be7c569, bea7eec, bf81be6, c290537, c3eb267, c4eab09, c4f995f, c5f372b, c70623a, c7ca1a6, cb2bb63, cb50be9, cc560e5, d3794b5, d56a607, d6d31c9, d7d32e5, dcf39e5, dd124a1, dd94740, e1a05ba, e4b98f0, e6e94a4, e7488c7, e82f68a, e85dcdd, e9978ed, ea05d98, eaa3c13, eb11b82, ee21607, ee92331, ef3422a, ef7600f, f256b4d, f5246f0, f7cf853, fd66af5, ff2deb1, ffc9089
- Review pass 1 by claude-reviewer-subagent: 0 findings
- Review pass 2 by claude-reviewer-subagent: 0 findings
