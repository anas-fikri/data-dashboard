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
updated: "2026-10-12T11:15:34Z"
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
    - "n": 2
      by: claude-security-reviewer-subagen
      at: "2026-10-12T11:07:16Z"
      findings: 3
    - "n": 3
      by: claude-security-reviewer-subagen
      at: "2026-10-12T11:15:34Z"
      findings: 0
evidence:
  audit:
    at: "2026-10-12T11:12:10Z"
    passed: true
    tree: d66c9b21db026f04b92727296fa26b31c0b51d59a56e692586b99556ee5aeabd
    results:
      - name: osv-scanner (dependencies, offline db)
        exit_code: 0
        summary: |-
          Scanning dir .
          Starting filesystem walk for root: /
          Scanned /Users/anasfikri/Documents/Projects/pcpexpress/data-dashboard/.claude/worktrees/t-001-scaffold/package-lock.json file and found 715 packages
          End status: 100 dirs visited, 421 inodes visited, 1 Extract calls, 54.836667ms elapsed, 54.837ms wall time
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
    - Entri ≤ 4 MiB (hasil 10 ribu baris umumnya 2–4 MB; anggaran 64 MiB tetap memuat ≥ 16 entri sebesar itu), TTL 24 jam.
  - DuckDB kehabisan memori → QUERY_TOO_HEAVY dengan saran.
  - Tanpa rate limit per menit: slot per user, pembatas unduhan, cache negatif, dan batas hasil sudah membatasi; ditinjau ulang di T-024.
    - Risiko diterima sampai T-024: user dengan total data > MAX_LOCAL_PARQUET_BYTES (mungkin dalam kuota 20 GB) bisa terus mendorong file user lain keluar dari cache lokal. Dibatasi 1 unduhan per user dan 2 global, antrean FIFO.
  - Body permintaan (review putaran 3): dibaca streaming dengan batas byte (readTextLimited: /api/query 65 KB, unggah 8 KB, login 8 KB). Buffer proxy Next dibatasi 1 MB (proxyClientMaxBodySize).
    - Yang dibatasi memori per permintaan (≈ 1 MB), bukan durasi: proxy menunggu seluruh body tiba sebelum handler jalan (3 MB dikirim pelan selama 3 s → 400 setelah 3,08 s). Durasi dibatasi requestTimeout Node (300 s) dan client_max_body_size reverse proxy (T-023).
    - Body > 1 MB dipotong diam-diam (bukan 413): serverActions.bodySizeLimit dan batas Route Handler harus tetap ≤ 1 MB (dicatat di next.config.ts).
  - Batas hasil 5 MB kini memakai perkiraan heap, lebih ketat dari sebelumnya: 10 ribu baris × 3 teks 40 karakter + 10 ukuran ≈ 6,2 MB → RESULT_TOO_LARGE (pesan menyarankan mengurangi limit/dimensi). Spec perf (≈ 2,2 MB) tidak terpengaruh.
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
- [x] V1 Architecture: trust boundaries and the components handling sensitive data are identified for this change — Batas kepercayaan: browser → /api/query (sesi + Origin) → service (cek pemilik) → DuckDB terkunci (enable_external_access=false, allowed_directories, lock_configuration) → cache parquet lokal; unduhan S3 hanya di server. Dirinci di Risk (STRIDE).
- [x] V2 Authentication: credentials are verified server-side; no default, hard-coded, or weak secrets — N/A: tidak ada kredensial baru; rute memakai requireUser("action") yang sudah ada (sesi dicek server-side, 401 tanpa sesi).
- [x] V3 Session management: session tokens are random, protected, invalidated on logout and expiry — N/A: tidak mengubah sesi; memakai sesi yang ada (sessionVersion dicek).
- [x] V4 Access control: every endpoint/action checks authorization server-side, deny by default (no IDOR) — Dataset di-resolve where {id, ownerId}, sheet where {id, versionId}; bukan pemilik atau sheet dataset lain → 404 tanpa membocorkan keberadaan (AC 2, AC 7; uji unit + e2e). Cek pemilik terjadi sebelum cache hasil dibaca.
- [x] V5 Validation, sanitization and encoding: all input validated; output encoded; no injection (SQL, OS, template) — Spec zod strict dengan enum tertutup dan batas jumlah; nama kolom di-resolve lewat skema ke identifier c<pos>; semua nilai user diikat sebagai parameter; SQL selalu satu SELECT yang hanya membaca read_parquet($path) (uji F11); tanggal filter harus tanggal kalender sungguhan.
- [x] V6 Stored cryptography: sensitive data at rest uses approved algorithms; keys are not in the code — N/A: tidak menyimpan rahasia; SHA-256 hanya untuk kunci cache dan nama file (bukan kontrol keamanan).
- [x] V7 Error handling and logging: errors reveal no internals; security events are logged without secrets — Error tak terduga → 500 dengan pesan umum; kode error terpetakan (400/404/409/422/429/504). Log hanya userId + pesan error, tanpa isi data.
- [x] V8 Data protection: personal/sensitive data is minimized, not cached or logged, and removable — Respons Cache-Control: no-store. Cache hasil di memori proses (TTL 24 jam, kunci per dataset/versi/revisi). Salinan parquet lokal dibuang saat dataset dihapus (termasuk unduhan berjalan) dan setelah menganggur 3 hari.
- [x] V9 Communication: TLS for all external traffic; certificates validated — N/A di tingkat aplikasi: tidak ada endpoint eksternal baru; trafik S3 internal, TLS di reverse proxy deployment (T-023).
- [x] V10 Malicious code: no backdoors, time bombs, or unexplained network calls; dependencies are trusted — Tidak ada panggilan jaringan selain HEAD/GET objek S3 dari bucket yang dikonfigurasi; autoinstall/autoload ekstensi DuckDB dimatikan; @duckdb/node-api 1.5.6 resmi, npm audit 0.
- [x] V11 Business logic: flows cannot be abused (limits, ordering, replay, race conditions) — Slot query global + per user; pembatas unduhan (2 global, 1 per user); timeout 30 s + cache negatif; hasil ≤ 5 MB (perkiraan heap); spec ≤ 64 KB; schemaRevision di kunci cache; forget saat unduhan berjalan (review N1–N3).
- [x] V12 Files and resources: uploads are type/size limited and stored safely; no path traversal or SSRF — Tidak ada unggahan baru. Path file lokal = hash kunci dari DB (bukan input user); DuckDB hanya boleh membaca direktori cache/temp; kunci S3 dari DB, tidak ada SSRF.
- [x] V13 API and web service: API inputs/outputs are schema-validated; CORS and rate limits are deliberate — Input divalidasi skema zod; body JSON dibaca streaming ≤ 65 KB (readTextLimited) dan buffer proxy 1 MB; Origin wajib = APP_URL (403); tanpa header CORS; pembatasan lewat slot (rate limit per menit ditinjau di T-024).
- [x] V14 Configuration: secure defaults, security headers, no debug in production, dependencies up to date — Env QUERY_* divalidasi dengan batas min/max (cache hasil ≤ 512 MiB); konfigurasi DuckDB dikunci; tanpa mode debug; DuckDB di serverExternalPackages; npm audit 0.
