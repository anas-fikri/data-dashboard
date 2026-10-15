---
id: T-054
title: Bangun layar tinjauan perubahan periode sebelum data diganti atau dilepas
status: todo
profile: standard
goal: G-6
tags:
  - ui
  - data-safety
  - a11y
depends_on:
  - T-052
  - T-043
created: "2026-10-15T02:30:58Z"
updated: "2026-10-15T02:30:58Z"
created_by: claude-code
---

## Objective
Bagian rencana docs/ai/plans/2026-10-15-tampilan-excel-dan-data-periode.md — P-22, Fase 3. Perkiraan 3–4 hari. Baca bagian rencana yang relevan (§3 Lihat data, §4 periode, §5 batas, §6 risiko) sebelum mulai; cek ulang kontrak T-016 (otorisasi) dan T-017 (ekspor) sesuai risiko R21.

## Acceptance criteria
- [ ] Given rencana mengganti periode, melepas periode karena batas, menyusutkan periode > 50%, memuat periode kemungkinan nyasar, atau berasal dari label, then versi menjadi AWAITING_CONFIRM dan pemilik melihat tabel Periode | Sekarang | Setelah | Keterangan sebelum 'Terapkan'
- [ ] Given penyusutan > 50%, then 'Terapkan' baru aktif setelah centang 'Saya paham Februari 2026 diganti dengan data yang lebih sedikit'; given periode kemungkinan nyasar, then default-nya 'Kecualikan' dengan jumlah baris tercatat, dan bisa diubah ke 'Masukkan'
- [ ] Given sha256 sama dengan file asal sebuah periode, then tampil 'File ini identik dengan periode Maret 2026'; given label dengan rentang kolom tanggal acuan di luar label, then peringatan tampil
- [ ] Given 'Lihat isi file', then grid membuka versi tertunda (hanya pemilik); given 'Batalkan upload' atau > 7 hari tanpa keputusan, then versi dibuang dan data aktif tidak berubah
- [ ] Given sheet periode lama tidak ada di file baru, then tampil default 'Pertahankan data lama sheet itu'

## Risk
(Required for strict profile. Impact:, Security (STRIDE):, Rollback:, Validation:)

## Notes
