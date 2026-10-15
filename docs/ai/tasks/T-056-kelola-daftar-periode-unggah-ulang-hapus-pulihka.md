---
id: T-056
title: 'Kelola daftar periode: unggah ulang, hapus, pulihkan, riwayat berlabel'
status: todo
profile: standard
goal: G-6
tags:
  - ui
  - data-safety
  - security
depends_on:
  - T-054
created: "2026-10-15T02:30:58Z"
updated: "2026-10-15T02:30:58Z"
created_by: claude-code
---

## Objective
Bagian rencana docs/ai/plans/2026-10-15-tampilan-excel-dan-data-periode.md — P-24, Fase 3. Perkiraan 3 hari. Baca bagian rencana yang relevan (§3 Lihat data, §4 periode, §5 batas, §6 risiko) sebelum mulai; cek ulang kontrak T-016 (otorisasi) dan T-017 (ekspor) sesuai risiko R21.

## Acceptance criteria
- [ ] Given dataset periode, then kartu Periode menampilkan Periode, Baris per sheet, File, Diunggah oleh, dan Tanggal, beserta aksi 'Unggah ulang' (periode terisi) dan 'Hapus'
- [ ] Given 'Hapus Februari 2026' dikonfirmasi, then versi PERIOD_REMOVE aktif dalam hitungan detik tanpa job worker, periode lain tidak berubah, dan AuditLog tercatat; periode terakhir tidak bisa dihapus (diarahkan ke 'Ganti semua data')
- [ ] Given periode diganti/dihapus dan versi lama yang memuatnya masih tersimpan, when 'Pulihkan', then versi PERIOD_RESTORE memuat segmen lama periode itu tanpa membatalkan periode lain; bila versi lama sudah terhapus retensi, aksi tidak tersedia dan ada penjelasannya
- [ ] Given riwayat versi, then setiap baris menyebut perubahan periodenya (ditambahkan / diganti 12.400 → 12.950 / dilepas (batas 24 periode) / dihapus / dipulihkan), dan rollback memperingatkan periode yang ikut hilang

## Risk
(Required for strict profile. Impact:, Security (STRIDE):, Rollback:, Validation:)

## Notes
