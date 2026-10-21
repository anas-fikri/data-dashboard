---
id: T-7ykh
title: Tampilkan baris data pivot bertingkat di halaman cetak kartu kecil
status: in_progress
profile: standard
goal: G-7
tags:
  - pdf
created: "2026-10-21T19:46:55Z"
updated: "2026-10-21T21:03:00Z"
created_by: claude-code
workers:
  - claude-code
branch: claude/intelligent-albattani-fd1va8
base: 3f0008e2990162242c5c5f494b3550f7f4ea5f71
evidence:
  check:
    cmd: npm run check
    exit_code: 0
    duration_ms: 197262
    summary: |-
      …t":"127.0.0.1","port":34547,"step":"membuka folder","code":2,"err":"No such file or directory","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":40,"time":1792616512760,"service":"data-dashboard","host":"127.0.0.1","port":34465,"err":"Unable to start subsystem: sftp","msg":"subsistem SFTP ditolak NAS"}
      {"level":40,"time":1792616512867,"service":"data-dashboard","host":"127.0.0.1","port":37451,"step":"menghapus file uji","code":4,"err":"Failure","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":40,"time":1792616512977,"service":"data-dashboard","host":"127.0.0.1","port":42945,"step":"menulis file uji","code":4,"err":"Failure","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":30,"time":1792616513972,"service":"data-dashboard","datasetId":"t072mvill5whds000000","msg":"dataset dihapus"}
      {"level":40,"time":1792616526251,"service":"data-dashboard","err":"Can't reach database server","msg":"sesi shell gagal dibaca"}
      {"level":40,"time":1792616532822,"service":"data-dashboard","check":"B","detail":"koneksi ditolak","msg":"health check gagal"}
      {"level":40,"time":1792616532845,"service":"data-dashboard","check":"Lambat","detail":"Lambat: timeout 20 ms","msg":"health check gagal"}
      {"level":40,"time":1792616532847,"service":"data-dashboard","check":"Y","detail":"mati","msg":"health check gagal"}
      {"level":40,"time":1792616532856,"service":"data-dashboard","check":"Renderer PDF","detail":"renderer tidak menjawab /healthz","msg":"health check gagal"}

       Test Files  224 passed | 1 skipped (225)
            Tests  3020 passed | 10 skipped (3030)
         Start at  21:00:19
         Duration  134.84s (tests 83%, import 14%, transform 3%)

          Isolate  225 workers spawned · ~142ms startup each (spawn + environment, per file)
                   at least ~10.50s faster with isolate: false — reuses workers across files instead of one per file


      > data-dashboard@1.2.0 audit
      > npm audit --audit-level=high --omit=dev && npm audit --audit-level=critical

      found 0 vulnerabilities
      found 0 vulnerabilities
    at: "2026-10-21T21:02:35Z"
    tree: ab5dddbfdeec4fc7762e7317e6abbc12c18e89635b52fef4e32e653c227b6166
  audit:
    at: "2026-10-21T21:02:36Z"
    passed: true
    tree: ab5dddbfdeec4fc7762e7317e6abbc12c18e89635b52fef4e32e653c227b6166
    results:
      - name: osv-scanner (dependencies, offline db)
        exit_code: 0
        summary: |-
          Scanning dir .
          Starting filesystem walk for root: /
          Scanned /home/user/data-dashboard/package-lock.json file and found 836 packages
          End status: 528 dirs visited, 5194 inodes visited, 1 Extract calls, 239.275081ms elapsed, 239.275325ms wall time
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
Ditemukan T-075: pivot 4 tingkat di kartu ukuran bawaan (widget baru via API) dicetak sebagai 'Menampilkan 0 dari 32 baris' — hanya kepala kelompok Barat › Kilat › Kota 07 yang muat, tanpa satu pun baris data (src/features/widgets/pivot-table.ts fittingPivotRows, src/components/render/print-pivot.tsx). Ada catatan potongan, jadi tidak diam-diam, tetapi PDF tidak berguna. Pastikan setidaknya satu kelompok utuh (kepala + baris + subtotal) muat, atau pindahkan kepala kelompok menjadi kolom label seperti ekspor CSV, atau beri petunjuk 'perbesar kartu' di catatan.

## Acceptance criteria
- [x] Given pivot 4 tingkat di kartu 4×4 grid di halaman cetak, then minimal satu baris data tampil atau catatan menyarankan memperbesar kartu; e2e pivot-lanjutan menguji kartu kecil

## Risk
Impact: hanya teks catatan bawah pivot di halaman cetak/PDF (print-pivot.tsx) saat tidak satu pun baris
data muat; tata letak dan pemilihan baris tidak berubah.
Security (STRIDE): tidak ada permukaan baru (teks statis).
Rollback: revert commit T-7ykh.
Validation: tests/components/pivot-ui.test.ts (T-7ykh); e2e --project=pivot-lanjutan (kartu "Pivot kecil"
4×4, pivot 4 tingkat: 0 baris data → catatan memuat petunjuk dan petunjuk tidak terpotong line-clamp).

## Notes
- Pilihan (2026-10-21): catatan potongan menambah "Perbesar kartu agar baris data muat" tepat setelah
  "Menampilkan 0 dari N baris" (awal catatan, jadi tetap terlihat walau catatan dipotong 2 baris). Tidak
  memaksa baris data muat: kartu 4×4 hanya memuat 3 kepala kelompok + Total, dan kepala kelompok
  (dengan subtotal) tetap informatif. Diverifikasi e2e: kartu kecil mencetak 0 baris data + petunjuk.

## Security checklist (OWASP ASVS 4.0.3)
<!-- Check each item when verified, or write "N/A: <reason>" after the text and check it. -->
- [x] V1 Architecture: trust boundaries and the components handling sensitive data are identified for this change — N/A: hanya teks statis catatan pivot di halaman cetak; tidak ada input, data, endpoint, atau konfigurasi baru.
- [x] V2 Authentication: credentials are verified server-side; no default, hard-coded, or weak secrets — N/A: hanya teks statis catatan pivot di halaman cetak; tidak ada input, data, endpoint, atau konfigurasi baru.
- [x] V3 Session management: session tokens are random, protected, invalidated on logout and expiry — N/A: hanya teks statis catatan pivot di halaman cetak; tidak ada input, data, endpoint, atau konfigurasi baru.
- [x] V4 Access control: every endpoint/action checks authorization server-side, deny by default (no IDOR) — N/A: hanya teks statis catatan pivot di halaman cetak; tidak ada input, data, endpoint, atau konfigurasi baru.
- [x] V5 Validation, sanitization and encoding: all input validated; output encoded; no injection (SQL, OS, template) — N/A: hanya teks statis catatan pivot di halaman cetak; tidak ada input, data, endpoint, atau konfigurasi baru.
- [x] V6 Stored cryptography: sensitive data at rest uses approved algorithms; keys are not in the code — N/A: hanya teks statis catatan pivot di halaman cetak; tidak ada input, data, endpoint, atau konfigurasi baru.
- [x] V7 Error handling and logging: errors reveal no internals; security events are logged without secrets — N/A: hanya teks statis catatan pivot di halaman cetak; tidak ada input, data, endpoint, atau konfigurasi baru.
- [x] V8 Data protection: personal/sensitive data is minimized, not cached or logged, and removable — N/A: hanya teks statis catatan pivot di halaman cetak; tidak ada input, data, endpoint, atau konfigurasi baru.
- [x] V9 Communication: TLS for all external traffic; certificates validated — N/A: hanya teks statis catatan pivot di halaman cetak; tidak ada input, data, endpoint, atau konfigurasi baru.
- [x] V10 Malicious code: no backdoors, time bombs, or unexplained network calls; dependencies are trusted — N/A: hanya teks statis catatan pivot di halaman cetak; tidak ada input, data, endpoint, atau konfigurasi baru.
- [x] V11 Business logic: flows cannot be abused (limits, ordering, replay, race conditions) — N/A: hanya teks statis catatan pivot di halaman cetak; tidak ada input, data, endpoint, atau konfigurasi baru.
- [x] V12 Files and resources: uploads are type/size limited and stored safely; no path traversal or SSRF — N/A: hanya teks statis catatan pivot di halaman cetak; tidak ada input, data, endpoint, atau konfigurasi baru.
- [x] V13 API and web service: API inputs/outputs are schema-validated; CORS and rate limits are deliberate — N/A: hanya teks statis catatan pivot di halaman cetak; tidak ada input, data, endpoint, atau konfigurasi baru.
- [x] V14 Configuration: secure defaults, security headers, no debug in production, dependencies up to date — N/A: hanya teks statis catatan pivot di halaman cetak; tidak ada input, data, endpoint, atau konfigurasi baru.
