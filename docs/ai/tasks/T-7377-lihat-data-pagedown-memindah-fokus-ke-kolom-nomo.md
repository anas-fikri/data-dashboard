---
id: T-7377
title: 'Lihat data: PageDown memindah fokus ke kolom nomor baris (e2e data-view-a11y AC2 gagal di main)'
status: in_progress
profile: standard
tags:
  - data-view
  - a11y
created: "2026-11-10T02:55:37Z"
updated: "2026-11-13T13:52:12Z"
created_by: claude-code
workers:
  - claude-code
branch: claude/cool-babbage-t5yojt
base: 9416e4766524bc5368bfebc1adf0e40e339a1732
---

## Objective
Uji e2e data-view-a11y AC2 gagal konsisten di main (ditemukan saat suite penuh v1.14, juga gagal tanpa perubahan v1.14 — uji banding tanpa tombol Cari): setelah Home lalu ArrowRight (fokus c1), PageDown memindah fokus ke kolom nomor baris (n), bukan tetap di c1. Terakhir tercatat lulus 2026-10-23 (T-tzxt). Cari commit penyebab (git bisect pada proyek data-view-a11y) dan perbaiki navigasi keyboard grid.

## Acceptance criteria
- [x] Given sel c1 terfokus di Lihat data, when PageDown/PageUp ditekan, then fokus tetap di kolom c1 dan baris berpindah satu halaman; e2e data-view-a11y lulus
- [x] Given sel di Lihat data, when Esc menutup dialog saring lalu F2 ditekan, then panel Isi sel terbuka untuk sel yang sama (e2e data-view-a11y AC3 lulus)

## Risk
Impact: navigasi keyboard grid Lihat data (Home/End, pengembalian fokus setelah dialog saring). Security: N/A (UI). Rollback: versi sebelumnya. Validation: e2e data-view-a11y 2× lulus + proyek data-view lain.

## Notes
- 2026-11-10T05:32:06Z v1.15 (2026-11-10): AC3 juga gagal — F2 setelah Esc dari dialog saring tidak membuka panel Isi sel (data-view-a11y.spec.ts:298); uji banding di 7809c7d (v1.14) gagal sama → bukan regresi v1.15. AC1 dijalankan terpisah.
- 2026-11-13T13:52:12Z Akar masalah AC2: Home/End memfokus sel lewat dua requestAnimationFrame → tombol berikutnya berangkat dari sel lama. Kini fokus langsung bila sel sudah dirender. AC3: uji menekan F2 sebelum dialog tertutup; disamakan dengan AC2 (tunggu tertutup) + fokus kembali ke sel menurut baris/kolom bila sel asal dirender ulang.
