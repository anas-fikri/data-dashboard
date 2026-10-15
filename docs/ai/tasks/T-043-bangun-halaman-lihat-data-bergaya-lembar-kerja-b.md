---
id: T-043
title: Bangun halaman 'Lihat data' bergaya lembar kerja (baca-saja)
status: todo
profile: standard
goal: G-6
tags:
  - ui
depends_on:
  - T-041
  - T-035
created: "2026-10-15T02:30:56Z"
updated: "2026-10-15T02:30:56Z"
created_by: claude-code
---

## Objective
Bagian rencana docs/ai/plans/2026-10-15-tampilan-excel-dan-data-periode.md — P-11, Fase 2. Perkiraan 4–5 hari. Baca bagian rencana yang relevan (§3 Lihat data, §4 periode, §5 batas, §6 risiko) sebelum mulai; cek ulang kontrak T-016 (otorisasi) dan T-017 (ekspor) sesuai risiko R21.

## Acceptance criteria
- [ ] Given pemilik/editor klik 'Lihat data', when halaman dimuat, then grid menampilkan sheet aktif dengan huruf kolom + nama + ikon tipe, header dan nomor baris beku, tab sheet di bawah, format id-ID (angka, d Mmm yyyy, Rp, Ya/Tidak, NULL kosong), dan status 'Baris 1–40 dari 9.812.334'
- [ ] Given sheet 10 jt tanpa urut, when 'Ke baris 9.000.000' atau Ctrl+End, then baris itu tampil ≤ 1 detik, termasuk di Firefox
- [ ] Given lebar kolom diubah atau di-autofit, kolom dibekukan (≤ 3), disembunyikan, atau digeser, when halaman dibuka lagi, then pengaturan pulih per (sheet, revisi skema); bila localStorage diblokir, grid tetap berfungsi
- [ ] Given versi berganti saat menggulir, then muncul banner 'Data sudah diperbarui — Muat ulang' dan tidak ada baris dari dua versi yang tercampur

## Risk
(Required for strict profile. Impact:, Security (STRIDE):, Rollback:, Validation:)

## Notes
