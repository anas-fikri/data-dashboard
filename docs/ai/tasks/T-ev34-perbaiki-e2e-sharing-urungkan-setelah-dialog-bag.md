---
id: T-ev34
title: 'Perbaiki e2e sharing: urungkan setelah dialog Bagikan menutup kanvas mode edit'
status: in_progress
profile: standard
tags:
  - e2e
created: "2026-10-21T18:24:30Z"
updated: "2026-10-21T20:42:17Z"
created_by: claude-code
workers:
  - claude-code
branch: claude/intelligent-albattani-fd1va8
base: e0ec8e7649c72fc3d704a97b6aacd01ddaba4101
evidence:
  check:
    cmd: npm run check
    exit_code: 0
    duration_ms: 204795
    summary: |-
      …t":"127.0.0.1","port":45481,"step":"membuka folder","code":2,"err":"No such file or directory","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":40,"time":1792615260832,"service":"data-dashboard","host":"127.0.0.1","port":42215,"err":"Unable to start subsystem: sftp","msg":"subsistem SFTP ditolak NAS"}
      {"level":40,"time":1792615260931,"service":"data-dashboard","host":"127.0.0.1","port":40627,"step":"menghapus file uji","code":4,"err":"Failure","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":40,"time":1792615261041,"service":"data-dashboard","host":"127.0.0.1","port":35887,"step":"menulis file uji","code":4,"err":"Failure","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":30,"time":1792615262348,"service":"data-dashboard","datasetId":"t072mvikuc4xds000000","msg":"dataset dihapus"}
      {"level":40,"time":1792615276039,"service":"data-dashboard","err":"Can't reach database server","msg":"sesi shell gagal dibaca"}
      {"level":40,"time":1792615286291,"service":"data-dashboard","check":"B","detail":"koneksi ditolak","msg":"health check gagal"}
      {"level":40,"time":1792615286313,"service":"data-dashboard","check":"Lambat","detail":"Lambat: timeout 20 ms","msg":"health check gagal"}
      {"level":40,"time":1792615286316,"service":"data-dashboard","check":"Y","detail":"mati","msg":"health check gagal"}
      {"level":40,"time":1792615286333,"service":"data-dashboard","check":"Renderer PDF","detail":"renderer tidak menjawab /healthz","msg":"health check gagal"}

       Test Files  224 passed | 1 skipped (225)
            Tests  3014 passed | 10 skipped (3024)
         Start at  20:39:24
         Duration  138.96s (tests 83%, import 14%, transform 3%)

          Isolate  225 workers spawned · ~142ms startup each (spawn + environment, per file)
                   at least ~10.53s faster with isolate: false — reuses workers across files instead of one per file


      > data-dashboard@1.2.0 audit
      > npm audit --audit-level=high --omit=dev && npm audit --audit-level=critical

      found 0 vulnerabilities
      found 0 vulnerabilities
    at: "2026-10-21T20:41:44Z"
    tree: 758c3436bed73fe182ae4b1eb55a7c3d595cbc1c821dea4d255442bf916e713b
  audit:
    at: "2026-10-21T20:41:48Z"
    passed: true
    tree: 758c3436bed73fe182ae4b1eb55a7c3d595cbc1c821dea4d255442bf916e713b
    results:
      - name: osv-scanner (dependencies, offline db)
        exit_code: 0
        summary: |-
          Scanning dir .
          Starting filesystem walk for root: /
          Scanned /home/user/data-dashboard/package-lock.json file and found 836 packages
          End status: 528 dirs visited, 5148 inodes visited, 1 Extract calls, 231.927037ms elapsed, 231.927279ms wall time
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
Ditemukan saat T-074: tests/e2e/sharing.spec.ts:1849 ('peringatan kolom filter … #kolom-filter', bagian Ctrl+Z di dialog Bagikan) gagal deterministik di HEAD 1ad5b22 tanpa perubahan T-074 (diverifikasi dengan git stash, 2/2 run): setelah closeShare halaman berada di /dashboards (daftar) sehingga widget 'Urungkan nanti' tidak ditemukan. Cari apakah aplikasi bernavigasi (mis. Escape/Back, refresh akses) atau tesnya salah; perbaiki akarnya.

## Acceptance criteria
- [x] Given --project=sharing dijalankan dua kali berturut-turut, then semua tes lulus tanpa waitForTimeout baru

## Risk
Impact: penanganan Ctrl/Cmd+Z, Ctrl+Y, Ctrl/Cmd+Shift+Z di kanvas mode edit — di luar kolom teks bawaan
peramban kini dicegah; urungkan kanvas dan urungkan di dalam kolom teks tidak berubah.
Security (STRIDE): T (tampering) — mencegah perubahan data (judul widget) yang tidak disengaja; tanpa
perubahan otorisasi/server.
Rollback: revert commit perbaikan (dashboard-canvas.tsx + uji).
Validation: uji unit tests/components/native-undo-guard.test.ts; e2e --project=sharing dua kali berturut-turut.

## Notes
- Diagnosis T-075 (2026-10-21, belum diperbaiki): direproduksi (--project=sharing, 25 lulus, 1 gagal di
  :1849). Halaman TIDAK bernavigasi ke /dashboards — snapshot error-context diambil dari halaman lain di
  konteks (tes memakai halaman bersama `a`, bukan fixture `page`). Trace jaringan: tepat saat "Bagikan"
  diklik dengan panel widget baru "Urungkan nanti" masih terbuka, klien mengirim
  PATCH /api/dashboards/<d>/widgets/<w> {"title":""} (sesudah PATCH judul "Urungkan nanti" dan PATCH
  type) → judul widget terhapus, jadi widgetTitled(...) = 0. Satu-satunya pengirim judul adalah
  WidgetPanel.saveTitle (onBlur input Judul); state `title` panel bernilai "" saat blur — kemungkinan panel
  dipasang ulang dengan props widget basi (judul "") lalu input kehilangan fokus. Ini bug kehilangan data
  (judul) di aplikasi, bukan hanya tes. Langkah berikut: reproduksi dengan tes kecil (tambah widget, isi
  judul + Enter, pilih jenis, klik Bagikan, cek PATCH), cari pemicu pasang ulang (AccessRefreshProvider
  stateKey / refresh setelah aksi server listShares) dan buat saveTitle hanya mengirim bila input pernah
  diubah pengguna sejak pasang.
- Akar masalah (T-ev34, 2026-10-21): panel TIDAK dipasang ulang. Log konsol di trace: input Judul menerima
  onChange "" tepat saat tes menekan Ctrl+Z dengan fokus di Select peran dialog Bagikan. Urungkan BAWAAN
  Chrome berlaku untuk seluruh dokumen, jadi mengurungkan ketikan (fill) di kolom Judul yang tidak
  difokus → kolom kosong, fokus berpindah ke sana, FocusScope Radix mengembalikan fokus ke dialog → blur
  → saveTitle mengirim {"title":""}. Ini bug kehilangan data nyata (pengguna menekan Ctrl+Z di dialog
  atau di tombol kanvas saat kanvas tidak punya langkah urungkan).
- Perbaikan: isStrayNativeUndo (dashboard-canvas.tsx) — Ctrl/Cmd+Z, Ctrl+Y, Ctrl/Cmd+Shift+Z yang
  targetnya bukan kolom teks (input teks, textarea, contenteditable) dicegah bawaannya di pendengar
  keydown kanvas mode edit; urungkan kanvas tetap lewat isCanvasUndo. Judul kosong tetap nilai sah
  ("Widget tanpa judul") jadi server tidak diubah; tes sharing :1849 tidak diubah (sudah menguji ini).

## Security checklist (OWASP ASVS 4.0.3)
<!-- Check each item when verified, or write "N/A: <reason>" after the text and check it. -->
- [x] V1 Architecture: trust boundaries and the components handling sensitive data are identified for this change — N/A: hanya penanganan tombol keyboard di klien (mencegah urungkan bawaan peramban); tidak ada input, data, endpoint, atau konfigurasi baru.
- [x] V2 Authentication: credentials are verified server-side; no default, hard-coded, or weak secrets — N/A: hanya penanganan tombol keyboard di klien (mencegah urungkan bawaan peramban); tidak ada input, data, endpoint, atau konfigurasi baru.
- [x] V3 Session management: session tokens are random, protected, invalidated on logout and expiry — N/A: hanya penanganan tombol keyboard di klien (mencegah urungkan bawaan peramban); tidak ada input, data, endpoint, atau konfigurasi baru.
- [x] V4 Access control: every endpoint/action checks authorization server-side, deny by default (no IDOR) — N/A: hanya penanganan tombol keyboard di klien (mencegah urungkan bawaan peramban); tidak ada input, data, endpoint, atau konfigurasi baru.
- [x] V5 Validation, sanitization and encoding: all input validated; output encoded; no injection (SQL, OS, template) — N/A: hanya penanganan tombol keyboard di klien (mencegah urungkan bawaan peramban); tidak ada input, data, endpoint, atau konfigurasi baru.
- [x] V6 Stored cryptography: sensitive data at rest uses approved algorithms; keys are not in the code — N/A: hanya penanganan tombol keyboard di klien (mencegah urungkan bawaan peramban); tidak ada input, data, endpoint, atau konfigurasi baru.
- [x] V7 Error handling and logging: errors reveal no internals; security events are logged without secrets — N/A: hanya penanganan tombol keyboard di klien (mencegah urungkan bawaan peramban); tidak ada input, data, endpoint, atau konfigurasi baru.
- [x] V8 Data protection: personal/sensitive data is minimized, not cached or logged, and removable — N/A: hanya penanganan tombol keyboard di klien (mencegah urungkan bawaan peramban); tidak ada input, data, endpoint, atau konfigurasi baru.
- [x] V9 Communication: TLS for all external traffic; certificates validated — N/A: hanya penanganan tombol keyboard di klien (mencegah urungkan bawaan peramban); tidak ada input, data, endpoint, atau konfigurasi baru.
- [x] V10 Malicious code: no backdoors, time bombs, or unexplained network calls; dependencies are trusted — N/A: hanya penanganan tombol keyboard di klien (mencegah urungkan bawaan peramban); tidak ada input, data, endpoint, atau konfigurasi baru.
- [x] V11 Business logic: flows cannot be abused (limits, ordering, replay, race conditions) — Terverifikasi: urungkan bawaan peramban di luar kolom teks tidak lagi bisa mengosongkan judul widget diam-diam (uji unit native-undo-guard + e2e sharing :1849).
- [x] V12 Files and resources: uploads are type/size limited and stored safely; no path traversal or SSRF — N/A: hanya penanganan tombol keyboard di klien (mencegah urungkan bawaan peramban); tidak ada input, data, endpoint, atau konfigurasi baru.
- [x] V13 API and web service: API inputs/outputs are schema-validated; CORS and rate limits are deliberate — N/A: hanya penanganan tombol keyboard di klien (mencegah urungkan bawaan peramban); tidak ada input, data, endpoint, atau konfigurasi baru.
- [x] V14 Configuration: secure defaults, security headers, no debug in production, dependencies up to date — N/A: hanya penanganan tombol keyboard di klien (mencegah urungkan bawaan peramban); tidak ada input, data, endpoint, atau konfigurasi baru.
