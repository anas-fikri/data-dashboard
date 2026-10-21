---
id: T-062
title: (Bersyarat) Cache urutan baris untuk gulir dalam yang terurut
status: blocked
profile: strict
goal: G-6
tags:
  - perf
  - query
  - conditional
depends_on:
  - T-061
created: "2026-10-15T02:30:59Z"
updated: "2026-10-21T02:20:50Z"
created_by: claude-code
workers:
  - claude-code
branch: claude/intelligent-albattani-fd1va8
base: e94e670220aa322ba737092407ff3bb9b2f0be1c
paths:
  - .env.example
  - deploy/deploy.sh
  - docker-compose.prod.yml
  - docs/runbook-deploy.md
  - scripts/perf-grid.ts
  - src/features/query/grid-http.ts
  - src/features/query/grid-order.ts
  - src/features/query/grid-service.ts
  - src/features/query/local-parquet.ts
  - src/features/query/order-cache.ts
  - src/features/query/runtime.ts
  - src/features/query/service.ts
  - src/lib/duckdb/engine.ts
  - src/lib/env.ts
  - tests/features/query/grid-order.test.ts
  - tests/features/query/order-cache.test.ts
  - tests/lib/env.test.ts
review:
  passes:
    - "n": 1
      by: claude-reviewer-subagent
      at: "2026-10-21T02:17:07Z"
      findings: 5
    - "n": 2
      by: claude-code
      at: "2026-10-21T02:17:07Z"
      findings: 0
evidence:
  check:
    cmd: npm run check
    exit_code: 0
    duration_ms: 195589
    summary: |-
      …r: disk penuh","msg":"cache urutan grid gagal dibangun"}
      {"level":40,"time":1792549184289,"service":"data-dashboard","host":"127.0.0.1","port":34581,"step":"membuka folder","code":2,"err":"No such file or directory","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":40,"time":1792549184349,"service":"data-dashboard","host":"127.0.0.1","port":40555,"err":"Unable to start subsystem: sftp","msg":"subsistem SFTP ditolak NAS"}
      {"level":40,"time":1792549184459,"service":"data-dashboard","host":"127.0.0.1","port":36969,"step":"menghapus file uji","code":4,"err":"Failure","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":40,"time":1792549184571,"service":"data-dashboard","host":"127.0.0.1","port":45093,"step":"menulis file uji","code":4,"err":"Failure","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":40,"time":1792549193014,"service":"data-dashboard","err":"Can't reach database server","msg":"sesi shell gagal dibaca"}
      {"level":40,"time":1792549200223,"service":"data-dashboard","check":"B","detail":"koneksi ditolak","msg":"health check gagal"}
      {"level":40,"time":1792549200246,"service":"data-dashboard","check":"Lambat","detail":"Lambat: timeout 20 ms","msg":"health check gagal"}
      {"level":40,"time":1792549200250,"service":"data-dashboard","check":"Y","detail":"mati","msg":"health check gagal"}
      {"level":40,"time":1792549200258,"service":"data-dashboard","check":"Renderer PDF","detail":"renderer tidak menjawab /healthz","msg":"health check gagal"}

       Test Files  203 passed | 1 skipped (204)
            Tests  2684 passed | 10 skipped (2694)
         Start at  02:18:07
         Duration  135.52s (tests 85%, import 12%, transform 2%)

          Isolate  204 workers spawned · ~145ms startup each (spawn + environment, per file)
                   at least ~9.68s faster with isolate: false — reuses workers across files instead of one per file


      > data-dashboard@0.1.0 audit
      > npm audit --audit-level=high --omit=dev && npm audit --audit-level=critical

      found 0 vulnerabilities
      found 0 vulnerabilities
    at: "2026-10-21T02:20:24Z"
    tree: b50a594f0b925050d17d4417d0ead64f449693ae29032798edec788f04fa118b
  commits:
    - 03a0095
    - 08ca5b4
    - 0cb153a
    - 0e22c88
    - "1220871"
    - 14bbbc8
    - "1781974"
    - 17d81a7
    - 18b74cc
    - 1b2b9ab
    - 23e5ae9
    - 258a139
    - 277b913
    - 27924c4
    - 27986dc
    - 29fe0f3
    - 2d7b316
    - 2d82efa
    - 2ed6480
    - 337259e
    - 35f92f6
    - 3602b55
    - 36afc9f
    - 3b96186
    - 3bb3baa
    - 4060d62
    - 4679db1
    - 49f49a5
    - 4bd9881
    - 4e9a95e
    - 4eea84c
    - 5101f51
    - 538221d
    - 5603fc7
    - 56a8447
    - 56e4d6d
    - 57df970
    - 58fdf0c
    - 59ec9a3
    - "6123427"
    - 62b718d
    - 62ec216
    - 65e370c
    - 686497c
    - 69b8953
    - 69fdcf7
    - 6a7cef1
    - 6b3ee3f
    - 70136f5
    - "7153066"
    - "7187327"
    - 75cf456
    - 76e3ce7
    - "7824e56"
    - 7ae2840
    - 7af4484
    - 7d64743
    - 7f238c4
    - 7f9a7c7
    - "8199692"
    - "8570e80"
    - 8c08ba4
    - 8f6ef33
    - 8f8df38
    - 8fc3abc
    - 90e4e63
    - 9159d7c
    - "9298e14"
    - 930dd6d
    - 94bea50
    - 94d85a4
    - 9bd7e54
    - 9ced9f4
    - 9f78595
    - a019f8f
    - a03481c
    - a0e1646
    - a5360dd
    - a687d4c
    - a8f9162
    - acb27a6
    - acf0247
    - ae4e5a2
    - af1994a
    - b0b99d8
    - b20b40b
    - b30aea5
    - b32d50d
    - b42141b
    - b8e59ee
    - b933279
    - ba2efef
    - bafb4ad
    - bcbddee
    - c15362c
    - c1a5b7f
    - c1c8b0a
    - c2fd95c
    - c3626c9
    - c76c343
    - ca5782f
    - ccd0a9a
    - ce26ca5
    - ce5d6a7
    - ce649d0
    - cf28ad3
    - cf730c5
    - d32a8ea
    - d4c2029
    - d557c9e
    - d602f56
    - da46e35
    - dfc2ebb
    - dff9b8c
    - e24e070
    - e2f1df7
    - e51fcb4
    - e94e670
    - edcbdff
    - f197114
    - f3ea697
    - f54828c
    - f55d8d2
    - f5b2aa6
    - f87b0a1
    - f9d43c6
    - fae1c8b
    - fc288cb
    - fc87996
  acceptance:
    total: 2
    done: 1
  audit:
    at: "2026-10-21T02:20:24Z"
    passed: true
    tree: b50a594f0b925050d17d4417d0ead64f449693ae29032798edec788f04fa118b
    results:
      - name: osv-scanner (dependencies, offline db)
        exit_code: 0
        summary: |-
          Scanning dir .
          Starting filesystem walk for root: /
          Scanned /home/user/data-dashboard/package-lock.json file and found 836 packages
          End status: 517 dirs visited, 3983 inodes visited, 1 Extract calls, 231.264493ms elapsed, 231.264859ms wall time
          Loaded npm local db from /root/.cache/osv-scalibr/npm/all.zip

          No issues found
      - name: npm audit (prod high, dev critical)
        exit_code: 0
        summary: |-
          > data-dashboard@0.1.0 audit
          > npm audit --audit-level=high --omit=dev && npm audit --audit-level=critical

          found 0 vulnerabilities
          found 0 vulnerabilities
      - name: aitk secret scan (tracked files)
        exit_code: 0
---

## Objective
Bagian rencana docs/ai/plans/2026-10-15-tampilan-excel-dan-data-periode.md — P-30, Fase 4 (§3.4 butir 3,
§3.6, §5.2). T-061 mengukur blok dalam urut teks p95 6,0 s (> 2 s), jadi cache urutan dibangun: permutasi
`_row` hasil urut/saring/cari disimpan sebagai berkas di disk lokal app (kunci: typed segmen + urut + saring
+ cari + periode + versi + revisi), ditambah potongan hasil terurut yang sudah diambil isinya (karena ±2–3 s
biaya ambil isi 200 `_row` acak tetap ada walau permutasi di-cache). Anggaran `GRID_ORDER_CACHE_BYTES`
(1 GiB, LRU), TTL 30 menit, invalidasi ketat saat versi/revisi berganti. Kontrak T-016 (akses dicek sebelum
cache) dan T-017/T-046 (ekspor tidak memakai cache) tidak berubah.

## Acceptance criteria
- [ ] Given urut teks pada 10 jt baris, when blok dalam berikutnya diminta, then p95 ≤ 500 ms dengan memakai berkas permutasi _row (kunci: typed segmen + urut + saring)
- [x] Given GRID_ORDER_CACHE_BYTES penuh, TTL 30 menit lewat, atau versi/revisi berganti, then entri lama dibuang dan tidak pernah dipakai untuk versi lain

## Risk
- **Impact:** jalur 2 `POST /api/sheets/:id/rows` (urut/cari) — bila cache salah, baris tampil salah urut.
  Dijaga properti uji (cache = jalur tanpa cache, 30 tampilan acak × jendela acak) dan kunci yang memuat
  versi + revisi + file typed. Beban: permutasi dibangun di belakang (satu per proses, ±4 s CPU di slot grid);
  potongan baru ±3 s di permintaan lompatan. Disk app + ≤ 1 GiB.
- **Security (STRIDE):** I — berkas berisi data dataset di disk lokal app (sama seperti cache parquet);
  dibuang saat data dihapus (forget), TTL, dan saat proses mulai; akses tetap dicek `authorizeGrid` sebelum
  cache dibaca, kunci memuat versi/sheet sehingga tidak ada kebocoran lintas versi/sheet. T — path berkas
  buatan program (hex) di direktori sandbox DuckDB (`allowed_directories` + direktori order), nilai lewat
  parameter. D — pembangunan dibatasi satu per proses lewat gerbang grid; anggaran byte. S/R/E: tidak berubah.
- **Rollback:** `GRID_ORDER_CACHE_BYTES=0` (cache mati, jalur lama persis) atau image sebelumnya; tanpa
  migrasi.
- **Validation:** `tests/features/query/grid-order.test.ts` (properti + AC2 integrasi, DuckDB sungguhan),
  `tests/features/query/order-cache.test.ts` (LRU/TTL/invalidasi/forget), `npm run perf -- grid --only cache
  --load` (docs/ai/perf/T-062.md).

## Notes
- 2026-10-21 (T-061): **diaktifkan** — blok dalam urut teks p95 6,0 s (10 jt) / 7,9 s (13 jt) > 2 s
  (docs/ai/perf/T-061.md). Perhatian: dari ±5,5 s itu hanya ±3–3,5 s tahap urut `ids`; tahap ambil isi
  `WHERE _row IN (ids)` ±2 s (dekompresi 30 kolom di hampir semua row group untuk 200 baris acak) tetap ada
  walau permutasi di-cache, jadi target ≤ 500 ms butuh juga memangkas kolom yang diambil (mis. hanya kolom di
  viewport) atau menyimpan baris hasil dalam urutan permutasi. Ukur dengan `npm run perf -- grid --only "urut teks dalam"`.
- 2026-10-21 (T-062): dibangun berkas permutasi `_row` + potongan terurut 50 rb baris (isi diambil sekali per
  potongan) di `<QUERY_CACHE_DIR>/order`; permutasi dibangun di belakang sesudah blok pertama (±4 s, satu per
  proses, gerbang grid). Hasil 10 jt (docs/ai/perf/T-062.md): **blok berikutnya** urut teks p95 24 ms
  (angka 21, saring + urut 23) → AC1 tercapai untuk gulir lanjutan. **Lompatan ke wilayah baru** (potongan
  belum ada) p95 3,3 s (dari 6,5 s) — TIDAK ≤ 500 ms: batas bawahnya dekompresi semua row group sumber;
  menembusnya butuh salinan ±1 GB per tampilan (di atas anggaran 1 GiB) atau row group typed lebih kecil
  (perubahan ingest, di luar rencana) — perlu keputusan pemilik. Beban stres urut + cache: rasio widget 2,17
  (tanpa cache 2,20), blok grid selesai 2,7× lebih banyak. AC2 dibuktikan uji unit/integrasi. Angka VM belum.
- 2026-10-21 review putaran 1 (0 blocking) diperbaiki: M1 potongan bersama yang gagal karena peminta pertama
  membatalkan → penunggu mencoba lagi sekali dengan gerbang/sinyalnya sendiri (uji M1); L2 VERSION_CHANGED hanya
  membuang entri sheet yang versinya bukan versi aktif; L3 batas byte lunak didokumentasikan (bisa sesaat lewat
  sebesar satu berkas yang sedang ditulis — perm ±37 MB / potongan ±5 MB pada 10 jt × 30 kolom — ditambah
  entri yang sedang dibaca; dibuang begitu pin dilepas); L4 berkas di subdirektori per proses
  (`order/<pid>-<acak>`), hanya sisa proses mati yang dibersihkan; L5 permutasi gagal dijeda per kunci (sibuk
  30 s, lainnya 5 menit).
- **AC1 — keputusan pemilik (dibiarkan belum dicentang).** Angka 10 jt × 30 kolom, 4 vCPU: blok berikutnya
  (gulir lanjutan) p95 24 ms; lompatan ke wilayah baru p95 3,3 s (tanpa cache 6,5 s). Pilihan:
  1. **Terima rumusan "gulir lanjutan"** (blok sesudah blok yang sudah dimuat) sebagai AC1 → selesai tanpa
     biaya tambahan; lompatan jauh tetap ±3 s (masih ≤ 3 s target blok pertama).
  2. **Row group typed lebih kecil di ingest** (mis. 4.096 baris): ambil 200 `_row` acak turun ±2,4 → ±0,5 s
     (eksperimen; salinan 961 MB), sehingga lompatan perkiraan ±0,6–1 s (belum diukur ujung-ke-ujung); berlaku untuk data baru/recast, berkas sedikit
     lebih besar, scan widget sedikit lebih lambat — perubahan ingest di luar rencana P-30, perlu ADR + ukur.
  3. **Anggaran lebih besar** (`GRID_ORDER_CACHE_BYTES` ≥ ±1,2 GB per tampilan aktif) untuk salinan terurut
     penuh: lompatan ±0,2 s, tetapi bangun 49 s CPU per tampilan (Out of Memory pada varian berpartisi di
     1 GB) dan disk ±1,06 GB per urutan — tidak disarankan di 4 vCPU.

## Security checklist (OWASP ASVS 4.0.3)
<!-- Check each item when verified, or write "N/A: <reason>" after the text and check it. -->
- [x] V1 Architecture: trust boundaries and the components handling sensitive data are identified for this change — verified: cache urutan hanya di proses app, berkas di `<QUERY_CACHE_DIR>/order` (sandbox DuckDB), dibaca hanya setelah `authorizeGrid`.
- [x] V2 Authentication: credentials are verified server-side; no default, hard-coded, or weak secrets — N/A: autentikasi tidak berubah (route grid tetap `withUser`).
- [x] V3 Session management: session tokens are random, protected, invalidated on logout and expiry — N/A: sesi tidak disentuh.
- [x] V4 Access control: every endpoint/action checks authorization server-side, deny by default (no IDOR) — verified: cache dicari setelah `authorizeGrid` (pemilik/editor, versi aktif); kunci memuat sheet+versi+revisi; VERSION_CHANGED membuang entri (uji AC2).
- [x] V5 Validation, sanitization and encoding: all input validated; output encoded; no injection (SQL, OS, template) — verified: body tetap zod `rowsBodySchema`; SQL hanya c<pos>/_row/_pos; nilai lewat parameter; path COPY buatan program (hex + nomor) dikutip `lit()`.
- [x] V6 Stored cryptography: sensitive data at rest uses approved algorithms; keys are not in the code — N/A: tidak ada kripto; berkas cache setara cache parquet lokal yang sudah ada.
- [x] V7 Error handling and logging: errors reveal no internals; security events are logged without secrets — verified: galat potongan dipetakan ke kode query yang sama (pesan umum); gagal bangun permutasi hanya log warn sheetId/versionId tanpa nilai saringan.
- [x] V8 Data protection: personal/sensitive data is minimized, not cached or logged, and removable — verified: data yang di-cache dibatasi kolom diminta (teks dipotong 500), dibuang saat dataset dihapus (`forgetLocalParquet` → `forget`), TTL 30 menit, dan saat proses mulai.
- [x] V9 Communication: TLS for all external traffic; certificates validated — N/A: tidak ada lalu lintas jaringan baru.
- [x] V10 Malicious code: no backdoors, time bombs, or unexplained network calls; dependencies are trusted — verified: tanpa dependensi baru; satu interval sapu TTL (unref).
- [x] V11 Business logic: flows cannot be abused (limits, ordering, replay, race conditions) — verified: pembangunan permutasi satu per proses + gerbang grid; single-flight per kunci/potongan; pin mencegah berkas dibuang saat dibaca; entri yang dibuang selagi dibangun tidak disimpan (uji order-cache).
- [x] V12 Files and resources: uploads are type/size limited and stored safely; no path traversal or SSRF — verified: nama berkas dari hash kunci + nomor urut, direktori tetap; total byte ≤ GRID_ORDER_CACHE_BYTES.
- [x] V13 API and web service: API inputs/outputs are schema-validated; CORS and rate limits are deliberate — verified: kontrak rute dan rate limit grid tidak berubah; bentuk jawaban sama (uji properti).
- [x] V14 Configuration: secure defaults, security headers, no debug in production, dependencies up to date — verified: env baru `GRID_ORDER_CACHE_BYTES` (bawaan 1 GiB, 0 = mati) di env.ts/.env.example/compose/runbook.

## Evidence
<!-- Generated by aitk close. -->
- Check: `npm run check` → exit 0 at 2026-10-21T02:20:24Z (195589 ms)
- Acceptance criteria: 1/2 satisfied
- Commits: 03a0095, 08ca5b4, 0cb153a, 0e22c88, 1220871, 14bbbc8, 1781974, 17d81a7, 18b74cc, 1b2b9ab, 23e5ae9, 258a139, 277b913, 27924c4, 27986dc, 29fe0f3, 2d7b316, 2d82efa, 2ed6480, 337259e, 35f92f6, 3602b55, 36afc9f, 3b96186, 3bb3baa, 4060d62, 4679db1, 49f49a5, 4bd9881, 4e9a95e, 4eea84c, 5101f51, 538221d, 5603fc7, 56a8447, 56e4d6d, 57df970, 58fdf0c, 59ec9a3, 6123427, 62b718d, 62ec216, 65e370c, 686497c, 69b8953, 69fdcf7, 6a7cef1, 6b3ee3f, 70136f5, 7153066, 7187327, 75cf456, 76e3ce7, 7824e56, 7ae2840, 7af4484, 7d64743, 7f238c4, 7f9a7c7, 8199692, 8570e80, 8c08ba4, 8f6ef33, 8f8df38, 8fc3abc, 90e4e63, 9159d7c, 9298e14, 930dd6d, 94bea50, 94d85a4, 9bd7e54, 9ced9f4, 9f78595, a019f8f, a03481c, a0e1646, a5360dd, a687d4c, a8f9162, acb27a6, acf0247, ae4e5a2, af1994a, b0b99d8, b20b40b, b30aea5, b32d50d, b42141b, b8e59ee, b933279, ba2efef, bafb4ad, bcbddee, c15362c, c1a5b7f, c1c8b0a, c2fd95c, c3626c9, c76c343, ca5782f, ccd0a9a, ce26ca5, ce5d6a7, ce649d0, cf28ad3, cf730c5, d32a8ea, d4c2029, d557c9e, d602f56, da46e35, dfc2ebb, dff9b8c, e24e070, e2f1df7, e51fcb4, e94e670, edcbdff, f197114, f3ea697, f54828c, f55d8d2, f5b2aa6, f87b0a1, f9d43c6, fae1c8b, fc288cb, fc87996
- Review pass 1 by claude-reviewer-subagent: 5 findings
- Review pass 2 by claude-code: 0 findings
