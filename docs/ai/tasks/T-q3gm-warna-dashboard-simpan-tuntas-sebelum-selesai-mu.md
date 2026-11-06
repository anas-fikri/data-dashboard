---
id: T-q3gm
title: 'Warna dashboard: simpan tuntas sebelum Selesai/muat ulang + nilai server terkini (Low review T-z1vv)'
status: todo
profile: standard
created: "2026-11-06T23:41:10Z"
updated: "2026-11-06T23:41:10Z"
created_by: claude-code
---

## Objective
Temuan Low review putaran 2 T-z1vv (dashboard-colors-control.tsx / dashboard-canvas.tsx):
L1 "Selesai" (done() di dashboard-canvas) tidak menunggu simpan template warna (jeda 350 ms + request) — mode lihat bisa memuat template lama sampai dimuat ulang; kontrol perlu mengekspos flush yang ditunggu sebelum router.push.
L2 tutup tab/F5/"Muat ulang" (window.location.reload) tidak menjalankan cleanup React → perubahan ≤ 350 ms terakhir hilang; kirim di pagehide, dan antrekan keepalive di belakang chain agar nilai lama tidak menang.
L3 ref `confirmed` hanya diisi saat mount: setelah kanvas mengikuti perubahan rekan, gagal simpan kembali ke nilai saat mount; refresh server bisa menimpa pilihan yang belum tersimpan (tampilan salah, data benar).

## Acceptance criteria

## Risk
(Required for strict profile. Impact:, Security (STRIDE):, Rollback:, Validation:)

## Notes
