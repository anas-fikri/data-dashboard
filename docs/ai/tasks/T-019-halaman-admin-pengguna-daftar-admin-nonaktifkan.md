---
id: T-019
title: 'Halaman admin pengguna: daftar, admin, nonaktifkan, alihkan kepemilikan'
status: todo
profile: strict
profile_pinned: true
goal: G-2
tags:
  - security
depends_on:
  - T-002
  - T-003
  - T-010
created: "2026-10-11T14:45:09Z"
updated: "2026-10-11T23:56:00Z"
created_by: claude-code
---

## Objective
/admin/pengguna untuk isAdmin: daftar user (email, admin, aktif, login terakhir), toggle admin, nonaktifkan/aktifkan (menaikkan sessionVersion → sesi putus, D1), alihkan semua dataset user nonaktif ke user lain. Larangan: menonaktifkan diri sendiri atau admin aktif terakhir.

## Acceptance criteria
- [ ] Given admin menonaktifkan user B yang sedang login, when B mengirim permintaan berikutnya, then diarahkan ke /login dengan pesan akun nonaktif dan tidak bisa login lagi
- [ ] Given hanya satu admin aktif, when ia mencoba mencabut admin dirinya atau menonaktifkan dirinya, then code LAST_ADMIN
- [ ] Given user non-admin, when membuka /admin/pengguna atau memanggil Server Action-nya, then 404 / code NOT_FOUND tanpa perubahan
- [ ] Given dataset milik B (nonaktif) dengan dashboard, when admin mengalihkan ke C, then C pemilik dan dashboard tetap berfungsi
- [ ] Given halaman/komponen task ini selesai, when /frontend-expert:audit dijalankan (anti-slop-design, responsive 320/768/1024/1440, accessibility), then tidak ada temuan Critical/High dan blok Conventions check (Tokens: preset project; Icons: waiver @tabler/icons-react; States loading/empty/error; Responsive; A11y) dicatat sebagai note task
- [ ] Given admin A mencabut peran admin B yang sedang login, when B mengirim permintaan admin berikutnya, then NOT_FOUND (toggle admin menaikkan sessionVersion dan isAdmin dibaca dari DB)
- [ ] Given toggle admin, nonaktifkan, atau alih kepemilikan, when terjadi, then AuditLog tercatat dengan actor, target, dan ip

## Risk
(Required for strict profile. Impact:, Security (STRIDE):, Rollback:, Validation:)

## Notes
- 2026-10-11T14:49:25Z UI wajib lewat rantai frontend-expert: design-foundations → tokens (preset dari T-025) → (+forms/data-fetching/app-shell sesuai kebutuhan) → components → anti-slop-code → responsive → motion ringan → anti-slop-design → polish → accessibility. Skip design-direction karena arah sudah dipilih di T-025, kecuali layar baru yang ambigu. Chart via skill dataviz; filter/select pakai Select kustom dari T-025, bukan native.
- 2026-10-11T23:56:00Z Dari review T-003: Dataset.owner onDelete Cascade → menghapus user menghapus baris dataset tetapi tidak objek storage. Penghapusan/penonaktifan user oleh admin wajib memanggil deleteDatasetObjects per dataset (atau mencatat ke StorageCleanup).

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
