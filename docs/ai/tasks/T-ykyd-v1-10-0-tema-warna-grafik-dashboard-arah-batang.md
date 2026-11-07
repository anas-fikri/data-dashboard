---
id: T-ykyd
title: 'v1.10.0: tema warna grafik dashboard, arah batang, garis tren'
status: in_progress
profile: standard
created: "2026-11-07T16:10:34Z"
updated: "2026-11-07T16:30:28Z"
created_by: claude-code
workers:
  - claude-code
branch: claude/cool-babbage-t5yojt
base: a77fe1b52270ac9fbc7a6643f051af765848c1f9
---

## Objective
Warna dashboard mengatur Tema grafik (warna seri semua Batang/Garis/Pai, layar + PDF) selain template warna status, dengan penjelasan bahwa warna status butuh Penilaian warna per widget; Batang punya arah Otomatis/Mendatar/Tegak (otomatis tegak + urut waktu untuk tanggal/periode); Garis tren lurus/rata-rata bergerak di sumbu waktu dengan legenda arah; halaman Yang baru berbahasa awam dengan penanda di kepala halaman. Rilis v1.10.0 tanpa migrasi.

## Acceptance criteria
- [ ] Given tema grafik dipilih di Warna dashboard, when grafik Batang/Garis/Pai dirender (layar/PDF), then warna seri + swatch legenda memakai palet tema
- [ ] Given panel Warna dashboard dibuka, when dibaca, then menjelaskan warna status hanya untuk widget yang diberi Penilaian warna
- [ ] Given batang berdimensi tanggal/periode dengan arah Otomatis, when dirender, then tegak; Mendatar/Tegak manual dihormati
- [ ] Given Tren dipilih di Garis/Batang tegak berdimensi waktu, when dirender, then seri tren putus-putus + legenda arah tren

## Risk
Impact: tampilan semua grafik dashboard (warna seri, arah batang, seri tren) di layar dan PDF; skema spec grafik + tampilan terikat + Dashboard.colors bertambah field opsional (tanpa migrasi); kepala halaman + footer (tautan Yang baru). Security (STRIDE): Tampering — palette divalidasi enum di dashboardColorsSchema strict lewat route PATCH yang sama (mutation wrapper: sesi, cek origin, rate limit, canEditWhere); tidak ada input bebas baru (orientation/trend enum). Information disclosure — halaman Yang baru statis di bundel, requireUser. Rollback: image v1.9.0 tanpa membatalkan apa pun; widget ber-arah/ber-tren tampil tidak valid dan tema dashboard kembali bawaan sampai roll-forward (CHANGELOG Notes, runbook §19). Validation: vitest penuh, typecheck, lint, e2e chart-theme (3), shell, widgets/chart-polish/pivot/status-colors/exports/filters, review subagen.

## Notes

## Security checklist (OWASP ASVS 4.0.3)
<!-- Check each item when verified, or write "N/A: <reason>" after the text and check it. -->
- [x] V1 Architecture: trust boundaries and the components handling sensitive data are identified for this change — batas kepercayaan sama: route API → service canEditWhere → Prisma; data tema bukan data sensitif
- [x] V2 Authentication: credentials are verified server-side; no default, hard-coded, or weak secrets — N/A: tidak disentuh perubahan ini
- [x] V3 Session management: session tokens are random, protected, invalidated on logout and expiry — N/A: tidak disentuh perubahan ini
- [x] V4 Access control: every endpoint/action checks authorization server-side, deny by default (no IDOR) — PATCH /api/dashboards/[id]/colors tetap updateMany + canEditWhere; viewer 403, tanpa akses 404
- [x] V5 Validation, sanitization and encoding: all input validated; output encoded; no injection (SQL, OS, template) — semua field baru enum zod strict (palette, orientation, trend); warna tema statis di CSS, bukan input pengguna
- [x] V6 Stored cryptography: sensitive data at rest uses approved algorithms; keys are not in the code — N/A: tidak disentuh perubahan ini
- [x] V7 Error handling and logging: errors reveal no internals; security events are logged without secrets — N/A: tidak disentuh perubahan ini
- [x] V8 Data protection: personal/sensitive data is minimized, not cached or logged, and removable — localStorage hanya menyimpan versi terakhir halaman Yang baru yang dibuka (bukan data pribadi)
- [x] V9 Communication: TLS for all external traffic; certificates validated — N/A: tidak disentuh perubahan ini
- [x] V10 Malicious code: no backdoors, time bombs, or unexplained network calls; dependencies are trusted — N/A: tidak disentuh perubahan ini
- [x] V11 Business logic: flows cannot be abused (limits, ordering, replay, race conditions) — N/A: tidak disentuh perubahan ini
- [x] V12 Files and resources: uploads are type/size limited and stored safely; no path traversal or SSRF — N/A: tidak disentuh perubahan ini
- [x] V13 API and web service: API inputs/outputs are schema-validated; CORS and rate limits are deliberate — input API divalidasi skema strict; tidak ada endpoint baru
- [x] V14 Configuration: secure defaults, security headers, no debug in production, dependencies up to date — N/A: tidak disentuh perubahan ini
