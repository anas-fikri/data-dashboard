---
id: T-037
title: Baca daftar segmen di lapisan query dan cache parquet
status: in_review
profile: standard
goal: G-6
tags:
  - query
  - perf
depends_on:
  - T-036
created: "2026-10-15T02:30:55Z"
updated: "2026-10-19T15:03:30Z"
created_by: claude-code
workers:
  - claude-code
branch: worktree-t-001-scaffold
base: f1971145e02500e77cdcb6ae4f846e8284a17e7f
review:
  passes:
    - "n": 1
      by: claude-reviewer-subagent
      at: "2026-10-19T14:58:50Z"
      findings: 0
    - "n": 2
      by: claude-code
      at: "2026-10-19T14:58:50Z"
      findings: 0
evidence:
  check:
    cmd: npm run check
    exit_code: 0
    duration_ms: 227362
    summary: |-
      …code":2,"err":"No such file or directory","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":40,"time":1792422053020,"service":"data-dashboard","host":"127.0.0.1","port":56476,"step":"menulis file uji","code":3,"err":"Permission denied","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":40,"time":1792422053030,"service":"data-dashboard","host":"127.0.0.1","port":56485,"err":"Unable to start subsystem: sftp","msg":"subsistem SFTP ditolak NAS"}
      {"level":40,"time":1792422053054,"service":"data-dashboard","host":"127.0.0.1","port":56487,"step":"menghapus file uji","code":4,"err":"Failure","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":40,"time":1792422053170,"service":"data-dashboard","host":"127.0.0.1","port":56491,"step":"menulis file uji","code":4,"err":"Failure","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":40,"time":1792422070461,"service":"data-dashboard","check":"B","detail":"koneksi ditolak","msg":"health check gagal"}
      {"level":40,"time":1792422070485,"service":"data-dashboard","check":"Lambat","detail":"Lambat: timeout 20 ms","msg":"health check gagal"}
      {"level":40,"time":1792422070488,"service":"data-dashboard","check":"Y","detail":"mati","msg":"health check gagal"}
      {"level":40,"time":1792422070495,"service":"data-dashboard","check":"Renderer PDF","detail":"renderer tidak menjawab /healthz","msg":"health check gagal"}
      {"level":40,"time":1792422074712,"service":"data-dashboard","err":"Can't reach database server","msg":"sesi shell gagal dibaca"}

       Test Files  157 passed (157)
            Tests  2039 passed (2039)
         Start at  22:00:22
         Duration  139.97s (tests 74%, import 18%, transform 8%)

          Isolate  157 workers spawned · ~547ms startup each (spawn + environment, per file)
                   at least ~8.99s faster with isolate: false — reuses workers across files instead of one per file


      > data-dashboard@0.1.0 audit
      > npm audit --audit-level=high --omit=dev && npm audit --audit-level=critical

      found 0 vulnerabilities
      found 0 vulnerabilities
    at: "2026-10-19T15:02:48Z"
    tree: f7787dda92dfe80d057c684db582c6bbda7fb382bb829f657d3d754912ce50d7
  audit:
    at: "2026-10-19T15:02:51Z"
    passed: true
    tree: f7787dda92dfe80d057c684db582c6bbda7fb382bb829f657d3d754912ce50d7
    results:
      - name: osv-scanner (dependencies, offline db)
        exit_code: 0
        summary: |-
          Scanning dir .
          Starting filesystem walk for root: /
          Scanned /Users/anasfikri/Documents/Projects/pcpexpress/data-dashboard/.claude/worktrees/t-001-scaffold/package-lock.json file and found 832 packages
          End status: 213 dirs visited, 1432 inodes visited, 1 Extract calls, 614.820291ms elapsed, 614.819ms wall time
          Loaded npm local db from /Users/anasfikri/Library/Caches/osv-scalibr/npm/all.zip

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
Bagian rencana docs/ai/plans/2026-10-15-tampilan-excel-dan-data-periode.md — P-5, Fase 1. Perkiraan 4–5 hari. Baca bagian rencana yang relevan (§3 Lihat data, §4 periode, §5 batas, §6 risiko) sebelum mulai; cek ulang kontrak T-016 (otorisasi) dan T-017 (ekspor) sesuai risiko R21.

## Acceptance criteria
- [x] Given sheet dengan 1 dan 24 segmen, when semua jenis widget, filter-values, sampel skema, dan count dijalankan, then hasil identik dengan satu file gabungan dan baseline T-009/T-011 tidak memburuk > 10%
- [x] Given cache dingin pada sheet 24 segmen, when dashboard dibuka, then semua kunci disewa dalam satu admission (batch lease) tanpa QUERY_BUSY berulang, dan batas unduhan bersamaan tetap berlaku
- [x] Given segmen dengan set kolom berbeda, then query memproyeksikan NULL AS c<pos>, dan kunci cache hasil tetap memuat versionId
- [x] Given versi baru aktif dengan satu segmen tambahan, then hanya segmen baru yang di-prefetch ke cache lokal app

## Risk
- Impact: semua jalur baca (widget KPI/grafik/tabel/pivot, query bebas, nilai filter, sampel skema, ekspor CSV/XLSX/pivot, pemanasan cache) menerima sumber berupa daftar segmen manifest. Sheet ≤ 1 segmen (semua data hari ini) memakai jalur lama persis: SQL sama, satu sewa, satu unduhan ekspor — baseline T-009/T-011 tidak bergeser. Migrasi aditif 20261019160000_t037_segment_columns (SegmentTyped.columns + backfill dari skema sheet).
- Security (STRIDE): Tampering/injeksi — daftar path dikirim sebagai satu parameter listValue, proyeksi hanya memakai identifier c<pos> dari skema DB (bilangan bulat) dan tipe SQL dari sqlType; tidak ada input user; sandbox DuckDB tetap: path daftar hanya file cache lokal/direktori kerja ekspor (uji: cache di luar allowed_directories ditolak "Permission Error"). DoS — sewa batch dihitung satu jatah unduhan owner, maxDownloads tetap membatasi unduhan berjalan; satu admission mencegah QUERY_BUSY berulang pada sheet 24 segmen dingin. Information disclosure — kunci cache hasil tetap memuat versionId + schemaRevision (manifest ditentukan versi).
- Rollback: revert commit + deploy image sebelumnya; kolom SegmentTyped.columns aditif (diabaikan kode lama). Tidak ada perubahan data parquet.
- Validation: tests/features/query/segments.test.ts (DuckDB + cache sungguhan: 24 segmen = file gabungan untuk KPI sum/avg, batang top-N + total, garis per bulan, tabel tanpa urut + halaman dalam + terurut teks/angka, pivot 2 baris × bulan, nilai filter teks/tanggal, sampel; skema campuran legacy `_row INTEGER` + segmen tanpa c5 = gabungan ber-NULL; 24 file dingin satu admission, unduhan bersamaan ≤ 2), source.test.ts (bentuk SQL/parameter), warm.test.ts (hanya segmen baru diunduh, tanpa HEAD/anggaran untuk yang sudah ada), job.test.ts (ekspor 2 segmen); vitest penuh 2036 tes; e2e widgets/filters/exports/pivot/schema; check-segments di DB dev (kolom manifest = skema, 0 selisih).

## Notes
- Performa: jalur ≤ 1 segmen tidak berubah (SQL dan sewa sama), jadi baseline T-009/T-011 tidak bergeser. Biaya daftar 24 segmen sudah diukur spike T-034 di olympus (13/13 query lolos kriteria ADR-0008); T-061/T-063 mengukur ulang dengan data periode sungguhan.
- Halaman tabel tanpa urut tetap ORDER BY _row LIMIT/OFFSET (hasil identik); jalur jendela (segmen, file_row_number) untuk halaman dalam datang di T-041.
- forget() cache saat dataset/versi dihapus masih memakai Sheet.typedKey (= satu-satunya segmen di REPLACE); GC segmen bersama di T-038 yang memperluasnya.

## Security checklist (OWASP ASVS 4.0.3)
<!-- Check each item when verified, or write "N/A: <reason>" after the text and check it. -->
- [x] V1 Architecture: trust boundaries and the components handling sensitive data are identified for this change — sumber query = daftar file typed dari manifest DB; file disewa ke cache lokal app (atau direktori kerja ekspor) lalu dibaca DuckDB bersandbox; tidak ada komponen baru
- [x] V2 Authentication: credentials are verified server-side; no default, hard-coded, or weak secrets — N/A — tidak menyentuh autentikasi
- [x] V3 Session management: session tokens are random, protected, invalidated on logout and expiry — N/A — tidak menyentuh sesi
- [x] V4 Access control: every endpoint/action checks authorization server-side, deny by default (no IDOR) — otorisasi tidak berubah: sheet di-resolve dari versi aktif dataset/dashboard yang boleh dilihat, daftar segmen diturunkan dari manifest SESUDAHNYA (ADR-0008 R21); tidak ada endpoint baru
- [x] V5 Validation, sanitization and encoding: all input validated; output encoded; no injection (SQL, OS, template) — daftar path dikirim sebagai satu parameter listValue; proyeksi hanya identifier c<pos> (bilangan bulat dari skema DB) + tipe sqlType; tidak ada teks user di SQL baru
- [x] V6 Stored cryptography: sensitive data at rest uses approved algorithms; keys are not in the code — N/A — tidak ada data rahasia baru
- [x] V7 Error handling and logging: errors reveal no internals; security events are logged without secrets — galat sumber daya tetap dipetakan ke kode yang sama (QUERY_BUSY, QUERY_TIMEOUT, …); jumlah path ≠ jumlah segmen → galat (tidak membaca file yang salah)
- [x] V8 Data protection: personal/sensitive data is minimized, not cached or logged, and removable — kunci cache hasil tetap memuat versionId + schemaRevision; manifest tetap per (versi, sheet, revisi)
- [x] V9 Communication: TLS for all external traffic; certificates validated — N/A — tidak ada lalu lintas eksternal baru (unduhan S3 sama seperti sebelumnya)
- [x] V10 Malicious code: no backdoors, time bombs, or unexplained network calls; dependencies are trusted — tanpa dependensi baru (listValue dari @duckdb/node-api yang sudah ada)
- [x] V11 Business logic: flows cannot be abused (limits, ordering, replay, race conditions) — sewa batch satu admission per owner (tidak QUERY_BUSY berulang), maxDownloads tetap membatasi unduhan berjalan, sewa yang menyerah dilepas (tidak menahan file); pemanasan hanya mengunduh segmen baru
- [x] V12 Files and resources: uploads are type/size limited and stored safely; no path traversal or SSRF — sandbox DuckDB: path daftar hanya file di bawah direktori cache/kerja (uji: path di luar allowed_directories ditolak Permission Error); file cache tetap nama hash kunci
- [x] V13 API and web service: API inputs/outputs are schema-validated; CORS and rate limits are deliberate — body/jawaban API tidak berubah
- [x] V14 Configuration: secure defaults, security headers, no debug in production, dependencies up to date — tanpa env baru; migrasi aditif SegmentTyped.columns; npm audit 0 kerentanan
