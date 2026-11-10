---
id: T-nn87
title: Mode layar TV + muat ulang otomatis di dashboard
status: todo
profile: standard
tags:
  - dashboards
  - ui
created: "2026-11-10T01:17:12Z"
updated: "2026-11-10T02:59:39Z"
created_by: claude-code
---

## Objective
Dashboard bisa ditampilkan di monitor operasional/gudang: mode layar penuh tanpa menu dan bilah samping, data dimuat ulang otomatis pada interval yang dipilih (mis. 1/5/15 menit), tanpa memuat ulang seluruh halaman.

## Acceptance criteria
- [ ] Given dashboard terbuka, when pengguna memilih Mode TV, then tampilan layar penuh tanpa sidebar/header/menu edit, filter aktif tetap berlaku, dan Esc/tombol Keluar kembali ke tampilan biasa
- [ ] Given muat ulang otomatis diatur (Mati/1/5/15/30 menit), when interval lewat, then data semua widget diambil ulang tanpa memuat ulang halaman, waktu pembaruan terakhir tampil, dan pengaturan diingat browser
- [ ] Given tab tidak terlihat atau koneksi putus, when interval lewat, then pengambilan ulang ditunda sampai tab terlihat lagi dan galat tidak menghapus data terakhir

## Risk
Impact: mode TV + muat ulang otomatis — auto-refresh.tsx (interval di localStorage, tick, penanda gagal), tv-mode.tsx, useWidgetQuery (tick), app-shell (data-shell-chrome) + globals.css, halaman dashboard (?tv=1). Tanpa migrasi; hanya klien.
Security (STRIDE): DoS — interval minimum 1 menit, tab tersembunyi ditunda, query server memakai cache yang sama; Information disclosure — tidak ada data baru, akses tetap dicek per query; Tampering — interval dari localStorage divalidasi terhadap daftar pilihan.
Rollback: revert commit (pilihan di localStorage diabaikan versi lama).
Validation: e2e dashboard-flex T-nn87 (tanpa chrome, jam palsu → refetch, gagal → peringatan + data terakhir, pulih, keluar), dashboard-page-access.test.ts (tv=1), suite e2e per proyek.

## Notes

## Security checklist (OWASP ASVS 4.0.3)
<!-- Check each item when verified, or write "N/A: <reason>" after the text and check it. -->
- [x] V1 Architecture: trust boundaries and the components handling sensitive data are identified for this change — Hanya perilaku klien; tanpa endpoint baru
- [x] V2 Authentication: credentials are verified server-side; no default, hard-coded, or weak secrets — N/A: tidak disentuh perubahan ini
- [x] V3 Session management: session tokens are random, protected, invalidated on logout and expiry — N/A: tidak disentuh perubahan ini
- [x] V4 Access control: every endpoint/action checks authorization server-side, deny by default (no IDOR) — N/A: tidak disentuh perubahan ini
- [x] V5 Validation, sanitization and encoding: all input validated; output encoded; no injection (SQL, OS, template) — Nilai interval dari localStorage hanya diterima bila termasuk REFRESH_OPTIONS
- [x] V6 Stored cryptography: sensitive data at rest uses approved algorithms; keys are not in the code — N/A: tidak disentuh perubahan ini
- [x] V7 Error handling and logging: errors reveal no internals; security events are logged without secrets — N/A: tidak disentuh perubahan ini
- [x] V8 Data protection: personal/sensitive data is minimized, not cached or logged, and removable — N/A: tidak disentuh perubahan ini
- [x] V9 Communication: TLS for all external traffic; certificates validated — N/A: tidak disentuh perubahan ini
- [x] V10 Malicious code: no backdoors, time bombs, or unexplained network calls; dependencies are trusted — N/A: tidak disentuh perubahan ini
- [x] V11 Business logic: flows cannot be abused (limits, ordering, replay, race conditions) — Muat ulang paling sering tiap 1 menit dan ditunda saat tab tersembunyi; kegagalan tidak menghapus data terakhir dan ditandai
- [x] V12 Files and resources: uploads are type/size limited and stored safely; no path traversal or SSRF — N/A: tidak disentuh perubahan ini
- [x] V13 API and web service: API inputs/outputs are schema-validated; CORS and rate limits are deliberate — N/A: tidak disentuh perubahan ini
- [x] V14 Configuration: secure defaults, security headers, no debug in production, dependencies up to date — N/A: tidak disentuh perubahan ini
