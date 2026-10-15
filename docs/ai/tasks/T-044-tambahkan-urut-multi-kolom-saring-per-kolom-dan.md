---
id: T-044
title: Tambahkan urut multi-kolom, saring per kolom, dan cari di Lihat data
status: todo
profile: standard
goal: G-6
tags:
  - ui
  - api
depends_on:
  - T-043
  - T-042
created: "2026-10-15T02:30:56Z"
updated: "2026-10-15T02:30:56Z"
created_by: claude-code
---

## Objective
Bagian rencana docs/ai/plans/2026-10-15-tampilan-excel-dan-data-periode.md — P-12, Fase 2. Perkiraan 3–4 hari. Baca bagian rencana yang relevan (§3 Lihat data, §4 periode, §5 batas, §6 risiko) sebelum mulai; cek ulang kontrak T-016 (otorisasi) dan T-017 (ekspor) sesuai risiko R21.

## Acceptance criteria
- [ ] Given klik header (naik → turun → tanpa urut) atau Shift+klik (≤ 3 kolom), then urutan dihitung server, aria-sort benar, dan nomor baris mengikuti urutan baru
- [ ] Given menu saring (Alt+↓) berupa daftar nilai + cari untuk teks, rentang untuk angka, serta rentang + preset untuk tanggal, when diterapkan, then chip saringan tampil, status 'x baris (tersaring dari y)', dan 'Hapus semua saringan' berfungsi
- [ ] Given Ctrl+F 'jakarta' di dalam grid, then hanya baris yang mengandung teks itu di ≤ 10 kolom teks terlihat yang tampil, sel cocok disorot, muncul 'Ditemukan di N baris', dan pencarian dibatasi 10 detik serta bisa dibatalkan
- [ ] Given urut teks pada 10 jt baris melewati QUERY_TIMEOUT_MS, then tampil 'Pengurutan ini terlalu berat; saring data dulu' dan grid tetap bisa dipakai

## Risk
(Required for strict profile. Impact:, Security (STRIDE):, Rollback:, Validation:)

## Notes
