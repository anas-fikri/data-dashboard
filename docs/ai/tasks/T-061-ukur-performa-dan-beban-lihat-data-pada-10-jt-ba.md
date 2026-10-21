---
id: T-061
title: Ukur performa dan beban Lihat data pada 10 jt baris
status: in_progress
profile: standard
goal: G-6
tags:
  - perf
depends_on:
  - T-044
  - T-042
  - T-023
  - T-024
created: "2026-10-15T02:30:59Z"
updated: "2026-10-21T01:08:28Z"
created_by: claude-code
workers:
  - claude-code
branch: claude/intelligent-albattani-fd1va8
base: 69fdcf71beaf4a31ba447df1fe8f09694b9906ec
evidence:
  check:
    cmd: npm run check
    exit_code: 0
    duration_ms: 227403
    summary: |-
      …t
      > vitest run


       RUN  v5.0.3 /home/user/data-dashboard

      {"level":40,"time":1792544861685,"service":"data-dashboard","host":"127.0.0.1","port":46467,"step":"membuka folder","code":2,"err":"No such file or directory","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":40,"time":1792544861744,"service":"data-dashboard","host":"127.0.0.1","port":39427,"err":"Unable to start subsystem: sftp","msg":"subsistem SFTP ditolak NAS"}
      {"level":40,"time":1792544861839,"service":"data-dashboard","host":"127.0.0.1","port":38485,"step":"menghapus file uji","code":4,"err":"Failure","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":40,"time":1792544861941,"service":"data-dashboard","host":"127.0.0.1","port":37757,"step":"menulis file uji","code":4,"err":"Failure","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":40,"time":1792544872980,"service":"data-dashboard","err":"Can't reach database server","msg":"sesi shell gagal dibaca"}
      {"level":40,"time":1792544878680,"service":"data-dashboard","check":"B","detail":"koneksi ditolak","msg":"health check gagal"}
      {"level":40,"time":1792544878701,"service":"data-dashboard","check":"Lambat","detail":"Lambat: timeout 20 ms","msg":"health check gagal"}
      {"level":40,"time":1792544878707,"service":"data-dashboard","check":"Y","detail":"mati","msg":"health check gagal"}
      {"level":40,"time":1792544878718,"service":"data-dashboard","check":"Renderer PDF","detail":"renderer tidak menjawab /healthz","msg":"health check gagal"}

       Test Files  201 passed | 1 skipped (202)
            Tests  2660 passed | 10 skipped (2670)
         Start at  01:06:02
         Duration  144.94s (tests 82%, import 15%, transform 3%)

          Isolate  202 workers spawned · ~147ms startup each (spawn + environment, per file)
                   at least ~9.75s faster with isolate: false — reuses workers across files instead of one per file


      > data-dashboard@0.1.0 audit
      > npm audit --audit-level=high --omit=dev && npm audit --audit-level=critical

      found 0 vulnerabilities
      found 0 vulnerabilities
    at: "2026-10-21T01:08:28Z"
    tree: 3b7c1a4d4e1d11b53131c5efdda8dd0d6aaec6379be20f3e9ceab187e6e8545b
  audit:
    at: "2026-10-21T00:54:02Z"
    passed: true
    tree: d1053008f196433b09094aed14780791612aad7c3b798f4d4d66ffcea4075650
    results:
      - name: osv-scanner (dependencies, offline db)
        exit_code: 0
        summary: |-
          Scanning dir .
          Starting filesystem walk for root: /
          Scanned /home/user/data-dashboard/package-lock.json file and found 836 packages
          End status: 516 dirs visited, 3858 inodes visited, 1 Extract calls, 220.701972ms elapsed, 220.702115ms wall time
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
Ukur "Lihat data" pada 10 jt × 30 kolom (dan 13 jt untuk Q2) terhadap target §3.6 rencana G-6: blok tanpa urut,
blok pertama urut/saring, "Ke baris", blok dalam urut teks (penentu P-30), dan isolasi beban 5 penggulir +
dashboard 6 widget; sediakan perintah ulang ukur yang sama untuk pemilik di VM. Bagian rencana docs/ai/plans/2026-10-15-tampilan-excel-dan-data-periode.md — P-29, Fase 4. Perkiraan 2 hari. Baca bagian rencana yang relevan (§3 Lihat data, §4 periode, §5 batas, §6 risiko) sebelum mulai; cek ulang kontrak T-016 (otorisasi) dan T-017 (ekspor) sesuai risiko R21.

## Acceptance criteria
- [ ] Given profil T-023 dan fixture 10 jt × 30 kolom dengan cache hangat, when npm run perf skenario grid dijalankan, then laporan mencatat p95 blok tanpa urut ≤ 300 ms server / ≤ 500 ms tampil, blok pertama urut/saring ≤ 3 detik, 'Ke baris' ≤ 1 detik, dan waktu blok dalam urut teks
- [ ] Given 5 pengguna menggulir + dashboard 6 widget, then p95 widget ≤ 2× baseline, tanpa QUERY_TIMEOUT/QUERY_BUSY pada widget
- [x] Given fixture 13 jt baris, then angka yang sama tercatat sebagai dasar keputusan menaikkan PERIOD_SHEET_MAX_ROWS
- [x] Given blok dalam terurut p95 > 2 detik, then P-30 diaktifkan; bila tidak, P-30 ditutup tanpa dikerjakan

## Risk
(Required for strict profile. Impact:, Security (STRIDE):, Rollback:, Validation:)

## Notes
- 2026-10-21 (claude-code, container cloud 4 vCPU Xeon 2,1 GHz/16 GB, BUKAN VM T-023). Bukti:
  docs/ai/perf/T-061.md + docs/ai/perf/T-061/ (JSON mentah). Alat: `npm run perf -- grid` (scripts/perf-grid.ts,
  data bersama scripts/perf-grid-data.ts), scripts/dev-grid-perf-seed.ts + scripts/perf-grid-http.mjs (HTTP +
  Chromium), scripts/perf-grid-vm.sh (ulang ukur pemilik di stack uji olympus). Tanpa perubahan kode aplikasi.
- AC1 (belum dicentang, butuh profil T-023): blok tanpa urut p95 server 31–74 ms (HTTP dev 170 ms), "Ke baris"
  ±9 jt tampil p95 379 ms, gulir sampai tampil p95 544 ms (dev server, target 500), blok pertama urut 2,6–3,3 s
  p95 (batas 3 s; kolom desimal berganti 3,3 s, saring+urut 3,0 s), blok dalam urut teks p95 6,0 s. ±2 s blok
  urut = tahap ambil isi 30 kolom untuk 200 `_row` acak (dekompresi semua row group), bukan bug kecil.
- AC2 (dicentang lalu DIBATALKAN manual 2026-10-21 setelah review — aitk tidak punya perintah un-mark;
  menunggu run VM): gulir polos lolos — rasio p95 widget 1,21 (jalur server) / 1,68 (HTTP), 0 QUERY_BUSY/QUERY_TIMEOUT widget.
  Varian stres (5 penggulir di blok dalam urut teks) 2,17 / 2,25 dengan GRID_MAX_CONCURRENCY=2; dengan 1 slot
  grid 1,67. Rekomendasi VM 4 vCPU: GRID_MAX_CONCURRENCY=1 (bawaan tidak diubah; putuskan dari run VM).
  Varian: polos 2 slot LOLOS (1,21 / 1,68); polos 1 slot LOLOS (1,04); urut teks dalam 2 slot (bawaan) GAGAL
  (2,17 server / 2,25 HTTP; 13 jt 2,20); urut teks dalam 1 slot LOLOS (1,67). Bawaan compose tidak diubah ke 1
  karena olympus 8 vCPU dan biaya blok grid di bawah beban naik (p95 389 → 587 ms); putuskan dari angka VM
  (perf-grid-vm.sh mengukur kedua setelan).
- AC3: 13 jt (13 segmen × 1 jt) tercatat: urut/saring+urut blok pertama 3,1–3,9 s (> 3 s), blok dalam urut teks
  7,9 s, rasio beban polos 1,24 → jangan naikkan PERIOD_SHEET_MAX_ROWS di 4 vCPU sebelum run VM/T-062.
- AC4: blok dalam urut teks p95 6,0 s > 2 s → P-30 (T-062) diaktifkan; catatan batas tahap ambil dicatat di T-062.
- Sisa (pemilik): `bash deploy/perf-stack.sh up 6 && bash scripts/perf-grid-vm.sh hasil-T-061 30 && bash
  deploy/perf-stack.sh down`, salin hasil ke docs/ai/perf/T-061-olympus/, nilai AC1 dari angka VM.

## Security checklist (OWASP ASVS 4.0.3)
<!-- Check each item when verified, or write "N/A: <reason>" after the text and check it. -->
- [x] V1 Architecture: trust boundaries and the components handling sensitive data are identified for this change — hanya skrip perf/dev; batas kepercayaan aplikasi tidak berubah. dev-grid-perf-seed menulis langsung ke DB+storage dan menolak NODE_ENV=production (di VM hanya untuk stack uji dashboard-perftest, NODE_ENV=test)
- [x] V2 Authentication: credentials are verified server-side; no default, hard-coded, or weak secrets — perf-grid-http login lewat /api/auth/login sungguhan dengan akun dari users.json (dibuat dev-create-user/perf-stack, password acak, tidak di-commit); tidak ada kredensial di skrip/bukti
- [x] V3 Session management: session tokens are random, protected, invalidated on logout and expiry N/A: logika sesi tidak berubah
- [x] V4 Access control: every endpoint/action checks authorization server-side, deny by default (no IDOR) — tidak ada endpoint baru; penggulir uji memakai akses EDITOR lewat DashboardShare sungguhan, jadi otorisasi grid (pemilik/editor) ikut teruji
- [x] V5 Validation, sanitization and encoding: all input validated; output encoded; no injection (SQL, OS, template) — SQL skrip hanya dari konstanta/angka argumen sendiri (generator DuckDB), bukan input pengguna; permintaan grid lewat skema zod aplikasi
- [x] V6 Stored cryptography: sensitive data at rest uses approved algorithms; keys are not in the code N/A: tidak ada data/kunci kriptografi baru
- [x] V7 Error handling and logging: errors reveal no internals; security events are logged without secrets — keluaran perf hanya angka, id dataset, dan email akun uji di stdout lokal; bukti yang di-commit diperiksa tanpa email/password
- [x] V8 Data protection: personal/sensitive data is minimized, not cached or logged, and removable — data perf sintetis (tanpa data pribadi); scratch dihapus di akhir perf-grid-vm.sh; dataset uji ada di stack uji yang dibongkar perf-stack.sh down
- [x] V9 Communication: TLS for all external traffic; certificates validated N/A: tidak ada lalu lintas eksternal baru; run VM lewat proxy TLS stack uji (ignoreHTTPSErrors hanya di klien uji, sama dengan perf-e2e.mjs)
- [x] V10 Malicious code: no backdoors, time bombs, or unexplained network calls; dependencies are trusted — tanpa dependensi baru; skrip hanya memanggil PERF_BASE yang diberikan
- [x] V11 Business logic: flows cannot be abused (limits, ordering, replay, race conditions) — tidak ada alur aplikasi baru; klien uji mematuhi rate limit grid (≤ 280/menit per akun)
- [x] V12 Files and resources: uploads are type/size limited and stored safely; no path traversal or SSRF — seed mengunggah parquet buatan sendiri ke kunci segmen standar (segmentPrefix tervalidasi id); tidak ada path dari input pengguna
- [x] V13 API and web service: API inputs/outputs are schema-validated; CORS and rate limits are deliberate — API tidak berubah; rate limit grid/query dipertahankan dan diukur
- [x] V14 Configuration: secure defaults, security headers, no debug in production, dependencies up to date — bawaan konfigurasi tidak diubah (GRID_MAX_CONCURRENCY=1 hanya rekomendasi untuk VM 4 vCPU); npm audit lewat aitk audit
