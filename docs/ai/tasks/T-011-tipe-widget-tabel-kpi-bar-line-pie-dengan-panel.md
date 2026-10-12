---
id: T-011
title: Tipe widget tabel, KPI, bar, line, pie dengan panel konfigurasi
status: in_review
profile: strict
profile_pinned: true
goal: G-4
tags:
  - security
depends_on:
  - T-009
  - T-010
created: "2026-10-11T14:45:09Z"
updated: "2026-10-12T22:52:45Z"
created_by: claude-code
workers:
  - claude-code
branch: worktree-t-001-scaffold
base: 5a7d2eb0f7922bb6c2dfa8951ec497d0b7545d0d
review:
  passes:
    - "n": 1
      by: claude-security-reviewer-subagen
      at: "2026-10-12T22:52:45Z"
      findings: 2
    - "n": 2
      by: frontend-expert-design-reviewer
      at: "2026-10-12T22:52:45Z"
      findings: 13
---

## Objective
Panel konfigurasi: sheet, dimensi, ukuran + agregasi (sum/avg/count/min/max/count distinct), sort, top-N, format angka (ribuan ID, persen, Rp dengan spasi biasa, D11). Spec tersimpan di Widget. /api/query menerima {widgetId, filters} dan mengambil spec dari widget (pemilik dulu; non-pemilik diaktifkan T-016). Render ECharts (skill dataviz). Tabel: paginasi server 100 baris, sort kolom. Kolom hidden/hilang → pesan di widget, widget lain tetap jalan.

## Acceptance criteria
- [ ] Given widget bar dimensi cabang + sum(omzet) pada fixture kecil, when dirender, then nilai sama dengan SUMIF yang dihitung test dari fixture
- [ ] Given widget KPI format Rp dengan nilai 1234567.5, when dirender, then teks tepat 'Rp 1.234.568' dengan spasi U+0020
- [ ] Given widget tabel, when user sort kolom dan pindah halaman, then hanya 100 baris per halaman dikirim dan urutan sesuai
- [ ] Given kolom yang dirujuk widget disembunyikan di skema, when dashboard dibuka, then widget itu menampilkan pesan kolom tidak tersedia dan widget lain berfungsi
- [ ] Given widget tabel atas sheet 1 juta baris (perf), when sort + pindah halaman, then respons < 2 detik; bukti di docs/ai/perf/T-011.md
- [ ] Given halaman/komponen task ini selesai, when /frontend-expert:audit dijalankan (anti-slop-design, responsive 320/768/1024/1440, accessibility), then tidak ada temuan Critical/High dan blok Conventions check (Tokens: preset project; Icons: waiver @tabler/icons-react; States loading/empty/error; Responsive; A11y) dicatat sebagai note task
- [ ] Given nilai sel atau nama kolom berisi '<img src=x onerror=alert(1)>', when tooltip/label/tabel dirender, then tampil sebagai teks (tooltip renderMode richText atau escape wajib di formatter)

## Risk
- **Impact:**
  - Widget mendapat isi: tipe table/kpi/bar/line/pie + spec (Widget.type/spec, kolom JSON yang sudah ada sejak T-010; tanpa migrasi).
  - /api/query menerima bentuk kedua `{ widgetId, filters?, page?, sort? }` (spec diambil dari widget di DB); bentuk T-009 `{ datasetId, spec }` tetap.
  - PATCH /api/dashboards/[id]/widgets/[widgetId] menerima `{ type, spec }`; tambah widget (urungkan hapus) menerima tipe + spec.
  - Mesin query DuckDB: jatah per user kini antre ≤ queueWaitMs alih-alih langsung QUERY_BUSY (tetap tidak melebihi jatah).
  - Dependensi baru ECharts 6.1.0 (+ zrender 6.1.0), dimuat malas hanya bila ada grafik.
  - Token warna grafik --chart-1…6 diganti palet kategori (terang + gelap); sebelumnya tidak dipakai di mana pun.
- **Security (STRIDE):**
  - **Spoofing:** semua rute memakai sesi server; tanpa sesi → 401.
  - **Tampering:**
    - Spec widget divalidasi zod ketat per tipe dan terhadap skema aktif (kolom ada, tidak disembunyikan, agregasi cocok) saat disimpan, dan diulang saat query.
    - Kolom dirujuk lewat posisi → nama → kolom fisik c<pos> buatan program; nilai filter lewat parameter binding; urutan tabel hanya kolom milik tabel itu (indeks), halaman dibatasi 0–100.000.
  - **Repudiation:** perubahan widget tidak diaudit per langkah (bukan data sensitif); kegagalan query dicatat dengan userId tanpa body.
  - **Information disclosure:**
    - Widget di-resolve lewat dashboard.dataset.ownerId; milik orang lain = tidak ada → 404 (tanpa oracle). Non-pemilik baru di T-016.
    - Cache hasil memakai kunci dataset/versi/sheet/revisi skema/spec; pemeriksaan pemilik terjadi sebelum cache.
    - Nilai sel dan nama kolom ditampilkan sebagai teks: React meng-escape; ECharts tooltip renderMode "richText" + formatter teks biasa; label sumbu/pai lewat formatter fungsi (AC 7).
    - Error tak terduga → 500 tanpa detail.
  - **DoS:**
    - Query per user dibatasi slot DuckDB (antre ≤ 10 s, lalu QUERY_BUSY); klien maks. 2 query widget bersamaan per halaman dengan coba ulang bertahap.
    - Halaman tabel 100 baris, teks sel ≤ 500 karakter, hasil ≤ 5 MB, timeout query, cache negatif untuk timeout.
    - Perubahan widget: rate limit dashboardEdit 600/10 menit, body ≤ 64 KB.
  - **Elevation:** CSRF — semua POST/PATCH wajib Origin = APP_URL (403).
- **Rollback:**
  - Revert commit T-011. Tidak ada migrasi skema; widget yang sudah diatur akan tampil kosong lagi di kode lama (kolom type/spec diabaikan).
  - Antrean per user di mesin query bisa dikembalikan ke penolakan langsung tanpa perubahan data.
- **Validation:**
  - Unit: tests/features/query/widget-query.test.ts (DuckDB sungguhan: batang = SUMIF, tabel 100 baris + urut + halaman, COLUMN_UNAVAILABLE, SHEET_UNAVAILABLE, NOT_FOUND, format Rp), tests/features/dashboards/dashboards.test.ts (simpan/pulihkan spec), tests/features/query/query.test.ts (antrean per user), tests/components/widget-config.test.ts (pilihan awal, opsi grafik richText).
  - e2e: tests/e2e/widgets.spec.ts (project widgets, worker sungguhan) — AC 1, 2, 3, 4, 7.
  - Perf: docs/ai/perf/T-011.md — 1 juta baris p95 114 ms, maks 115 ms (AC 5).

## Notes
- 2026-10-11T14:49:25Z UI wajib lewat rantai frontend-expert: design-foundations → tokens (preset dari T-025) → (+forms/data-fetching/app-shell sesuai kebutuhan) → components → anti-slop-code → responsive → motion ringan → anti-slop-design → polish → accessibility. Skip design-direction karena arah sudah dipilih di T-025, kecuali layar baru yang ambigu. Chart via skill dataviz; filter/select pakai Select kustom dari T-025, bukan native.
- 2026-10-11T14:56:59Z Kolom sort tabel divalidasi terhadap kolom widget, bukan seluruh skema.
- 2026-10-12T14:28:33Z Dari review T-010 (L6): urungkan hapus widget saat ini memulihkan judul dan posisi saja karena widget masih kosong. Begitu widget punya type/spec, urungkan hapus wajib memulihkan type dan spec juga (dikirim di body restore, validasi sama dengan buat).

## Security checklist (OWASP ASVS 4.0.3)
<!-- Check each item when verified, or write "N/A: <reason>" after the text and check it. -->
- [x] V1 Architecture: trust boundaries and the components handling sensitive data are identified for this change — Batas kepercayaan: browser → PATCH widget (simpan tipe/spec) dan POST /api/query { widgetId } (sesi server) → service widget/query (pemilik lewat dashboard.dataset.ownerId) → Postgres (Widget.type/spec, skema sheet) → cache parquet lokal + DuckDB sandbox (enable_external_access=false, allowed_directories). Dirinci di Risk.
- [x] V2 Authentication: credentials are verified server-side; no default, hard-coded, or weak secrets — N/A: tidak mengubah autentikasi; memakai sesi yang ada (requireUser).
- [x] V3 Session management: session tokens are random, protected, invalidated on logout and expiry — N/A: tidak mengubah sesi.
- [x] V4 Access control: every endpoint/action checks authorization server-side, deny by default (no IDOR) — Widget dan dashboard selalu dicari dengan where dataset.ownerId = user (query, simpan, pulihkan, sumber data panel); sheet harus milik versi aktif dataset widget. Bukan pemilik/tidak ada → 404 yang sama. Diuji unit (NOT_FOUND) dan e2e.
- [x] V5 Validation, sanitization and encoding: all input validated; output encoded; no injection (SQL, OS, template) — Spec zod ketat per tipe + validasi terhadap skema aktif; SQL hanya identifier c<pos>/_row buatan program, fungsi/arah dari enum tertutup, nilai lewat parameter; output React ter-escape, ECharts tooltip richText + formatter teks (AC 7).
- [x] V6 Stored cryptography: sensitive data at rest uses approved algorithms; keys are not in the code — N/A: tidak ada data rahasia baru yang disimpan.
- [x] V7 Error handling and logging: errors reveal no internals; security events are logged without secrets — Kode error tetap (INVALID, NOT_FOUND, NOT_READY, COLUMN_UNAVAILABLE, SHEET_UNAVAILABLE, QUERY_BUSY, QUERY_TIMEOUT, …) dengan pesan Indonesia yang bisa ditindak; error tak terduga → 500 tanpa detail, dicatat dengan userId tanpa body/SQL.
- [x] V8 Data protection: personal/sensitive data is minimized, not cached or logged, and removable — Hasil query no-store; cache hasil di memori proses dengan kunci per dataset/versi/revisi skema; tidak ada data baru yang dicatat di log.
- [x] V9 Communication: TLS for all external traffic; certificates validated — N/A: tidak ada lalu lintas eksternal baru (ECharts dibundel, bukan CDN).
- [x] V10 Malicious code: no backdoors, time bombs, or unexplained network calls; dependencies are trusted — Dependensi baru echarts 6.1.0 + zrender 6.1.0 (Apache-2.0, dipin persis, rilis 2026-05-19), npm audit 0 kerentanan; dimuat dari bundel sendiri.
- [x] V11 Business logic: flows cannot be abused (limits, ordering, replay, race conditions) — Satu user tidak bisa memegang lebih dari jatah slot query (antrean berbatas waktu); halaman tabel dibatasi; urutan hanya kolom tabel; spec yang tidak lagi cocok dengan skema memberi pesan per widget tanpa mengganggu widget lain.
- [x] V12 Files and resources: uploads are type/size limited and stored safely; no path traversal or SSRF — N/A: tidak ada unggahan baru; path parquet hanya dari kunci typedKey di DB (parameter, dibatasi allowed_directories).
- [x] V13 API and web service: API inputs/outputs are schema-validated; CORS and rate limits are deliberate — Body /api/query dan PATCH widget divalidasi zod ketat (kunci tak dikenal ditolak), ≤ 64 KB, Origin wajib = APP_URL, Cache-Control no-store; perubahan widget dibatasi rate limit dashboardEdit.
- [x] V14 Configuration: secure defaults, security headers, no debug in production, dependencies up to date — Tidak ada konfigurasi baru; header keamanan dan CSP tetap (ECharts tanpa eval/inline script, renderer SVG).
