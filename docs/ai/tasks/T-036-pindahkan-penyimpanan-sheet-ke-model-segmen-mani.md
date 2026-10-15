---
id: T-036
title: Pindahkan penyimpanan sheet ke model segmen + manifest versi lewat migrasi metadata
status: todo
profile: strict
profile_pinned: true
goal: G-6
tags:
  - data-model
  - migration
depends_on:
  - T-034
  - T-033
created: "2026-10-15T02:30:55Z"
updated: "2026-10-15T02:30:55Z"
created_by: claude-code
---

## Objective
Bagian rencana docs/ai/plans/2026-10-15-tampilan-excel-dan-data-periode.md — P-4, Fase 1. Perkiraan 4–5 hari. Baca bagian rencana yang relevan (§3 Lihat data, §4 periode, §5 batas, §6 risiko) sebelum mulai; cek ulang kontrak T-016 (otorisasi) dan T-017 (ekspor) sesuai risiko R21.

## Acceptance criteria
- [ ] Given database berisi dataset lama, when migrasi berjalan, then setiap Sheet punya tepat satu segmen legacy (rowBase 0) yang merujuk rawKey/typedKey lamanya tanpa objek disalin, dan seluruh test + e2e lolos tanpa perubahan
- [ ] Given segmen baru ditulis, then typed memuat c<pos> kanonik, _row BIGINT = rowBase + baris fisik (unik per sheet logis, tidak pernah dipakai ulang, sama di setiap recast), dan _src_row, sementara SheetLineage.rowHighWater naik atomik
- [ ] Given REPLACE, rollback, atau aktivasi dengan sheetMap, then lineageId terbawa ke sheet versi baru

## Risk
(Required for strict profile. Impact:, Security (STRIDE):, Rollback:, Validation:)

## Notes
