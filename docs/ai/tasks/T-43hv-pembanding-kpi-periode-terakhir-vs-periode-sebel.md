---
id: T-43hv
title: 'Pembanding KPI: periode terakhir vs periode sebelumnya / tahun lalu'
status: done
profile: strict
tags:
  - widgets
  - query
created: "2026-11-10T03:55:58Z"
updated: "2026-11-10T05:49:08Z"
closed: "2026-11-10T05:49:08Z"
created_by: claude-code
workers:
  - claude-code
branch: claude/cool-babbage-t5yojt
base: 7809c7d015c841c053be1d0020a067f3527ec4d8
paths:
  - CHANGELOG.md
  - content/panduan/06-susun-dashboard.md
  - content/panduan/09-viewer-lihat-filter-ekspor.md
  - docs/runbook-deploy.md
  - playwright.config.ts
  - src/components/dashboards/config-sections.tsx
  - src/components/dashboards/kpi-compare-fields.tsx
  - src/components/dashboards/status-fields.tsx
  - src/components/dashboards/widget-config.tsx
  - src/components/widgets/chart-table.tsx
  - src/components/widgets/chart-widget.tsx
  - src/components/widgets/drill-dialog.tsx
  - src/components/widgets/kpi-compare.ts
  - src/components/widgets/kpi-fit.ts
  - src/components/widgets/kpi-view.tsx
  - src/components/widgets/widget-body.tsx
  - src/components/widgets/widget-query.ts
  - src/features/dashboards/service.ts
  - src/features/exports/sql.ts
  - src/features/query/service.ts
  - src/features/query/spec.ts
  - src/features/query/sql.ts
  - src/features/query/widget.ts
  - src/features/whats-new/entries.ts
  - src/features/widgets/remap.ts
  - src/features/widgets/spec.ts
  - tests/components/drill.test.ts
  - tests/components/kpi-compare.test.ts
  - tests/e2e/kpi-drill.spec.ts
  - tests/features/exports/csv.test.ts
  - tests/features/exports/fixtures.ts
  - tests/features/query/widget-query.test.ts
  - tests/features/widgets/remap.test.ts
review:
  passes:
    - "n": 1
      by: claude-reviewer-subagent
      at: "2026-11-10T04:56:42Z"
      findings: 5
    - "n": 2
      by: claude-code
      at: "2026-11-10T05:01:02Z"
      findings: 2
    - "n": 3
      by: claude-reviewer-subagent
      at: "2026-11-10T05:01:03Z"
      findings: 2
    - "n": 4
      by: claude-reviewer-subagent
      at: "2026-11-10T05:02:20Z"
      findings: 0
evidence:
  check:
    cmd: npm run check
    exit_code: 0
    duration_ms: 208133
    summary: |-
      …t":"127.0.0.1","port":40275,"step":"membuka folder","code":2,"err":"No such file or directory","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":40,"time":1794289419900,"service":"data-dashboard","host":"127.0.0.1","port":44765,"err":"Unable to start subsystem: sftp","msg":"subsistem SFTP ditolak NAS"}
      {"level":40,"time":1794289419998,"service":"data-dashboard","host":"127.0.0.1","port":33119,"step":"menghapus file uji","code":4,"err":"Failure","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":40,"time":1794289420109,"service":"data-dashboard","host":"127.0.0.1","port":40921,"step":"menulis file uji","code":4,"err":"Failure","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":30,"time":1794289421057,"service":"data-dashboard","datasetId":"t072mwa9ld8qds000000","msg":"dataset dihapus"}
      {"level":40,"time":1794289432308,"service":"data-dashboard","err":"Can't reach database server","msg":"sesi shell gagal dibaca"}
      {"level":40,"time":1794289436496,"service":"data-dashboard","check":"B","detail":"koneksi ditolak","msg":"health check gagal"}
      {"level":40,"time":1794289436518,"service":"data-dashboard","check":"Lambat","detail":"Lambat: timeout 20 ms","msg":"health check gagal"}
      {"level":40,"time":1794289436523,"service":"data-dashboard","check":"Y","detail":"mati","msg":"health check gagal"}
      {"level":40,"time":1794289436537,"service":"data-dashboard","check":"Renderer PDF","detail":"renderer tidak menjawab /healthz","msg":"health check gagal"}

       Test Files  244 passed | 1 skipped (245)
            Tests  3267 passed | 10 skipped (3277)
         Start at  05:42:04
         Duration  137.52s (tests 80%, import 17%, transform 3%)

          Isolate  245 workers spawned · ~118ms startup each (spawn + environment, per file)
                   at least ~9.53s faster with isolate: false — reuses workers across files instead of one per file


      > data-dashboard@1.14.0 audit
      > npm audit --audit-level=high --omit=dev && npm audit --audit-level=critical

      found 0 vulnerabilities
      found 0 vulnerabilities
    at: "2026-11-10T05:44:23Z"
    tree: c1529108cfcefd9e03f086c4b0d369be9501480ef939948da8a25fa24bd4c3c3
  commits:
    - 0c43f39
    - 1d723f8
    - 39f6a65
    - 41ef202
    - 5931b03
    - 9ee22e2
    - b81d108
    - cd206e3
    - cf10253
    - e2c8065
    - f8d9189
  acceptance:
    total: 4
    done: 4
  audit:
    at: "2026-11-10T05:44:48Z"
    passed: true
    tree: c1529108cfcefd9e03f086c4b0d369be9501480ef939948da8a25fa24bd4c3c3
    results:
      - name: osv-scanner (dependencies, offline db)
        exit_code: 0
        summary: |-
          Scanning dir .
          Starting filesystem walk for root: /
          Scanned /home/user/data-dashboard/package-lock.json file and found 837 packages
          End status: 544 dirs visited, 3653 inodes visited, 1 Extract calls, 80.989651ms elapsed, 80.98983ms wall time
          Loaded npm local db from /root/.cache/osv-scanner/npm/all.zip
          No issues found
      - name: npm audit (prod high, dev critical)
        exit_code: 0
        summary: |-
          > data-dashboard@1.14.0 audit
          > npm audit --audit-level=high --omit=dev && npm audit --audit-level=critical

          found 0 vulnerabilities
          found 0 vulnerabilities
      - name: aitk secret scan (tracked files)
        exit_code: 0
---

## Objective
KPI bisa menampilkan nilainya untuk periode terakhir (hari/minggu/bulan/kuartal/tahun) pada kolom tanggal pilihan, dibandingkan periode sebelumnya atau periode yang sama tahun lalu: ▲/▼ persen berwarna sesuai penilaian (naik baik / turun baik), di layar dan PDF, mengikuti filter dashboard.

## Acceptance criteria
- [x] Given KPI dengan pembanding (kolom tanggal, periode Bulan, vs periode sebelumnya), when dashboard dibuka, then nilai = agregat bulan terakhir di data yang lolos filter, dan baris pembanding menampilkan ▲/▼ persen + nilai bulan sebelumnya beserta labelnya (mis. 'vs Okt 2026')
- [x] Given pembanding 'periode sama tahun lalu', when dihitung, then periode pembanding = periode terakhir dikurangi satu tahun; tanpa data pembanding → 'tidak ada data <periode>' tanpa persen; nilai pembanding 0 → selisih angka, bukan persen tak hingga
- [x] Given penilaian KPI naik baik/turun baik (atau bawaan dashboard), when nilai naik/turun, then warna ▲/▼ hijau/merah sesuai arah; Tanpa warna → netral
- [x] Given kolom tanggal dihapus/diganti saat versi data baru, when diaktifkan, then pembanding ikut dipetakan atau ditandai kolom hilang; kolom bukan tanggal ditolak saat simpan

## Risk
Impact: spec KPI compare (spec.ts, remap.ts), widgetPlan kpi (widget.ts: kolom tanggal wajib), buildPeriodBoundsSql (sql.ts), runKpiCompare (service.ts: 3 query kecil, cache per batas/periode), tipe KpiCompareData (query/spec.ts), UI kpi-compare.ts, kpi-view.tsx, kpi-fit.ts (baris tambahan), kpi-compare-fields.tsx, status-fields.tsx (petunjuk).
Security (STRIDE): kolom tanggal pembanding bagian columnsOf widget (D6, dipilih pemilik/editor); identifier SQL dari program (c<pos>, grain dari enum, INTERVAL tetap), nilai filter tetap berparameter; kunci cache memuat spec + kolom/periode/pembanding + filter dashboard; DoS — +2 query kecil per KPI berpembanding, di antrean DuckDB yang sama.
Rollback: image v1.14.0 — KPI berpembanding tampil 'Pengaturan widget tidak valid' (skema strict) sampai roll-forward; data tetap; tanpa migrasi.
Validation: widget-query.test.ts (Maret vs Februari, filter dashboard menentukan periode, tahun lalu tanpa data, kolom bukan tanggal ditolak), kpi-compare.test.ts, drill.test.ts (KpiView), remap.test.ts, e2e kpi-drill (UI + warna + filter + ponsel/axe), suite e2e per proyek.

## Notes
- 2026-11-10T05:01:18Z Review pass 2 (by claude-code) tercatat tidak sengaja: perintah dijalankan tanpa AITK_TOOL, isinya duplikat pass 3 (subagen, putaran 2: 2 temuan Low — panel pembanding tanggal terkecil/terbesar diperbaiki, label periode ekspor → T-tyb1). Bukti tidak diubah tangan.
- 2026-11-10T05:40:54Z Bukti: tests/features/query/widget-query.test.ts (Maret vs Februari, filter dashboard menentukan periode terakhir, tahun lalu tanpa data → previous null + previousRows 0 juga untuk COUNT, minggu vs tahun lalu 52 minggu Senin, kolom bukan tanggal dan tanggal terkecil/terbesar ditolak), kpi-compare.test.ts (persen, pembanding 0 → selisih angka, tanpa data, warna naik/turun baik, netral tanpa penilaian, label per grain), drill.test.ts (KpiView baris pembanding berwarna), remap.test.ts (kolom tanggal dipetakan / hilang ditandai), exports/csv.test.ts (ekspor = periode terakhir, filter ikut), e2e kpi-drill (UI pembanding, warna, tahun lalu, filter Jakarta, ponsel 360 px + axe). Suite e2e per proyek lulus kecuali data-view-a11y AC2/AC3 (gagal juga di v1.14 → T-7377) dan period-limits (lulus saat diulang). Review subagen 3 putaran → 0 temuan; Low sisa → T-tyb1.

## Security checklist (OWASP ASVS 4.0.3)
<!-- Check each item when verified, or write "N/A: <reason>" after the text and check it. -->
- [x] V1 Architecture: trust boundaries and the components handling sensitive data are identified for this change — Batas kepercayaan: spec pembanding hanya dari DB widget (pemilik/editor menyimpan lewat checkConfig); klien tidak mengirim kolom/periode.
- [x] V2 Authentication: credentials are verified server-side; no default, hard-coded, or weak secrets — N/A: tidak disentuh perubahan ini
- [x] V3 Session management: session tokens are random, protected, invalidated on logout and expiry — N/A: tidak disentuh perubahan ini
- [x] V4 Access control: every endpoint/action checks authorization server-side, deny by default (no IDOR) — Akses lewat authorize widget yang sama dengan /api/query (dashboardAccess per permintaan); kolom tanggal pembanding bagian columnsOf widget (D6).
- [x] V5 Validation, sanitization and encoding: all input validated; output encoded; no injection (SQL, OS, template) — Spec divalidasi zod strict (grain/against enum, kolom posisi); widgetPlan menolak kolom bukan tanggal dan tanggal terkecil/terbesar; SQL: identifier c<pos> dari program, grain dari enum, INTERVAL konstanta, nilai filter berparameter.
- [x] V6 Stored cryptography: sensitive data at rest uses approved algorithms; keys are not in the code — N/A: tidak disentuh perubahan ini
- [x] V7 Error handling and logging: errors reveal no internals; security events are logged without secrets — Galat INVALID/COLUMN_UNAVAILABLE lewat forRole seperti widget lain (viewer tanpa nama kolom tersembunyi).
- [x] V8 Data protection: personal/sensitive data is minimized, not cached or logged, and removable — Tidak ada data baru yang terbuka: agregat yang sama dengan KPI, dibatasi periode; cache per kunci spec+pembanding+filter.
- [x] V9 Communication: TLS for all external traffic; certificates validated — N/A: tidak disentuh perubahan ini
- [x] V10 Malicious code: no backdoors, time bombs, or unexplained network calls; dependencies are trusted — N/A: tidak disentuh perubahan ini
- [x] V11 Business logic: flows cannot be abused (limits, ordering, replay, race conditions) — Periode dihitung dari baris yang lolos filter yang sama (tidak membocorkan baris di luar filter); 3 query kecil di antrean DuckDB per user.
- [x] V12 Files and resources: uploads are type/size limited and stored safely; no path traversal or SSRF — N/A: tidak disentuh perubahan ini
- [x] V13 API and web service: API inputs/outputs are schema-validated; CORS and rate limits are deliberate — /api/query tetap cek Origin + rate limit RULES.query + batas body; body strict tidak berubah untuk pembanding.
- [x] V14 Configuration: secure defaults, security headers, no debug in production, dependencies up to date — N/A: tidak disentuh perubahan ini

## Evidence
<!-- Generated by aitk close. -->
- Check: `npm run check` → exit 0 at 2026-11-10T05:44:23Z (208133 ms)
- Acceptance criteria: 4/4 satisfied
- Commits: 0c43f39, 1d723f8, 39f6a65, 41ef202, 5931b03, 9ee22e2, b81d108, cd206e3, cf10253, e2c8065, f8d9189
- Review pass 1 by claude-reviewer-subagent: 5 findings
- Review pass 2 by claude-code: 2 findings
- Review pass 3 by claude-reviewer-subagent: 2 findings
- Review pass 4 by claude-reviewer-subagent: 0 findings
