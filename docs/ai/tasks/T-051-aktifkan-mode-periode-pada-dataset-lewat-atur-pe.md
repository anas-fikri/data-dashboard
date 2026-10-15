---
id: T-051
title: Aktifkan mode periode pada dataset lewat 'Atur periode'
status: todo
profile: standard
goal: G-6
tags:
  - ui
  - data-integrity
  - security
depends_on:
  - T-049
  - T-050
created: "2026-10-15T02:30:57Z"
updated: "2026-10-15T02:30:57Z"
created_by: claude-code
---

## Objective
Bagian rencana docs/ai/plans/2026-10-15-tampilan-excel-dan-data-periode.md — P-19, Fase 3. Perkiraan 3 hari. Baca bagian rencana yang relevan (§3 Lihat data, §4 periode, §5 batas, §6 risiko) sebelum mulai; cek ulang kontrak T-016 (otorisasi) dan T-017 (ekspor) sesuai risiko R21.

## Acceptance criteria
- [ ] Given versi aktif READY, when pemilik memilih 'Dari kolom tanggal: Tanggal Kirim · per bulan' atau 'Saya pilih saat upload' lalu 'Tinjau', then tampil sebaran baris per periode, jumlah baris tanpa tanggal valid (dengan ≤ 20 contoh nomor baris), dan proyeksi kapasitas, tanpa ada data yang berubah
- [ ] Given ada baris tanpa tanggal valid, then 'Terapkan' nonaktif sampai pemilik memilih eksplisit 'Buang N baris', dan pilihan itu tercatat di riwayat
- [ ] Given 'Terapkan', when job selesai, then versi PERIOD_SETUP aktif dengan satu segmen per periode, total dan angka dashboard sama (dikurangi baris yang dibuang eksplisit), dan rollback mengembalikan dataset ke mode biasa
- [ ] Given 'Simpan N periode' > PERIOD_KEEP_MAX atau pengguna bukan pemilik, then ditolak; AuditLog mencatat aktivasi, dan pilihan 'Saat batas tercapai: Tolak unggahan (default) / Lepas periode terlama otomatis' dijelaskan di layar

## Risk
(Required for strict profile. Impact:, Security (STRIDE):, Rollback:, Validation:)

## Notes
