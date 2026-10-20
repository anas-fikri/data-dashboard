---
id: T-042
title: Pisahkan batas laju, slot, dan cache grid dari query widget
status: in_progress
profile: standard
goal: G-6
tags:
  - perf
  - security
depends_on:
  - T-041
created: "2026-10-15T02:30:56Z"
updated: "2026-10-20T06:33:10Z"
created_by: claude-code
workers:
  - claude-code
branch: claude/intelligent-albattani-fd1va8
base: ae4e5a271e11f802d384b932e332d8977cec41e6
evidence:
  check:
    cmd: npm run check
    exit_code: 0
    duration_ms: 171858
    summary: |-
      …t
      > vitest run


       RUN  v5.0.3 /home/user/data-dashboard

      {"level":40,"time":1792477940423,"service":"data-dashboard","host":"127.0.0.1","port":41713,"step":"membuka folder","code":2,"err":"No such file or directory","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":40,"time":1792477940487,"service":"data-dashboard","host":"127.0.0.1","port":32933,"err":"Unable to start subsystem: sftp","msg":"subsistem SFTP ditolak NAS"}
      {"level":40,"time":1792477940593,"service":"data-dashboard","host":"127.0.0.1","port":44201,"step":"menghapus file uji","code":4,"err":"Failure","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":40,"time":1792477940700,"service":"data-dashboard","host":"127.0.0.1","port":36379,"step":"menulis file uji","code":4,"err":"Failure","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":40,"time":1792477947860,"service":"data-dashboard","err":"Can't reach database server","msg":"sesi shell gagal dibaca"}
      {"level":40,"time":1792477954527,"service":"data-dashboard","check":"B","detail":"koneksi ditolak","msg":"health check gagal"}
      {"level":40,"time":1792477954549,"service":"data-dashboard","check":"Lambat","detail":"Lambat: timeout 20 ms","msg":"health check gagal"}
      {"level":40,"time":1792477954552,"service":"data-dashboard","check":"Y","detail":"mati","msg":"health check gagal"}
      {"level":40,"time":1792477954560,"service":"data-dashboard","check":"Renderer PDF","detail":"renderer tidak menjawab /healthz","msg":"health check gagal"}

       Test Files  166 passed | 1 skipped (167)
            Tests  2144 passed | 10 skipped (2154)
         Start at  06:31:05
         Duration  123.51s (tests 86%, import 12%, transform 2%)

          Isolate  167 workers spawned · ~142ms startup each (spawn + environment, per file)
                   at least ~7.78s faster with isolate: false — reuses workers across files instead of one per file


      > data-dashboard@0.1.0 audit
      > npm audit --audit-level=high --omit=dev && npm audit --audit-level=critical

      found 0 vulnerabilities
      found 0 vulnerabilities
    at: "2026-10-20T06:33:10Z"
    tree: 640a70f83eff004125a6bfa01942342e488a1622eb67e7c8eaf10a648b455b50
  audit:
    at: "2026-10-20T06:26:27Z"
    passed: true
    tree: 2402aa4703582846fdd4ee01a3423753870eea1a9a74163d9cf8e5f17dbada1c
    results:
      - name: osv-scanner (dependencies, offline db)
        exit_code: 0
        summary: |-
          Scanning dir .
          Starting filesystem walk for root: /
          Scanned /home/user/data-dashboard/package-lock.json file and found 832 packages
          End status: 385 dirs visited, 1877 inodes visited, 1 Extract calls, 199.08613ms elapsed, 199.086359ms wall time
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
Bagian rencana docs/ai/plans/2026-10-15-tampilan-excel-dan-data-periode.md — P-10, Fase 2. Perkiraan 1,5 hari. Baca bagian rencana yang relevan (§3 Lihat data, §4 periode, §5 batas, §6 risiko) sebelum mulai; cek ulang kontrak T-016 (otorisasi) dan T-017 (ekspor) sesuai risiko R21.

## Acceptance criteria
- [x] Given pengguna menggulir sampai 300 permintaan/menit, when dashboard miliknya dimuat bersamaan, then widget tidak terkena RATE_LIMITED karena aturan rate grid terpisah
- [x] Given permintaan grid, then grid memakai maksimal 2 dari 4 slot global dan 2 in-flight per pengguna, dan blok grid tidak masuk cache hasil 64 MiB (hanya count dan ringkasan)
- [x] Given 5 pengguna menggulir sheet 10 jt + dashboard 6 widget, then p95 widget ≤ 2× baseline T-012 dan tidak ada QUERY_BUSY pada widget

## Risk
- Impact: route `POST /api/sheets/:id/rows` dan `GET /api/sheets/:id/cell` (aturan rate `grid:user`, mesin lewat GridGate), tipe `CachedQuery` (varian `gridCount`), env baru opsional `GRID_MAX_CONCURRENCY` (default 2). Query widget, ekspor (T-017) dan otorisasi (T-016) tidak berubah; widget tetap memakai `RULES.query` dan jatah mesin biasa.
- Security (STRIDE): DoS — penggulir dibatasi 300/menit/user, 2 in-flight/user (lebih → 429 QUERY_BUSY langsung), ≤ 2 dari 4 slot global; Information disclosure — kunci count memuat versionId + sheetId + schemaRevision + saringan, dan count hanya dibaca setelah otorisasi pemilik/editor; tidak ada blok baris di cache lintas user.
- Rollback: revert commit T-042 (tanpa migrasi; env baru opsional).
- Validation: unit grid-gate (4), grid-http (2), grid count-cache (1); e2e `grid` 2/2; perf `--load` docs/ai/perf/T-042.md (p95 widget 1,48× baseline, 0 QUERY_BUSY).

## Notes
- Gerbang grid tidak memakai jatah per-user mesin (2), jadi pengguna yang menggulir tidak membuat widget dashboard-nya sendiri antre. Grid memegang slot grid lalu slot global mesin (sisa waktu antre dibagi).
- `GRID_RATE_PER_MIN` di rencana diwujudkan sebagai konstanta `RULES.grid` (300/menit), sama dengan aturan rate lain (bukan env).
- Count jalur urut/saring/cari di-cache di cache hasil yang ada (≈64 byte/entri, TTL 24 jam); jalur tanpa urut tidak perlu count (dari manifest). "Ringkasan" (stats) belum ada endpoint-nya (P-12+); akan memakai pola yang sama.
- Review M1: permintaan grid yang dibatalkan klien saat antre slot grid dicabut segera (signal HTTP diteruskan ke GridGate), sehingga jatah in-flight user langsung lepas. Review L2: gerbang dibuat malas bila runtime global lama (sebelum hot reload) belum memilikinya.
- Batas yang diketahui (review L1): dengan MAX_QUERY_CONCURRENCY=1 grid bisa memegang satu-satunya slot global (maxGlobal minimal 1); produksi memakai 4. Review L4: slot dan in-flight grid berlaku per proses/replika aplikasi (seperti slot query); rate limit grid di Redis berlaku global.
- AC3 diukur di container cloud 4 vCPU (bukan VM T-023); ulang di olympus pada P-29.

## Security checklist (OWASP ASVS 4.0.3)
<!-- Check each item when verified, or write "N/A: <reason>" after the text and check it. -->
- [x] V1 Architecture: trust boundaries and the components handling sensitive data are identified for this change — verified: alur route grid → GridGate → QueryEngine; otorisasi tetap di grid-service authorize()
- [x] V2 Authentication: credentials are verified server-side; no default, hard-coded, or weak secrets — N/A — tidak menyentuh autentikasi (withUser/requireUser tetap)
- [x] V3 Session management: session tokens are random, protected, invalidated on logout and expiry — N/A — tidak menyentuh sesi
- [x] V4 Access control: every endpoint/action checks authorization server-side, deny by default (no IDOR) — verified: count cache dibaca hanya setelah authorize() pemilik/editor; kunci memuat versionId+sheetId
- [x] V5 Validation, sanitization and encoding: all input validated; output encoded; no injection (SQL, OS, template) — verified: tidak ada input baru; body tetap zod rowsBodySchema
- [x] V6 Stored cryptography: sensitive data at rest uses approved algorithms; keys are not in the code — N/A — tidak ada data tersimpan terenkripsi
- [x] V7 Error handling and logging: errors reveal no internals; security events are logged without secrets — verified: QUERY_BUSY/RATE_LIMITED berpesan umum tanpa nama kolom/sheet
- [x] V8 Data protection: personal/sensitive data is minimized, not cached or logged, and removable — verified: blok baris tidak di-cache; hanya angka count
- [x] V9 Communication: TLS for all external traffic; certificates validated — N/A — tidak ada lalu lintas eksternal baru
- [x] V10 Malicious code: no backdoors, time bombs, or unexplained network calls; dependencies are trusted — verified: tanpa dependensi baru
- [x] V11 Business logic: flows cannot be abused (limits, ordering, replay, race conditions) — verified: batas in-flight per user + slot global grid; uji grid-gate (slot tidak bocor saat timeout)
- [x] V12 Files and resources: uploads are type/size limited and stored safely; no path traversal or SSRF — N/A — tidak ada file/unggahan
- [x] V13 API and web service: API inputs/outputs are schema-validated; CORS and rate limits are deliberate — verified: rate limit grid:user 300/menit terpisah (uji grid-http)
- [x] V14 Configuration: secure defaults, security headers, no debug in production, dependencies up to date — verified: default aman GRID_MAX_CONCURRENCY=2 dipotong ke MAX_QUERY_CONCURRENCY−1
