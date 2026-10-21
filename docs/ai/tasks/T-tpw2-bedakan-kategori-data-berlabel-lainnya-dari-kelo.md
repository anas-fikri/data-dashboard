---
id: T-tpw2
title: Bedakan kategori data berlabel (Lainnya) dari kelompok sisa Top N di ekspor dan PDF
status: todo
profile: standard
profile_pinned: true
goal: G-7
tags:
  - ui
  - query
depends_on:
  - T-071
created: "2026-10-21T15:48:06Z"
updated: "2026-10-21T15:48:06Z"
created_by: claude-code
---

## Objective
Temuan review T-071 L1: kategori data yang namanya persis '(Lainnya)' tampil identik dengan kelompok sisa Top N di CSV/XLSX dan PDF (di layar dibedakan miring + data-other, dan hanya data asli yang bisa jadi filter silang). Beri penanda yang terbaca di ekspor/PDF, mis. label sistem berbeda atau kolom/keterangan, tanpa mengubah ekspor pivot tanpa Top N.

## Acceptance criteria
- [ ] Given pivot ber-Top N dengan kategori data bernama '(Lainnya)', when diekspor CSV/XLSX atau dicetak PDF, then kelompok sisa Top N dan kategori data itu bisa dibedakan pembaca
- [ ] Given pivot tanpa Top N, then isi ekspor CSV/XLSX tidak berubah (uji regresi)

## Risk
(Required for strict profile. Impact:, Security (STRIDE):, Rollback:, Validation:)

## Notes
