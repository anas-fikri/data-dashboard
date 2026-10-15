---
id: T-060
title: (Opsional) Satu periode dari beberapa file sebagai satu kelompok
status: todo
profile: standard
goal: G-6
tags:
  - upload
  - ingest
  - optional
depends_on:
  - T-054
  - T-059
created: "2026-10-15T02:30:59Z"
updated: "2026-10-15T02:30:59Z"
created_by: claude-code
---

## Objective
Bagian rencana docs/ai/plans/2026-10-15-tampilan-excel-dan-data-periode.md — P-28, Fase 3. Perkiraan 3 hari. Baca bagian rencana yang relevan (§3 Lihat data, §4 periode, §5 batas, §6 risiko) sebelum mulai; cek ulang kontrak T-016 (otorisasi) dan T-017 (ekspor) sesuai risiko R21.

## Acceptance criteria
- [ ] Given bulan > 1.048.576 baris yang dipecah ke 3 file xlsx, when ketiganya diunggah sebagai satu kelompok untuk Maret 2026, then satu versi berisi 3 segmen Maret menggantikan seluruh Maret, dan mengunggah ulang kelompok yang sama menghasilkan data identik tanpa baris ganda
- [ ] Given kelompok > PERIOD_MAX_FILES, then ditolak dengan pesan

## Risk
(Required for strict profile. Impact:, Security (STRIDE):, Rollback:, Validation:)

## Notes
