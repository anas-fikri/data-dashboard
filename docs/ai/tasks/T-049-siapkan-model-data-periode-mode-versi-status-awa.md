---
id: T-049
title: 'Siapkan model data periode: mode versi, status AWAITING_CONFIRM, kolom _period, dan aturan beku'
status: todo
profile: strict
profile_pinned: true
goal: G-6
tags:
  - data-model
  - data-integrity
  - migration
depends_on:
  - T-038
  - T-040
created: "2026-10-15T02:30:57Z"
updated: "2026-10-15T02:30:57Z"
created_by: claude-code
---

## Objective
Bagian rencana docs/ai/plans/2026-10-15-tampilan-excel-dan-data-periode.md — P-17, Fase 3. Perkiraan 2–3 hari. Baca bagian rencana yang relevan (§3 Lihat data, §4 periode, §5 batas, §6 risiko) sebelum mulai; cek ulang kontrak T-016 (otorisasi) dan T-017 (ekspor) sesuai risiko R21.

## Acceptance criteria
- [ ] Given migrasi, then VersionMode = REPLACE/PERIOD/PERIOD_SETUP/PERIOD_REMOVE/PERIOD_RESTORE (migrasi gagal dengan pesan bila ada baris APPEND); AWAITING_CONFIRM masuk semua daftar non-terminal dan peta label (memblokir unggahan dan rollback seperti AWAITING_MAPPING); Segment punya periodKey, periodStart, minDate/maxDate, sha256, originalName, dan sourceKind
- [ ] Given dataset non-periode, when ingest, recast, mapping, dan query berjalan, then layout parquet dan hasil identik dengan sebelumnya (tanpa _period, test lama lolos)
- [ ] Given versi periode, then periodGrain/periodSource tersimpan di versi/sheet (bukan dataset), _period tertulis di typed segmen dan bertahan saat recast, sedangkan ubah tipe/format kolom periode dan pilih ulang header ditolak dengan pesan
- [ ] Given verifyVersionIntegrity pada versi periode, then pemeriksaan juga mencakup _period NULL di baris data dan kesesuaian jumlah baris per periode dengan metadata

## Risk
(Required for strict profile. Impact:, Security (STRIDE):, Rollback:, Validation:)

## Notes
