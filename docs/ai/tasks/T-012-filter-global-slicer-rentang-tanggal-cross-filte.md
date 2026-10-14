---
id: T-012
title: Filter global, slicer, rentang tanggal, cross-filter
status: in_review
profile: strict
profile_pinned: true
goal: G-4
tags:
  - security
depends_on:
  - T-011
created: "2026-10-11T14:45:09Z"
updated: "2026-10-14T03:32:04Z"
created_by: claude-code
workers:
  - claude-code
branch: worktree-t-001-scaffold
base: 098fc7793391d5395405eff5c73923297cb10705
review:
  passes:
    - "n": 1
      by: claude-verify-workflow
      at: "2026-10-13T23:51:57Z"
      findings: 30
    - "n": 2
      by: claude-verify-workflow
      at: "2026-10-14T01:58:53Z"
      findings: 15
    - "n": 3
      by: frontend-expert-design-reviewer
      at: "2026-10-14T03:10:57Z"
      findings: 5
evidence:
  check:
    cmd: npm run check
    exit_code: 0
    duration_ms: 35553
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

      {"level":40,"time":1791948701426,"service":"data-dashboard","check":"B","detail":"koneksi ditolak","msg":"health check gagal"}
      {"level":40,"time":1791948701448,"service":"data-dashboard","check":"Lambat","detail":"Lambat: timeout 20 ms","msg":"health check gagal"}

       Test Files  46 passed (46)
            Tests  757 passed (757)
         Start at  10:31:38
         Duration  24.59s (tests 87%, import 8%, transform 5%)


      > data-dashboard@0.1.0 audit
      > npm audit --audit-level=high --omit=dev && npm audit --audit-level=critical

      found 0 vulnerabilities
      found 0 vulnerabilities
    at: "2026-10-14T03:32:04Z"
    tree: e39c3482deba0ad4e55b0adb46e0ca73d8dd6e9b4f9d0351ab3adc84d093deab
---

## Objective
Bar filter dashboard: slicer multi-select dengan pencarian server-side (DISTINCT LIMIT 1000, peringatan > 1000), rentang tanggal preset (bulan ini, kuartal, YTD) dihitung Asia/Jakarta dan dibandingkan naive (D8), filter angka. Kolom filter yang diizinkan tersimpan di Dashboard. Klik elemen chart → cross-filter widget lain (bisa dimatikan per widget). Filter di URL.

## Acceptance criteria
- [ ] Given slicer cabang dipilih 2 nilai, when dashboard dimuat ulang dengan URL sama, then kedua nilai terpilih dan semua widget terfilter
- [ ] Given user klik batang 'Jakarta' pada chart A, when cross-filter aktif, then widget B dan C hanya data Jakarta dan tombol hapus filter muncul
- [ ] Given hari ini 2026-10-11 Asia/Jakarta dan kolom DATE, when preset YTD, then filter 2026-01-01 ≤ tanggal ≤ 2026-10-11 tanpa pergeseran zona
- [ ] Given kolom dengan 5.000 nilai unik, when slicer dibuka, then 1000 nilai pertama tampil, peringatan muncul, dan mengetik 3 huruf menyaring di server
- [ ] Given halaman/komponen task ini selesai, when /frontend-expert:audit dijalankan (anti-slop-design, responsive 320/768/1024/1440, accessibility), then tidak ada temuan Critical/High dan blok Conventions check (Tokens: preset project; Icons: waiver @tabler/icons-react; States loading/empty/error; Responsive; A11y) dicatat sebagai note task

## Risk
- Impact: skema DB (kolom baru `Dashboard.filterColumns` JSONB default `[]`, migrasi `20261013172513_dashboard_filter_columns`, aditif); jalur query widget (`/api/query` menerima `dashboardFilters`, kunci cache hasil ditambah klausa kanonik — tanpa filter dashboard kunci lama tidak berubah); `getDashboard` membaca skema sheet versi aktif bila ada kolom filter/grafik (satu query tambahan); endpoint baru `POST /api/dashboards/[id]/filter-values` dan `PATCH /api/dashboards/[id]/filter-columns` (satu-satunya jalur ubah kolom filter; Server Action duplikat dihapus di review putaran 1); spec grafik menerima `crossFilter?: boolean`; redaksi log ditambah kunci `dashboardFilters/values/value/q/cross`. Review putaran 1: filter `not_in` ("semua kecuali"); filter berlaku hanya bila kelompok tipe kolom widget (teks | angka | waktu | boolean) sama dengan kolom sumbernya (kolom filter atau dimensi grafik cross-filter), lainnya dilewati; satu kolom filter per nama (nama sama dari sheet lain ditolak, data lama dengan nama ganda: entri pertama yang dipakai); tanggal saja pada kolom TIMESTAMP cocok sehari penuh; repo query `crossFilterColumns` → `filterSources` (nama + tipe, cache 30 detik per dashboard); `QueryEngine.exec` menerima AbortSignal. Review putaran 2: field `filters` posisional (T-011) dihapus dari body `/api/query` widget — body strict, jadi permintaan yang masih mengirimnya → 400 INVALID (klien T-012 sudah tidak mengirimnya; `widgetPlan` tidak lagi menerima filter klien, spec widget memang tidak punya filter sendiri); jalur viewer D6 menjadi `{widgetId, dashboardFilters}` (docs/flow-kerja.md D6 + bagian query, docs/ai/conventions.md, Objective + catatan T-016). Widget/dashboard lama tetap jalan tanpa perubahan data.
- Security (STRIDE): S — semua endpoint lewat requireUser + Origin = APP_URL. T — satu-satunya filter dari klien adalah `dashboardFilters` (kolom lewat nama; `filters` posisional lama dihapus di review putaran 2 → 400, sehingga tidak ada jalur yang melewati pemeriksaan kelompok tipe dan ketersediaan sumber), dibatasi `filterColumns` ∪ dimensi grafik cross-filter yang dihitung server (D6); filter bernama sama di sheet lain hanya berlaku bila kelompok tipenya sama dengan kolom sumber yang tersedia (sisa risiko: kolom bertipe sama dan bernama sama di sheet lain ikut tersaring — sesuai rancangan; pemilik yang memilih kolom filter, dan peringatan untuk dialog berbagi dicatat di T-016); nilai lewat parameter binding, identifier hanya `c<pos>` dari skema; preset dihitung server (bukan tanggal dari klien). R — perubahan kolom filter menaikkan `Dashboard.updatedAt`. I — dashboard/kolom milik orang lain → NOT_FOUND/404; kolom tersembunyi tidak pernah dipakai (filter dilewati, slicer → COLUMN_UNAVAILABLE) dan tampilan kolom filter yang tidak tersedia hanya membawa nama tersimpan + tipe netral; klien tidak lagi mengirim posisi kolom, jadi beda 400/409 tidak bisa dipakai menghitung lebar skema (termasuk kolom tersembunyi); nilai filter/kata cari tidak dicatat di log aplikasi (redaksi pino diuji). Pengecualian sadar: status filter ada di URL `?f=` (AC1), jadi nilainya bisa masuk riwayat browser, log request dev server, dan access log reverse proxy → T-023 wajib membuang query string dari access log (Caddy filter `request>uri` / nginx `$uri`, bukan `$request_uri`); Referer ke situs lain aman karena `strict-origin-when-cross-origin`. D — rate limit `filterValues` 300/menit/user terpisah, jatah query per user + global yang sama dengan widget, batas waktu slicer 10 detik, LIMIT 1001, body ≤ 8 KB / 64 KB, ≤ 20 filter × ≤ 500 nilai; hasil slicer di-cache (LRU berbatas byte) dengan kunci kata cari ternormalisasi (NFC, huruf kecil, tanpa aksen — "a"/"A"/"á" satu entri), daftar > 256 KB tidak di-cache, permintaan slicer yang dibatalkan klien tidak menjalankan DuckDB bila masih antre dan di-interrupt bila sedang berjalan. E — pengaturan kolom filter hanya pemilik (`dataset.ownerId`), validasi ulang terhadap versi aktif.
- Rollback: revert kode T-012; kolom `filterColumns` boleh dibiarkan (default `[]`, tidak dibaca kode lama) atau dihapus dengan migrasi `ALTER TABLE "Dashboard" DROP COLUMN "filterColumns"`. Spec widget dengan `crossFilter` akan ditolak schema strict versi lama → bersihkan dengan `UPDATE "Widget" SET spec = spec - 'crossFilter'` sebelum rollback kode.
- Keterbatasan yang diterima: nilai slicer yang panjangnya tepat 500 karakter dicocokkan lewat awalan 500 karakter (agar cross-filter dari label grafik yang dipotong tetap kena), sehingga teks lain yang lebih panjang dengan awalan sama ikut tersaring — butuh teks tepat 500 karakter + teks lebih panjang berawalan sama, jarang; dua dimensi grafik cross-filter bernama sama dengan tipe berbeda: filter berlaku untuk kedua kelompok tipe bila nilainya cocok dengan keduanya (mis. teks "2026-10-14"); nilai DECIMAL dari slicer dikirim sebagai number JS, jadi nilai dengan > 15 digit signifikan (atau 16–17 digit yang representasi terpendeknya beda dari nilai tersimpan, mis. 123456789012,123456 → 123456789012.12346) tidak bisa dicocokkan kembali: `in` → 0 baris (tampak janggal), dan `not_in` ("semua kecuali") tidak mengecualikan nilai itu sama sekali — barisnya tetap terhitung tanpa peringatan, padahal chip berbunyi "Semua kecuali …" (perbaikan nanti: kirim teks desimal persis dari slicer dan cast `$f` ke DECIMAL(38,6)); pencarian slicer mencocokkan teks nilai tersimpan, bukan label tampil: kolom durasi dicari dalam detik ("5400" ketemu, "1:30" / "1,5" tidak), dan DOUBLE sangat kecil/besar ditulis DuckDB dalam notasi ilmiah ("0,0000001" tidak menemukan 1e-07) — gejala sama dengan pencarian boolean sebelum putaran 1, nilai tetap bisa dipilih dari daftar tanpa kata cari.
- Validation: unit test DuckDB sungguhan `tests/features/query/dashboard-filters.test.ts` (in + kosong, `not_in` dengan/tanpa (Kosong) + awalan 500 + in∪not_in = semua baris, tanggal saja pada TIMESTAMP = sehari penuh untuk in/not_in, rentang DECIMAL/DOUBLE/tanggal, preset 2026-10-11 WIB pada DATE/TIMESTAMP, batas 2026-12-31 23:30 UTC, filter dilewati di sheet lain/tersembunyi/tipe nilai beda, kelompok tipe beda dengan sumber → dilewati (tanggal vs teks, angka vs teks, sumber dimensi cross-filter), kolom tidak diizinkan → INVALID tanpa query, `filters` posisional ditolak → INVALID tanpa membaca sumber filter/DuckDB, juga untuk kolom yang diizinkan, posisi tidak ada, dan bersama dashboardFilters sah — jawaban identik untuk semua posisi, kunci cache kanonik), `tests/features/query/widget-query.test.ts` (`filters` posisional → INVALID identik untuk posisi ada/tersembunyi/tidak ada tanpa menyebut nama kolom, dashboardFilters di luar kolom filter → INVALID, angka di luar ±2^53 → INVALID, kolom filter tersembunyi → dilewati), `tests/features/query/filter-values.test.ts` (5.000 nilai → 1000 + truncated, "jak" tanpa peka kapital/aksen, wildcard di-escape, boolean lewat "ya"/"tidak"/"true"/"false", angka "1.234,25"/"4.999", kunci cache ternormalisasi = satu query, daftar > 256 KB tidak di-cache, sinyal batal → tanpa DuckDB, NOT_FOUND bukan pemilik), `tests/features/query/filter-values-http.test.ts` (429 + Retry-After, 403/401, status per kode, sinyal permintaan diteruskan, log tanpa kata cari), `tests/features/dashboards/filter-columns.test.ts` (validasi pengaturan kolom filter termasuk nama sama dari sheet lain ditolak, tampilan tidak tersedia = nama tersimpan + tipe netral, sumber filter + tipe, kolom cross-filter), `tests/lib/logger.test.ts` (redaksi); E2E `tests/e2e/filters.spec.ts` (AC1–AC4); perf `docs/ai/perf/T-012.md` (1 juta baris, p95 widget 36 ms, slicer cari 31 ms).

## Notes
- 2026-10-11T14:49:25Z UI wajib lewat rantai frontend-expert: design-foundations → tokens (preset dari T-025) → (+forms/data-fetching/app-shell sesuai kebutuhan) → components → anti-slop-code → responsive → motion ringan → anti-slop-design → polish → accessibility. Skip design-direction karena arah sudah dipilih di T-025, kecuali layar baru yang ambigu. Chart via skill dataviz; filter/select pakai Select kustom dari T-025, bukan native.
- 2026-10-11T14:56:59Z allowedFilterColumns per dashboard disimpan server; filter di URL divalidasi terhadapnya; nilai filter tidak di-log (pino redaksi).

## Security checklist (OWASP ASVS 4.0.3)
<!-- Check each item when verified, or write "N/A: <reason>" after the text and check it. -->
- [x] V1 Architecture: trust boundaries and the components handling sensitive data are identified for this change — batas: klien → Route Handler (`/api/query`, `/api/dashboards/[id]/filter-values`, `/filter-columns`) / Server Action → service (authz pemilik, validasi zod, izin kolom D6) → DuckDB (parameter binding). Data sensitif = nilai filter/kata cari (tidak di-log).
- [x] V2 Authentication: credentials are verified server-side; no default, hard-coded, or weak secrets — N/A: tidak mengubah autentikasi; endpoint baru memakai requireUser("action") yang ada (401 tanpa sesi, diuji).
- [x] V3 Session management: session tokens are random, protected, invalidated on logout and expiry — N/A: tidak mengubah sesi (JWT + sessionVersion T-002 tetap dipakai).
- [x] V4 Access control: every endpoint/action checks authorization server-side, deny by default (no IDOR) — filter-values: `dashboard.dataset.ownerId = user` (lainnya NOT_FOUND 404, diuji); setter kolom filter: `updateMany where {id, dataset:{ownerId}}` (NOT_FOUND, diuji); query widget: satu-satunya filter klien `dashboardFilters` — kolomnya hanya `filterColumns` ∪ dimensi cross-filter dari DB (INVALID tanpa DuckDB, diuji) dan hanya diterapkan ke kolom dengan kelompok tipe yang sama dengan sumbernya yang tersedia (diuji); `filters` posisional lama dihapus (body strict → 400, diuji), jadi tidak ada jalur filter yang melewati pemeriksaan ini; sheet selalu dari versi aktif dataset dashboard.
- [x] V5 Validation, sanitization and encoding: all input validated; output encoded; no injection (SQL, OS, template) — zod strict (`dashFilterSchema`, `widgetBodySchema` tanpa `filters`, `filterValuesBodySchema`, `filterColumnSchema`), tanggal kalender diperiksa, angka ±2^53; SQL: identifier `c<pos>` dari skema, nilai/kata cari lewat `$f`/`$q`, wildcard LIKE di-escape (diuji), cast DECIMAL lewat teks hasil decimal6.
- [x] V6 Stored cryptography: sensitive data at rest uses approved algorithms; keys are not in the code — N/A: tidak ada data rahasia baru yang disimpan (filterColumns hanya nama sheet/kolom).
- [x] V7 Error handling and logging: errors reveal no internals; security events are logged without secrets — error tak terduga → 503/BUSY tanpa detail; log aplikasi hanya userId + pesan error; kunci `dashboardFilters/values/value/q/cross/filters` diredaksi (tests/lib/logger.test.ts, filter-values-http.test.ts). Pengecualian sadar: nilai filter di `?f=` ikut tercatat di log request (dev server, access log proxy) — lihat V8.
- [x] V8 Data protection: personal/sensitive data is minimized, not cached or logged, and removable — nilai filter tidak di-log aplikasi; hasil query/slicer hanya di cache memori proses (LRU berbatas byte, TTL 24 jam, kunci memuat versi + schemaRevision; daftar slicer > 256 KB tidak di-cache); respons no-store; teks > 1000 karakter tidak dikirim ke slicer. **Pengecualian sadar (AC1 mewajibkan status filter di URL):** `?f=` bisa tersimpan di riwayat browser dan access log reverse proxy → tindak lanjut T-023: access log produksi tanpa query string (Caddy filter `request>uri` / nginx `$uri`); Referer lintas situs hanya origin.
- [x] V9 Communication: TLS for all external traffic; certificates validated — N/A: tidak ada lalu lintas eksternal baru (DuckDB in-process, PostgreSQL yang sama).
- [x] V10 Malicious code: no backdoors, time bombs, or unexplained network calls; dependencies are trusted — tidak ada dependensi baru; tidak ada panggilan jaringan baru.
- [x] V11 Business logic: flows cannot be abused (limits, ordering, replay, race conditions) — ≤ 8 kolom filter, ≤ 20 filter × ≤ 500 nilai, kata cari ≤ 100, LIMIT 1001, batas waktu slicer 10 detik, jatah query per user sama dengan widget; preset dari jam server (klien tidak bisa memilih "hari ini"); kolom filter yang tidak tersedia dilewati per widget, bukan error.
- [x] V12 Files and resources: uploads are type/size limited and stored safely; no path traversal or SSRF — N/A: tidak ada unggahan/path dari user; parquet tetap dari typedKey DB.
- [x] V13 API and web service: API inputs/outputs are schema-validated; CORS and rate limits are deliberate — body JSON berbatas + content-type JSON, Origin = APP_URL (403, diuji), rate limit `filterValues` 300/menit/user (429 + Retry-After, diuji) dan `dashboardEdit` untuk setter, `query` 600/menit untuk widget.
- [x] V14 Configuration: secure defaults, security headers, no debug in production, dependencies up to date — N/A: tidak mengubah konfigurasi/header; default kolom filter `[]` = tidak ada filter yang diizinkan selain cross-filter.
