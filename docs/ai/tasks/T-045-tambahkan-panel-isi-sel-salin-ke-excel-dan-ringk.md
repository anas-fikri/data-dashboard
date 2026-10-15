---
id: T-045
title: Tambahkan panel Isi sel, salin ke Excel, dan ringkasan kolom
status: todo
profile: standard
goal: G-6
tags:
  - ui
  - security
depends_on:
  - T-043
created: "2026-10-15T02:30:56Z"
updated: "2026-10-15T02:30:56Z"
created_by: claude-code
---

## Objective
Bagian rencana docs/ai/plans/2026-10-15-tampilan-excel-dan-data-periode.md — P-13, Fase 2. Perkiraan 2,5–3 hari. Baca bagian rencana yang relevan (§3 Lihat data, §4 periode, §5 batas, §6 risiko) sebelum mulai; cek ulang kontrak T-016 (otorisasi) dan T-017 (ekspor) sesuai risiko R21.

## Acceptance criteria
- [ ] Given sel terpotong atau gagal cast dipilih (F2/Enter), then panel Isi sel menampilkan isi lengkap, nilai asli + 'Tidak terbaca sebagai <tipe>' untuk sel gagal cast, dan sumber 'maret-2026.xlsx · baris 1.234 · Maret 2026'
- [ ] Given sel fokus, when Ctrl/Cmd+C, then nilai terbaca Excel sebagai angka/tanggal (tanpa pemisah ribuan, desimal sesuai pilihan koma/titik, tanggal ISO)
- [ ] Given ≤ 1.000 baris dipilih lewat nomor baris, when Ctrl+C, then TSV + baris judul tersalin, sel teks berawalan = + - @ dinetralkan, dan angka negatif tidak berubah; pilihan > 1.000 baris memunculkan tawaran 'Unduh tampilan'
- [ ] Given kolom angka dipilih, then bilah status menampilkan Jumlah, Rata-rata, Min, Maks, dan Hitung atas seluruh baris tersaring, sama dengan widget KPI setara

## Risk
(Required for strict profile. Impact:, Security (STRIDE):, Rollback:, Validation:)

## Notes
