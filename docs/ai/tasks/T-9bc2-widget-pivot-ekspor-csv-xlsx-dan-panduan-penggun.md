---
id: T-9bc2
title: 'Widget pivot: ekspor CSV/XLSX dan panduan pengguna'
status: in_review
profile: standard
created: "2026-10-19T08:26:18Z"
updated: "2026-10-19T13:51:51Z"
created_by: claude-code
workers:
  - claude-code
branch: worktree-t-001-scaffold
base: a0e1646e205fe25a0219f0fa23f0d779450610b6
review:
  passes:
    - "n": 1
      by: claude-reviewer-subagent
      at: "2026-10-19T13:48:15Z"
      findings: 0
    - "n": 2
      by: claude-code
      at: "2026-10-19T13:48:15Z"
      findings: 0
evidence:
  check:
    cmd: npm run check
    exit_code: 0
    duration_ms: 110380
    summary: |-
      …"code":2,"err":"No such file or directory","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":40,"time":1792417770068,"service":"data-dashboard","host":"127.0.0.1","port":57945,"step":"menulis file uji","code":3,"err":"Permission denied","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":40,"time":1792417770083,"service":"data-dashboard","host":"127.0.0.1","port":57954,"err":"Unable to start subsystem: sftp","msg":"subsistem SFTP ditolak NAS"}
      {"level":40,"time":1792417770104,"service":"data-dashboard","host":"127.0.0.1","port":57956,"step":"menghapus file uji","code":4,"err":"Failure","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":40,"time":1792417770127,"service":"data-dashboard","host":"127.0.0.1","port":57960,"step":"menulis file uji","code":4,"err":"Failure","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":40,"time":1792417776912,"service":"data-dashboard","check":"B","detail":"koneksi ditolak","msg":"health check gagal"}
      {"level":40,"time":1792417776936,"service":"data-dashboard","check":"Lambat","detail":"Lambat: timeout 20 ms","msg":"health check gagal"}
      {"level":40,"time":1792417776938,"service":"data-dashboard","check":"Y","detail":"mati","msg":"health check gagal"}
      {"level":40,"time":1792417776945,"service":"data-dashboard","check":"Renderer PDF","detail":"renderer tidak menjawab /healthz","msg":"health check gagal"}
      {"level":40,"time":1792417780800,"service":"data-dashboard","err":"Can't reach database server","msg":"sesi shell gagal dibaca"}

       Test Files  153 passed (153)
            Tests  2004 passed (2004)
         Start at  20:49:09
         Duration  74.37s (tests 79%, import 17%, transform 4%)

          Isolate  153 workers spawned · ~274ms startup each (spawn + environment, per file)
                   at least ~4.38s faster with isolate: false — reuses workers across files instead of one per file


      > data-dashboard@0.1.0 audit
      > npm audit --audit-level=high --omit=dev && npm audit --audit-level=critical

      found 0 vulnerabilities
      found 0 vulnerabilities
    at: "2026-10-19T13:50:25Z"
    tree: f5449e33343d56fed30d8a2f409548832d4b374a3e017d5e83289477e6de9f9b
  audit:
    at: "2026-10-19T13:50:26Z"
    passed: true
    tree: f5449e33343d56fed30d8a2f409548832d4b374a3e017d5e83289477e6de9f9b
    results:
      - name: osv-scanner (dependencies, offline db)
        exit_code: 0
        summary: |-
          Scanning dir .
          Starting filesystem walk for root: /
          Scanned /Users/anasfikri/Documents/Projects/pcpexpress/data-dashboard/.claude/worktrees/t-001-scaffold/package-lock.json file and found 832 packages
          End status: 211 dirs visited, 1420 inodes visited, 1 Extract calls, 126.904333ms elapsed, 126.905ms wall time
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
Widget pivot bisa diekspor ke CSV dan Excel (XLSX) dengan bentuk yang sama dengan layar (kolom label per kolom baris, baris Subtotal dan Total, angka bertipe angka, catatan batas tampil), dan pengguna baru mendapat artikel panduan langkah demi langkah dengan pemetaan dari PivotTable Excel serta video bernarasi bahasa Indonesia yang mengucapkan istilah bahasa Inggris dengan suara beraksen Inggris.

## Acceptance criteria
- [x] Given pivot di dashboard, when viewer mengekspor CSV atau XLSX, then file berisi tabel pivot dengan header baris/kolom, subtotal, dan total sesuai tampilan
- [x] Given pengguna baru membuka Panduan, when mencari pivot, then ada artikel langkah demi langkah dengan contoh dari Excel pivot table dan video bernarasi bahasa Indonesia yang mengucapkan istilah bahasa Inggris dengan aksen Inggris

## Risk
- Impact: job ekspor worker mendapat cabang pivot (writePivotExport: query pivot yang sama dengan layar atas parquet kerja → pivotTable → grid CSV/XLSX); tombol ekspor kartu pivot aktif lagi; panduan baru widget-pivot + video pemilik-pivot; skrip dev guide-tts mendukung penanda [en:…] (suara en-GB) dan tulis atomik. Ekspor tabel/grafik tidak berubah (cabang terpisah, regresi e2e exports 8/8).
- Security (STRIDE): Tampering/injeksi spreadsheet — setiap teks CSV (header, label kelompok/rincian, Subtotal, Total, catatan) dikutip dan dinetralkan (awalan '), XLSX selalu inlineStr; Information disclosure — akses dan peran dicek ulang di worker sebelum cabang pivot (repo.widget + resolveWidget + forRole), filter dashboard ikut; DoS — keluaran dibatasi 200 × 40 oleh query pivot, DuckDB ekspor tetap terkunci ke direktori kerja dan di bawah tenggat/watch.
- Rollback: revert commit; ekspor pivot kembali ditolak (tombol tersembunyi) — tidak ada migrasi DB. Artikel/video panduan bisa disembunyikan admin di Admin › Panduan.
- Validation: tests/features/exports/pivot-grid.test.ts (grid 2 kolom baris, subtotal, Total, catatan, tanggal, CSV aman), job.test.ts (pivot CSV/XLSX atas parquet sungguhan, filter dashboard, angka = agregasi langsung), service.test.ts; e2e pivot.spec.ts (ekspor CSV dari kepala kartu: header, Subtotal, rincian, Total persis) 6/6 dua kali, e2e exports 8/8; video direkam di DB demo dan frame ditinjau (lebar penuh, Total terlihat), takarir VTT tanpa penanda.

## Notes
- Narasi: suara id-ID-ArdiNeural, istilah bahasa Inggris (pivot, PivotTable, Excel, dashboard, Rows, Columns, Values, CSV) diucapkan en-GB-RyanNeural lalu disambung ffmpeg (hening ujung dipangkas, jeda 80 ms).
- Produksi: artikel widget-pivot + video diunggah lewat seed-guides --only widget-pivot --videos (artikel lain tidak ditimpa agar suntingan admin aman; tambahan kalimat Pivot di artikel susun-dashboard hanya di repo).

## Security checklist (OWASP ASVS 4.0.3)
<!-- Check each item when verified, or write "N/A: <reason>" after the text and check it. -->
- [x] V1 Architecture: trust boundaries and the components handling sensitive data are identified for this change — jalur baru di worker ekspor (writePivotExport) memakai DuckDB ekspor yang sama (allowed_directories = direktori kerja, external access off, konfigurasi terkunci); data sumber = parquet sheet aktif yang diunduh ke direktori kerja
- [x] V2 Authentication: credentials are verified server-side; no default, hard-coded, or weak secrets — N/A — tidak menyentuh autentikasi
- [x] V3 Session management: session tokens are random, protected, invalidated on logout and expiry — N/A — tidak menyentuh sesi
- [x] V4 Access control: every endpoint/action checks authorization server-side, deny by default (no IDOR) — worker mengecek ulang widget dengan peran SEKARANG (repo.widget + dashboard cocok) lalu resolveWidget/forRole sebelum cabang pivot; POST /api/exports tetap memeriksa akses dashboard (orang lain 404)
- [x] V5 Validation, sanitization and encoding: all input validated; output encoded; no injection (SQL, OS, template) — CSV: semua teks (header, label kelompok/rincian, Subtotal, Total, catatan) dikutip dan dinetralkan (awalan ' untuk = + - @ tab CR); XLSX: teks selalu inlineStr (tidak pernah formula), angka bertipe angka; SQL pivot hanya identifier c<pos> + parameter
- [x] V6 Stored cryptography: sensitive data at rest uses approved algorithms; keys are not in the code — N/A
- [x] V7 Error handling and logging: errors reveal no internals; security events are logged without secrets — galat ekspor pivot memakai kode/pesan ekspor yang ada (EXPORT_TIMEOUT, EXPORT_FAILED berat, NOT_FOUND per peran); tidak ada log data sel
- [x] V8 Data protection: personal/sensitive data is minimized, not cached or logged, and removable — tidak ada penyimpanan lokal baru (localStorage/sessionStorage tidak dipakai)
- [x] V9 Communication: TLS for all external traffic; certificates validated — N/A — tidak ada lalu lintas eksternal baru
- [x] V10 Malicious code: no backdoors, time bombs, or unexplained network calls; dependencies are trusted — tanpa dependensi baru (Radix Popover/Select dan Tabler yang sudah ada)
- [x] V11 Business logic: flows cannot be abused (limits, ordering, replay, race conditions) — keluaran pivot dibatasi 200 baris × 40 kolom oleh query yang sama dengan layar (catatan batas di baris terakhir); tenggat EXPORT_DEADLINE_MS + watch (ekspor dihapus/tenggat) tetap berlaku; batas 2 ekspor berjalan per user tetap
- [x] V12 Files and resources: uploads are type/size limited and stored safely; no path traversal or SSRF — file keluaran hanya ditulis di direktori kerja job lalu diunggah ke exports/<user>/<id>.<ext> (presigned, kedaluwarsa); direktori kerja dihapus di finally
- [x] V13 API and web service: API inputs/outputs are schema-validated; CORS and rate limits are deliberate — body POST /api/exports tidak berubah (widgetId + format + filter tervalidasi strict); tidak ada endpoint baru
- [x] V14 Configuration: secure defaults, security headers, no debug in production, dependencies up to date — tanpa konfigurasi baru; npm audit 0 kerentanan
