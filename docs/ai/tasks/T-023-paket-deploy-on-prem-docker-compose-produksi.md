---
id: T-023
title: Paket deploy on-prem Docker Compose produksi
status: todo
profile: standard
goal: G-5
depends_on:
  - T-013
  - T-018
created: "2026-10-11T14:45:09Z"
updated: "2026-10-11T14:45:09Z"
created_by: claude-code
---

## Objective
docker-compose.prod.yml: app (4 GB), worker ×2 (3 GB, concurrency 1), renderer (2 GB), PostgreSQL, MinIO (subdomain storage.<domain>, lifecycle, CORS), Redis (maxmemory + allkeys-lru), reverse proxy TLS (client_max_body_size 32m, proxy_request_buffering off). Backup harian PostgreSQL + MinIO, healthcheck, log terpusat, job terjadwal (pembersihan versi/file asli/upload mandek). Runbook deploy + restore. Spek minimum VM 4 vCPU 16 GB SSD.

## Acceptance criteria
- [ ] Given VM kosong dengan Docker, when skrip deploy sesuai runbook dijalankan, then app via HTTPS dan /health hijau (termasuk MinIO publik dan renderer) dalam < 10 menit
- [ ] Given deploy produksi, when browser mengunggah satu part 16 MiB ke URL presigned publik lewat reverse proxy, then berhasil (tidak 403 SignatureDoesNotMatch, tidak 413)
- [ ] Given backup harian, when restore dijalankan sesuai runbook ke VM lain, then dashboard dan data terbuka identik
- [ ] Given worker dihentikan paksa saat ingest, when worker dimulai ulang, then job diulang sesuai idempotensi T-006 dan versi berakhir READY tanpa objek parsial

## Risk
(Required for strict profile. Impact:, Security (STRIDE):, Rollback:, Validation:)

## Notes
