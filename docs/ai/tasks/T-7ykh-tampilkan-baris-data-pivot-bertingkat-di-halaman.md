---
id: T-7ykh
title: Tampilkan baris data pivot bertingkat di halaman cetak kartu kecil
status: todo
profile: standard
goal: G-7
tags:
  - pdf
created: "2026-10-21T19:46:55Z"
updated: "2026-10-21T19:46:55Z"
created_by: claude-code
---

## Objective
Ditemukan T-075: pivot 4 tingkat di kartu ukuran bawaan (widget baru via API) dicetak sebagai 'Menampilkan 0 dari 32 baris' — hanya kepala kelompok Barat › Kilat › Kota 07 yang muat, tanpa satu pun baris data (src/features/widgets/pivot-table.ts fittingPivotRows, src/components/render/print-pivot.tsx). Ada catatan potongan, jadi tidak diam-diam, tetapi PDF tidak berguna. Pastikan setidaknya satu kelompok utuh (kepala + baris + subtotal) muat, atau pindahkan kepala kelompok menjadi kolom label seperti ekspor CSV, atau beri petunjuk 'perbesar kartu' di catatan.

## Acceptance criteria
- [ ] Given pivot 4 tingkat di kartu 4×4 grid di halaman cetak, then minimal satu baris data tampil atau catatan menyarankan memperbesar kartu; e2e pivot-lanjutan menguji kartu kecil

## Risk
(Required for strict profile. Impact:, Security (STRIDE):, Rollback:, Validation:)

## Notes
