---
id: T-k6k0
title: 'Ctrl+K cari cepat: dataset, dashboard, panduan'
status: todo
profile: standard
tags:
  - ui
created: "2026-11-10T01:17:11Z"
updated: "2026-11-10T02:59:39Z"
created_by: claude-code
---

## Objective
Pengguna membuka kotak cari cepat dengan Ctrl+K / Cmd+K (atau tombol cari di header) untuk melompat ke dataset, dashboard, atau panduan yang boleh dilihatnya, dengan papan ketik penuh.

## Acceptance criteria
- [ ] Given pengguna masuk, when menekan Ctrl+K atau Cmd+K atau tombol Cari di header, then dialog cari terbuka dengan fokus di kotak input dan Esc menutupnya
- [ ] Given pengguna mengetik, when hasil tampil, then hanya dataset, dashboard (milik/dibagikan), dan panduan sesuai perannya yang muncul, dikelompokkan, dan bisa dipilih dengan panah atas/bawah + Enter
- [ ] Given pembaca layar, when dialog dibuka dan hasil berubah, then peran combobox/listbox benar dan jumlah hasil diumumkan

## Risk
Impact: cari cepat — GET /api/search (src/app/api/search/route.ts), service quickSearch (src/features/search/service.ts), dialog combobox di app-shell (src/components/shell/quick-search.tsx). Tanpa migrasi, hanya baca.
Security (STRIDE): Information disclosure — dataset milik user saja; dashboard dengan aturan yang sama dengan halaman Dashboard (milik, share langsung, share organisasi dari pemilik aktif); panduan lewat guideRolesFor/searchGuides sesuai peran; wildcard LIKE di-escape; respons no-store; Spoofing — requireUser (401 tanpa sesi).
Rollback: revert commit (tanpa data).
Validation: tests/features/search/quick-search.test.ts, e2e dashboard-flex T-k6k0 (combobox, Enter, Esc), axe tanpa pelanggaran serius di halaman berkepala (backup/period/pivot e2e).

## Notes

## Security checklist (OWASP ASVS 4.0.3)
<!-- Check each item when verified, or write "N/A: <reason>" after the text and check it. -->
- [x] V1 Architecture: trust boundaries and the components handling sensitive data are identified for this change — Route baca baru di balik sesi yang sama; tanpa rahasia
- [x] V2 Authentication: credentials are verified server-side; no default, hard-coded, or weak secrets — N/A: tidak disentuh perubahan ini
- [x] V3 Session management: session tokens are random, protected, invalidated on logout and expiry — N/A: tidak disentuh perubahan ini
- [x] V4 Access control: every endpoint/action checks authorization server-side, deny by default (no IDOR) — Saringan akses di query (ownerId, aturan lihat dashboard yang sama dengan daftar, peran panduan); tidak ada id dari klien
- [x] V5 Validation, sanitization and encoding: all input validated; output encoded; no injection (SQL, OS, template) — Kata kunci lewat searchQuery (≤ 100, dibersihkan) + escapeLike; Prisma berparameter
- [x] V6 Stored cryptography: sensitive data at rest uses approved algorithms; keys are not in the code — N/A: tidak disentuh perubahan ini
- [x] V7 Error handling and logging: errors reveal no internals; security events are logged without secrets — Galat → 503 umum, detail hanya di log
- [x] V8 Data protection: personal/sensitive data is minimized, not cached or logged, and removable — N/A: tidak disentuh perubahan ini
- [x] V9 Communication: TLS for all external traffic; certificates validated — N/A: tidak disentuh perubahan ini
- [x] V10 Malicious code: no backdoors, time bombs, or unexplained network calls; dependencies are trusted — N/A: tidak disentuh perubahan ini
- [x] V11 Business logic: flows cannot be abused (limits, ordering, replay, race conditions) — N/A: tidak disentuh perubahan ini
- [x] V12 Files and resources: uploads are type/size limited and stored safely; no path traversal or SSRF — N/A: tidak disentuh perubahan ini
- [x] V13 API and web service: API inputs/outputs are schema-validated; CORS and rate limits are deliberate — GET ber-sesi, no-store; tanpa mutasi
- [x] V14 Configuration: secure defaults, security headers, no debug in production, dependencies up to date — N/A: tidak disentuh perubahan ini
