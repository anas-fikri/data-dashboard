---
id: T-028
title: 'Ingest: angka negatif gaya akuntansi ''(1.000)'' dibaca sebagai -1000'
status: todo
profile: standard
profile_pinned: true
tags:
  - bug
created: "2026-10-12T23:39:16Z"
updated: "2026-10-12T23:39:16Z"
created_by: claude-code
---

## Objective
Ditemukan verifikasi integritas T-011: RE.numId/RE.numUs di src/features/ingest/infer.ts tidak mengenali format kurung, sehingga sel '(1.000)' menjadi kosong dan hilang dari total.

## Acceptance criteria
- [ ] Given CSV/XLSX dengan sel '(1.000)' dan '(1.234,50)' di kolom angka id-ID, when di-ingest, then nilainya -1000 dan -1234,5 dan ikut dalam total widget
- [ ] Given teks dalam kurung yang bukan angka, when di-ingest, then tidak diubah menjadi angka

## Risk
(Required for strict profile. Impact:, Security (STRIDE):, Rollback:, Validation:)

## Notes
