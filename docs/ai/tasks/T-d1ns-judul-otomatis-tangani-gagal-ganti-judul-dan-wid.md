---
id: T-d1ns
title: 'Judul otomatis: tangani gagal ganti judul dan widget lama tanpa judul'
status: in_progress
profile: standard
tags:
  - ui
created: "2026-10-22T04:29:18Z"
updated: "2026-11-17T14:16:04Z"
created_by: claude-code
workers:
  - claude-code
branch: claude/cool-babbage-t5yojt
base: 9117b9deede9e645e46e8e75c07f05b0e5146f3f
---

## Objective
Temuan Low review T-12zs: (1) ganti judul otomatis yang gagal (jaringan) tidak diberitahukan dan hanya diingat di memori — setelah Selesai/muat ulang judul lama dianggap ketikan; (2) kartu widget lama tanpa judul tetap 'Widget tanpa judul' sampai pengaturannya diubah; (3) pesan 'diubah di tab lain' bisa muncul sesaat saat query membawa widgetVersion rename otomatis sebelum hasil rename tercatat.

## Acceptance criteria
- [x] Gagal ganti judul otomatis ditampilkan sebagai status simpan gagal dan dicoba ulang saat Selesai
- [x] Kartu widget tanpa judul menampilkan judul turunan
- [x] Tidak ada pesan konflik sesaat setelah judul otomatis diganti

## Risk
Impact: kecil, UI/pesan. Security (STRIDE): lihat checklist. Rollback: image sebelumnya. Validation: unit + e2e terkait.

## Notes

## Security checklist (OWASP ASVS 4.0.3)
<!-- Check each item when verified, or write "N/A: <reason>" after the text and check it. -->
- [x] V1 Architecture: trust boundaries and the components handling sensitive data are identified for this change — editor dashboard (klien) + getDashboard (server, judul tampilan)
- [x] V2 Authentication: credentials are verified server-side; no default, hard-coded, or weak secrets — N/A: autentikasi tidak berubah
- [x] V3 Session management: session tokens are random, protected, invalidated on logout and expiry — N/A: sesi tidak berubah
- [x] V4 Access control: every endpoint/action checks authorization server-side, deny by default (no IDOR) — autoTitle dihitung dari widget setelah rincian sumber dihapus untuk viewer; kolom tersembunyi tidak dipakai
- [x] V5 Validation, sanitization and encoding: all input validated; output encoded; no injection (SQL, OS, template) — judul dinormalisasi/dipotong (autoTitle clip); rename tetap divalidasi server
- [x] V6 Stored cryptography: sensitive data at rest uses approved algorithms; keys are not in the code — N/A: tanpa data tersimpan baru
- [x] V7 Error handling and logging: errors reveal no internals; security events are logged without secrets — galat skema saat menghitung judul tampilan ditelan (dashboard tetap termuat)
- [x] V8 Data protection: personal/sensitive data is minimized, not cached or logged, and removable — N/A: tanpa data pribadi baru
- [x] V9 Communication: TLS for all external traffic; certificates validated — N/A: tanpa lalu lintas baru
- [x] V10 Malicious code: no backdoors, time bombs, or unexplained network calls; dependencies are trusted — tanpa dependensi/panggilan jaringan baru
- [x] V11 Business logic: flows cannot be abused (limits, ordering, replay, race conditions) — ulang judul hanya lewat flush (aksi pengguna), tanpa ulang otomatis tak terbatas
- [x] V12 Files and resources: uploads are type/size limited and stored safely; no path traversal or SSRF — N/A: tanpa file
- [x] V13 API and web service: API inputs/outputs are schema-validated; CORS and rate limits are deliberate — API rename yang ada (versi widget dicek, STALE)
- [x] V14 Configuration: secure defaults, security headers, no debug in production, dependencies up to date — N/A: konfigurasi tidak berubah
