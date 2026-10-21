---
id: T-066
title: Tampilkan versi aplikasi di UI dan /health, tag image Docker dengan versi
status: in_progress
profile: standard
profile_pinned: true
goal: G-7
tags:
  - ops
  - ui
created: "2026-10-21T10:24:04Z"
updated: "2026-10-21T10:42:00Z"
created_by: claude-code
workers:
  - claude-code
branch: claude/intelligent-albattani-fd1va8
base: 14e93e40d1958f24b4f21e5f5c1acd7302d0cdca
evidence:
  check:
    cmd: npm run check
    exit_code: 0
    duration_ms: 214221
    summary: |-
      …: disk penuh","msg":"cache urutan grid gagal dibangun"}
      {"level":40,"time":1792579197869,"service":"data-dashboard","err":"Can't reach database server","msg":"sesi shell gagal dibaca"}
      {"level":40,"time":1792579205616,"service":"data-dashboard","host":"127.0.0.1","port":43573,"step":"membuka folder","code":2,"err":"No such file or directory","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":40,"time":1792579205688,"service":"data-dashboard","host":"127.0.0.1","port":36085,"err":"Unable to start subsystem: sftp","msg":"subsistem SFTP ditolak NAS"}
      {"level":40,"time":1792579205788,"service":"data-dashboard","host":"127.0.0.1","port":44449,"step":"menghapus file uji","code":4,"err":"Failure","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":40,"time":1792579205893,"service":"data-dashboard","host":"127.0.0.1","port":39829,"step":"menulis file uji","code":4,"err":"Failure","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":40,"time":1792579229248,"service":"data-dashboard","check":"B","detail":"koneksi ditolak","msg":"health check gagal"}
      {"level":40,"time":1792579229271,"service":"data-dashboard","check":"Lambat","detail":"Lambat: timeout 20 ms","msg":"health check gagal"}
      {"level":40,"time":1792579229274,"service":"data-dashboard","check":"Y","detail":"mati","msg":"health check gagal"}
      {"level":40,"time":1792579229291,"service":"data-dashboard","check":"Renderer PDF","detail":"renderer tidak menjawab /healthz","msg":"health check gagal"}

       Test Files  206 passed | 1 skipped (207)
            Tests  2704 passed | 10 skipped (2714)
         Start at  10:38:13
         Duration  151.97s (tests 85%, import 12%, transform 2%)

          Isolate  207 workers spawned · ~161ms startup each (spawn + environment, per file)
                   at least ~10.94s faster with isolate: false — reuses workers across files instead of one per file


      > data-dashboard@1.0.0 audit
      > npm audit --audit-level=high --omit=dev && npm audit --audit-level=critical

      found 0 vulnerabilities
      found 0 vulnerabilities
    at: "2026-10-21T10:40:47Z"
    tree: a74413ea8bab04c850f1421602d2b54798b068b27c618b9fb497e7930e92ea87
  audit:
    at: "2026-10-21T10:41:15Z"
    passed: true
    tree: a74413ea8bab04c850f1421602d2b54798b068b27c618b9fb497e7930e92ea87
    results:
      - name: osv-scanner (dependencies, offline db)
        exit_code: 0
        summary: |-
          Scanning dir .
          Starting filesystem walk for root: /
          Scanned /home/user/data-dashboard/package-lock.json file and found 836 packages
          End status: 519 dirs visited, 4206 inodes visited, 1 Extract calls, 247.124365ms elapsed, 247.124828ms wall time
          Loaded npm local db from /root/.cache/osv-scalibr/npm/all.zip

          No issues found
      - name: npm audit (prod high, dev critical)
        exit_code: 0
        summary: |-
          > data-dashboard@1.0.0 audit
          > npm audit --audit-level=high --omit=dev && npm audit --audit-level=critical

          found 0 vulnerabilities
          found 0 vulnerabilities
      - name: aitk secret scan (tracked files)
        exit_code: 0
---

## Objective
Rilis 1.0.0 sudah dibuat lewat aitk release, tetapi pengguna, admin, dan image Docker tidak menunjukkan versinya. Versi dibaca dari package.json saat build (satu sumber), tampil di menu akun dan /health (detail admin), dan menjadi tag image bawaan skrip deploy; rilis berikutnya per tonggak goal sebagai versi minor (v1.1.0 …). Rencana G-7 §3.5.

## Acceptance criteria
- [x] Given aplikasi dibangun dari package.json versi 1.0.0, when pengguna yang login membuka menu akun (avatar), then tampil teks 'Versi 1.0.0' (kecil, muted) di bagian bawah menu, dan nilai berasal dari package.json saat build (bukan diketik ulang di kode)
- [x] Given admin login, when membuka /health dan GET /api/health, then detail admin memuat versi aplikasi (dan commit pendek bila tersedia dari build arg); given tanpa sesi admin, then versi dan commit TIDAK tampil (publicView tetap hanya status keseluruhan)
- [x] Given deploy/images.sh build atau deploy/upgrade.sh build tanpa IMAGE_TAG eksplisit, when dijalankan, then image app/worker/renderer/backup ditandai v<versi package.json> (mis. v1.0.0), IMAGE_TAG di .env.prod diisi tag itu, dan IMAGE_TAG eksplisit tetap menang; docker-compose.prod.yml fallback latest tidak berubah
- [x] Given worker dan renderer, when start, then log pino pertama memuat field version yang sama dengan aplikasi; given unit test, then modul versi teruji dan npm run check hijau
- [x] Given docs/runbook-deploy.md dan panduan-developer.md, then tercatat alur rilis per tonggak: aitk release (minor per tonggak G-7) → build image bertag versi → upgrade.sh; tag lama tetap tersedia untuk rollback

## Risk
Impact: menu akun (semua pengguna masuk), /health + /api/health (detail admin), log start worker/renderer, Dockerfile/renderer Dockerfile (build arg APP_COMMIT di akhir stage), compose prod (args build), deploy/images.sh, deploy/upgrade.sh build, deploy/deploy.sh (APP_COMMIT saat build). Gerbang upgrade.sh lain (preflight/load/migrate/start/rollback) tidak diubah.
Security (STRIDE): Information disclosure — versi/commit hanya untuk sesi admin di /health (publicView) dan pengguna masuk di menu akun; publik tetap {status, checkedAt} (unit + e2e). Tampering — APP_COMMIT divalidasi heksa 7–40 sebelum ditampilkan/dilog. Tag image: images.sh menolak tag yang dipakai container berjalan, tag bawaan yang sudah ada, dan prev-*; upgrade.sh build menolak tag = produksi lama dan prev-*.
Rollback: revert commit; image lama tetap bertag v<versi lama>/prev-<stamp>; compose fallback latest tidak berubah.
Validation: tests/lib/version.test.ts, tests/lib/health.test.ts, tests/scripts/images-tag.test.ts (5), tests/scripts/upgrade-gates.test.ts (+5 build), e2e health.spec + shell.spec (12/12), log start worker/renderer dicek manual (field version + commit).

## Notes
- Versi dibaca server dari package.json (src/lib/version.ts, server-only) dan diteruskan ke klien lewat props (AppShell → AccountMenu), jadi package.json tidak ikut bundle klien. Renderer membaca package.json yang disalin ke image renderer (setelah npm install).
- CHANGELOG.md dimasukkan ke .prettierignore: ditulis `aitk release` dan membuat `npm run check` merah sejak rilis 1.0.0.
- Belum dicek di lingkungan ini: `docker build` image app/worker/renderer sungguhan dan `next build` produksi (build arg + bundling JSON); dibuktikan lewat dev server (Turbopack) + uji skrip dengan docker tiruan. Pemilik/rilis berikutnya: cek `/health` admin menampilkan commit setelah `images.sh build`.
- frontend-expert plugin tidak tersedia di sesi cloud; perubahan UI kecil (satu label muted memakai DropdownMenuLabel + token text-muted-foreground, tanpa ikon baru).

## Security checklist (OWASP ASVS 4.0.3)
<!-- Check each item when verified, or write "N/A: <reason>" after the text and check it. -->
- [x] V1 Architecture: trust boundaries and the components handling sensitive data are identified for this change — verified: batas kepercayaan = sesi admin (isAdmin dari DB) untuk versi di /health; menu akun hanya untuk sesi masuk.
- [x] V2 Authentication: credentials are verified server-side; no default, hard-coded, or weak secrets — N/A: tidak mengubah autentikasi.
- [x] V3 Session management: session tokens are random, protected, invalidated on logout and expiry — N/A: tidak mengubah sesi.
- [x] V4 Access control: every endpoint/action checks authorization server-side, deny by default (no IDOR) — verified: publicView menyaring versi/commit untuk non-admin (unit + e2e anonim: kunci hanya status, checkedAt).
- [x] V5 Validation, sanitization and encoding: all input validated; output encoded; no injection (SQL, OS, template) — verified: APP_COMMIT divalidasi regex heksa 7–40; tag image dari package.json divalidasi semver sebelum dipakai di skrip.
- [x] V6 Stored cryptography: sensitive data at rest uses approved algorithms; keys are not in the code — N/A: tidak ada data sensitif tersimpan.
- [x] V7 Error handling and logging: errors reveal no internals; security events are logged without secrets — verified: log start memuat version/commit saja, tanpa secret.
- [x] V8 Data protection: personal/sensitive data is minimized, not cached or logged, and removable — N/A: tidak ada data pribadi baru.
- [x] V9 Communication: TLS for all external traffic; certificates validated — N/A: tidak ada lalu lintas jaringan baru.
- [x] V10 Malicious code: no backdoors, time bombs, or unexplained network calls; dependencies are trusted — verified: tanpa dependensi baru; renderer membaca package.json lokal saja.
- [x] V11 Business logic: flows cannot be abused (limits, ordering, replay, race conditions) — verified: images.sh/upgrade.sh tidak pernah memindahkan tag produksi berjalan atau prev-* (uji skrip).
- [x] V12 Files and resources: uploads are type/size limited and stored safely; no path traversal or SSRF — N/A: tidak ada unggahan/path dari pengguna.
- [x] V13 API and web service: API inputs/outputs are schema-validated; CORS and rate limits are deliberate — verified: /api/health admin menambah version/commit; non-admin tidak berubah.
- [x] V14 Configuration: secure defaults, security headers, no debug in production, dependencies up to date — verified: build arg tanpa secret; compose fallback latest tetap; npm audit hijau.
