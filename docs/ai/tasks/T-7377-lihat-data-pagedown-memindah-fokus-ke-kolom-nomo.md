---
id: T-7377
title: 'Lihat data: PageDown memindah fokus ke kolom nomor baris (e2e data-view-a11y AC2 gagal di main)'
status: done
profile: lite
tags:
  - data-view
  - a11y
created: "2026-11-10T02:55:37Z"
updated: "2026-11-13T14:00:35Z"
closed: "2026-11-13T14:00:35Z"
created_by: claude-code
workers:
  - claude-code
branch: claude/cool-babbage-t5yojt
base: 9416e4766524bc5368bfebc1adf0e40e339a1732
paths:
  - src/components/grid/sheet-grid.tsx
  - tests/e2e/data-view-a11y.spec.ts
review:
  passes:
    - "n": 1
      by: claude-reviewer-subagent
      at: "2026-11-13T13:52:58Z"
      findings: 0
evidence:
  check:
    cmd: npm run check
    exit_code: 0
    duration_ms: 214071
    summary: |-
      …level":40,"time":1794578415628,"service":"data-dashboard","err":{"type":"Error","message":"NOPERM this user has no permissions to run the 'client' command","stack":"Error: NOPERM this user has no permissions to run the 'client' command\n    at Object.<anonymous> (/home/user/data-dashboard/tests/features/versions/queue-position.test.ts:71:17)\n    at Object.Mock [as getWorkers] (file:///home/user/data-dashboard/node_modules/vitest/dist/chunks/spy.DgMTfhrK.js:323:40)\n    at queueWorkerCount (/home/user/data-dashboard/src/lib/queue/versions.ts:102:40)\n    at ingestWorkerCount (/home/user/data-dashboard/src/lib/queue/versions.ts:124:10)\n    at /home/user/data-dashboard/tests/features/versions/queue-position.test.ts:69:13\n    at process.processTicksAndRejections (node:internal/process/task_queues:103:5)\n    at async file:///home/user/data-dashboard/node_modules/vitest/dist/chunks/run.BTlFXlnv.js:2783:20"},"msg":"jumlah worker gagal dibaca"}
      {"level":40,"time":1794578425442,"service":"data-dashboard","userId":"slow","err":"timeout","msg":"storage per akun gagal dihitung"}
      {"level":40,"time":1794578425444,"service":"data-dashboard","userId":"slow","err":"timeout","msg":"storage per akun gagal dihitung"}
      {"level":40,"time":1794578425444,"service":"data-dashboard","userId":"slow","err":"timeout","msg":"storage per akun gagal dihitung"}
      {"level":30,"time":1794578432667,"service":"data-dashboard","datasetId":"t072mwf1nv7qds000000","msg":"dataset dihapus"}

       Test Files  255 passed | 1 skipped (256)
            Tests  3401 passed | 10 skipped (3411)
         Start at  13:58:10
         Duration  142.16s (tests 80%, import 17%, transform 3%)

          Isolate  256 workers spawned · ~116ms startup each (spawn + environment, per file)
                   at least ~9.79s faster with isolate: false — reuses workers across files instead of one per file


      > data-dashboard@1.21.7 audit
      > npm audit --audit-level=high --omit=dev && npm audit --audit-level=critical

      found 0 vulnerabilities
      found 0 vulnerabilities
    at: "2026-11-13T14:00:34Z"
    tree: 47f691cae9c4119819445d869d710a78fe496d6d3ebd5832ca7da3c6e4bfe8ac
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
    - 1d723f8
    - 1f127d7
    - 1f34fb1
    - 1fa2a2b
    - 1faf55a
    - 202826f
    - 23f1d09
    - "2472318"
    - 24e0d05
    - 26454a6
    - "2762863"
    - 280999b
    - 2a3404c
    - 2a4785d
    - 2b1c079
    - 2dc0d7f
    - 3171ffa
    - 320d807
    - 347467d
    - 36c9f18
    - 39f6a65
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
    - 711beaf
    - 7288cca
    - "7336191"
    - 741a155
    - 7552f30
    - "76492e3"
    - 76c1d1c
    - 77a5cd1
    - 77df3bc
    - 7809c7d
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
    - 9ee22e2
    - 9ef1150
    - a04e7fb
    - a079f81
    - a12fcfb
    - a18c5e1
    - a489cb3
    - a544a24
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
    - c3eb267
    - c4eab09
    - c4f995f
    - c5f372b
    - c70623a
    - c7ca1a6
    - cad7698
    - cb2bb63
    - cb50be9
    - cd206e3
    - cf10253
    - d3794b5
    - d56a607
    - d6d31c9
    - d7d32e5
    - dcf39e5
    - dd124a1
    - dd94740
    - e1a05ba
    - e2c8065
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
    - f7cf853
    - f8d9189
    - fd66af5
    - ff2deb1
    - ffc9089
  acceptance:
    total: 2
    done: 2
---

## Objective
Uji e2e data-view-a11y AC2 gagal konsisten di main (ditemukan saat suite penuh v1.14, juga gagal tanpa perubahan v1.14 — uji banding tanpa tombol Cari): setelah Home lalu ArrowRight (fokus c1), PageDown memindah fokus ke kolom nomor baris (n), bukan tetap di c1. Terakhir tercatat lulus 2026-10-23 (T-tzxt). Cari commit penyebab (git bisect pada proyek data-view-a11y) dan perbaiki navigasi keyboard grid.

## Acceptance criteria
- [x] Given sel c1 terfokus di Lihat data, when PageDown/PageUp ditekan, then fokus tetap di kolom c1 dan baris berpindah satu halaman; e2e data-view-a11y lulus
- [x] Given sel di Lihat data, when Esc menutup dialog saring lalu F2 ditekan, then panel Isi sel terbuka untuk sel yang sama (e2e data-view-a11y AC3 lulus)

## Risk
Impact: navigasi keyboard grid Lihat data (Home/End, pengembalian fokus setelah dialog saring). Security: N/A (UI). Rollback: versi sebelumnya. Validation: e2e data-view-a11y 2× lulus + proyek data-view lain.

## Notes
- 2026-11-10T05:32:06Z v1.15 (2026-11-10): AC3 juga gagal — F2 setelah Esc dari dialog saring tidak membuka panel Isi sel (data-view-a11y.spec.ts:298); uji banding di 7809c7d (v1.14) gagal sama → bukan regresi v1.15. AC1 dijalankan terpisah.
- 2026-11-13T13:52:12Z Akar masalah AC2: Home/End memfokus sel lewat dua requestAnimationFrame → tombol berikutnya berangkat dari sel lama. Kini fokus langsung bila sel sudah dirender. AC3: uji menekan F2 sebelum dialog tertutup; disamakan dengan AC2 (tunggu tertutup) + fokus kembali ke sel menurut baris/kolom bila sel asal dirender ulang.
- 2026-11-13T13:52:59Z Review: 0 blocking. Low: fokus kembali menurut nomor baris (bukan rekaman) bila data berubah saat dialog terbuka; focus() tanpa preventScroll; selektor sel ditulis 3×.

## Evidence
<!-- Generated by aitk close. -->
- Check: `npm run check` → exit 0 at 2026-11-13T14:00:34Z (214071 ms)
- Acceptance criteria: 2/2 satisfied
- Commits: 000f2ab, 06f26ff, 0c43f39, 0e6065c, 0f5241b, 10be0fe, 1113f25, 1146ff1, 139ea63, 170b893, 1777cf3, 1892c10, 18ad0a8, 19af165, 1d723f8, 1f127d7, 1f34fb1, 1fa2a2b, 1faf55a, 202826f, 23f1d09, 2472318, 24e0d05, 26454a6, 2762863, 280999b, 2a3404c, 2a4785d, 2b1c079, 2dc0d7f, 3171ffa, 320d807, 347467d, 36c9f18, 39f6a65, 3b06bc5, 3b6ad9e, 4084a12, 41ef202, 4299c61, 434c0b7, 441a240, 45146c1, 4530e0b, 480fe60, 4850467, 4a2e710, 4fa9ec8, 515f654, 51f63b2, 51fa41a, 52d859a, 53b72de, 562459f, 56ac448, 5815e7e, 589ab6c, 58fd0d2, 5931b03, 5a2674d, 5b25e15, 5d23aff, 6237d6d, 63a7f03, 648ad69, 64c3c85, 6574710, 669a30f, 681c251, 683ea1f, 6981253, 6aca388, 6af2ee7, 6b5c285, 711beaf, 7288cca, 7336191, 741a155, 7552f30, 76492e3, 76c1d1c, 77a5cd1, 77df3bc, 7809c7d, 79246cf, 79e0222, 7dc7885, 7ddd569, 7e67256, 803bb7b, 8049e15, 80cc079, 8325cf5, 83c6e64, 84ba18e, 85626d5, 856bae9, 86636d7, 8741bf3, 8b0a10f, 8b7909f, 8c7f091, 8d5bf1d, 8dc3860, 914b030, 92ee216, 9416e47, 957a6dd, 95a30ac, 95f55db, 95f7b45, 973f5ad, 9803850, 9980959, 9b62f18, 9ba7b00, 9cfda54, 9e468f4, 9ee22e2, 9ef1150, a04e7fb, a079f81, a12fcfb, a18c5e1, a489cb3, a544a24, a70a59a, aa93391, ace71fc, b1036b4, b37b39c, b421bcc, b43e7d6, b4d9cbb, b81d108, ba29099, ba74587, be7c569, bea7eec, bf81be6, c3eb267, c4eab09, c4f995f, c5f372b, c70623a, c7ca1a6, cad7698, cb2bb63, cb50be9, cd206e3, cf10253, d3794b5, d56a607, d6d31c9, d7d32e5, dcf39e5, dd124a1, dd94740, e1a05ba, e2c8065, e4b98f0, e6e94a4, e7488c7, e82f68a, e85dcdd, e9978ed, ea05d98, eaa3c13, eb11b82, ee21607, ee92331, ef3422a, ef7600f, f256b4d, f7cf853, f8d9189, fd66af5, ff2deb1, ffc9089
- Review pass 1 by claude-reviewer-subagent: 0 findings
