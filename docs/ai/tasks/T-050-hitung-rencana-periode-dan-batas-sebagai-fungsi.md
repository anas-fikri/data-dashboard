---
id: T-050
title: Hitung rencana periode dan batas sebagai fungsi murni computePeriodPlan
status: todo
profile: standard
goal: G-6
tags:
  - data-integrity
  - test
depends_on:
  - T-049
created: "2026-10-15T02:30:57Z"
updated: "2026-10-15T02:30:57Z"
created_by: claude-code
---

## Objective
Bagian rencana docs/ai/plans/2026-10-15-tampilan-excel-dan-data-periode.md — P-18, Fase 3. Perkiraan 2 hari. Baca bagian rencana yang relevan (§3 Lihat data, §4 periode, §5 batas, §6 risiko) sebelum mulai; cek ulang kontrak T-016 (otorisasi) dan T-017 (ekspor) sesuai risiko R21.

## Acceptance criteria
- [ ] Given periode aktif, periode file baru, pengaturan dataset, dan batas env, when computePeriodPlan dijalankan, then hasilnya daftar periode ditambah/diganti/dilepas/dikecualikan/ditolak beserta baris sebelum → sesudah, tanpa pernah menyisakan periode sebagian
- [ ] Given batas terlewati dengan onLimit=EVICT_OLDEST, then yang dilepas adalah periode terlama menurut kunci periode, utuh, dan tidak pernah periode dari unggahan ini; given onLimit=REJECT (default), then PERIOD_LIMIT beserta periode yang harus dihapus pemilik
- [ ] Given satu periode melebihi batas, atau periode lebih tua dari periode tertua saat jendela penuh, then PERIOD_TOO_LARGE/PERIOD_OUT_OF_WINDOW tanpa ada periode yang dilepas
- [ ] Given uji berbasis properti ≥ 1.000 kasus acak, then semua invarian selalu terpenuhi dan rencana dibekukan (JSON) di versi

## Risk
(Required for strict profile. Impact:, Security (STRIDE):, Rollback:, Validation:)

## Notes
