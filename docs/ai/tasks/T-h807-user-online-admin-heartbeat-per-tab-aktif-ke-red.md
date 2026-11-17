---
id: T-h807
title: 'User online (admin): heartbeat per tab aktif ke Redis, jumlah online di kartu Server (admin) + daftar di Admin › Penggu…'
status: todo
profile: strict
profile_pinned: true
created: "2026-11-17T12:46:12Z"
updated: "2026-11-17T12:46:29Z"
created_by: claude-code
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
