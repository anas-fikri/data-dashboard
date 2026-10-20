---
id: T-046
title: Unduh tampilan Lihat data lewat job ekspor
status: in_progress
profile: standard
goal: G-6
tags:
  - api
  - security
  - ui
depends_on:
  - T-044
  - T-017
created: "2026-10-15T02:30:56Z"
updated: "2026-10-20T09:23:18Z"
created_by: claude-code
workers:
  - claude-code
branch: claude/intelligent-albattani-fd1va8
base: e51fcb41e894cee77d4e5c2e033084b2436e1b02
evidence:
  check:
    cmd: npm run check
    exit_code: 0
    duration_ms: 188875
    summary: |-
      …t
      > vitest run


       RUN  v5.0.3 /home/user/data-dashboard

      {"level":40,"time":1792488111132,"service":"data-dashboard","host":"127.0.0.1","port":34573,"step":"membuka folder","code":2,"err":"No such file or directory","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":40,"time":1792488111187,"service":"data-dashboard","host":"127.0.0.1","port":36491,"err":"Unable to start subsystem: sftp","msg":"subsistem SFTP ditolak NAS"}
      {"level":40,"time":1792488111290,"service":"data-dashboard","host":"127.0.0.1","port":40903,"step":"menghapus file uji","code":4,"err":"Failure","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":40,"time":1792488111400,"service":"data-dashboard","host":"127.0.0.1","port":45869,"step":"menulis file uji","code":4,"err":"Failure","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":40,"time":1792488117425,"service":"data-dashboard","err":"Can't reach database server","msg":"sesi shell gagal dibaca"}
      {"level":40,"time":1792488130364,"service":"data-dashboard","check":"B","detail":"koneksi ditolak","msg":"health check gagal"}
      {"level":40,"time":1792488130390,"service":"data-dashboard","check":"Lambat","detail":"Lambat: timeout 20 ms","msg":"health check gagal"}
      {"level":40,"time":1792488130400,"service":"data-dashboard","check":"Y","detail":"mati","msg":"health check gagal"}
      {"level":40,"time":1792488130408,"service":"data-dashboard","check":"Renderer PDF","detail":"renderer tidak menjawab /healthz","msg":"health check gagal"}

       Test Files  171 passed | 1 skipped (172)
            Tests  2220 passed | 10 skipped (2230)
         Start at  09:20:31
         Duration  132.75s (tests 84%, import 13%, transform 3%)

          Isolate  172 workers spawned · ~160ms startup each (spawn + environment, per file)
                   at least ~9.02s faster with isolate: false — reuses workers across files instead of one per file


      > data-dashboard@0.1.0 audit
      > npm audit --audit-level=high --omit=dev && npm audit --audit-level=critical

      found 0 vulnerabilities
      found 0 vulnerabilities
    at: "2026-10-20T09:22:46Z"
    tree: cd0a8fd3fb1526bbde3b3ae9d24dacc1c7c300e30f3f6ca686ab1404d15101d3
  audit:
    at: "2026-10-20T09:22:49Z"
    passed: true
    tree: cd0a8fd3fb1526bbde3b3ae9d24dacc1c7c300e30f3f6ca686ab1404d15101d3
    results:
      - name: osv-scanner (dependencies, offline db)
        exit_code: 0
        summary: |-
          Scanning dir .
          Starting filesystem walk for root: /
          Scanned /home/user/data-dashboard/package-lock.json file and found 836 packages
          End status: 458 dirs visited, 2265 inodes visited, 1 Extract calls, 199.084678ms elapsed, 199.084928ms wall time
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
Bagian rencana docs/ai/plans/2026-10-15-tampilan-excel-dan-data-periode.md — P-14, Fase 2 (§3.4 "Ekspor: job T-017 dengan spec tampilan", §3.5 "Unduh tampilan"). Tombol "Unduh tampilan" di Lihat data membuat file CSV/XLSX lewat job ekspor T-017 yang isinya persis tampilan grid saat itu: kolom terlihat dalam urutan tampil (kolom tersembunyi tidak pernah ikut), urut, saringan, dan cari; formula dinetralkan; hanya pemilik/editor (viewer → FORBIDDEN); tautan 1 jam + AuditLog; tampilan di atas batas T-017 (dan 1.048.575 baris XLSX) ditolak dengan penjelasan, tidak pernah dipotong. Kontrak T-016 (resolver grid authorizeGrid) dan T-017 (tabel Export, antrean "export", status/unduh) dicek ulang (R21) dan dipakai ulang.

## Acceptance criteria
- [x] Given saringan, urutan, dan kolom terlihat aktif, when 'Unduh tampilan' CSV/XLSX, then job T-017 menghasilkan file dengan kolom, urutan, dan baris sama dengan grid (diuji pada fixture 1.000 baris), tautan presigned berlaku 1 jam, dan AuditLog tercatat
- [x] Given tampilan melewati batas T-017, then dialog menjelaskan batasnya (termasuk batas Excel 1.048.575 baris untuk XLSX) dan menyarankan saringan; file tidak pernah dipotong diam-diam
- [x] Given viewer mencoba mengekspor tampilan sheet, then FORBIDDEN

## Risk
- Impact: kolom baru `Export.sheetId` (nullable, tanpa FK; migrasi 20261020150000_t046_export_sheet = satu ALTER ADD COLUMN, aman online). Jalur ekspor widget/PDF tetap (runExportJob direstrukturisasi jadi prepareWidget/prepareSheet + badan bersama; uji job/service/e2e exports lama hijau). prismaGridRepo dipindah ke grid-repo.ts (perilaku sama). Chunk grid lazy 290,6/293 KiB (dialog di chunk React.lazy sendiri).
- Security (STRIDE): S — sesi wajib (withUser), Origin = APP_URL; T — body zod strict, tampilan dicocokkan ulang dengan skema saat buat DAN di worker (planGrid), identifier hanya c<pos>/_row/o<i>, nilai lewat parameter; R — setiap tautan unduh dicatat `dataset.sheet.export` (meta tanpa nilai saringan); I — kolom tersembunyi skema ditolak (INVALID tanpa nama), kolom yang disembunyikan pengguna tidak dikirim, unduh/status hanya pemilik ekspor yang masih pemilik/editor dataset (lainnya 404); D — RULES.export + batas 2 ekspor berjalan per user (bersama widget/PDF), EXPORT_MAX_ROWS dihitung sebelum menulis, tenggat 10 menit, DuckDB ekspor 768MB/2 thread; E — viewer/asing FORBIDDEN saat buat, peran + versi aktif dicek ulang di worker (pencabutan/versi berganti → FORBIDDEN/VERSION_CHANGED, tanpa file).
- Rollback: revert commit kode; kolom `sheetId` boleh tetap (nullable, diabaikan kode lama). Baris Export tampilan yang tersisa akan gagal bersih/404 di kode lama (dashboardId null).
- Validation: unit sheet-job.test (13: file = runGridRows untuk 3 tampilan pada fixture 1.000 baris/3 segmen, XLSX, batas, akses), service-sheet.test (9), e2e data-view-export 4/4, regresi e2e exports 8/8, data-view 5/5, data-view-copy 4/4; measure-grid-chunk 290,6 KiB.

## Notes
- Desain: POST /api/exports menerima body `{ sheetId, versionId, format, cols, sort?, filters?, search? }` (dibedakan dari widget/PDF lewat `sheetId`) → createSheetExport (resolveSheetView = authorizeGrid + planGrid) → baris Export (sheetId, params = tampilan + requestedAt) → antrean "export" yang sama. Worker: prepareSheet → SQL sheet-sql.ts: tampilan polos multi-segmen = urutan manifest (sama dengan jalur 1 grid, bukan ORDER BY _row — diuji dengan rowBase segmen terbalik), selain itu WHERE/ORDER BY gridWhereSql/gridOrderSql yang sama dengan jalur 2 grid. Alias keluaran o<i> agar ORDER BY tidak merujuk nilai yang sudah dinetralkan.
- Batas: dialog membandingkan jumlah baris tampilan dengan EXPORT_MAX_ROWS (props halaman) / min(…, 1.048.575) untuk XLSX dan tidak memulai bila lebih; worker juga menghitung dulu → EXPORT_TOO_LARGE dengan pesan batas + saran saring. Env EXPORT_MAX_ROWS sudah dibatasi ≤ 1.048.575.
- Klien: dialog di chunk React.lazy terpisah (grid-export.tsx), dipasang saat pertama dibuka dan tetap (polling/unduhan otomatis jalan walau ditutup); POST/polling ekspor bukan permintaan grid, jadi tidak memakai jatah 2 in-flight grid. Tanpa dependensi baru (package-lock tidak berubah).
- Dilewati: plugin frontend-expert tidak tersedia di sesi cloud ini (UI mengikuti pola dialog grid-filter-dialog + ExportStatus T-017/T-018; token CSS, ikon Tabler 20/1.5). Teks ExportStatus menyebut "Menu boleh ditutup" (kosmetik, bersama ekspor widget).

## Security checklist (OWASP ASVS 4.0.3)
<!-- Check each item when verified, or write "N/A: <reason>" after the text and check it. -->
- [x] V1 Architecture: trust boundaries and the components handling sensitive data are identified for this change — terverifikasi: batas kepercayaan = POST /api/exports (createSheetExport), GET /api/exports/[id](/download), dan worker job ekspor; klien hanya mengirim posisi kolom, urut, saringan, cari
- [x] V2 Authentication: credentials are verified server-side; no default, hard-coded, or weak secrets — N/A: tidak mengubah autentikasi; route memakai withUser()
- [x] V3 Session management: session tokens are random, protected, invalidated on logout and expiry — N/A: tidak mengubah sesi
- [x] V4 Access control: every endpoint/action checks authorization server-side, deny by default (no IDOR) — terverifikasi: buat = authorizeGrid (pemilik/editor; viewer/asing FORBIDDEN, versi lain VERSION_CHANGED), worker cek ulang peran + versi SAAT INI, status/unduh = pemilik ekspor yang masih pemilik/editor dataset (lainnya 404) — unit service-sheet.test, sheet-job.test, e2e AC3
- [x] V5 Validation, sanitization and encoding: all input validated; output encoded; no injection (SQL, OS, template) — terverifikasi: sheetExportBodySchema/ParamsSchema zod strict (bentuk sort/filters/search = rowsBodySchema), planGrid mencocokkan dengan skema terlihat; identifier program saja, nilai parameter binding; CSV/XLSX menetralkan formula (= + - @ tab CR, FORCE_QUOTE teks) — unit sheet-job.test, e2e
- [x] V6 Stored cryptography: sensitive data at rest uses approved algorithms; keys are not in the code — N/A: tidak ada data terenkripsi baru
- [x] V7 Error handling and logging: errors reveal no internals; security events are logged without secrets — terverifikasi: pesan galat tanpa nama kolom/sheet atau galat DuckDB/S3 mentah; galat tak terduga → 503 umum / FAILED umum
- [x] V8 Data protection: personal/sensitive data is minimized, not cached or logged, and removable — terverifikasi: kolom tersembunyi (skema dan pengguna) tidak pernah diekspor (uji isi file tanpa "rahasia"); params ekspor tidak dicatat di AuditLog (meta tanpa nilai saringan); objek dihapus saat kedaluwarsa 60 menit (alur T-017)
- [x] V9 Communication: TLS for all external traffic; certificates validated — N/A: tanpa lalu lintas eksternal baru (storage S3 internal yang sama)
- [x] V10 Malicious code: no backdoors, time bombs, or unexplained network calls; dependencies are trusted — terverifikasi: tanpa dependensi baru (package.json/lockfile tidak berubah)
- [x] V11 Business logic: flows cannot be abused (limits, ordering, replay, race conditions) — terverifikasi: RULES.export + 2 ekspor berjalan per user (advisory lock), jumlah baris dihitung sebelum menulis (EXPORT_TOO_LARGE, tidak pernah dipotong), XLSX ≤ 1.048.575, tenggat EXPORT_DEADLINE_MS, versi berganti → VERSION_CHANGED (tidak mencampur versi)
- [x] V12 Files and resources: uploads are type/size limited and stored safely; no path traversal or SSRF — terverifikasi: kunci objek exports/<userId>/<id>.<ext> divalidasi regex, Content-Type/Disposition ditetapkan server, DuckDB ekspor allowed_directories = direktori kerja; tanpa path dari klien
- [x] V13 API and web service: API inputs/outputs are schema-validated; CORS and rate limits are deliberate — terverifikasi: body ≤ 64 KB, Origin wajib (rejectCrossOrigin), zod strict, kode HTTP per kode (FORBIDDEN 403, VERSION_CHANGED 409) — unit service-sheet.test, e2e AC3
- [x] V14 Configuration: secure defaults, security headers, no debug in production, dependencies up to date — terverifikasi: tanpa header/CSP baru, tanpa debug; chunk AG tetap hanya rute Lihat data (measure-grid-chunk 290,6/293 KiB, leakedToDashboard [])
