---
id: T-023
title: Paket deploy on-prem Docker Compose produksi
status: in_progress
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
updated: "2026-10-17T02:05:25Z"
created_by: claude-code
workers:
  - claude-code
branch: worktree-t-001-scaffold
base: 1bacfb5c33e15b6edf677d19425445a1f3cc6933
evidence:
  check:
    cmd: npm run check
    exit_code: 0
    duration_ms: 45932
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

      {"level":40,"time":1792202698747,"service":"data-dashboard","check":"B","detail":"koneksi ditolak","msg":"health check gagal"}
      {"level":40,"time":1792202698771,"service":"data-dashboard","check":"Lambat","detail":"Lambat: timeout 20 ms","msg":"health check gagal"}
      {"level":40,"time":1792202698778,"service":"data-dashboard","check":"Renderer PDF","detail":"renderer tidak menjawab /healthz","msg":"health check gagal"}

       Test Files  126 passed (126)
            Tests  1731 passed (1731)
         Start at  09:04:52
         Duration  31.37s (tests 75%, import 18%, transform 6%, worker 1%)

          Isolate  126 workers spawned · ~131ms startup each (spawn + environment, per file)
                   at least ~1.70s faster with isolate: false — reuses workers across files instead of one per file


      > data-dashboard@0.1.0 audit
      > npm audit --audit-level=high --omit=dev && npm audit --audit-level=critical

      found 0 vulnerabilities
      found 0 vulnerabilities
    at: "2026-10-17T02:05:25Z"
    tree: 7fb7af34b7788b9b21cc6e80d46e144c3734163e0b777a0617bd5881dcf16834
---

## Objective
docker-compose.prod.yml: app (4 GB), worker ×2 (3 GB, concurrency 1), renderer (2 GB), PostgreSQL, MinIO (subdomain storage.<domain>, lifecycle, CORS), Redis (maxmemory + allkeys-lru), reverse proxy TLS (client_max_body_size 32m, proxy_request_buffering off). Backup harian PostgreSQL + MinIO, healthcheck, log terpusat, job terjadwal (pembersihan versi/file asli/upload mandek). Runbook deploy + restore. Spek minimum VM 4 vCPU 16 GB SSD.

## Acceptance criteria
- [ ] Given VM kosong dengan Docker, when skrip deploy sesuai runbook dijalankan, then app via HTTPS dan /health hijau (termasuk MinIO publik dan renderer) dalam < 10 menit
- [ ] Given deploy produksi, when browser mengunggah satu part 16 MiB ke URL presigned publik lewat reverse proxy, then berhasil (tidak 403 SignatureDoesNotMatch, tidak 413)
- [ ] Given backup harian, when restore dijalankan sesuai runbook ke VM lain, then dashboard dan data terbuka identik
- [ ] Given worker dihentikan paksa saat ingest, when worker dimulai ulang, then job diulang sesuai idempotensi T-006 dan versi berakhir READY tanpa objek parsial
- [ ] Given compose produksi, when diperiksa, then hanya reverse proxy mempublikasikan port; Redis requirepass + protected-mode; renderer hanya di network frontend; app/worker memakai service account MinIO berpolicy prefix (bukan root); MINIO_BROWSER=off
- [ ] Given storage.<domain>, when request selain PUT/GET/HEAD/OPTIONS ke /<bucket>/(raw|guides|exports)/* dengan X-Amz-Signature atau ke /minio/*, then proxy menolak; semua respons storage membawa X-Content-Type-Options: nosniff dan Content-Security-Policy: sandbox
- [ ] Given backup harian, when diperiksa, then terenkripsi (age/gpg), disalin off-VM, retensi 30 hari, dan uji restore tercatat di runbook

## Risk
(Required for strict profile. Impact:, Security (STRIDE):, Rollback:, Validation:)

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

## Security checklist (OWASP ASVS 4.0.3)
<!-- Check each item when verified, or write "N/A: <reason>" after the text and check it. -->
- [ ] V1 Architecture: trust boundaries and the components handling sensitive data are identified for this change
- [ ] V2 Authentication: credentials are verified server-side; no default, hard-coded, or weak secrets
- [ ] V3 Session management: session tokens are random, protected, invalidated on logout and expiry
- [ ] V4 Access control: every endpoint/action checks authorization server-side, deny by default (no IDOR)
- [ ] V5 Validation, sanitization and encoding: all input validated; output encoded; no injection (SQL, OS, template)
- [ ] V6 Stored cryptography: sensitive data at rest uses approved algorithms; keys are not in the code
- [ ] V7 Error handling and logging: errors reveal no internals; security events are logged without secrets
- [ ] V8 Data protection: personal/sensitive data is minimized, not cached or logged, and removable
- [ ] V9 Communication: TLS for all external traffic; certificates validated
- [ ] V10 Malicious code: no backdoors, time bombs, or unexplained network calls; dependencies are trusted
- [ ] V11 Business logic: flows cannot be abused (limits, ordering, replay, race conditions)
- [ ] V12 Files and resources: uploads are type/size limited and stored safely; no path traversal or SSRF
- [ ] V13 API and web service: API inputs/outputs are schema-validated; CORS and rate limits are deliberate
- [ ] V14 Configuration: secure defaults, security headers, no debug in production, dependencies up to date
