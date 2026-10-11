---
id: T-009
title: API query deklaratif via DuckDB dengan cache per revisi
status: todo
profile: standard
goal: G-3
tags:
  - security
depends_on:
  - T-007
created: "2026-10-11T14:45:08Z"
updated: "2026-10-11T14:45:08Z"
created_by: claude-code
---

## Objective
Alur B4. Route Handler POST /api/query menerima {datasetId, spec} (mode bebas: hanya pemilik dataset; jalur {widgetId, filters} ditambahkan T-011/T-016). Spec zod: sheetId, dimensions[], measures[{column, agg}], filters[], sort, limit ≤ 10k, timeGrain. Validasi kolom terhadap skema aktif (tidak hidden), agregasi sesuai tipe. SQL: identifier dikutip ganda dari skema, nilai parameter binding. Key cache hash(datasetId, versionId, sheetId, schemaRevision, JSON kanonik), TTL 24 jam. typed.parquet versi aktif disalin ke disk lokal dengan LRU MAX_LOCAL_PARQUET_BYTES, fallback S3. Timeout 30 s + interrupt, slot MAX_QUERY_CONCURRENCY. Cache skema in-memory per dataset di-invalidate saat skema/versi berubah.

## Acceptance criteria
- [ ] Given kolom bernama 'Total; "Omzet"' ada di skema, when spec merujuknya, then query berhasil; given kolom tidak ada di skema atau hidden, then HTTP 400 tanpa menyentuh DuckDB
- [ ] Given user bukan pemilik dataset, when memanggil /api/query mode bebas, then HTTP 404
- [ ] Given spec sama dikirim dua kali dengan urutan key berbeda, when kedua, then terlayani dari cache; given schemaRevision naik, then permintaan berikutnya cache miss
- [ ] Given query sengaja lambat > 30 s, when batas tercapai, then DuckDB di-interrupt dan respons code QUERY_TIMEOUT dengan saran mempersempit filter
- [ ] Given cache lokal penuh, when parquet versi baru dibutuhkan, then file paling lama tidak dipakai dihapus dan total byte ≤ MAX_LOCAL_PARQUET_BYTES
- [ ] Given dataset CSV 10 juta baris (perf), when spec group-by 2 dimensi + 2 ukuran 20× beruntun, then p95 < 3 detik; bukti di docs/ai/perf/T-009.md

## Risk
(Required for strict profile. Impact:, Security (STRIDE):, Rollback:, Validation:)

## Notes
