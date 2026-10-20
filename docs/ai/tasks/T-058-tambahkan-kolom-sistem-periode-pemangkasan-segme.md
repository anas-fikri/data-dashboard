---
id: T-058
title: Tambahkan kolom sistem 'Periode', pemangkasan segmen, dan pemilih periode
status: done
profile: strict
goal: G-6
tags:
  - query
  - ui
  - security
depends_on:
  - T-052
  - T-044
created: "2026-10-15T02:30:58Z"
updated: "2026-10-20T18:52:43Z"
closed: "2026-10-20T18:52:43Z"
created_by: claude-code
workers:
  - claude-code
branch: claude/intelligent-albattani-fd1va8
base: 4060d62cf7729b01c97f60b4a4676c9c8ef384b8
paths:
  - playwright.config.ts
  - src/app/(app)/datasets/[id]/data/page.tsx
  - src/components/dashboards/add-filter-column-menu.tsx
  - src/components/dashboards/filters/date-panel.tsx
  - src/components/dashboards/filters/filter-model.ts
  - src/components/dashboards/filters/filter-text.ts
  - src/components/dashboards/pivot-config-model.ts
  - src/components/dashboards/widget-config-model.ts
  - src/components/dashboards/widget-config.tsx
  - src/components/grid/grid-export.tsx
  - src/components/grid/grid-fetch.ts
  - src/components/grid/grid-filter-dialog.tsx
  - src/components/grid/grid-model.ts
  - src/components/grid/grid-period-picker.tsx
  - src/components/grid/sheet-grid.tsx
  - src/components/grid/use-grid-values.ts
  - src/components/widgets/table-view.tsx
  - src/components/widgets/widget-query.ts
  - src/features/dashboards/filter-columns.ts
  - src/features/dashboards/service.ts
  - src/features/exports/job.ts
  - src/features/exports/schema.ts
  - src/features/exports/service.ts
  - src/features/exports/sql.ts
  - src/features/exports/types.ts
  - src/features/ingest/infer.ts
  - src/features/query/filter-values.ts
  - src/features/query/filters.ts
  - src/features/query/grid-page.ts
  - src/features/query/grid-repo.ts
  - src/features/query/grid-service.ts
  - src/features/query/grid.ts
  - src/features/query/period-column.ts
  - src/features/query/prune.ts
  - src/features/query/runtime.ts
  - src/features/query/service.ts
  - src/features/query/source.ts
  - src/features/query/spec.ts
  - src/features/query/table.ts
  - src/features/query/widget.ts
  - src/features/versions/activation.ts
  - src/features/versions/period-setup.ts
  - src/features/widgets/remap.ts
  - src/features/widgets/spec.ts
  - tests/components/widget-config.test.ts
  - tests/e2e/period-query.spec.ts
  - tests/features/dashboards/dashboards.test.ts
  - tests/features/query/grid-page.test.ts
  - tests/features/query/grid-period.test.ts
  - tests/features/query/period-column.test.ts
  - tests/features/query/period-query.test.ts
  - tests/features/query/prune.test.ts
  - tests/features/query/source.test.ts
review:
  passes:
    - "n": 1
      by: claude-reviewer-subagent
      at: "2026-10-20T18:49:02Z"
      findings: 2
    - "n": 2
      by: claude-code
      at: "2026-10-20T18:49:03Z"
      findings: 0
evidence:
  check:
    cmd: npm run check
    exit_code: 0
    duration_ms: 189092
    summary: |-
      …t
      > vitest run


       RUN  v5.0.3 /home/user/data-dashboard

      {"level":40,"time":1792522283860,"service":"data-dashboard","host":"127.0.0.1","port":40675,"step":"membuka folder","code":2,"err":"No such file or directory","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":40,"time":1792522283915,"service":"data-dashboard","host":"127.0.0.1","port":35185,"err":"Unable to start subsystem: sftp","msg":"subsistem SFTP ditolak NAS"}
      {"level":40,"time":1792522284014,"service":"data-dashboard","host":"127.0.0.1","port":46119,"step":"menghapus file uji","code":4,"err":"Failure","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":40,"time":1792522284121,"service":"data-dashboard","host":"127.0.0.1","port":36269,"step":"menulis file uji","code":4,"err":"Failure","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":40,"time":1792522291640,"service":"data-dashboard","err":"Can't reach database server","msg":"sesi shell gagal dibaca"}
      {"level":40,"time":1792522299684,"service":"data-dashboard","check":"B","detail":"koneksi ditolak","msg":"health check gagal"}
      {"level":40,"time":1792522299707,"service":"data-dashboard","check":"Lambat","detail":"Lambat: timeout 20 ms","msg":"health check gagal"}
      {"level":40,"time":1792522299711,"service":"data-dashboard","check":"Y","detail":"mati","msg":"health check gagal"}
      {"level":40,"time":1792522299724,"service":"data-dashboard","check":"Renderer PDF","detail":"renderer tidak menjawab /healthz","msg":"health check gagal"}

       Test Files  193 passed | 1 skipped (194)
            Tests  2562 passed | 10 skipped (2572)
         Start at  18:50:00
         Duration  130.92s (tests 84%, import 13%, transform 3%)

          Isolate  194 workers spawned · ~149ms startup each (spawn + environment, per file)
                   at least ~9.50s faster with isolate: false — reuses workers across files instead of one per file


      > data-dashboard@0.1.0 audit
      > npm audit --audit-level=high --omit=dev && npm audit --audit-level=critical

      found 0 vulnerabilities
      found 0 vulnerabilities
    at: "2026-10-20T18:52:12Z"
    tree: 5e7c6a9bdee18e894543bdd55a7ed05890a4278cab43a087cdbdca5a627b5d0c
  commits:
    - 08ca5b4
    - 0cb153a
    - "1220871"
    - 14bbbc8
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
    - 59ec9a3
    - "6123427"
    - 62ec216
    - 686497c
    - 69b8953
    - 6a7cef1
    - 6b3ee3f
    - 70136f5
    - "7187327"
    - 75cf456
    - 76e3ce7
    - "7824e56"
    - 7ae2840
    - 7af4484
    - 7d64743
    - 7f238c4
    - 7f9a7c7
    - "8570e80"
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
    - a019f8f
    - a03481c
    - a0e1646
    - a5360dd
    - a687d4c
    - a8f9162
    - acb27a6
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
    - f197114
    - f3ea697
    - f54828c
    - f55d8d2
    - f5b2aa6
    - f87b0a1
    - f9d43c6
    - fc288cb
    - fc87996
  acceptance:
    total: 4
    done: 4
  audit:
    at: "2026-10-20T18:52:13Z"
    passed: true
    tree: 5e7c6a9bdee18e894543bdd55a7ed05890a4278cab43a087cdbdca5a627b5d0c
    results:
      - name: osv-scanner (dependencies, offline db)
        exit_code: 0
        summary: |-
          Scanning dir .
          Starting filesystem walk for root: /
          Scanned /home/user/data-dashboard/package-lock.json file and found 836 packages
          End status: 505 dirs visited, 3455 inodes visited, 1 Extract calls, 239.197337ms elapsed, 239.197707ms wall time
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
- Review putaran 1 (2 blokir, diperbaiki): (1) urut tabel widget/ekspor menurut Periode ditolak skema
  `pos ≤ 16.384` → `sortColumnSchema` = kolom sungguhan ATAU tepat PERIOD_COLUMN (uji viewer + ekspor);
  (2) `nextSecond` tahun 9999 menjadi "+010000-…" dan memangkas salah → tanpa batas atas (uji regresi).
  Penjaga: kolom sungguhan di posisi ≥ PERIOD_COLUMN tidak mungkin lewat ingest (semua jalur ≤
  MAX_COLUMN), tetap ditolak di "Atur periode" (periodPositionTaken, tinjau + terapkan lewat check()).
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

## Evidence
<!-- Generated by aitk close. -->
- Check: `npm run check` → exit 0 at 2026-10-20T18:52:12Z (189092 ms)
- Acceptance criteria: 4/4 satisfied
- Commits: 08ca5b4, 0cb153a, 1220871, 14bbbc8, 17d81a7, 18b74cc, 1b2b9ab, 23e5ae9, 258a139, 277b913, 27924c4, 27986dc, 29fe0f3, 2d7b316, 337259e, 35f92f6, 3602b55, 36afc9f, 3b96186, 3bb3baa, 4060d62, 4679db1, 49f49a5, 4bd9881, 4e9a95e, 4eea84c, 5101f51, 538221d, 5603fc7, 56a8447, 56e4d6d, 57df970, 59ec9a3, 6123427, 62ec216, 686497c, 69b8953, 6a7cef1, 6b3ee3f, 70136f5, 7187327, 75cf456, 76e3ce7, 7824e56, 7ae2840, 7af4484, 7d64743, 7f238c4, 7f9a7c7, 8570e80, 8f6ef33, 8f8df38, 8fc3abc, 90e4e63, 9159d7c, 9298e14, 930dd6d, 94bea50, 94d85a4, 9bd7e54, 9ced9f4, a019f8f, a03481c, a0e1646, a5360dd, a687d4c, a8f9162, acb27a6, ae4e5a2, af1994a, b0b99d8, b20b40b, b30aea5, b32d50d, b42141b, b8e59ee, b933279, ba2efef, bafb4ad, bcbddee, c15362c, c1c8b0a, c2fd95c, c3626c9, c76c343, ca5782f, ccd0a9a, ce26ca5, ce5d6a7, ce649d0, cf28ad3, cf730c5, d32a8ea, d4c2029, d557c9e, d602f56, da46e35, dfc2ebb, dff9b8c, e24e070, e2f1df7, e51fcb4, f197114, f3ea697, f54828c, f55d8d2, f5b2aa6, f87b0a1, f9d43c6, fc288cb, fc87996
- Review pass 1 by claude-reviewer-subagent: 2 findings
- Review pass 2 by claude-code: 0 findings
