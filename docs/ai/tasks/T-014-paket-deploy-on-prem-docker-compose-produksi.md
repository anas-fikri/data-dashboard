---
id: T-014
title: Paket deploy on-prem Docker Compose produksi
status: todo
profile: standard
goal: G-5
depends_on:
  - T-011
created: "2026-10-11T10:22:46Z"
updated: "2026-10-11T10:22:46Z"
created_by: claude-code
---

## Objective
docker-compose.prod.yml: app, worker (replika terpisah, batas memori 3 GB), PostgreSQL, MinIO, Redis, reverse proxy TLS. Backup PostgreSQL + MinIO harian, retensi upload mentah 7 hari (Parquet dipertahankan), healthcheck, log terpusat. Dokumen runbook.

## Acceptance criteria
- [ ] Given VM kosong dengan Docker, when menjalankan skrip deploy sesuai runbook, then aplikasi dapat diakses via HTTPS dan /health hijau dalam < 10 menit
- [ ] Given worker dihentikan paksa saat ingest, when worker dimulai ulang, then job dilanjutkan atau diulang dari awal tanpa data Parquet korup
- [ ] Given file mentah berumur > 7 hari, when job pembersihan berjalan, then file mentah terhapus dan dashboard tetap berfungsi

## Risk
(Required for strict profile. Impact:, Security (STRIDE):, Rollback:, Validation:)

## Notes
