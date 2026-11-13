---
id: T-q3gm
title: 'Warna dashboard: simpan tuntas sebelum Selesai/muat ulang + nilai server terkini (Low review T-z1vv)'
status: in_progress
profile: standard
created: "2026-11-06T23:41:10Z"
updated: "2026-11-13T15:45:50Z"
created_by: claude-code
workers:
  - claude-code
branch: claude/cool-babbage-t5yojt
base: 25abf41eb4f653703b46230443af0fe93a698013
---

## Objective
Temuan Low review putaran 2 T-z1vv (dashboard-colors-control.tsx / dashboard-canvas.tsx):
L1 "Selesai" (done() di dashboard-canvas) tidak menunggu simpan template warna (jeda 350 ms + request) — mode lihat bisa memuat template lama sampai dimuat ulang; kontrol perlu mengekspos flush yang ditunggu sebelum router.push.
L2 tutup tab/F5/"Muat ulang" (window.location.reload) tidak menjalankan cleanup React → perubahan ≤ 350 ms terakhir hilang; kirim di pagehide, dan antrekan keepalive di belakang chain agar nilai lama tidak menang.
L3 ref `confirmed` hanya diisi saat mount: setelah kanvas mengikuti perubahan rekan, gagal simpan kembali ke nilai saat mount; refresh server bisa menimpa pilihan yang belum tersimpan (tampilan salah, data benar).

## Acceptance criteria
- [x] Selesai dan Muat ulang menunggu simpan warna dashboard yang tertunda sebelum pindah/memuat ulang (mode lihat memakai template terbaru)
- [x] Tutup tab/F5 sebelum jeda habis tetap mengirim pilihan terakhir (pagehide + keepalive)
- [x] Gagal simpan kembali ke nilai server terkini (termasuk perubahan rekan), bukan nilai saat panel dipasang; nilai server tidak menimpa pilihan yang belum tersimpan

## Risk
Impact: kontrol Warna dashboard + tombol Selesai/Muat ulang di mode edit dashboard. Security: N/A (endpoint sama). Rollback: versi sebelumnya. Validation: e2e status-colors + chart-theme; aitk check.

## Notes

- 2026-11-13T15:45:50Z Keterbatasan: keepalive saat pagehide tidak bisa diantrekan di belakang permintaan yang sedang berjalan (halaman sudah ditutup) — urutan di server bisa terbalik bila keduanya tiba bersamaan (sangat jarang).
