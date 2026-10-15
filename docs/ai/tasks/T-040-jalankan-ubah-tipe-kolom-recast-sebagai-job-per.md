---
id: T-040
title: Jalankan ubah tipe kolom/recast sebagai job per segmen
status: todo
profile: standard
goal: G-6
tags:
  - worker
  - schema
depends_on:
  - T-037
created: "2026-10-15T02:30:55Z"
updated: "2026-10-15T02:30:55Z"
created_by: claude-code
---

## Objective
Bagian rencana docs/ai/plans/2026-10-15-tampilan-excel-dan-data-periode.md — P-8, Fase 1. Perkiraan 3–4 hari. Baca bagian rencana yang relevan (§3 Lihat data, §4 periode, §5 batas, §6 risiko) sebelum mulai; cek ulang kontrak T-016 (otorisasi) dan T-017 (ekspor) sesuai risiko R21.

## Acceptance criteria
- [ ] Given sheet 24 segmen, when pemilik mengubah tipe kolom, then job per segmen berjalan dengan prioritas di bawah ingest, progres 'Segmen 7 dari 24' tampil, dan revisi baru aktif atomik hanya setelah semua segmen selesai
- [ ] Given worker mati di tengah recast, when worker hidup lagi, then segmen yang sudah selesai tidak diulang dan hasil akhir identik
- [ ] Given versi lama berbagi segmen, when recast selesai, then typed revisi lama tetap utuh sehingga rollback tetap bisa
- [ ] Given kolom tersembunyi baru ditambahkan, then segmen lama tidak di-cast ulang (diproyeksikan NULL)

## Risk
(Required for strict profile. Impact:, Security (STRIDE):, Rollback:, Validation:)

## Notes
