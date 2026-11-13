---
id: T-01xj
title: 'T-0gmm lanjutan: uji unit jalur drift judul sheet gabungan (mergeHeaderDrift) + kolom filter ikut sheetMap saat aktivasi'
status: done
profile: standard
created: "2026-11-11T06:05:40Z"
updated: "2026-11-13T11:02:27Z"
closed: "2026-11-13T11:02:27Z"
created_by: claude-code
workers:
  - claude-code
branch: claude/cool-babbage-t5yojt
base: 7552f301bfaa7860868d72396ef89c0499a6bfee
paths:
  - src/features/versions/activation.ts
  - tests/features/ingest/merge-sheets.test.ts
  - tests/features/versions/activation.test.ts
review:
  passes:
    - "n": 1
      by: claude-reviewer-subagent
      at: "2026-11-13T10:59:20Z"
      findings: 0
evidence:
  check:
    cmd: npm run check
    exit_code: 0
    duration_ms: 210710
    summary: |-
      …5433`\n\nPlease make sure your database server is running at `127.0.0.1:5433`.","msg":"kuota pengguna tidak terbaca"}
      {"level":40,"time":1794567720656,"service":"data-dashboard","err":{"type":"Error","message":"NOPERM this user has no permissions to run the 'client' command","stack":"Error: NOPERM this user has no permissions to run the 'client' command\n    at Object.<anonymous> (/home/user/data-dashboard/tests/features/versions/queue-position.test.ts:71:17)\n    at Object.Mock [as getWorkers] (file:///home/user/data-dashboard/node_modules/vitest/dist/chunks/spy.DgMTfhrK.js:323:40)\n    at queueWorkerCount (/home/user/data-dashboard/src/lib/queue/versions.ts:102:40)\n    at ingestWorkerCount (/home/user/data-dashboard/src/lib/queue/versions.ts:124:10)\n    at /home/user/data-dashboard/tests/features/versions/queue-position.test.ts:69:13\n    at process.processTicksAndRejections (node:internal/process/task_queues:103:5)\n    at async file:///home/user/data-dashboard/node_modules/vitest/dist/chunks/run.BTlFXlnv.js:2783:20"},"msg":"jumlah worker gagal dibaca"}
      {"level":40,"time":1794567724998,"service":"data-dashboard","userId":"slow","err":"timeout","msg":"storage per akun gagal dihitung"}
      {"level":40,"time":1794567724999,"service":"data-dashboard","userId":"slow","err":"timeout","msg":"storage per akun gagal dihitung"}
      {"level":40,"time":1794567725000,"service":"data-dashboard","userId":"slow","err":"timeout","msg":"storage per akun gagal dihitung"}

       Test Files  253 passed | 3 skipped (256)
            Tests  3382 passed | 29 skipped (3411)
         Start at  10:59:56
         Duration  139.33s (tests 81%, import 16%, transform 3%)

          Isolate  256 workers spawned · ~108ms startup each (spawn + environment, per file)
                   at least ~9.07s faster with isolate: false — reuses workers across files instead of one per file


      > data-dashboard@1.21.6 audit
      > npm audit --audit-level=high --omit=dev && npm audit --audit-level=critical

      found 0 vulnerabilities
      found 0 vulnerabilities
    at: "2026-11-13T11:02:17Z"
    tree: d68f1c500ac19ff41e2682cdbb1d00d124fd29b5ed7492a279f25c9dbdc0f535
  commits:
    - 000f2ab
    - 06f26ff
    - 0e6065c
    - 0f5241b
    - 10be0fe
    - 1113f25
    - 1146ff1
    - 139ea63
    - 170b893
    - 1777cf3
    - 18ad0a8
    - 1f127d7
    - 1f34fb1
    - 1fa2a2b
    - 1faf55a
    - 24e0d05
    - 26454a6
    - "2762863"
    - 280999b
    - 2a4785d
    - 2b1c079
    - 3171ffa
    - 320d807
    - 347467d
    - 3b06bc5
    - 3b6ad9e
    - 4084a12
    - 4299c61
    - 434c0b7
    - 441a240
    - 45146c1
    - 480fe60
    - "4850467"
    - 4a2e710
    - 4fa9ec8
    - 52d859a
    - 53b72de
    - 562459f
    - 56ac448
    - 5815e7e
    - 589ab6c
    - 58fd0d2
    - 5a2674d
    - 5b25e15
    - 5d23aff
    - 6237d6d
    - 648ad69
    - 64c3c85
    - "6574710"
    - 669a30f
    - 681c251
    - 683ea1f
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
    - 79246cf
    - 7dc7885
    - 7ddd569
    - 7e67256
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
    - 957a6dd
    - 95a30ac
    - 95f55db
    - 95f7b45
    - 973f5ad
    - "9803850"
    - 9b62f18
    - 9cfda54
    - a04e7fb
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
    - ba74587
    - be7c569
    - bea7eec
    - bf81be6
    - c3eb267
    - c4eab09
    - c4f995f
    - c70623a
    - c7ca1a6
    - cb2bb63
    - cb50be9
    - d3794b5
    - d7d32e5
    - dcf39e5
    - dd124a1
    - e1a05ba
    - e4b98f0
    - e6e94a4
    - e7488c7
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
    - fd66af5
    - ff2deb1
    - ffc9089
  acceptance:
    total: 2
    done: 2
---

## Objective
Jalur drift judul sheet gabungan teruji, dan kolom filter dashboard tidak lagi kehilangan sheet-nya ketika sheet aktif diserap ke sheet gabungan atau ganti nama lewat pemetaan.

## Acceptance criteria
- [x] Uji unit jalur drift judul sheet gabungan (mergeHeaderDrift): versi gagal dengan saran, tanpa objek tersisa
- [x] Kolom filter dashboard (disimpan per nama sheet) ikut sheetMap saat aktivasi: sheet yang diserap/ganti nama → nama sheet target; diuji

## Risk
Impact: aktivasi versi (activateVersionInTx) menulis ulang Dashboard.filterColumns bila sheetMap mengganti nama sheet; dalam transaksi + advisory lock dashboard yang sama. Security (STRIDE): Tampering — hanya dashboard dataset yang sama, nama dari tabel Sheet. Rollback: versi sebelumnya (filter yang sudah dipetakan tetap valid karena nama sheet target ada). Validation: uji unit remapFilterColumns + uji aktivasi sheetMap + uji ingest drift; aitk check.

## Notes
- 2026-11-11T06:06:13Z Low review r3 T-0gmm: kolom kosong (absent, T-014) terlihat milik sheet aktif yang diserap gabungan tidak ikut dicek/dibawa (ingest.ts ±540 hanya plan.missing) — laporkan plan.absent yang tidak ada di skema pemimpin atau gabungkan ke absent kelompok. Juga: role=status peringatan pemilih mungkin tidak diumumkan karena dipasang bersama teksnya.
- 2026-11-13T10:58:36Z Catatan lama (kolom absent sheet yang diserap) tidak dikerjakan di sini — tetap Low.
- 2026-11-13T10:59:20Z Review: 0 blocking. Low: simpan kolom filter editor tanpa lock bisa menimpa hasil remap (sama dengan T-4q8n); sheet yang dipasangkan lewat matchSheet (tanpa sheetMap) tidak memetakan filter; tanpa revisi/updatedAt.

## Evidence
<!-- Generated by aitk close. -->
- Check: `npm run check` → exit 0 at 2026-11-13T11:02:17Z (210710 ms)
- Acceptance criteria: 2/2 satisfied
- Commits: 000f2ab, 06f26ff, 0e6065c, 0f5241b, 10be0fe, 1113f25, 1146ff1, 139ea63, 170b893, 1777cf3, 18ad0a8, 1f127d7, 1f34fb1, 1fa2a2b, 1faf55a, 24e0d05, 26454a6, 2762863, 280999b, 2a4785d, 2b1c079, 3171ffa, 320d807, 347467d, 3b06bc5, 3b6ad9e, 4084a12, 4299c61, 434c0b7, 441a240, 45146c1, 480fe60, 4850467, 4a2e710, 4fa9ec8, 52d859a, 53b72de, 562459f, 56ac448, 5815e7e, 589ab6c, 58fd0d2, 5a2674d, 5b25e15, 5d23aff, 6237d6d, 648ad69, 64c3c85, 6574710, 669a30f, 681c251, 683ea1f, 6aca388, 6af2ee7, 6b5c285, 711beaf, 7288cca, 7336191, 741a155, 7552f30, 76492e3, 76c1d1c, 77a5cd1, 79246cf, 7dc7885, 7ddd569, 7e67256, 8049e15, 80cc079, 8325cf5, 83c6e64, 84ba18e, 85626d5, 856bae9, 86636d7, 8741bf3, 8b0a10f, 8b7909f, 8c7f091, 8d5bf1d, 8dc3860, 914b030, 92ee216, 957a6dd, 95a30ac, 95f55db, 95f7b45, 973f5ad, 9803850, 9b62f18, 9cfda54, a04e7fb, a079f81, a12fcfb, a18c5e1, a544a24, a70a59a, aa93391, ace71fc, b1036b4, b421bcc, b43e7d6, b4d9cbb, ba29099, ba74587, be7c569, bea7eec, bf81be6, c3eb267, c4eab09, c4f995f, c70623a, c7ca1a6, cb2bb63, cb50be9, d3794b5, d7d32e5, dcf39e5, dd124a1, e1a05ba, e4b98f0, e6e94a4, e7488c7, e85dcdd, e9978ed, ea05d98, eaa3c13, eb11b82, ee21607, ee92331, ef3422a, ef7600f, f256b4d, f7cf853, fd66af5, ff2deb1, ffc9089
- Review pass 1 by claude-reviewer-subagent: 0 findings
