---
id: T-5edy
title: 'v1.12.0: sidebar filter tetap di dashboard (≥ 1280 px), bisa diciutkan'
status: in_review
profile: standard
created: "2026-11-08T14:22:48Z"
updated: "2026-11-08T15:00:22Z"
created_by: claude-code
workers:
  - claude-code
branch: claude/cool-babbage-t5yojt
base: 14edcb2448f2c200d0d4418be49a6182c41732bb
review:
  passes:
    - "n": 1
      by: claude-reviewer-subagent
      at: "2026-11-08T14:53:28Z"
      findings: 4
    - "n": 2
      by: claude-reviewer-subagent
      at: "2026-11-08T15:00:22Z"
      findings: 0
evidence:
  check:
    cmd: npm run check
    exit_code: 0
    duration_ms: 175755
    summary: |-
      …t":"127.0.0.1","port":34161,"step":"membuka folder","code":2,"err":"No such file or directory","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":40,"time":1794149746228,"service":"data-dashboard","host":"127.0.0.1","port":46607,"err":"Unable to start subsystem: sftp","msg":"subsistem SFTP ditolak NAS"}
      {"level":40,"time":1794149746325,"service":"data-dashboard","host":"127.0.0.1","port":43829,"step":"menghapus file uji","code":4,"err":"Failure","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":40,"time":1794149746435,"service":"data-dashboard","host":"127.0.0.1","port":36133,"step":"menulis file uji","code":4,"err":"Failure","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":30,"time":1794149747719,"service":"data-dashboard","datasetId":"t072mw7yfojhds000000","msg":"dataset dihapus"}
      {"level":40,"time":1794149761078,"service":"data-dashboard","err":"Can't reach database server","msg":"sesi shell gagal dibaca"}
      {"level":40,"time":1794149764323,"service":"data-dashboard","check":"B","detail":"koneksi ditolak","msg":"health check gagal"}
      {"level":40,"time":1794149764346,"service":"data-dashboard","check":"Lambat","detail":"Lambat: timeout 20 ms","msg":"health check gagal"}
      {"level":40,"time":1794149764348,"service":"data-dashboard","check":"Y","detail":"mati","msg":"health check gagal"}
      {"level":40,"time":1794149764369,"service":"data-dashboard","check":"Renderer PDF","detail":"renderer tidak menjawab /healthz","msg":"health check gagal"}

       Test Files  239 passed | 1 skipped (240)
            Tests  3189 passed | 10 skipped (3199)
         Start at  14:54:28
         Duration  119.66s (tests 80%, import 17%, transform 3%)

          Isolate  240 workers spawned · ~105ms startup each (spawn + environment, per file)
                   at least ~8.28s faster with isolate: false — reuses workers across files instead of one per file


      > data-dashboard@1.11.0 audit
      > npm audit --audit-level=high --omit=dev && npm audit --audit-level=critical

      found 0 vulnerabilities
      found 0 vulnerabilities
    at: "2026-11-08T14:56:29Z"
    tree: 4042aab6244e048c4cbaddacd2bf280c3948a49e78cfb70c6d9688ac4cfa3939
  audit:
    at: "2026-11-08T14:56:30Z"
    passed: true
    tree: 4042aab6244e048c4cbaddacd2bf280c3948a49e78cfb70c6d9688ac4cfa3939
    results:
      - name: osv-scanner (dependencies, offline db)
        exit_code: 0
        summary: |-
          Scanning dir .
          Starting filesystem walk for root: /
          Scanned /home/user/data-dashboard/package-lock.json file and found 837 packages
          End status: 521 dirs visited, 3040 inodes visited, 1 Extract calls, 382.681876ms elapsed, 382.682323ms wall time
          Loaded npm local db from /root/.cache/osv-scanner/npm/all.zip
          No issues found
      - name: npm audit (prod high, dev critical)
        exit_code: 0
        summary: |-
          > data-dashboard@1.11.0 audit
          > npm audit --audit-level=high --omit=dev && npm audit --audit-level=critical

          found 0 vulnerabilities
          found 0 vulnerabilities
      - name: aitk secret scan (tracked files)
        exit_code: 0
---

## Objective
Di layar ≥ 1280 px filter dashboard menjadi sidebar kiri yang menempel saat digulir (kontrol sama, vertikal), bisa diciutkan menjadi rel ikon + jumlah filter aktif yang diingat browser, otomatis rel saat panel widget menempel di mode ubah; di bawah 1280 px dan untuk filter silang saja tetap bilah di atas. Rilis v1.12.0 tanpa migrasi.

## Acceptance criteria
- [x] Given layar ≥ 1280 px dan dashboard berkolom filter, when halaman digulir ke bawah, then panel filter tetap terlihat di sisi kiri dan kontrolnya bisa dipakai tanpa naik ke atas
- [x] Given sidebar filter, when tombol Ciutkan ditekan, then menjadi rel ikon dengan jumlah filter aktif, pilihan diingat browser, dan bisa dibuka lagi
- [x] Given mode ubah dengan panel widget terbuka di ≥ 1280 px, when dirender, then sidebar filter otomatis menjadi rel agar kanvas tidak sempit
- [x] Given layar < 1280 px, when dirender, then filter tetap di atas (bilah/lembar seperti sebelumnya)

## Risk
Impact: tata letak filter dashboard di ≥ 1280 px (sidebar kiri sticky, rel ciut); tanpa perubahan API, skema, atau data. Security (STRIDE): tidak ada permukaan baru — hanya tampilan; localStorage menyimpan satu boolean (sidebar diciutkan), bukan data pribadi. Rollback: image v1.11.0 aman (filter kembali ke bilah atas), tanpa migrasi. Validation: e2e filters 10 (termasuk tes sidebar: sticky saat digulir, ciut/buka + diingat, rel saat panel widget, < 1280 px di atas), sharing 39, mapping 7, chart-polish 9, widgets 27, pivot 11, chart-theme 5, status-colors 6, shell/a11y 11; review subagen (0 blocking, Low diterapkan).

## Notes

- 2026-11-08T14:53:27Z Bukti: e2e filters 'v1.12.0: sidebar filter…' (sticky + slicer terlihat setelah digulir, ciut → rel 56 px/tombol 44 px fokus, diingat setelah muat ulang, buka → fokus ke tombol ciutkan, mode edit + panel → rel, tutup panel → kembali, 1024 px → bilah di atas); e2e lain lulus (sharing disesuaikan buka rel; chart-polish sapuan lebar sampai 2000 px).

## Security checklist (OWASP ASVS 4.0.3)
<!-- Check each item when verified, or write "N/A: <reason>" after the text and check it. -->
- [x] V1 Architecture: trust boundaries and the components handling sensitive data are identified for this change — N/A: tidak disentuh perubahan ini
- [x] V2 Authentication: credentials are verified server-side; no default, hard-coded, or weak secrets — N/A: tidak disentuh perubahan ini
- [x] V3 Session management: session tokens are random, protected, invalidated on logout and expiry — N/A: tidak disentuh perubahan ini
- [x] V4 Access control: every endpoint/action checks authorization server-side, deny by default (no IDOR) — N/A: tidak disentuh perubahan ini
- [x] V5 Validation, sanitization and encoding: all input validated; output encoded; no injection (SQL, OS, template) — N/A: tidak disentuh perubahan ini
- [x] V6 Stored cryptography: sensitive data at rest uses approved algorithms; keys are not in the code — N/A: tidak disentuh perubahan ini
- [x] V7 Error handling and logging: errors reveal no internals; security events are logged without secrets — N/A: tidak disentuh perubahan ini
- [x] V8 Data protection: personal/sensitive data is minimized, not cached or logged, and removable — localStorage hanya boolean dd:filter-sidebar-collapsed per browser
- [x] V9 Communication: TLS for all external traffic; certificates validated — N/A: tidak disentuh perubahan ini
- [x] V10 Malicious code: no backdoors, time bombs, or unexplained network calls; dependencies are trusted — N/A: tidak disentuh perubahan ini
- [x] V11 Business logic: flows cannot be abused (limits, ordering, replay, race conditions) — N/A: tidak disentuh perubahan ini
- [x] V12 Files and resources: uploads are type/size limited and stored safely; no path traversal or SSRF — N/A: tidak disentuh perubahan ini
- [x] V13 API and web service: API inputs/outputs are schema-validated; CORS and rate limits are deliberate — N/A: tidak disentuh perubahan ini
- [x] V14 Configuration: secure defaults, security headers, no debug in production, dependencies up to date — N/A: tidak disentuh perubahan ini
