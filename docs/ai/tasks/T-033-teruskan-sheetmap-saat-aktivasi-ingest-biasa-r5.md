---
id: T-033
title: Teruskan sheetMap saat aktivasi ingest biasa (R5-1)
status: todo
profile: standard
goal: G-5
tags:
  - bug
  - ingest
created: "2026-10-15T02:30:54Z"
updated: "2026-10-15T02:30:54Z"
created_by: claude-code
---

## Objective
Bug saat ini (temuan T-014 R5-1), dipisah dari rencana docs/ai/plans/2026-10-15-tampilan-excel-dan-data-periode.md (P-3, Q7): aktivasi ingest biasa ('Ganti semua') belum meneruskan sheetMap ke activateVersionInTx sehingga widget pada rantai alias bisa SHEET_UNAVAILABLE. Perkiraan 0,5–1 hari. Peta kode: catatan T-015.

## Acceptance criteria
- [ ] Given widget pada sheet dengan rantai alias ambigu, when file 'Ganti semua' diaktifkan otomatis, then widget tetap terpasang dan tidak SHEET_UNAVAILABLE
- [ ] Given unit test ingest dan FakeRepo.finish, then sheetMap dari loop sheet ingest.ts diteruskan ke repo.finish → activateVersionInTx dan teruji

## Risk
(Required for strict profile. Impact:, Security (STRIDE):, Rollback:, Validation:)

## Notes
