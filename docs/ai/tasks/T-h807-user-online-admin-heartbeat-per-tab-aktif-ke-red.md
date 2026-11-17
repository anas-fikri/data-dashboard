---
id: T-h807
title: 'User online (admin): heartbeat per tab aktif ke Redis, jumlah online di kartu Server (admin) + daftar di Admin › Penggu…'
status: in_progress
profile: strict
profile_pinned: true
created: "2026-11-17T12:46:12Z"
updated: "2026-11-17T13:19:30Z"
created_by: claude-code
workers:
  - claude-code
branch: claude/cool-babbage-t5yojt
base: 6e84221c735fb650970fb63d86441851cf3d1900
---

## Objective
Admin tahu siapa yang sedang memakai aplikasi (opsi A, keputusan pemilik 2026-11-17: khusus admin). Setiap tab aplikasi yang terlihat mengirim heartbeat ringan (POST /api/presence ±60 dtk, hanya saat document.visibilityState = visible, berhenti saat tab disembunyikan/logout). Server mencatat ke Redis (ZSET skor = waktu terakhir aktif + data kecil per user: path halaman terakhir tanpa query string), kedaluwarsa otomatis. "Online" = aktif ≤ 5 menit. Admin melihat jumlahnya di kartu Server sidebar dan daftar lengkap di Admin › Pengguna. Tanpa migrasi, tanpa layanan baru; tidak bergantung pada monitor (METRICS_NODE_URL).

## Acceptance criteria
- [ ] Tab aplikasi yang terlihat mengirim heartbeat ±60 dtk (langsung saat tab kembali terlihat), berhenti saat tab tersembunyi; tanpa heartbeat di /render, halaman login/publik, dan mode TV tetap dihitung
- [ ] Server mencatat kehadiran di Redis per user dari sesi (bukan dari body): waktu terakhir aktif + path halaman tanpa query string; data lebih dari 24 jam terhapus otomatis; heartbeat ber-rate-limit
- [ ] Online = aktif ≤ 5 menit; user nonaktif/dihapus tidak ikut dihitung
- [ ] Admin: kartu Server sidebar menampilkan 'N online' (juga saat sidebar diciutkan); non-admin tidak menerima angka ini dari API
- [ ] Admin › Pengguna: bagian 'Sedang online' — nama, email, terakhir aktif (relatif + WIB), halaman terakhir (label ramah: Dashboard <nama>, Dataset <nama>, Admin, dst.); kosong → teks jelas; diperbarui otomatis
- [ ] Tetap jalan tanpa monitor (METRICS_NODE_URL kosong): daftar Admin › Pengguna tetap tampil walau kartu Server tidak ada
- [ ] Uji unit store + route (akses admin saja, path disaring), e2e dua akun; panduan admin + Yang baru diperbarui

## Risk
Impact: satu request kecil per tab terlihat per menit (≈ jumlah user aktif/menit ke Redis; ZADD + SET EX), komponen baru di shell aplikasi, bagian baru di Admin › Pengguna, angka di kartu Server untuk admin. Tanpa migrasi. Security (STRIDE): Information disclosure — data kehadiran (siapa, kapan, halaman) hanya untuk admin (requireAdmin di API daftar; jumlah di /api/metrics hanya dikirim bila isAdmin); path disimpan tanpa query string (?f= bisa berisi nilai filter) dan dipotong; Spoofing — user hanya bisa menandai dirinya sendiri (id dari sesi, bukan body); DoS — rate limit heartbeat per user + body kecil; Repudiation — tidak dicatat ke AuditLog (bukan aksi keamanan). Privasi: data kehadiran dihapus otomatis (TTL ≤ 24 jam), tidak ada riwayat jangka panjang (opsi B tidak dikerjakan). Rollback: image sebelumnya; kunci Redis presence:* kedaluwarsa sendiri. Validation: uji unit store presence (jendela 5 menit, pembersihan, path disaring), uji route (bukan admin → 403, user nonaktif tidak tercatat), e2e: dua akun aktif → admin melihat 2 online, viewer tidak melihat angka/daftar.

## Notes

## Security checklist (OWASP ASVS 4.0.3)
<!-- Check each item when verified, or write "N/A: <reason>" after the text and check it. -->
- [x] V1 Architecture: trust boundaries and the components handling sensitive data are identified for this change — batas: tab browser → POST /api/presence (sesi) → Redis; daftar: admin → GET /api/presence → Redis + Postgres (akun aktif, nama dashboard/dataset)
- [x] V2 Authentication: credentials are verified server-side; no default, hard-coded, or weak secrets — N/A: autentikasi tidak berubah (requireUser/requireAdmin yang ada)
- [x] V3 Session management: session tokens are random, protected, invalidated on logout and expiry — N/A: tanpa token/sesi baru; heartbeat memakai cookie sesi yang ada; 401 → beacon berhenti
- [x] V4 Access control: every endpoint/action checks authorization server-side, deny by default (no IDOR) — GET daftar requireAdmin (non-admin 404); angka di /api/metrics hanya bila isAdmin; user hanya menandai dirinya (id dari sesi, bukan body)
- [x] V5 Validation, sanitization and encoding: all input validated; output encoded; no injection (SQL, OS, template) — path disaring cleanPath (pathname saja tanpa query/hash, karakter aman, ≤200, bukan /api,/render); body ≤1 KB JSON
- [x] V6 Stored cryptography: sensitive data at rest uses approved algorithms; keys are not in the code — N/A: tanpa data rahasia tersimpan
- [x] V7 Error handling and logging: errors reveal no internals; security events are logged without secrets — galat → 503 tanpa detail; dicatat di log tanpa data pribadi
- [x] V8 Data protection: personal/sensitive data is minimized, not cached or logged, and removable — data kehadiran minimal (waktu + pathname), TTL 24 jam, tanpa riwayat; hanya admin; akun nonaktif tidak ditampilkan
- [x] V9 Communication: TLS for all external traffic; certificates validated — N/A: lalu lintas internal yang sama
- [x] V10 Malicious code: no backdoors, time bombs, or unexplained network calls; dependencies are trusted — tanpa dependensi atau panggilan jaringan baru
- [x] V11 Business logic: flows cannot be abused (limits, ordering, replay, race conditions) — rate limit presence:user 120/10 mnt (lewat batas diabaikan diam-diam); tab tersembunyi tidak mengirim
- [x] V12 Files and resources: uploads are type/size limited and stored safely; no path traversal or SSRF — N/A: tanpa file; path bukan URL (tanpa SSRF)
- [x] V13 API and web service: API inputs/outputs are schema-validated; CORS and rate limits are deliberate — POST: origin wajib (rejectCrossOrigin), content-type JSON, body berbatas; GET no-store
- [x] V14 Configuration: secure defaults, security headers, no debug in production, dependencies up to date — N/A: konfigurasi tidak berubah
