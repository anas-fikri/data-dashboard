---
id: T-017
title: Ekspor widget ke CSV dan XLSX
status: todo
profile: standard
goal: G-4
depends_on:
  - T-016
created: "2026-10-11T14:45:09Z"
updated: "2026-10-11T14:45:09Z"
created_by: claude-code
---

## Objective
Job ekspor hasil widget dengan filter aktif (jalur query tanpa limit 10k, maks 1 juta baris) ke CSV dan XLSX, ditulis ke exports/<userId>/<jobId>.*, unduh via presigned 1 jam, lifecycle hapus 1 jam. Dijalankan di worker (job ringan, antrean terpisah dari ingest).

## Acceptance criteria
- [ ] Given widget tabel dengan filter aktif, when ekspor CSV, then file berisi persis baris terfilter dengan header nama tampil kolom
- [ ] Given hasil > 1 juta baris, when ekspor, then ditolak code EXPORT_TOO_LARGE dengan saran mempersempit filter
- [ ] Given ekspor XLSX selesai, when 61 menit berlalu, then tautan unduh tidak lagi valid dan objek terhapus

## Risk
(Required for strict profile. Impact:, Security (STRIDE):, Rollback:, Validation:)

## Notes
