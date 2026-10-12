---
id: T-009
title: API query deklaratif via DuckDB dengan cache per revisi
status: in_review
profile: strict
profile_pinned: true
goal: G-3
tags:
  - security
depends_on:
  - T-007
created: "2026-10-11T14:45:08Z"
updated: "2026-10-12T10:49:15Z"
created_by: claude-code
workers:
  - claude-code
branch: worktree-t-001-scaffold
base: f8b76608638dda7fb3bbc8173d76a466874a2bac
review:
  passes:
    - "n": 1
      by: claude-security-reviewer-subagen
      at: "2026-10-12T10:49:15Z"
      findings: 12
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
Risk level: HIGH. Endpoint pertama yang menjalankan SQL atas data user di proses aplikasi. Kebocoran lintas dataset, injeksi, atau query liar yang menghabiskan CPU/memori/disk aplikasi berdampak ke semua user.

Impact surface:
- **API:** POST /api/query (src/app/api/query, src/features/query: spec, sql, cache, service, http, runtime).
- **Mesin:** src/lib/duckdb/engine.ts (DuckDB aplikasi) dan parquet-cache.ts (cache lokal typed.parquet).
- **Konfigurasi:** env QUERY_CACHE_DIR, MAX_LOCAL_PARQUET_BYTES, MAX_QUERY_CONCURRENCY, QUERY_MEMORY_LIMIT, QUERY_TIMEOUT_MS; next.config serverExternalPackages (binding native DuckDB).

Security (STRIDE):
- **Spoofing:** sesi sisi Node (requireUser, sessionVersion dicek).
- **Tampering/injeksi:**
  - Body ≤ 64 KB; spec zod .strict() dengan enum tertutup (agg, timeGrain, op, arah sort) dan batas (≤ 3 dimensi, ≤ 10 ukuran, ≤ 20 filter, ≤ 500 nilai IN, limit ≤ 10k).
  - Kolom dirujuk lewat nama tampil, dipetakan ke c<pos> dari skema (identifier buatan program, dikutip). Nilai filter dan path parquet lewat parameter binding. Nama dari user tidak pernah masuk teks SQL (diuji dengan kolom 'Total; "Omzet"' dan nilai "x' OR 1=1 --").
- **Information disclosure / IDOR:**
  - Dataset hanya milik user (lainnya 404, tanpa membedakan "ada tapi bukan milikmu").
  - Sheet di-resolve where {id, versionId aktif} sehingga sheet dataset lain → 404.
  - Kunci cache hasil memuat datasetId + versionId + schemaRevision. Pemilik sudah dicek sebelum cache dibaca.
- **Elevation (escape dari DuckDB):** instance aplikasi enable_external_access=false + allowed_directories (hanya cache parquet dan temp) + lock_configuration.
  - File di luar direktori itu (mis. /etc/passwd) dan SET setelah dikunci ditolak (diuji).
  - Di dalam direktori yang diizinkan, DuckDB masih bisa COPY/ATTACH/read_text. Yang menjaga adalah hanya SQL dari buildSql yang pernah dijalankan: satu SELECT yang hanya membaca read_parquet($path) (diuji, review F11). engine.exec tidak dipanggil dengan teks dari user.
- **DoS (review T-009 F1–F4, N1–N3):**
  - Timeout 30 s → interrupt. Spec yang timeout di-cache negatif 5 menit, sehingga tidak bisa diulang gratis.
    - Risiko diterima: timeout karena server sedang ramai juga ikut di-cache 5 menit (spec itu menjawab QUERY_TIMEOUT sampai cache habis). Ditinjau ulang di uji beban T-024.
  - Slot query global MAX_QUERY_CONCURRENCY (antre ≤ 10 s, lalu QUERY_BUSY) dan per user = setengahnya. Slot hanya dipegang selama DuckDB berjalan; slot yang dilepas diserahkan langsung ke antrean.
  - Unduhan parquet punya pembatas sendiri (N2): ≤ 2 berjalan bersamaan, ≤ 1 dimulai per user (lebih → QUERY_BUSY), yang lain antre.
    - Permintaan menunggu file ≤ 10 s, lalu QUERY_BUSY "data sedang disiapkan"; unduhan berlanjut di background dan permintaan berikutnya memakai hasilnya.
    - Unduhan besar tidak lagi menahan query user lain.
  - Cache parquet lokal: LRU ≤ MAX_LOCAL_PARQUET_BYTES.
    - Ruang dipesan lewat HEAD sebelum unduh; penuh oleh file yang sedang dipakai → QUERY_BUSY.
    - Unduhan dibatasi 10 menit sejak mulai berjalan (abort).
    - File menganggur 3 hari dibuang. File > batas yang selesai diunduh tanpa penunggu langsung dibuang.
    - Dataset dihapus → salinan lokal dan unduhannya yang masih berjalan dibuang (forget, N3). Lewat registri tanpa DuckDB, jadi menghapus dataset tidak memuat modul native.
    - Hanya proses yang menghapus yang terjangkau; replika lain membuang salinannya lewat batas menganggur 3 hari.
  - Hasil ke klien ≤ 5 MB → RESULT_TOO_LARGE, diukur dengan perkiraan heap per baris (rowBytes, N1): 64 B per baris, angka 24 B, string 24 B + 2 B per karakter. Perkiraan diukur tidak pernah di bawah heap sebenarnya.
  - Teks dimensi dipotong 500 karakter di SQL.
    - Risiko diterima: label yang 500 karakter pertamanya sama digabung menjadi satu grup. Label grafik sepanjang itu tidak realistis.
  - Cache hasil di memori proses, bukan Redis bersama yang noeviction (ADR-0004).
    - LRU ≤ QUERY_RESULT_CACHE_BYTES (default 64 MiB, maksimal 512 MiB), dengan byte = perkiraan heap yang sama.
    - Entri ≤ 1 MB, TTL 24 jam.
  - DuckDB kehabisan memori → QUERY_TOO_HEAVY dengan saran.
  - Tanpa rate limit per menit: slot per user, pembatas unduhan, cache negatif, dan batas hasil sudah membatasi; ditinjau ulang di T-024.
- **CSRF:** Origin wajib = APP_URL (403).
- **Repudiation:** log error query dengan userId tanpa isi data.

Compatibility: endpoint baru. Mode editor via dashboard ({dashboardId, spec}) ditambahkan T-011/T-016.

Failure modes:
- **Cache hasil hilang saat proses restart:** hanya cache miss (cache per proses, bukan dibagi antar-replika).
- **S3 gagal saat mengisi cache lokal:** QUERY_FAILED 500 (file tmp dibuang); permintaan berikutnya mencoba lagi.
- **Disk cache penuh oleh file yang sedang dipakai:** total boleh melewati batas sementara, lalu dibuang saat release. File tunggal > batas dipakai lalu dihapus.
- **Proses aplikasi mati:** file cache tetap valid (nama = hash kunci, file typed tidak berubah) dan sisa unduhan tmp-* dibuang saat start.

Rollback: revert commit T-009 (endpoint baru, tanpa migrasi); hapus QUERY_CACHE_DIR.

Validation:
- **Unit** (tests/features/query/query.test.ts, mesin + cache parquet sungguhan): AC 1, 2, 3, 4, 5, 7, 8, filter bertipe, grain bulan, injeksi nilai filter, sandbox.
- **e2e** (ingest.spec, worker sungguhan): pemilik dapat hasil + cache, 400, 403 Origin asing, 404 bukan pemilik.
- **Perf:** docs/ai/perf/T-009.md (CSV 10 juta baris).

Open risks/assumptions:
- Skema dibaca dari DB tiap permintaan, bukan cache skema in-memory; query berindeks dan selalu sesuai revisi, tanpa invalidasi antarproses.
- Fallback S3 langsung (httpfs) belum ada karena ekstensi tidak dibundel. File typed selalu disalin ke disk lokal; T-023 menentukan volume cache per replika.

## Notes
- 2026-10-11T14:56:59Z DuckDB app: SET autoinstall_known_extensions=false, autoload_known_extensions=false, allowed_directories=[dir cache lokal], temp_directory + max_temp_directory_size, lock_configuration=true setelah setup; ekstensi httpfs/excel dibundel di image (on-prem tanpa internet). Key cache SHA-256. Slot konkurensi per user (4) selain global. Mode bebas: pemilik via {datasetId, spec}; editor via {dashboardId, spec} (authz share EDITOR, dataset diturunkan server) — lihat T-016.
- 2026-10-12T01:31:31Z ADR-0004 (dari T-004): Redis noeviction. Cache hasil wajib TTL 24 jam, nilai terbatas, dan SET yang gagal OOM diperlakukan sebagai cache miss (jangan gagalkan query).

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
