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
updated: "2026-10-13T07:53:17Z"
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
    - "n": 3
      by: frontend-expert-design-reviewer
      at: "2026-10-12T23:43:27Z"
      findings: 8
    - "n": 4
      by: claude-security-reviewer-subagen
      at: "2026-10-12T23:43:27Z"
      findings: 1
    - "n": 5
      by: claude-verify-workflow
      at: "2026-10-13T01:32:49Z"
      findings: 32
    - "n": 6
      by: claude-verify-workflow
      at: "2026-10-13T02:11:42Z"
      findings: 21
    - "n": 7
      by: claude-verify-workflow
      at: "2026-10-13T03:15:56Z"
      findings: 13
    - "n": 8
      by: claude-verify-workflow
      at: "2026-10-13T04:46:22Z"
      findings: 6
    - "n": 9
      by: frontend-expert-design-reviewer
      at: "2026-10-13T05:24:21Z"
      findings: 4
    - "n": 10
      by: frontend-expert-design-reviewer
      at: "2026-10-13T05:47:12Z"
      findings: 2
    - "n": 11
      by: frontend-expert-design-reviewer
      at: "2026-10-13T07:21:47Z"
      findings: 4
    - "n": 12
      by: frontend-expert-design-reviewer
      at: "2026-10-13T07:40:58Z"
      findings: 1
evidence:
  check:
    cmd: npm run check
    exit_code: 0
    duration_ms: 32983
    summary: |-
      > data-dashboard@0.1.0 check
      > npm run lint && npm run typecheck && npm run test && npm run audit


      > data-dashboard@0.1.0 lint
      > eslint . && prettier --check .

      Checking formatting...
      All matched files use Prettier code style!

      > data-dashboard@0.1.0 typecheck
      > tsc --noEmit


      > data-dashboard@0.1.0 test
      > vitest run


       RUN  v5.0.3 /Users/anasfikri/Documents/Projects/pcpexpress/data-dashboard/.claude/worktrees/t-001-scaffold

      {"level":40,"time":1791877975519,"service":"data-dashboard","check":"B","detail":"koneksi ditolak","msg":"health check gagal"}
      {"level":40,"time":1791877975542,"service":"data-dashboard","check":"Lambat","detail":"Lambat: timeout 20 ms","msg":"health check gagal"}

       Test Files  31 passed (31)
            Tests  589 passed (589)
         Start at  14:52:52
         Duration  23.41s (tests 89%, import 6%, transform 4%)


      > data-dashboard@0.1.0 audit
      > npm audit --audit-level=high --omit=dev && npm audit --audit-level=critical

      found 0 vulnerabilities
      found 0 vulnerabilities
    at: "2026-10-13T07:53:17Z"
    tree: 3f66aa2db727517b2cfade797e4783c461f0224d8a7989f7c11d495f96cb7281
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
  - Mesin query DuckDB: jatah per user kini antre (maks. 8 penunggu, total antre ≤ queueWaitMs) alih-alih langsung QUERY_BUSY; jatah user dipegang sebelum menyewa file parquet (penunggu tidak menahan file); tetap tidak melebihi jatah.
  - /api/query: rate limit 600/menit per user (429 + Retry-After).
  - Grafik widget: query total terpisah (jumlah kategori + total Total/Jumlah baris) dibatasi 5 s; pai maks. 5 irisan + "Lainnya", hanya Total/Jumlah baris.
  - Halaman tabel: materialisasi terlambat (urut + OFFSET hanya kolom urut dan _row), halaman dijepit ke halaman terakhir, urutan teks COLLATE nocase.noaccent (seperti Excel).
  - Data diganti (unggahan baru langsung aktif): spec widget dipetakan ke versi aktif saat dibaca (sheet lewat nama, atau satu-satunya sheet hanya bila versi lama juga satu sheet; kolom lewat nama, kolom yang hilang → COLUMN_UNAVAILABLE menyebut nama lamanya; features/widgets/remap.ts); disimpan permanen saat user menyimpan widget (T-013 akan memindahkan ke aktivasi versi).
  - Komponen bersama: ui/select.tsx (dropdown dibatasi layar, opsi membungkus, 44 px di ponsel).
  - Dependensi baru ECharts 6.1.0 (+ zrender 6.1.0), dimuat malas hanya bila ada grafik.
  - Token warna grafik --chart-1…6 diganti palet kategori (terang + gelap); sebelumnya tidak dipakai di mana pun.
- **Security (STRIDE):**
  - **Spoofing:** semua rute memakai sesi server; tanpa sesi → 401.
  - **Tampering:**
    - Spec widget divalidasi zod ketat per tipe dan terhadap skema aktif (kolom ada, tidak disembunyikan, agregasi cocok) saat disimpan, dan diulang saat query.
    - Kolom dirujuk lewat posisi → nama → kolom fisik c<pos> buatan program; nilai filter lewat parameter binding (angka dibatasi ±2^53); urutan tabel hanya kolom milik tabel itu (indeks), halaman dibatasi 0–100.000 dan dijepit ke data.
    - Pemetaan versi baru hanya membaca sheet dataset yang sama (where version.datasetId) — tidak lintas tenant; cache riwayat (features/query/history-cache.ts) dibatasi 500 entri dan 100.000 kolom skema, entri kedaluwarsa (30 s) dibuang saat menulis, skema target selalu dibaca segar.
    - PATCH judul + isi: judul divalidasi lebih dulu, tidak ada bagian yang tersimpan bila yang lain ditolak.
  - **Repudiation:** perubahan widget tidak diaudit per langkah (bukan data sensitif); kegagalan query dicatat dengan userId tanpa body.
  - **Information disclosure:**
    - Widget di-resolve lewat dashboard.dataset.ownerId; milik orang lain = tidak ada → 404 (tanpa oracle). Non-pemilik baru di T-016.
    - Cache hasil memakai kunci dataset/versi/sheet/revisi skema/spec; pemeriksaan pemilik terjadi sebelum cache.
    - Nilai sel dan nama kolom ditampilkan sebagai teks: React meng-escape; ECharts tooltip renderMode "richText" + formatter teks biasa; label sumbu/pai lewat formatter fungsi (AC 7).
    - Error tak terduga → 500 tanpa detail. Nama kolom tersembunyi tidak disebut untuk kolom filter dari klien.
  - **DoS:**
    - Query per user dibatasi slot DuckDB (antre maks. 8, ≤ 10 s, lalu QUERY_BUSY) + rate limit 600/menit; klien maks. 2 query widget bersamaan per halaman dengan coba ulang bertahap.
    - Halaman tabel 100 baris dengan materialisasi terlambat (halaman terakhir tabel 20 kolom teks 1 juta baris ± 0,75 s, sebelumnya 17 s), teks sel ≤ 500 karakter, hasil ≤ 5 MB, timeout bersama count + halaman, cache negatif untuk timeout.
    - Total grafik: query terpisah tanpa GROUP BY/window, maks. 5 s; gagal → grafik tanpa total (pai memberi catatan persen parsial), hasil itu di-cache 30 s saja.
    - Perubahan widget: rate limit dashboardEdit 600/10 menit, body ≤ 64 KB.
  - **Elevation:** CSRF — semua POST/PATCH wajib Origin = APP_URL (403).
- **Rollback:**
  - Revert commit T-011. Tidak ada migrasi skema; widget yang sudah diatur akan tampil kosong lagi di kode lama (kolom type/spec diabaikan).
  - Antrean per user di mesin query bisa dikembalikan ke penolakan langsung tanpa perubahan data.
  - Pemetaan versi saat dibaca tidak menulis apa pun; mematikannya mengembalikan perilaku "Sheet tidak ada di data aktif".
- **Validation:**
  - Unit: tests/features/query/widget-query.test.ts (DuckDB sungguhan: batang = SUMIF, total grafik termasuk ukuran tanggal, tabel 100 baris + urut + halaman + jepit, COLUMN_UNAVAILABLE, SHEET_UNAVAILABLE, NOT_FOUND, pemetaan versi baru, format Rp/otomatis/durasi), tests/features/dashboards/dashboards.test.ts (simpan/pulihkan spec, spec usang dipulihkan kosong), tests/features/query/query.test.ts (antrean per user + batas antrean), tests/components/widget-config.test.ts (pilihan awal, opsi grafik richText, sumbu waktu UTC, persen = 100, label), tests/lib/api-route.test.ts. Putaran verifikasi 2–4: tests/components/chart-round3.test.ts (sumbu periode + isi celah, urutan garis, durasi, pai Lainnya/toleransi/parsial, chartFit kartu kecil, tabel data grafik, cap waktu), tests/components/widget-views-round3.test.ts (KPI fallback, kolom mirip ID, tombol data, sentinel kolom hilang), tests/features/query/history-cache.test.ts (batas cache riwayat), widget-config.test.ts (Maks. Tab, kolom hilang, label urut, ukuran tanggal grafik).
  - e2e: tests/e2e/widgets.spec.ts (project widgets, worker sungguhan) — AC 1, 2, 3, 4, 7 + data diganti (unggah ulang → widget tampil angka baru). + kolom diganti namanya di unggahan baru → widget menyebut kolom lama (7 test).
  - Perf: docs/ai/perf/T-011.md — 1 juta baris p95 94 ms; 20 kolom teks maks 791 ms (AC 5); scripts/perf-widget-table.ts, scripts/perf-table-wide.ts.
  - Review: 3 lensa (desain/a11y, keamanan, integritas data) lewat workflow multi-agen; CSP produksi diperiksa (chunk ECharts tanpa eval). Verifikasi diulang 4 putaran (desain/a11y + keamanan + integritas + kritikus kelengkapan) sampai tanpa Critical/High; sisa Low/Info dicatat ke T-031 dan T-032.

## Notes
- 2026-10-11T14:49:25Z UI wajib lewat rantai frontend-expert: design-foundations → tokens (preset dari T-025) → (+forms/data-fetching/app-shell sesuai kebutuhan) → components → anti-slop-code → responsive → motion ringan → anti-slop-design → polish → accessibility. Skip design-direction karena arah sudah dipilih di T-025, kecuali layar baru yang ambigu. Chart via skill dataviz; filter/select pakai Select kustom dari T-025, bukan native.
- 2026-10-11T14:56:59Z Kolom sort tabel divalidasi terhadap kolom widget, bukan seluruh skema.
- 2026-10-12T14:28:33Z Dari review T-010 (L6): urungkan hapus widget saat ini memulihkan judul dan posisi saja karena widget masih kosong. Begitu widget punya type/spec, urungkan hapus wajib memulihkan type dan spec juga (dikirim di body restore, validasi sama dengan buat).
- 2026-10-13T05:07:29Z Ukuran minimum widget tabel 3x4 (verifikasi putaran 4–6): dijaga di kanvas (resize, ubah jenis → simpan tata letak), di server pada getDashboard/addWidget/deleteWidget/saveLayout (fitMinSizes). configureWidget sengaja tidak menulis tata letak (menaikkan revisi di luar editor akan memicu STALE); kanvas menyimpan tata letak yang sudah diperbesar setelah ubah jenis dan semua jalur baca memperbesar, jadi selisih simpan-vs-tampil hanya sementara dan tidak terlihat pengguna.

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
