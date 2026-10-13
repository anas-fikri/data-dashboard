---
id: T-012
title: Filter global, slicer, rentang tanggal, cross-filter
status: in_progress
profile: strict
profile_pinned: true
goal: G-4
tags:
  - security
depends_on:
  - T-011
created: "2026-10-11T14:45:09Z"
updated: "2026-10-13T23:03:03Z"
created_by: claude-code
workers:
  - claude-code
branch: worktree-t-001-scaffold
base: 098fc7793391d5395405eff5c73923297cb10705
evidence:
  check:
    cmd: npm run check
    exit_code: 0
    duration_ms: 32938
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

      {"level":40,"time":1791932561664,"service":"data-dashboard","check":"B","detail":"koneksi ditolak","msg":"health check gagal"}
      {"level":40,"time":1791932561692,"service":"data-dashboard","check":"Lambat","detail":"Lambat: timeout 20 ms","msg":"health check gagal"}

       Test Files  43 passed (43)
            Tests  723 passed (723)
         Start at  06:02:39
         Duration  22.78s (tests 88%, import 7%, transform 5%)


      > data-dashboard@0.1.0 audit
      > npm audit --audit-level=high --omit=dev && npm audit --audit-level=critical

      found 0 vulnerabilities
      found 0 vulnerabilities
    at: "2026-10-13T23:03:03Z"
    tree: 0417d21ac883800f5a6e9508133d8ef71a1d7b7424c481f42c599c148701db7e
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
- Impact: skema DB (kolom baru `Dashboard.filterColumns` JSONB default `[]`, migrasi `20261013172513_dashboard_filter_columns`, aditif); jalur query widget (`/api/query` menerima `dashboardFilters`, kunci cache hasil ditambah klausa kanonik — tanpa filter dashboard kunci lama tidak berubah); `getDashboard` membaca skema sheet versi aktif bila ada kolom filter/grafik (satu query tambahan); endpoint baru `POST /api/dashboards/[id]/filter-values` dan `PATCH /api/dashboards/[id]/filter-columns` + Server Action `setDashboardFilterColumnsAction`; spec grafik menerima `crossFilter?: boolean`; redaksi log ditambah kunci `dashboardFilters/values/value/q/cross`. Widget/dashboard lama tetap jalan tanpa perubahan data.
- Security (STRIDE): S — semua endpoint lewat requireUser + Origin = APP_URL. T — kolom filter dibatasi `filterColumns` ∪ dimensi grafik cross-filter yang dihitung server (D6), nilai lewat parameter binding, identifier hanya `c<pos>` dari skema; preset dihitung server (bukan tanggal dari klien). R — perubahan kolom filter menaikkan `Dashboard.updatedAt`. I — dashboard/kolom milik orang lain → NOT_FOUND/404; kolom tersembunyi tidak pernah dipakai (filter dilewati, slicer → COLUMN_UNAVAILABLE); nilai filter/kata cari tidak dicatat di log (redaksi pino diuji). D — rate limit `filterValues` 300/menit/user terpisah, jatah query per user + global yang sama dengan widget, batas waktu slicer 10 detik, LIMIT 1001, body ≤ 8 KB / 64 KB, ≤ 20 filter × ≤ 500 nilai; hasil slicer di-cache (LRU berbatas byte). E — pengaturan kolom filter hanya pemilik (`dataset.ownerId`), validasi ulang terhadap versi aktif.
- Rollback: revert kode T-012; kolom `filterColumns` boleh dibiarkan (default `[]`, tidak dibaca kode lama) atau dihapus dengan migrasi `ALTER TABLE "Dashboard" DROP COLUMN "filterColumns"`. Spec widget dengan `crossFilter` akan ditolak schema strict versi lama → bersihkan dengan `UPDATE "Widget" SET spec = spec - 'crossFilter'` sebelum rollback kode.
- Validation: unit test DuckDB sungguhan `tests/features/query/dashboard-filters.test.ts` (in + kosong, rentang DECIMAL/DOUBLE/tanggal, preset 2026-10-11 WIB pada DATE/TIMESTAMP, batas 2026-12-31 23:30 UTC, filter dilewati di sheet lain/tersembunyi/tipe beda, kolom tidak diizinkan → INVALID tanpa query, kunci cache kanonik), `tests/features/query/filter-values.test.ts` (5.000 nilai → 1000 + truncated, "jak" tanpa peka kapital/aksen, wildcard di-escape, NOT_FOUND bukan pemilik), `tests/features/query/filter-values-http.test.ts` (429 + Retry-After, 403/401, status per kode, log tanpa kata cari), `tests/features/dashboards/filter-columns.test.ts` (validasi pengaturan kolom filter, tampilan, kolom cross-filter), `tests/lib/logger.test.ts` (redaksi). E2E AC 1/2/4/5 menunggu UI.

## Notes
- 2026-10-11T14:49:25Z UI wajib lewat rantai frontend-expert: design-foundations → tokens (preset dari T-025) → (+forms/data-fetching/app-shell sesuai kebutuhan) → components → anti-slop-code → responsive → motion ringan → anti-slop-design → polish → accessibility. Skip design-direction karena arah sudah dipilih di T-025, kecuali layar baru yang ambigu. Chart via skill dataviz; filter/select pakai Select kustom dari T-025, bukan native.
- 2026-10-11T14:56:59Z allowedFilterColumns per dashboard disimpan server; filter di URL divalidasi terhadapnya; nilai filter tidak di-log (pino redaksi).

## Security checklist (OWASP ASVS 4.0.3)
<!-- Check each item when verified, or write "N/A: <reason>" after the text and check it. -->
- [x] V1 Architecture: trust boundaries and the components handling sensitive data are identified for this change — batas: klien → Route Handler (`/api/query`, `/api/dashboards/[id]/filter-values`, `/filter-columns`) / Server Action → service (authz pemilik, validasi zod, izin kolom D6) → DuckDB (parameter binding). Data sensitif = nilai filter/kata cari (tidak di-log).
- [x] V2 Authentication: credentials are verified server-side; no default, hard-coded, or weak secrets — N/A: tidak mengubah autentikasi; endpoint baru memakai requireUser("action") yang ada (401 tanpa sesi, diuji).
- [x] V3 Session management: session tokens are random, protected, invalidated on logout and expiry — N/A: tidak mengubah sesi (JWT + sessionVersion T-002 tetap dipakai).
- [x] V4 Access control: every endpoint/action checks authorization server-side, deny by default (no IDOR) — filter-values: `dashboard.dataset.ownerId = user` (lainnya NOT_FOUND 404, diuji); setter kolom filter: `updateMany where {id, dataset:{ownerId}}` (NOT_FOUND, diuji); query widget: kolom filter hanya `filterColumns` ∪ dimensi cross-filter dari DB (INVALID, diuji); sheet selalu dari versi aktif dataset dashboard.
- [x] V5 Validation, sanitization and encoding: all input validated; output encoded; no injection (SQL, OS, template) — zod strict (`dashFilterSchema`, `filterValuesBodySchema`, `filterColumnSchema`), tanggal kalender diperiksa, angka ±2^53; SQL: identifier `c<pos>` dari skema, nilai/kata cari lewat `$f`/`$q`, wildcard LIKE di-escape (diuji), cast DECIMAL lewat teks hasil decimal6.
- [x] V6 Stored cryptography: sensitive data at rest uses approved algorithms; keys are not in the code — N/A: tidak ada data rahasia baru yang disimpan (filterColumns hanya nama sheet/kolom).
- [x] V7 Error handling and logging: errors reveal no internals; security events are logged without secrets — error tak terduga → 503/BUSY tanpa detail; log hanya userId + pesan error; kunci `dashboardFilters/values/value/q/cross/filters` diredaksi (tests/lib/logger.test.ts, filter-values-http.test.ts).
- [x] V8 Data protection: personal/sensitive data is minimized, not cached or logged, and removable — nilai filter tidak di-log; hasil query/slicer hanya di cache memori proses (LRU berbatas byte, TTL 24 jam, kunci memuat versi + schemaRevision); respons no-store; teks > 1000 karakter tidak dikirim ke slicer.
- [x] V9 Communication: TLS for all external traffic; certificates validated — N/A: tidak ada lalu lintas eksternal baru (DuckDB in-process, PostgreSQL yang sama).
- [x] V10 Malicious code: no backdoors, time bombs, or unexplained network calls; dependencies are trusted — tidak ada dependensi baru; tidak ada panggilan jaringan baru.
- [x] V11 Business logic: flows cannot be abused (limits, ordering, replay, race conditions) — ≤ 8 kolom filter, ≤ 20 filter × ≤ 500 nilai, kata cari ≤ 100, LIMIT 1001, batas waktu slicer 10 detik, jatah query per user sama dengan widget; preset dari jam server (klien tidak bisa memilih "hari ini"); kolom filter yang tidak tersedia dilewati per widget, bukan error.
- [x] V12 Files and resources: uploads are type/size limited and stored safely; no path traversal or SSRF — N/A: tidak ada unggahan/path dari user; parquet tetap dari typedKey DB.
- [x] V13 API and web service: API inputs/outputs are schema-validated; CORS and rate limits are deliberate — body JSON berbatas + content-type JSON, Origin = APP_URL (403, diuji), rate limit `filterValues` 300/menit/user (429 + Retry-After, diuji) dan `dashboardEdit` untuk setter, `query` 600/menit untuk widget.
- [x] V14 Configuration: secure defaults, security headers, no debug in production, dependencies up to date — N/A: tidak mengubah konfigurasi/header; default kolom filter `[]` = tidak ada filter yang diizinkan selain cross-filter.
