---
id: T-023
title: Paket deploy on-prem Docker Compose produksi
status: in_review
profile: strict
profile_pinned: true
goal: G-5
tags:
  - security
depends_on:
  - T-013
  - T-018
  - T-027
created: "2026-10-11T14:45:09Z"
updated: "2026-10-17T05:22:44Z"
created_by: claude-code
workers:
  - claude-code
branch: worktree-t-001-scaffold
base: 1bacfb5c33e15b6edf677d19425445a1f3cc6933
review:
  passes:
    - "n": 1
      by: claude-verify-workflow
      at: "2026-10-17T04:13:46Z"
      findings: 5
    - "n": 2
      by: claude-agent-review
      at: "2026-10-17T04:22:02Z"
      findings: 2
    - "n": 3
      by: claude-confirm-review
      at: "2026-10-17T05:11:30Z"
      findings: 0
evidence:
  check:
    cmd: npm run check
    exit_code: 0
    duration_ms: 95623
    summary: |-
      > data-dashboard@0.1.0 check
      > npm run lint && npm run typecheck && npm run test && npm run audit


      > data-dashboard@0.1.0 lint
      > eslint . && prettier --check .

      Checking formatting...
      All matched files use Prettier code style!

      > data-dashboard@0.1.0 typecheck
      > tsc --noEmit


      > data-dashboard@0.1.0 test
      > vitest run


       RUN  v5.0.3 /Users/anasfikri/Documents/Projects/pcpexpress/data-dashboard/.claude/worktrees/t-001-scaffold

      {"level":40,"time":1792214361585,"service":"data-dashboard","check":"B","detail":"koneksi ditolak","msg":"health check gagal"}
      {"level":40,"time":1792214361612,"service":"data-dashboard","check":"Lambat","detail":"Lambat: timeout 20 ms","msg":"health check gagal"}
      {"level":40,"time":1792214361615,"service":"data-dashboard","check":"Y","detail":"mati","msg":"health check gagal"}
      {"level":40,"time":1792214361623,"service":"data-dashboard","check":"Renderer PDF","detail":"renderer tidak menjawab /healthz","msg":"health check gagal"}

       Test Files  126 passed (126)
            Tests  1733 passed (1733)
         Start at  12:19:01
         Duration  64.66s (tests 74%, import 19%, transform 6%)

          Isolate  126 workers spawned · ~305ms startup each (spawn + environment, per file)
                   at least ~3.96s faster with isolate: false — reuses workers across files instead of one per file


      > data-dashboard@0.1.0 audit
      > npm audit --audit-level=high --omit=dev && npm audit --audit-level=critical

      found 0 vulnerabilities
      found 0 vulnerabilities
    at: "2026-10-17T05:20:08Z"
    tree: ea6dc4da70409ec2522e1a65d504b6c07e3dc4f939e385b0aef40e971f003622
  audit:
    at: "2026-10-17T05:22:24Z"
    passed: true
    tree: 177f3c740fcb863f4704df4e893bd23f218c370ae96a55a42db66a3855be51ab
    results:
      - name: osv-scanner (dependencies, offline db)
        exit_code: 0
        summary: |-
          Scanning dir .
          Starting filesystem walk for root: /
          Scanned /Users/anasfikri/Documents/Projects/pcpexpress/data-dashboard/.claude/worktrees/t-001-scaffold/package-lock.json file and found 818 packages
          End status: 186 dirs visited, 1063 inodes visited, 1 Extract calls, 168.098708ms elapsed, 168.1ms wall time
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
docker-compose.prod.yml: app (4 GB), worker ×2 (3 GB, concurrency 1), renderer (2 GB), PostgreSQL, MinIO (subdomain storage.<domain>, lifecycle, CORS), Redis (maxmemory + allkeys-lru), reverse proxy TLS (client_max_body_size 32m, proxy_request_buffering off). Backup harian PostgreSQL + MinIO, healthcheck, log terpusat, job terjadwal (pembersihan versi/file asli/upload mandek). Runbook deploy + restore. Spek minimum VM 4 vCPU 16 GB SSD.

## Acceptance criteria
- [ ] Given VM kosong dengan Docker, when skrip deploy sesuai runbook dijalankan, then app via HTTPS dan /health hijau (termasuk MinIO publik dan renderer) dalam < 10 menit
- [x] Given deploy produksi, when browser mengunggah satu part 16 MiB ke URL presigned publik lewat reverse proxy, then berhasil (tidak 403 SignatureDoesNotMatch, tidak 413)
- [x] Given backup harian, when restore dijalankan sesuai runbook ke VM lain, then dashboard dan data terbuka identik
- [x] Given worker dihentikan paksa saat ingest, when worker dimulai ulang, then job diulang sesuai idempotensi T-006 dan versi berakhir READY tanpa objek parsial
- [x] Given compose produksi, when diperiksa, then hanya reverse proxy mempublikasikan port; Redis requirepass + protected-mode; renderer hanya di network frontend; app/worker memakai service account MinIO berpolicy prefix (bukan root); MINIO_BROWSER=off
- [x] Given storage.<domain>, when request selain PUT/GET/HEAD/OPTIONS ke /<bucket>/(raw|guides|exports)/* dengan X-Amz-Signature atau ke /minio/*, then proxy menolak; semua respons storage membawa X-Content-Type-Options: nosniff dan Content-Security-Policy: sandbox
- [ ] Given backup harian, when diperiksa, then terenkripsi (age/gpg), disalin off-VM, retensi 30 hari, dan uji restore tercatat di runbook

## Risk
Impact: paket produksi baru — docker-compose.prod.yml (proxy Caddy, app, worker, renderer, RustFS, Redis, backup, pg-relay/PostgreSQL), deploy/ (deploy.sh, backup/restore/verify-backup/restore-drill/fingerprint, storage-iam, lan-cert, host-db, rotate-db-password, set-smtp), runbook. Kode aplikasi yang berubah: healthcheck container memakai /api/health/core (inti saja), cache health per kelompok, next.config build (NEXT_BUILD_CPUS, staticPageGenerationTimeout), seccomp renderer (clone3 → ENOSYS). deploy.sh membuat ulang proxy + backup tiap deploy (bind mount satu file), host-db.sh membuat database UTF8. Produksi olympus: https://10.3.3.221:8443 (storage :8444) di VM bersama; aplikasi lain di VM tidak disentuh.
Security (STRIDE): S — hanya proxy yang publish port; TLS dari root LAN berpembatasan IP 10.3.3.221/32 (kunci root offline) + HSTS; proxy menimpa Host/X-Forwarded-Host/X-Real-IP. T — storage hanya GET/HEAD/PUT/OPTIONS pada /<bucket>/(raw|guides|exports)/*, selain itu 403; app/worker memakai service account RustFS berpolicy prefix; backup age + sha256; restore satu transaksi. R — AuditLog aplikasi tetap; log akses tanpa query/Cookie/Authorization/Referer/Location, path token diredaksi. I — kredensial tidak di argumen proses (env libpq, REDISCLI_AUTH, config Redis dari file, stdin); secret acak per deploy di .env.prod (600); /api/health dan /api/health/core publik hanya status; kunci privat backup hanya di laptop admin. D — mem_limit per service, Redis maxmemory noeviction, batas body proxy, renderer/SMTP tidak lagi menentukan sehat-tidaknya app (gangguan fitur sampingan tidak mematikan situs), start_period renderer; pg-relay hanya menerima subnet aplikasi. E — cap_drop ALL + no-new-privileges + read_only, renderer seccomp + jaringan internal tanpa egress, Redis protected-mode + requirepass, console RustFS mati, init (tini) di Redis/renderer.
Rollback: `docker compose --env-file .env.prod -f docker-compose.prod.yml down` (volume tetap) lalu deploy commit/IMAGE_TAG sebelumnya; data dipulihkan dari arsip backup (runbook §5, restore.sh). PostgreSQL host hanya berisi role + database dashboard (host-db.sh) — DROP bila rollback total. Perubahan kode aplikasi (route /api/health/core) cukup di-revert; Dockerfile HEALTHCHECK kembali ke /api/health.
Validation: aitk check (lint, typecheck, 1733 unit, npm audit 0); e2e penuh 183/183 + e2e health terarah (/api/health/core publik, hanya status); produksi: deploy.sh "Sehat" lewat rantai TLS terverifikasi (--cacert root LAN), check-public-presign (UploadPart 16 MiB 200, metode/path lain 403, nosniff + CSP sandbox), AC4 worker dibunuh saat ingest → READY tanpa objek parsial, ps tanpa kredensial (0), pg-relay menolak jaringan lain, log akses tanpa token/query, latihan restore LULUS (checksum OK, isi per tabel identik — jumlah + md5 tiap baris, produksi tidak berubah selama backup —, daftar objek storage identik, health 200); diagnosa 151 kolom PG14/SQL_ASCII produksi vs PG16/UTF8 hasil restore identik lewat dua jalur (DB kosong dan migrate + restore --clean); review 3 putaran (5 → 2 → 0 temuan blocking). Sisa risiko: DB olympus SQL_ASCII (ILIKE hanya ASCII) dan backup belum disalin off-VM — task lanjutan.

## Notes
- 2026-10-11T14:57:00Z Image di-pin per digest; skrip deploy generate semua secret; runbook rotasi AUTH_SECRET (array: tambah baru di depan, hapus lama setelah maxAge); access log redaksi /render/* dan /verify*; CORS MinIO AllowedHeaders terbatas (Content-Type, Content-Length) + MaxAge.
- 2026-10-11T23:41:06Z Dari T-027: next.config headers() dan experimental.serverActions.allowedOrigins dievaluasi saat BUILD — image produksi wajib dibangun dengan APP_HOST produksi. HSTS dan CSP dipasang proxy saat runtime. Verifikasi pasca-deploy: node scripts/smoke-prod-headers.mjs https://<domain>.
- 2026-10-11T23:44:44Z Dari review T-027: reverse proxy wajib meneruskan Host atau X-Forwarded-Host asli (Next mencocokkan Origin Server Action dengannya; allowedOrigins tidak dipakai). .dockerignore sudah mengecualikan .env. HSTS memakai includeSubDomains: semua subdomain (termasuk storage.<domain>, D5) wajib https.
- 2026-10-11T23:58:30Z Dari review T-003: job pembersihan StorageCleanup wajib memvalidasi bentuk prefix (raw|parquet)/<cuid>/ sebelum menghapus.
- 2026-10-12T01:31:31Z Dari T-004: compose produksi Redis --maxmemory-policy noeviction (ADR-0004); worker dijalankan sebagai proses terpisah (npm run worker = tsx --conditions=react-server; T-006/T-023 boleh bundel ke JS); proxy storage wajib meneruskan header Content-Length apa adanya (signed header UploadPart); jalankan node scripts/check-presign.mjs setelah deploy.
- 2026-10-12T04:27:59Z Dari T-005 (ADR-0005): volume temp worker ≥ ± 5× ukuran upload maksimum (file sumber diunduh + spill sharedStrings ≤ min(8 GiB, 4× ukuran file)); untuk MAX_UPLOAD_BYTES 1 GB sediakan ≥ 5 GB per replika worker.
- 2026-10-12T04:36:35Z Koreksi catatan disk temp worker (menggantikan '≥ 5× ukuran upload'): file spill sharedStrings dibatasi mutlak 8 GiB, jadi volume temp per replika worker ≥ ukuran upload maksimum + 8 GiB (± 9 GB untuk 1 GB).
- 2026-10-12T10:24:01Z Dari T-009: Route /api/query memuat @duckdb/node-api (native, serverExternalPackages). Output standalone harus membawa @duckdb/node-bindings-linux-<arch> (dipilih per platform saat runtime; nft bisa melewatkannya) — pastikan ter-copy di image (mis. outputFileTracingIncludes atau salin node_modules/@duckdb). QUERY_CACHE_DIR per replika di volume lokal.
- 2026-10-13T14:32:41Z Dari review keamanan T-019: reverse proxy produksi WAJIB menimpa (bukan meneruskan dari klien) header Host, X-Forwarded-Host dan X-Real-IP (nginx: proxy_set_header Host $host; proxy_set_header X-Forwarded-Host $host; proxy_set_header X-Real-IP $remote_addr;). Tanpa itu: cek Origin Server Action bisa diakali dengan X-Forwarded-Host palsu dan IP di AuditLog/rate limit bisa dipalsukan (TRUST_PROXY=true). Tambahkan uji di scripts/smoke-prod-headers.mjs: POST Server Action dengan Origin + X-Forwarded-Host jahat ditolak; X-Real-IP palsu tidak muncul di AuditLog.
- 2026-10-13T15:34:02Z Dari review T-019 putaran 2: (1) image app produksi wajib membawa scripts/admin-restore.mjs + @prisma/client (output standalone Next tidak otomatis membawanya); smoke test: docker compose exec app node scripts/admin-restore.mjs tidak-ada@pcpexpress.com --confirm harus exit 1 tanpa perubahan. (2) logging Docker wajib dirotasi (max-size/max-file) untuk app dan worker — log penolakan akses admin sudah dibatasi per pengguna, tapi stdout tetap perlu rotasi.
- 2026-10-13T23:51:57Z Dari review keamanan T-012: status filter dashboard ada di URL (?f=, berisi nilai filter seperti nama cabang/kode). Access log reverse proxy WAJIB membuang query string (Caddy: filter request>uri; nginx: log $uri, bukan $request_uri) agar nilai filter tidak tersimpan di log server.
- 2026-10-15T20:25:41Z Dari T-018 (ADR-0006): (1) renderer HANYA di network compose internal 'render' (internal: true, tanpa egress) bersama app + worker — bukan network frontend (RustFS/proxy ada di sana); ganti AC 'renderer hanya di network frontend' dengan itu. (2) Nama host internal app untuk APP_INTERNAL_URL tidak boleh 'app'/'dev' atau TLD HSTS preload lain bila http (Chromium memaksa https lalu gagal; env app + renderer menolaknya) — pakai mis. http://web:3000. (3) Access log reverse proxy + app WAJIB meredaksi /render/* (token render di path); pino sudah meredaksi nilai string /render/<token>. (4) Font (Noto/DejaVu yang dipakai print) dipasang di image renderer; image mcr.microsoft.com/playwright:v1.64.0-noble dipin per digest. (5) Seccomp profile Playwright: renderer/seccomp_profile.json (vendored v1.64.0) via security_opt seccomp=… + no-new-privileges, cap_drop ALL, read_only + tmpfs /tmp, user pwuser, mem_limit 2g. (6) /health produksi memuat 'Renderer PDF' bila RENDERER_URL terisi (rendererChecks). (7) Worker butuh RENDERER_URL/RENDERER_SECRET/RENDER_TIMEOUT_MS/PDF_MAX_BYTES; renderer butuh RENDERER_SECRET + APP_INTERNAL_URL saja (tanpa secret DB/S3).
- 2026-10-15T20:31:39Z Dari T-018 (builder renderer): service renderer butuh cap_add SYS_CHROOT di samping cap_drop ALL (sandbox Chromium gagal start tanpa itu; kapabilitas efektif tetap 0). Image mcr.microsoft.com/playwright:v1.64.0-noble dipin digest sha256:06a9939e57531807f8d5fd76ce44b53165ffb7d7501d87ab10e285c20b1e971f; menjalankan renderer/*.ts lewat renderer/loader.mjs (type stripping Node, tanpa tsx/esbuild host); RENDERER_HOST=0.0.0.0 di kontainer; nama service app di network render bukan app/dev (mis. dashboard-web); perintah bukti AC6 memakai -f docker-compose.dev.yml.
- 2026-10-16T21:54:05Z Dari review T-021 N7: next.config proxyClientMaxBodySize kini 3 MB untuk semua rute (poster video ≤ 2 MB). Di reverse proxy set client_max_body_size kecil per lokasi (mis. 64 KB untuk /api/auth/*, 1 MB default) dan 3 MB hanya untuk /api/guides/videos/*/poster.
- 2026-10-17T05:18:09Z Bukti AC olympus 2026-10-17: AC2 check-public-presign UploadPart 16 MiB 200 lewat proxy, metode/path lain 403. AC3 restore-drill.sh LULUS (dashboard-20261017T051529Z): checksum OK, jumlah + md5 tiap baris identik, objek storage identik, health 200 — salinan terisolasi di VM yang sama (VM kedua belum tersedia); diagnosa 151 kolom PG14/SQL_ASCII vs PG16/UTF8 identik. AC4 worker dibunuh saat ingest → READY tanpa objek parsial. AC5 hanya proxy publish port (8443/8444), Redis requirepass + protected-mode, renderer hanya di jaringan internal render (pengganti 'frontend', ADR-0006), service account RustFS berpolicy prefix, console RustFS mati. AC6 proxy storage menolak selain GET/HEAD/PUT/OPTIONS pada /<bucket>/(raw|guides|exports)/*, nosniff + CSP sandbox. TERBUKA: AC1 HTTPS + /health hijau (storage + renderer) tercapai, tetapi deploy.sh dengan build penuh 1283 dtk (>10 menit) di olympus (VM bersama di bawah spek minimum 4 vCPU/16 GB, I/O hypervisor ±85% dipakai pihak lain); AC7 backup terenkripsi age + sha256, retensi 30 hari, uji restore tercatat, tetapi salinan off-VM belum ada (butuh target NAS/SFTP/S3 dari user).

## Security checklist (OWASP ASVS 4.0.3)
<!-- Check each item when verified, or write "N/A: <reason>" after the text and check it. -->
- [x] V1 Architecture: trust boundaries and the components handling sensitive data are identified for this change — batas kepercayaan di header docker-compose.prod.yml + runbook: proxy satu-satunya ingress (8443/8444), jaringan edge/data bersubnet tetap, render internal tanpa egress, pg-relay hanya menerima subnet aplikasi; data sensitif = PostgreSQL host, bucket RustFS, arsip backup
- [x] V2 Authentication: credentials are verified server-side; no default, hard-coded, or weak secrets — deploy.sh membuat semua secret acak per deploy + menolak placeholder ISI_; configCheck menolak placeholder; app/worker memakai service account RustFS berpolicy prefix (bukan root); password DB dirotasi (rotate-db-password.sh), Redis requirepass
- [x] V3 Session management: session tokens are random, protected, invalidated on logout and expiry — N/A: logika sesi tidak berubah; produksi HTTPS + HSTS sehingga cookie Secure, rotasi AUTH_SECRET di runbook
- [x] V4 Access control: every endpoint/action checks authorization server-side, deny by default (no IDOR) — proxy storage hanya GET/HEAD/PUT/OPTIONS pada /<bucket>/(raw|guides|exports)/*, selain itu 403 (check-public-presign); policy prefix RustFS; /api/health dan /api/health/core publik hanya status, detail khusus admin
- [x] V5 Validation, sanitization and encoding: all input validated; output encoded; no injection (SQL, OS, template) — SQL skrip lewat stdin dengan literal di-escape (host-db.sh) atau password alfanumerik acak (rotate-db-password.sh); tidak ada eval input pengguna; path storage dicocokkan regex di Caddy
- [x] V6 Stored cryptography: sensitive data at rest uses approved algorithms; keys are not in the code — backup age (X25519) + sha256, kunci privat hanya di laptop admin/brankas; root CA LAN kunci offline; tidak ada kunci di kode/image
- [x] V7 Error handling and logging: errors reveal no internals; security events are logged without secrets — log akses Caddy tanpa query/Cookie/Authorization/Referer/Location/Set-Cookie, path token diredaksi; ps tanpa kredensial (0 baris); safeMessage di health; latihan restore hanya mencetak nama tabel yang beda
- [x] V8 Data protection: personal/sensitive data is minimized, not cached or logged, and removable — backup terenkripsi, retensi 30 hari, log json-file dirotasi 5x20 MB; .env.prod mode 600 dan tidak di-commit; salinan latihan dibongkar down -v + env dihapus
- [x] V9 Communication: TLS for all external traffic; certificates validated — TLS di proxy dengan sertifikat dari root LAN berpembatasan IP 10.3.3.221/32, rantai diverifikasi (deploy.sh --cacert, curl --cacert); HSTS; trafik antar-container di jaringan Docker privat
- [x] V10 Malicious code: no backdoors, time bombs, or unexplained network calls; dependencies are trusted — image caddy/playwright dipin digest; npm audit 0 kerentanan; tidak ada panggilan jaringan tak terjelaskan (renderer tanpa egress)
- [x] V11 Business logic: flows cannot be abused (limits, ordering, replay, race conditions) — restore satu transaksi (--single-transaction --exit-on-error) + checksum; latihan restore di project terpisah tanpa menyentuh data produksi; cache health 5 dtk per kelompok mencegah amplifikasi
- [x] V12 Files and resources: uploads are type/size limited and stored safely; no path traversal or SSRF — unggahan presigned langsung ke storage lewat allowlist proxy; batas body proxy; volume temp worker sesuai ADR-0005; tanpa path dari input pengguna di skrip
- [x] V13 API and web service: API inputs/outputs are schema-validated; CORS and rate limits are deliberate — CORS RustFS header terbatas; /api/health/core JSON {status, checkedAt} saja; rate limit aplikasi tidak berubah
- [x] V14 Configuration: secure defaults, security headers, no debug in production, dependencies up to date — NODE_ENV production, console RustFS mati, cap_drop ALL + no-new-privileges + read_only, seccomp renderer, header HSTS/CSP nonce, storage nosniff + CSP sandbox, Redis protected-mode, dependensi terbaru (npm audit 0)
