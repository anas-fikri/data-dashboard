---
id: T-011
title: Tipe widget tabel, KPI, bar, line, pie dengan panel konfigurasi
status: in_progress
profile: strict
profile_pinned: true
goal: G-4
tags:
  - security
depends_on:
  - T-009
  - T-010
created: "2026-10-11T14:45:09Z"
updated: "2026-10-12T15:17:02Z"
created_by: claude-code
workers:
  - claude-code
branch: worktree-t-001-scaffold
base: 5a7d2eb0f7922bb6c2dfa8951ec497d0b7545d0d
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
(Required for strict profile. Impact:, Security (STRIDE):, Rollback:, Validation:)

## Notes
- 2026-10-11T14:49:25Z UI wajib lewat rantai frontend-expert: design-foundations → tokens (preset dari T-025) → (+forms/data-fetching/app-shell sesuai kebutuhan) → components → anti-slop-code → responsive → motion ringan → anti-slop-design → polish → accessibility. Skip design-direction karena arah sudah dipilih di T-025, kecuali layar baru yang ambigu. Chart via skill dataviz; filter/select pakai Select kustom dari T-025, bukan native.
- 2026-10-11T14:56:59Z Kolom sort tabel divalidasi terhadap kolom widget, bukan seluruh skema.
- 2026-10-12T14:28:33Z Dari review T-010 (L6): urungkan hapus widget saat ini memulihkan judul dan posisi saja karena widget masih kosong. Begitu widget punya type/spec, urungkan hapus wajib memulihkan type dan spec juga (dikirim di body restore, validasi sama dengan buat).

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
