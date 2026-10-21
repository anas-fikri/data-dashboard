---
id: T-062
title: (Bersyarat) Cache urutan baris untuk gulir dalam yang terurut
status: in_progress
profile: standard
goal: G-6
tags:
  - perf
  - query
  - conditional
depends_on:
  - T-061
created: "2026-10-15T02:30:59Z"
updated: "2026-10-21T02:16:46Z"
created_by: claude-code
workers:
  - claude-code
branch: claude/intelligent-albattani-fd1va8
base: e94e670220aa322ba737092407ff3bb9b2f0be1c
evidence:
  check:
    cmd: npm run check
    exit_code: 0
    duration_ms: 196829
    summary: |-
      …r: disk penuh","msg":"cache urutan grid gagal dibangun"}
      {"level":40,"time":1792548940645,"service":"data-dashboard","host":"127.0.0.1","port":37645,"step":"membuka folder","code":2,"err":"No such file or directory","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":40,"time":1792548940700,"service":"data-dashboard","host":"127.0.0.1","port":45863,"err":"Unable to start subsystem: sftp","msg":"subsistem SFTP ditolak NAS"}
      {"level":40,"time":1792548940795,"service":"data-dashboard","host":"127.0.0.1","port":46717,"step":"menghapus file uji","code":4,"err":"Failure","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":40,"time":1792548940897,"service":"data-dashboard","host":"127.0.0.1","port":44917,"step":"menulis file uji","code":4,"err":"Failure","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":40,"time":1792548950562,"service":"data-dashboard","err":"Can't reach database server","msg":"sesi shell gagal dibaca"}
      {"level":40,"time":1792548958102,"service":"data-dashboard","check":"B","detail":"koneksi ditolak","msg":"health check gagal"}
      {"level":40,"time":1792548958125,"service":"data-dashboard","check":"Lambat","detail":"Lambat: timeout 20 ms","msg":"health check gagal"}
      {"level":40,"time":1792548958132,"service":"data-dashboard","check":"Y","detail":"mati","msg":"health check gagal"}
      {"level":40,"time":1792548958142,"service":"data-dashboard","check":"Renderer PDF","detail":"renderer tidak menjawab /healthz","msg":"health check gagal"}

       Test Files  203 passed | 1 skipped (204)
            Tests  2684 passed | 10 skipped (2694)
         Start at  02:14:06
         Duration  132.36s (tests 85%, import 13%, transform 2%)

          Isolate  204 workers spawned · ~142ms startup each (spawn + environment, per file)
                   at least ~9.51s faster with isolate: false — reuses workers across files instead of one per file


      > data-dashboard@0.1.0 audit
      > npm audit --audit-level=high --omit=dev && npm audit --audit-level=critical

      found 0 vulnerabilities
      found 0 vulnerabilities
    at: "2026-10-21T02:16:20Z"
    tree: b50a594f0b925050d17d4417d0ead64f449693ae29032798edec788f04fa118b
  audit:
    at: "2026-10-21T02:16:21Z"
    passed: true
    tree: b50a594f0b925050d17d4417d0ead64f449693ae29032798edec788f04fa118b
    results:
      - name: osv-scanner (dependencies, offline db)
        exit_code: 0
        summary: |-
          Scanning dir .
          Starting filesystem walk for root: /
          Scanned /home/user/data-dashboard/package-lock.json file and found 836 packages
          End status: 517 dirs visited, 3971 inodes visited, 1 Extract calls, 218.62536ms elapsed, 218.625656ms wall time
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
