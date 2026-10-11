---
id: T-012
title: Filter global, slicer, rentang tanggal, cross-filter
status: todo
profile: strict
profile_pinned: true
goal: G-4
tags:
  - security
depends_on:
  - T-011
created: "2026-10-11T14:45:09Z"
updated: "2026-10-11T14:57:01Z"
created_by: claude-code
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
(Required for strict profile. Impact:, Security (STRIDE):, Rollback:, Validation:)

## Notes
- 2026-10-11T14:49:25Z UI wajib lewat rantai frontend-expert: design-foundations → tokens (preset dari T-025) → (+forms/data-fetching/app-shell sesuai kebutuhan) → components → anti-slop-code → responsive → motion ringan → anti-slop-design → polish → accessibility. Skip design-direction karena arah sudah dipilih di T-025, kecuali layar baru yang ambigu. Chart via skill dataviz; filter/select pakai Select kustom dari T-025, bukan native.
- 2026-10-11T14:56:59Z allowedFilterColumns per dashboard disimpan server; filter di URL divalidasi terhadapnya; nilai filter tidak di-log (pino redaksi).

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
