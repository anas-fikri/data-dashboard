---
id: T-1zdf
title: Perbaiki e2e widgets AC 2 KPI Rupiah yang gagal
status: done
profile: standard
created: "2026-10-21T11:40:02Z"
updated: "2026-10-21T12:44:12Z"
closed: "2026-10-21T12:44:12Z"
created_by: claude-code
workers:
  - claude-code
branch: claude/intelligent-albattani-fd1va8
base: 8ce72cf62cc3dda3ea61b9a6b114b84505908aa5
paths:
  - src/components/dashboards/dashboard-canvas.tsx
  - src/components/dashboards/use-grid-width.ts
  - tests/e2e/dashboards.spec.ts
  - tests/e2e/widgets.spec.ts
review:
  passes:
    - "n": 1
      by: claude-reviewer-subagent
      at: "2026-10-21T12:40:15Z"
      findings: 2
    - "n": 2
      by: claude-code
      at: "2026-10-21T12:40:15Z"
      findings: 0
evidence:
  check:
    cmd: npm run check
    exit_code: 0
    duration_ms: 208616
    summary: |-
      …: disk penuh","msg":"cache urutan grid gagal dibangun"}
      {"level":40,"time":1792586580464,"service":"data-dashboard","host":"127.0.0.1","port":35669,"step":"membuka folder","code":2,"err":"No such file or directory","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":40,"time":1792586580520,"service":"data-dashboard","host":"127.0.0.1","port":44977,"err":"Unable to start subsystem: sftp","msg":"subsistem SFTP ditolak NAS"}
      {"level":40,"time":1792586580619,"service":"data-dashboard","host":"127.0.0.1","port":33111,"step":"menghapus file uji","code":4,"err":"Failure","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":40,"time":1792586580727,"service":"data-dashboard","host":"127.0.0.1","port":35441,"step":"menulis file uji","code":4,"err":"Failure","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":40,"time":1792586593765,"service":"data-dashboard","err":"Can't reach database server","msg":"sesi shell gagal dibaca"}
      {"level":40,"time":1792586604946,"service":"data-dashboard","check":"B","detail":"koneksi ditolak","msg":"health check gagal"}
      {"level":40,"time":1792586604969,"service":"data-dashboard","check":"Lambat","detail":"Lambat: timeout 20 ms","msg":"health check gagal"}
      {"level":40,"time":1792586604972,"service":"data-dashboard","check":"Y","detail":"mati","msg":"health check gagal"}
      {"level":40,"time":1792586604986,"service":"data-dashboard","check":"Renderer PDF","detail":"renderer tidak menjawab /healthz","msg":"health check gagal"}

       Test Files  208 passed | 1 skipped (209)
            Tests  2729 passed | 10 skipped (2739)
         Start at  12:41:16
         Duration  147.45s (tests 84%, import 13%, transform 3%)

          Isolate  209 workers spawned · ~159ms startup each (spawn + environment, per file)
                   at least ~10.94s faster with isolate: false — reuses workers across files instead of one per file


      > data-dashboard@1.1.0 audit
      > npm audit --audit-level=high --omit=dev && npm audit --audit-level=critical

      found 0 vulnerabilities
      found 0 vulnerabilities
    at: "2026-10-21T12:43:45Z"
    tree: 24a81b0ce6f49e46e2896bda662e7ffb8ad3336821c93df4551570379a37fba2
  commits:
    - c4a56e5
  acceptance:
    total: 1
    done: 1
  audit:
    at: "2026-10-21T12:43:45Z"
    passed: true
    tree: 24a81b0ce6f49e46e2896bda662e7ffb8ad3336821c93df4551570379a37fba2
    results:
      - name: osv-scanner (dependencies, offline db)
        exit_code: 0
        summary: |-
          Scanning dir .
          Starting filesystem walk for root: /
          Scanned /home/user/data-dashboard/package-lock.json file and found 836 packages
          End status: 519 dirs visited, 4381 inodes visited, 1 Extract calls, 255.922929ms elapsed, 255.923282ms wall time
          Loaded npm local db from /root/.cache/osv-scalibr/npm/all.zip

          No issues found
      - name: npm audit (prod high, dev critical)
        exit_code: 0
        summary: |-
          > data-dashboard@1.1.0 audit
          > npm audit --audit-level=high --omit=dev && npm audit --audit-level=critical

          found 0 vulnerabilities
          found 0 vulnerabilities
      - name: aitk secret scan (tracked files)
        exit_code: 0
---

## Objective
Project e2e `widgets` gagal di "AC 2 KPI Rupiah" bila dijalankan utuh (5 tes sesudahnya tidak jalan); sudah gagal di a4869d3. Temukan akar masalah (bug aplikasi atau tes usang), perbaiki tanpa melemahkan tes, dan pastikan semua 7 tes project lulus.

## Acceptance criteria
- [x] Given suite e2e project widgets dijalankan utuh, then semua tes lulus termasuk AC 2 KPI Rupiah dan 5 tes sesudahnya

## Risk
Impact: lebar grid dashboard (semua halaman dashboard layar ≥ 768 px). Pengukuran saat muat halaman sama dengan pustaka (effect pertama, lalu ResizeObserver); bedanya hanya kontainer yang muncul belakangan (dashboard kosong → widget pertama) kini ikut diukur dan diamati.
Security (STRIDE): tidak ada — hanya tata letak klien, tanpa data/izin/endpoint baru.
Rollback: revert commit T-1zdf (kembali ke `useContainerWidth` pustaka).
Validation: e2e widgets 7/7 (3 run), dashboards.spec 11 lulus kecuali race klik yang juga gagal di HEAD (T-z8y2), regresi lebar kartu gagal tanpa perbaikan (selisih 154,7 px) dan lulus dengan perbaikan; kpi-fit 5/6 sama dengan HEAD (4/4 run; tes cetak gagal juga di HEAD → T-w764); chart-polish 9/9; aitk check lulus.

## Notes
Akar masalah (dua):
1. **Bug aplikasi** — `useContainerWidth` react-grid-layout mulai dari 1280 px dan hanya mengukur + memasang ResizeObserver di effect saat komponen dipasang. Di dashboard kosong div kontainer belum dirender (CanvasEmpty), jadi setelah widget pertama ditambah grid tetap 1280 px: kartu w=4 selebar 416 px di kanvas 816 px (panel terbuka), dan grid tidak mengikuti perubahan ukuran sampai muat ulang. Perbaikan: `src/components/dashboards/use-grid-width.ts` (ref callback; effect jalan ulang saat kontainer berganti; pengukuran pertama tetap di effect yang sama dengan pustaka agar kotak KPI tidak mengukur kartu 1280 px — varian yang mengukur satu render terlambat membuat kpi-fit 1024 px goyah). Regresi: dashboards.spec AC 1 memeriksa lebar kartu pertama = 4/12 kanvas.
2. **Tes usang** — AC 2 lulus hanya bila dijalankan sendiri, karena bug no. 1 membuat kartu KPI 416 px sehingga bentuk lengkap muat. Dijalankan utuh (AC 1 membuat widget pertama di muatan halaman sebelumnya) kartu KPI benar 261 px dan kpi-fit (desain review T-011) menampilkan bentuk ringkas "Rp 1,23 jt"; nilai lengkap "Rp 1.234.568" tetap di title dan teks pembaca layar. Tes kini memeriksa kontrak itu: title persis "Rp\u00201.234.568" (U+0020), aria snapshot paragraf "Rp 1.234.568", dan teks tampil salah satu dari bentuk lengkap/ringkas — juga setelah urungkan hapus.

Di luar cakupan (gagal juga di HEAD): T-z8y2 (dashboards.spec klik Pengaturan sesaat setelah muat), T-w764 (kpi-fit tes cetak terpotong 1 px). Project `pdf` tidak bisa jalan di kontainer cloud ini (renderer Chromium sebagai root tanpa --no-sandbox) — lingkungan, bukan kode.

## Security checklist (OWASP ASVS 4.0.3)
<!-- Check each item when verified, or write "N/A: <reason>" after the text and check it. -->
- [x] V1 Architecture: trust boundaries and the components handling sensitive data are identified for this change — N/A: hanya pengukuran lebar tata letak di klien dan tes; tidak ada batas kepercayaan atau data sensitif baru
- [x] V2 Authentication: credentials are verified server-side; no default, hard-coded, or weak secrets — N/A: tidak menyentuh autentikasi; tes memakai helper akun uji yang ada tanpa password asli
- [x] V3 Session management: session tokens are random, protected, invalidated on logout and expiry — N/A: tidak menyentuh sesi
- [x] V4 Access control: every endpoint/action checks authorization server-side, deny by default (no IDOR) — N/A: tidak ada endpoint/aksi baru; otorisasi server tidak berubah
- [x] V5 Validation, sanitization and encoding: all input validated; output encoded; no injection (SQL, OS, template) — N/A: tidak ada input pengguna baru; tidak ada keluaran HTML baru (React tetap meng-encode)
- [x] V6 Stored cryptography: sensitive data at rest uses approved algorithms; keys are not in the code — N/A: tidak ada data tersimpan/kriptografi
- [x] V7 Error handling and logging: errors reveal no internals; security events are logged without secrets — N/A: tidak ada penanganan galat atau log baru
- [x] V8 Data protection: personal/sensitive data is minimized, not cached or logged, and removable — N/A: tidak memproses data pribadi baru
- [x] V9 Communication: TLS for all external traffic; certificates validated — N/A: tidak ada komunikasi jaringan baru
- [x] V10 Malicious code: no backdoors, time bombs, or unexplained network calls; dependencies are trusted — N/A: tidak ada dependensi atau panggilan jaringan baru; hanya hook React lokal (ResizeObserver)
- [x] V11 Business logic: flows cannot be abused (limits, ordering, replay, race conditions) — N/A: tidak ada alur bisnis baru; perilaku simpan tata letak tidak berubah
- [x] V12 Files and resources: uploads are type/size limited and stored safely; no path traversal or SSRF — N/A: tidak ada unggahan/berkas baru
- [x] V13 API and web service: API inputs/outputs are schema-validated; CORS and rate limits are deliberate — N/A: tidak ada API baru
- [x] V14 Configuration: secure defaults, security headers, no debug in production, dependencies up to date — N/A: tidak ada konfigurasi/header baru

## Evidence
<!-- Generated by aitk close. -->
- Check: `npm run check` → exit 0 at 2026-10-21T12:43:45Z (208616 ms)
- Acceptance criteria: 1/1 satisfied
- Commits: c4a56e5
- Review pass 1 by claude-reviewer-subagent: 2 findings
- Review pass 2 by claude-code: 0 findings
