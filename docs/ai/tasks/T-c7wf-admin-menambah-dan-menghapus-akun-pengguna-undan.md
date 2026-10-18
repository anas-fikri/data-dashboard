---
id: T-c7wf
title: Admin menambah dan menghapus akun pengguna (undangan email), panduan dan video diperbarui
status: in_progress
profile: standard
tags:
  - security
created: "2026-10-18T11:20:21Z"
updated: "2026-10-18T12:38:40Z"
created_by: claude-code
workers:
  - claude-code
branch: worktree-t-001-scaffold
base: aca91c95735c6685cebdde2fb5334114d7977a95
---

## Objective
(describe the outcome in one paragraph)

## Acceptance criteria
- [ ] Given admin di Admin › Pengguna, when menambah pengguna dengan email domain perusahaan, nama, dan peran, then akun terbuat terverifikasi tanpa password, email undangan berisi tautan buat password sekali pakai berlaku 72 jam terkirim, dan audit user.create tercatat; email di luar domain atau sudah terdaftar ditolak dengan pesan yang jelas
- [ ] Given pengguna terundang membuka tautan undangan, when menetapkan password, then ia bisa masuk; tautan kedaluwarsa atau terpakai ditolak dan pengguna bisa meminta tautan baru lewat Lupa password
- [ ] Given admin menghapus akun dengan konfirmasi mengetik email, then akun beserta sesi dan akses berbaginya terhapus dan audit user.delete (email di meta) tercatat; menghapus diri sendiri, admin aktif terakhir, atau akun yang masih punya dataset ditolak dengan pesan yang menunjuk langkah berikutnya
- [ ] Given panduan admin, then artikel dan video Mengelola pengguna memuat tambah dan hapus akun, dan terpasang di produksi

## Risk
Impact: halaman Admin › Pengguna (tombol Tambah pengguna + dialog, item menu Hapus akun… + dialog ketik email), service/action admin (createUser, deleteUser), email undangan, halaman /reset-password (judul "Buat password" untuk akun tanpa password), AuditAction user.create/user.delete, seed-guides --only, artikel + video admin-kelola-pengguna. Tanpa migrasi skema. Alur daftar mandiri, lupa password, nonaktif, dan alih dataset tidak berubah perilakunya.
Security (STRIDE): Spoofing — tautan undangan = token RESET_PASSWORD 32 byte acak, hanya hash di DB, sekali pakai atomik, 72 jam, hanya dikirim ke kotak surat pengguna (tidak pernah dikembalikan ke admin atau dicatat di log); akun tanpa password tidak bisa login sampai tautan dipakai. Tampering — semua masukan divalidasi di server (normalizeEmail, domain whitelist persis, nama dibersihkan + tanpa @, isAdmin boolean, email konfirmasi hapus dicocokkan ulang di server). Repudiation — user.create (meta isAdmin) dan user.delete (meta email, wasAdmin, wasActive) ditulis di transaksi yang sama dengan perubahan; audit buatan akun terhapus tetap ada (actorId SetNull). Information disclosure — pesan "Email ini sudah terdaftar" hanya untuk admin (sudah bisa melihat daftar pengguna); tanpa PII di log (userId saja). DoS — rate limit perubahan per admin (asAdmin); lock admins + datasets:<id> mencegah balapan. Elevation — pelaku dicek ulang sebagai admin aktif di bawah lock (dicabut di tengah jalan → NOT_FOUND); hapus diri sendiri ditolak sehingga selalu tersisa admin aktif; akun pemilik dataset tidak bisa dihapus (data tidak ikut hilang tanpa sengaja).
Rollback: revert commit ba74968 (+ commit panduan/video); akun yang sudah dibuat tetap valid sebagai akun biasa, akun yang sudah dihapus tidak bisa dikembalikan (dicatat di audit dengan email agar bisa dibuat ulang/diundang lagi). Artikel produksi bisa dikembalikan lewat editor panduan admin.
Validation: 18 unit test service baru (fake Prisma: token hash + TTL 72 jam, domain/duplikat/nama, pelaku dicabut, gagal kirim email, hapus diri sendiri, konfirmasi salah, masih punya dataset, cascade token/share, audit); e2e admin.spec T-c7wf (undang → email Mailpit → Buat password → masuk → tautan sekali pakai → hapus dengan ketik email → sesi berakhir) + suite admin & password lulus; tangkapan layar 390/1440 px; aitk check.

## Notes

## Security checklist (OWASP ASVS 4.0.3)
<!-- Check each item when verified, or write "N/A: <reason>" after the text and check it. -->
- [x] V1 Architecture: trust boundaries and the components handling sensitive data are identified for this change — batas kepercayaan: Server Action asAdmin (requireAdmin + rate limit) → service (cek ulang admin aktif di bawah lock admins) → Prisma; token undangan hanya ke email pengguna
- [x] V2 Authentication: credentials are verified server-side; no default, hard-coded, or weak secrets — akun undangan tanpa password tidak bisa login; password dibuat lewat token sekali pakai 72 jam (hash SHA-256 di DB, argon2id untuk password); tanpa rahasia bawaan
- [x] V3 Session management: session tokens are random, protected, invalidated on logout and expiry — hapus akun → baris user hilang, getSession menolak sesi lama di permintaan berikutnya (diuji e2e); set password menaikkan sessionVersion (alur reset yang sudah ada)
- [x] V4 Access control: every endpoint/action checks authorization server-side, deny by default (no IDOR) — createUserAction/deleteUserAction lewat asAdmin (non-admin → NOT_FOUND) + actorIsActiveAdmin di transaksi; hapus diri sendiri FORBIDDEN; id divalidasi isIdShape
- [x] V5 Validation, sanitization and encoding: all input validated; output encoded; no injection (SQL, OS, template) — normalizeEmail + whitelist domain persis, cleanName (kontrol/bidi dibuang, 80 karakter, tanpa @), isAdmin boolean, email konfirmasi dicocokkan di server; Prisma terparameter; email HTML di-escape
- [x] V6 Stored cryptography: sensitive data at rest uses approved algorithms; keys are not in the code — token disimpan sebagai hash SHA-256 (hashToken yang sama dengan reset), token mentah tidak pernah disimpan atau dicatat
- [x] V7 Error handling and logging: errors reveal no internals; security events are logged without secrets — galat terduga → kode + pesan pengguna; galat lain → BUSY umum, detail di log; log hanya userId/actorId (tanpa email/token); penolakan akses dicatat warn
- [x] V8 Data protection: personal/sensitive data is minimized, not cached or logged, and removable — hapus akun menghapus token, share yang diterima, ekspor, catatan baca (cascade); email sasaran hanya di meta audit untuk jejak admin
- [x] V9 Communication: TLS for all external traffic; certificates validated — N/A — tidak ada lalu lintas eksternal baru; email lewat SMTP yang sudah dikonfigurasi, tautan dari APP_URL (bukan Host header)
- [x] V10 Malicious code: no backdoors, time bombs, or unexplained network calls; dependencies are trusted — tanpa dependensi baru, tanpa panggilan jaringan baru selain email undangan lewat mailer yang ada
- [x] V11 Business logic: flows cannot be abused (limits, ordering, replay, race conditions) — lock admins menyerialkan tambah/hapus; lock datasets:<id> mencegah dataset dibuat di antara hitung dan hapus; duplikat email → INVALID (balapan dengan registrasi → P2002 → BUSY); token sekali pakai atomik (updateMany usedAt null)
- [x] V12 Files and resources: uploads are type/size limited and stored safely; no path traversal or SSRF — N/A — tidak ada unggahan atau akses file baru di aplikasi; seed-guides --only hanya membatasi slug
- [x] V13 API and web service: API inputs/outputs are schema-validated; CORS and rate limits are deliberate — Server Action memvalidasi argumen di service (unknown → validasi); rate limit perubahan per admin berlaku untuk tambah/hapus
- [x] V14 Configuration: secure defaults, security headers, no debug in production, dependencies up to date — tanpa konfigurasi baru; INVITE_TTL_MS konstanta di kode; npm audit 0 kerentanan
