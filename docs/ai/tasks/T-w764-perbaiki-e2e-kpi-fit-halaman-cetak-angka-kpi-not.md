---
id: T-w764
title: 'Perbaiki e2e kpi-fit halaman cetak: angka KPI noted w4 terpotong 1 px'
status: in_progress
profile: standard
created: "2026-10-21T12:34:26Z"
updated: "2026-10-21T21:17:36Z"
created_by: claude-code
workers:
  - claude-code
branch: claude/intelligent-albattani-fd1va8
base: 62dfa2b97043bf3ab0c4429f296d7bc00fdb08ee
evidence:
  check:
    cmd: npm run check
    exit_code: 0
    duration_ms: 197102
    summary: |-
      …t":"127.0.0.1","port":46299,"step":"membuka folder","code":2,"err":"No such file or directory","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":40,"time":1792617411512,"service":"data-dashboard","host":"127.0.0.1","port":38515,"err":"Unable to start subsystem: sftp","msg":"subsistem SFTP ditolak NAS"}
      {"level":40,"time":1792617411616,"service":"data-dashboard","host":"127.0.0.1","port":36435,"step":"menghapus file uji","code":4,"err":"Failure","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":40,"time":1792617411734,"service":"data-dashboard","host":"127.0.0.1","port":39585,"step":"menulis file uji","code":4,"err":"Failure","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":30,"time":1792617413088,"service":"data-dashboard","datasetId":"t072mvim4fkxds000000","msg":"dataset dihapus"}
      {"level":40,"time":1792617424880,"service":"data-dashboard","err":"Can't reach database server","msg":"sesi shell gagal dibaca"}
      {"level":40,"time":1792617434387,"service":"data-dashboard","check":"B","detail":"koneksi ditolak","msg":"health check gagal"}
      {"level":40,"time":1792617434409,"service":"data-dashboard","check":"Lambat","detail":"Lambat: timeout 20 ms","msg":"health check gagal"}
      {"level":40,"time":1792617434412,"service":"data-dashboard","check":"Y","detail":"mati","msg":"health check gagal"}
      {"level":40,"time":1792617434424,"service":"data-dashboard","check":"Renderer PDF","detail":"renderer tidak menjawab /healthz","msg":"health check gagal"}

       Test Files  225 passed | 1 skipped (226)
            Tests  3021 passed | 10 skipped (3031)
         Start at  21:15:16
         Duration  138.29s (tests 83%, import 14%, transform 3%)

          Isolate  226 workers spawned · ~146ms startup each (spawn + environment, per file)
                   at least ~10.87s faster with isolate: false — reuses workers across files instead of one per file


      > data-dashboard@1.2.0 audit
      > npm audit --audit-level=high --omit=dev && npm audit --audit-level=critical

      found 0 vulnerabilities
      found 0 vulnerabilities
    at: "2026-10-21T21:17:36Z"
    tree: f9480a784dccb1da9af6a9704d003ab568fcc961a1814b3e4e26f5b69ba807e6
  audit:
    at: "2026-10-21T21:12:30Z"
    passed: true
    tree: 424dfc2cc41eaece461923384d6bf28e9f904118e2cce0c4fbfb93e547f89c99
    results:
      - name: osv-scanner (dependencies, offline db)
        exit_code: 0
        summary: |-
          Scanning dir .
          Starting filesystem walk for root: /
          Scanned /home/user/data-dashboard/package-lock.json file and found 836 packages
          End status: 528 dirs visited, 5219 inodes visited, 1 Extract calls, 242.19742ms elapsed, 242.197731ms wall time
          Loaded npm local db from /root/.cache/osv-scalibr/npm/all.zip

          No issues found
      - name: npm audit (prod high, dev critical)
        exit_code: 0
        summary: |-
          > data-dashboard@1.2.0 audit
          > npm audit --audit-level=high --omit=dev && npm audit --audit-level=critical

          found 0 vulnerabilities
          found 0 vulnerabilities
      - name: aitk secret scan (tracked files)
        exit_code: 0
---

## Objective
Ditemukan saat T-1zdf (gagal konsisten di HEAD 8ce72cf, 4/4 run): tests/e2e/kpi-fit.spec.ts "AC1: halaman cetak (viewport renderer 1047 px, media print)" — angka KPI kartu bercatatan w4 terpotong 1 px di bawah (28 px, kotak @container KPI), toleransi 0,5 px. Tentukan apakah ini bug nyata (kpiHeightPx/ukuran huruf di halaman cetak) lalu perbaiki dengan tes regresi; jangan melonggarkan toleransi.

## Acceptance criteria
- [x] Given project kpi-fit dijalankan utuh, then tes AC1 halaman cetak lulus (potongan angka <= 0,5 px) tanpa melonggarkan toleransi

## Risk
Impact: tinggi baris angka KPI kini benar-benar leading-tight (1,25) di layar dan kertas (sebelumnya 1,5
karena kelasnya terbuang); angka sedikit lebih rapat ke label, ukuran huruf tidak berubah.
Security (STRIDE): tidak ada permukaan baru (hanya urutan kelas CSS).
Rollback: revert commit T-w764.
Validation: tests/components/kpi-line-height.test.ts (gagal sebelum perbaikan); e2e --project=kpi-fit 6/6
(cetak: potongan 0 px), pdf, widgets.

## Notes
- Diagnosis T-075 (2026-10-21, belum diperbaiki): direproduksi (--project=kpi-fit, 5 lulus, AC1 cetak
  gagal: "angka noted w4 terpotong (28 px, bawah @container …)", potongan 1 px > 0,5). Kotak yang
  memotong = kotak KPI (kpi-view.tsx, overflow-hidden, pb-3). Ukuran 28 px berasal dari batas tinggi
  `kpiHeightPx` (kpi-fit.ts: angka boleh memakai padding bawah kecuali 2 px ekor huruf, tinggi baris
  leading-tight 1,25). Dugaan: kotak isi teks (Range) font halaman cetak lebih tinggi dari 1,25 em
  sehingga cadangan 2 px kurang ± 1 px; perlu ukur ascent/descent font di halaman cetak lalu ubah rumus
  (mis. cadangan dari metrik font, bukan konstanta) + uji unit kpiHeightPx — jangan longgarkan toleransi.
- Akar masalah (T-w764, 2026-10-21): bukan metrik font (Inter: kotak isi 34 px < baris 35 px di 28 px).
  Pengukuran di halaman cetak: tinggi <p> angka 42 px = 1,5 × 28 — `cn()` (tailwind-merge) membuang
  `leading-tight` karena kelas ukuran `text-[clamp(...)]`/`text-sm` sesudahnya (text-* membawa tinggi
  baris), jadi tinggi baris jatuh ke 1,5 warisan body sementara kpiHeightPx menganggap 1,25 → kotak teks
  turun 3,5 px dan terpotong 1 px. Perbaikan: `leading-tight` ditaruh sesudah kelas ukuran (kpi-view.tsx).
  Sesudahnya tinggi <p> 35 px, potongan 0 px di semua kartu; toleransi tidak diubah.

## Security checklist (OWASP ASVS 4.0.3)
<!-- Check each item when verified, or write "N/A: <reason>" after the text and check it. -->
- [x] V1 Architecture: trust boundaries and the components handling sensitive data are identified for this change — N/A: hanya urutan kelas CSS angka KPI; tidak ada input, data, endpoint, atau konfigurasi baru.
- [x] V2 Authentication: credentials are verified server-side; no default, hard-coded, or weak secrets — N/A: hanya urutan kelas CSS angka KPI; tidak ada input, data, endpoint, atau konfigurasi baru.
- [x] V3 Session management: session tokens are random, protected, invalidated on logout and expiry — N/A: hanya urutan kelas CSS angka KPI; tidak ada input, data, endpoint, atau konfigurasi baru.
- [x] V4 Access control: every endpoint/action checks authorization server-side, deny by default (no IDOR) — N/A: hanya urutan kelas CSS angka KPI; tidak ada input, data, endpoint, atau konfigurasi baru.
- [x] V5 Validation, sanitization and encoding: all input validated; output encoded; no injection (SQL, OS, template) — N/A: hanya urutan kelas CSS angka KPI; tidak ada input, data, endpoint, atau konfigurasi baru.
- [x] V6 Stored cryptography: sensitive data at rest uses approved algorithms; keys are not in the code — N/A: hanya urutan kelas CSS angka KPI; tidak ada input, data, endpoint, atau konfigurasi baru.
- [x] V7 Error handling and logging: errors reveal no internals; security events are logged without secrets — N/A: hanya urutan kelas CSS angka KPI; tidak ada input, data, endpoint, atau konfigurasi baru.
- [x] V8 Data protection: personal/sensitive data is minimized, not cached or logged, and removable — N/A: hanya urutan kelas CSS angka KPI; tidak ada input, data, endpoint, atau konfigurasi baru.
- [x] V9 Communication: TLS for all external traffic; certificates validated — N/A: hanya urutan kelas CSS angka KPI; tidak ada input, data, endpoint, atau konfigurasi baru.
- [x] V10 Malicious code: no backdoors, time bombs, or unexplained network calls; dependencies are trusted — N/A: hanya urutan kelas CSS angka KPI; tidak ada input, data, endpoint, atau konfigurasi baru.
- [x] V11 Business logic: flows cannot be abused (limits, ordering, replay, race conditions) — N/A: hanya urutan kelas CSS angka KPI; tidak ada input, data, endpoint, atau konfigurasi baru.
- [x] V12 Files and resources: uploads are type/size limited and stored safely; no path traversal or SSRF — N/A: hanya urutan kelas CSS angka KPI; tidak ada input, data, endpoint, atau konfigurasi baru.
- [x] V13 API and web service: API inputs/outputs are schema-validated; CORS and rate limits are deliberate — N/A: hanya urutan kelas CSS angka KPI; tidak ada input, data, endpoint, atau konfigurasi baru.
- [x] V14 Configuration: secure defaults, security headers, no debug in production, dependencies up to date — N/A: hanya urutan kelas CSS angka KPI; tidak ada input, data, endpoint, atau konfigurasi baru.
