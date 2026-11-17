---
id: T-se9h
title: 'Skema warna: tema membawa warna level; level tinggi/normal/rendah otomatis aktif bawaan (arah makin tinggi makin baik),…'
status: in_progress
profile: standard
created: "2026-11-17T07:28:08Z"
updated: "2026-11-17T08:09:00Z"
created_by: claude-code
workers:
  - claude-code
branch: claude/cool-babbage-t5yojt
base: 115d670758b76a83a203fa455ed07dd50760fe52
---

## Objective
Level tinggi/sedang/rendah aktif otomatis di semua dashboard: penilaian bawaan dashboard yang belum diatur = 'makin tinggi makin baik'; dashboard bisa memilih 'Tanpa warna', widget tetap bisa membalik arah atau mematikan. Warna level mengikuti tema grafik bila template status belum dipilih (Ramah buta warna → biru–oranye; tema bersaturasi tinggi → Tegas; lainnya → Lembut).

## Acceptance criteria
- [ ] Dashboard tanpa pengaturan: level otomatis aktif (makin tinggi makin baik)
- [ ] Dashboard bisa memilih Tanpa warna; widget bisa membalik/mematikan
- [ ] Warna level ikut tema grafik bila template belum dipilih; pilihan template sendiri menang

## Risk
Impact: tampilan semua dashboard lama berubah (nilai yang belum punya penilaian kini berwarna) — disetujui pemilik. Security (STRIDE): tanpa perubahan akses; skema tone dashboard menerima 'none' (enum tetap). Rollback: image sebelumnya; dashboard yang menyimpan tone 'none' akan ditolak skema versi lama → warna dashboard itu dibaca tidak valid (cek pembacaan) — risiko kecil, catat di runbook. Validation: uji unit tone-schema, e2e status-colors, chart-theme, kpi-drill.

## Notes
