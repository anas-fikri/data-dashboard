---
id: T-007
title: API query deklaratif via DuckDB atas Parquet
status: todo
profile: standard
goal: G-3
tags:
  - security
depends_on:
  - T-006
created: "2026-10-11T10:22:46Z"
updated: "2026-10-11T10:22:46Z"
created_by: claude-code
---

## Objective
Endpoint menerima spec (zod): sheet, dimensions[], measures[{column, agg}], filters[], sort, limit ≤ 10k, time grain. Server menyusun SQL DuckDB dengan identifier yang divalidasi terhadap skema dan nilai via parameter binding. Cache hasil (Redis) per hash spec + versi dataset. Batas waktu query 30 detik.

## Acceptance criteria
- [ ] Given dataset 10 juta baris, when spec group-by 2 dimensi + 2 ukuran dikirim, then respons p95 < 3 detik pada 20 permintaan beruntun dan hasil kedua terlayani dari cache
- [ ] Given spec dengan nama kolom yang tidak ada di skema atau mengandung tanda kutip/titik koma, when dikirim, then ditolak 400 tanpa pernah menyentuh DuckDB
- [ ] Given user tanpa akses ke dataset, when memanggil endpoint query dengan datasetId tersebut, then mendapat 404
- [ ] Given query melebihi 30 detik, when batas tercapai, then query dibatalkan dan user menerima pesan untuk mempersempit filter

## Risk
(Required for strict profile. Impact:, Security (STRIDE):, Rollback:, Validation:)

## Notes
