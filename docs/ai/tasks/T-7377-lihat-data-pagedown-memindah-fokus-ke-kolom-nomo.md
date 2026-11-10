---
id: T-7377
title: 'Lihat data: PageDown memindah fokus ke kolom nomor baris (e2e data-view-a11y AC2 gagal di main)'
status: todo
profile: standard
tags:
  - data-view
  - a11y
created: "2026-11-10T02:55:37Z"
updated: "2026-11-10T05:32:06Z"
created_by: claude-code
---

## Objective
Uji e2e data-view-a11y AC2 gagal konsisten di main (ditemukan saat suite penuh v1.14, juga gagal tanpa perubahan v1.14 — uji banding tanpa tombol Cari): setelah Home lalu ArrowRight (fokus c1), PageDown memindah fokus ke kolom nomor baris (n), bukan tetap di c1. Terakhir tercatat lulus 2026-10-23 (T-tzxt). Cari commit penyebab (git bisect pada proyek data-view-a11y) dan perbaiki navigasi keyboard grid.

## Acceptance criteria
- [ ] Given sel c1 terfokus di Lihat data, when PageDown/PageUp ditekan, then fokus tetap di kolom c1 dan baris berpindah satu halaman; e2e data-view-a11y lulus

## Risk
(Required for strict profile. Impact:, Security (STRIDE):, Rollback:, Validation:)

## Notes

- 2026-11-10T05:32:06Z v1.15 (2026-11-10): AC3 juga gagal — F2 setelah Esc dari dialog saring tidak membuka panel Isi sel (data-view-a11y.spec.ts:298); uji banding di 7809c7d (v1.14) gagal sama → bukan regresi v1.15. AC1 dijalankan terpisah.
