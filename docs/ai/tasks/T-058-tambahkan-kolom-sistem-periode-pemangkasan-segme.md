---
id: T-058
title: Tambahkan kolom sistem 'Periode', pemangkasan segmen, dan pemilih periode
status: in_progress
profile: standard
goal: G-6
tags:
  - query
  - ui
  - security
depends_on:
  - T-052
  - T-044
created: "2026-10-15T02:30:58Z"
updated: "2026-10-20T18:38:37Z"
created_by: claude-code
workers:
  - claude-code
branch: claude/intelligent-albattani-fd1va8
base: 4060d62cf7729b01c97f60b4a4676c9c8ef384b8
evidence:
  check:
    cmd: npm run check
    exit_code: 0
    duration_ms: 193986
    summary: |-
      …t
      > vitest run


       RUN  v5.0.3 /home/user/data-dashboard

      {"level":40,"time":1792521433364,"service":"data-dashboard","host":"127.0.0.1","port":38155,"step":"membuka folder","code":2,"err":"No such file or directory","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":40,"time":1792521433431,"service":"data-dashboard","host":"127.0.0.1","port":33859,"err":"Unable to start subsystem: sftp","msg":"subsistem SFTP ditolak NAS"}
      {"level":40,"time":1792521433537,"service":"data-dashboard","host":"127.0.0.1","port":42821,"step":"menghapus file uji","code":4,"err":"Failure","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":40,"time":1792521433649,"service":"data-dashboard","host":"127.0.0.1","port":38587,"step":"menulis file uji","code":4,"err":"Failure","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":40,"time":1792521442620,"service":"data-dashboard","err":"Can't reach database server","msg":"sesi shell gagal dibaca"}
      {"level":40,"time":1792521450453,"service":"data-dashboard","check":"B","detail":"koneksi ditolak","msg":"health check gagal"}
      {"level":40,"time":1792521450478,"service":"data-dashboard","check":"Lambat","detail":"Lambat: timeout 20 ms","msg":"health check gagal"}
      {"level":40,"time":1792521450480,"service":"data-dashboard","check":"Y","detail":"mati","msg":"health check gagal"}
      {"level":40,"time":1792521450497,"service":"data-dashboard","check":"Renderer PDF","detail":"renderer tidak menjawab /healthz","msg":"health check gagal"}

       Test Files  193 passed | 1 skipped (194)
            Tests  2556 passed | 10 skipped (2566)
         Start at  18:35:49
         Duration  132.17s (tests 84%, import 14%, transform 3%)

          Isolate  194 workers spawned · ~150ms startup each (spawn + environment, per file)
                   at least ~9.53s faster with isolate: false — reuses workers across files instead of one per file


      > data-dashboard@0.1.0 audit
      > npm audit --audit-level=high --omit=dev && npm audit --audit-level=critical

      found 0 vulnerabilities
      found 0 vulnerabilities
    at: "2026-10-20T18:38:03Z"
    tree: 4f5946d9ddc9ebd80cad5c8c2ddc2a8ab5cd4f15f6684df2f272819009d84bdb
  audit:
    at: "2026-10-20T18:38:04Z"
    passed: true
    tree: 4f5946d9ddc9ebd80cad5c8c2ddc2a8ab5cd4f15f6684df2f272819009d84bdb
    results:
      - name: osv-scanner (dependencies, offline db)
        exit_code: 0
        summary: |-
          Scanning dir .
          Starting filesystem walk for root: /
          Scanned /home/user/data-dashboard/package-lock.json file and found 836 packages
          End status: 505 dirs visited, 3349 inodes visited, 1 Extract calls, 242.017274ms elapsed, 242.017697ms wall time
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
Bagian rencana docs/ai/plans/2026-10-15-tampilan-excel-dan-data-periode.md — P-26, Fase 3. Perkiraan 2–3 hari. Baca bagian rencana yang relevan (§3 Lihat data, §4 periode, §5 batas, §6 risiko) sebelum mulai; cek ulang kontrak T-016 (otorisasi) dan T-017 (ekspor) sesuai risiko R21.

## Acceptance criteria
- [x] Given dataset periode (termasuk mode label tanpa kolom tanggal), when membuat widget, then dimensi/filter 'Periode' tersedia, terurut kronologis, berlabel seperti 'Mar 2026', dan tampil sebagai 'Periode (sistem)' bila namanya bentrok
- [x] Given filter tanggal pada kolom periode atau filter 'Periode', when widget di-query, then hanya segmen yang min/max-nya beririsan yang disewa, dan hasilnya identik dengan query tanpa pemangkasan (teruji)
- [x] Given sheet periode, then urutan default widget tabel dan grid = (_period, _row); viewer hanya bisa memakai filter Periode bila dipasang pemilik (D6); preset 'Periode terbaru' tersedia
- [x] Given Lihat data, then pemilih 'Periode: Semua ▾' membatasi grid, dan totalnya sama dengan metadata periode

## Risk
- Impact: jalur query widget/KPI/grafik/pivot/tabel, query bebas, slicer, ekspor widget + ekspor tampilan,
  grid Lihat data (rows/values/stats/cell), remap widget saat aktivasi versi, panel widget + kolom filter
  dashboard. Sheet NON-periode tidak berubah (sumber/urutan/skema sama; kolom virtual hanya bila
  Sheet.periodSource + DatasetVersion.periodGrain). Tanpa migrasi DB, tanpa perubahan objek storage.
- Security (STRIDE): Spoofing/Elevation — tidak ada jalur akses baru; viewer tetap { widgetId,
  dashboardFilters } dan "Periode" hanya lewat izin nama kolom filter dashboard (D6, teruji). Tampering —
  identifier SQL hanya `c<PERIOD_COLUMN>`/`_period` buatan program, nilai filter/periode lewat parameter;
  kunci periode grid divalidasi regex + harus ada di manifest (INVALID tanpa query). Information
  disclosure — pemangkasan tidak mengubah hasil (uji DuckDB identik); kunci cache count/values/stats
  grid memuat periode terpilih (tidak bocor antar tampilan). DoS — pemangkasan mengurangi unduhan; daftar
  periode ≤ 120 kunci.
- Rollback: revert commit T-058; tidak ada data/migrasi yang perlu dibalik. Widget yang sempat memakai
  kolom Periode akan tampil "kolom tidak tersedia" setelah revert (posisi PERIOD_COLUMN tidak dikenal).
- Validation: unit (prune 14, period-column 10, period-query DuckDB 31, grid-period 12, source 9,
  grid-page 8, widget-config) + e2e period-query 3/3, data-view, data-view-query, data-view-export,
  filters.

## Notes
- Dari T-054: pada sheet bersumber LABEL, Segment.minDate/maxDate berisi rentang kolom tanggal acuan
  (labelReferenceColumn), bukan rentang periode. Pemangkasan untuk filter Periode/tanggal kolom periode
  harus memakai periodStart/periodKey untuk segmen berlabel; minDate/maxDate hanya sah untuk filter pada
  kolom acuan itu sendiri.

- Dari review T-049 (L3): proyeksi skema campuran di query/source.ts membuang _period — filter _period gagal pada sheet bersegmen campuran.

### Implementasi (2026-10-20)
- Kolom sistem virtual `PERIOD_COLUMN` (= MAX_COLUMN + 2) di skema lapisan query/dashboard
  (`src/features/query/period-column.ts`): nama "Periode" / "Periode (sistem)" bila bentrok, tipe tanggal,
  `periodGrain` (grain bawaan dimensi → label "Mar 2026"), `periodLatest` (preset "Periode terbaru").
  Disuntikkan di repo query (runtime), dashboards/service (sumber panel, kolom filter, checkConfig, remap)
  dan aktivasi versi; tidak pernah ditulis ke Sheet.schema.
- Sumber sheet periode SELALU diproyeksikan (source.ts): `*, _period AS c<PERIOD_COLUMN>` untuk satu
  kelompok skema, dan `_period` + kolom sistem di SETIAP kelompok proyeksi NULL (perbaikan L3 T-049;
  juga satu file berproyeksi NULL T-057).
- Pemangkasan (`prune.ts`) sebelum sewa: kolom Periode memakai periodStart; kolom periode sumber KOLOM
  memakai Segment.minDate/maxDate; sheet LABEL tidak memangkas kolom tanggal biasa (min/max = kolom acuan,
  T-054). Batas atas = detik sesudah max (presisi ms/µs aman). Ragu = pertahankan.
- Urutan bawaan (_period, _row): tabel widget, ekspor tabel, grid jalur 2 + ekspor tampilan
  (gridOrderSql), jalur 1 grid/ekspor polos lewat manifest diurutkan menurut awal periode (byPeriod).
- Lihat data: `?periode=` + pemilih "Periode: Semua ▾" (GridPeriodPicker); body rows/values/stats/ekspor
  menerima `period` (kunci periode, ≤ 120) → manifest dibatasi, total = dataRows periode. Sumber sel
  menyebut label periode.
- Tidak dikerjakan (lanjutan bila perlu): pemangkasan untuk saringan grid (total jalur 2 memakai sumber
  yang sama untuk count semua baris, jadi sengaja tidak dipangkas); chip filter silang dari batang
  Periode menampilkan tanggal awal periode bila tanpa grain.

## Security checklist (OWASP ASVS 4.0.3)
<!-- Check each item when verified, or write "N/A: <reason>" after the text and check it. -->
- [x] V1 Architecture: trust boundaries and the components handling sensitive data are identified for this change — batas tetap: klien hanya mengirim posisi/nama kolom + kunci periode; skema virtual dan pemangkasan dihitung server dari DB.
- [x] V2 Authentication: credentials are verified server-side; no default, hard-coded, or weak secrets — N/A: tidak ada perubahan autentikasi.
- [x] V3 Session management: session tokens are random, protected, invalidated on logout and expiry — N/A: tidak ada perubahan sesi.
- [x] V4 Access control: every endpoint/action checks authorization server-side, deny by default (no IDOR) — diverifikasi: grid tetap authorizeGrid (pemilik/editor) sebelum scopePeriods; widget viewer hanya filter yang diizinkan dashboard (uji D6 period-query.test.ts); kunci periode asing → INVALID tanpa query.
- [x] V5 Validation, sanitization and encoding: all input validated; output encoded; no injection (SQL, OS, template) — diverifikasi: `period` zod regex + max 120; identifier `c<PERIOD_COLUMN>`/`_period` konstanta program; nilai lewat parameter.
- [x] V6 Stored cryptography: sensitive data at rest uses approved algorithms; keys are not in the code — N/A: tidak ada data/kunci baru.
- [x] V7 Error handling and logging: errors reveal no internals; security events are logged without secrets — diverifikasi: pesan INVALID umum tanpa nama kolom/periode internal.
- [x] V8 Data protection: personal/sensitive data is minimized, not cached or logged, and removable — diverifikasi: kunci cache grid memuat periode (tidak tercampur antar tampilan); tidak ada log nilai.
- [x] V9 Communication: TLS for all external traffic; certificates validated — N/A: tidak ada komunikasi eksternal baru.
- [x] V10 Malicious code: no backdoors, time bombs, or unexplained network calls; dependencies are trusted — diverifikasi: tanpa dependensi baru.
- [x] V11 Business logic: flows cannot be abused (limits, ordering, replay, race conditions) — diverifikasi: pemangkasan hanya membuang segmen yang terbukti di luar filter (uji hasil identik); semua terbuang → satu segmen tetap.
- [x] V12 Files and resources: uploads are type/size limited and stored safely; no path traversal or SSRF — N/A: tidak ada unggahan/path baru; path parquet tetap dari cache sewa.
- [x] V13 API and web service: API inputs/outputs are schema-validated; CORS and rate limits are deliberate — diverifikasi: body rows/values/stats/ekspor strict zod dengan `period` baru; rate limit tidak berubah.
- [x] V14 Configuration: secure defaults, security headers, no debug in production, dependencies up to date — N/A: tidak ada konfigurasi baru.
