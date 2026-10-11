---
id: T-009
title: API query deklaratif via DuckDB dengan cache per revisi
status: todo
profile: strict
profile_pinned: true
goal: G-3
tags:
  - security
depends_on:
  - T-007
created: "2026-10-11T14:45:08Z"
updated: "2026-10-11T14:57:01Z"
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
- [ ] Given spec dengan sheetId milik dataset lain, when dikirim, then HTTP 404 (sheet selalu di-resolve where {id, datasetId})
- [ ] Given agg/timeGrain/arah sort di luar enum tertutup, atau dimensi > 3, ukuran > 10, filter > 20, atau JSON spec > 64 KB, then HTTP 400

## Risk
(Required for strict profile. Impact:, Security (STRIDE):, Rollback:, Validation:)

## Notes

- 2026-10-11T14:56:59Z DuckDB app: SET autoinstall_known_extensions=false, autoload_known_extensions=false, allowed_directories=[dir cache lokal], temp_directory + max_temp_directory_size, lock_configuration=true setelah setup; ekstensi httpfs/excel dibundel di image (on-prem tanpa internet). Key cache SHA-256. Slot konkurensi per user (4) selain global. Mode bebas: pemilik via {datasetId, spec}; editor via {dashboardId, spec} (authz share EDITOR, dataset diturunkan server) — lihat T-016.

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
