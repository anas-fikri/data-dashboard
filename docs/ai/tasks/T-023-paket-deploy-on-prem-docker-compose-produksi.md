---
id: T-023
title: Paket deploy on-prem Docker Compose produksi
status: todo
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
updated: "2026-10-11T23:58:30Z"
created_by: claude-code
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
