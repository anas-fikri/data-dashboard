---
id: T-7czr
title: 'Gerbang T-gcn8 salah alarm: headerRow typed NULL = baris judul segmen'
status: in_progress
profile: standard
created: "2026-10-24T00:07:24Z"
updated: "2026-10-24T00:07:29Z"
created_by: claude-code
workers:
  - claude-code
branch: claude/intelligent-albattani-fd1va8
base: aff74e4330f25c32d82a1fcfa7a37db7db3d9ac6
---

## Objective
Deploy v1.5.0 (2026-10-23 23:22Z) berhenti di gerbang pasca-migrasi T-gcn8 karena 3 file typed ber-`headerRow` NULL (dibuat ingest pertama v1.4.1) dihitung tidak cocok, padahal NULL berarti baris judul segmen (= sheet). Produksi di-rollback ke v1.4.1 tanpa kehilangan data. Perbaiki gerbang agar membandingkan nilai efektif (COALESCE dengan Segment.headerRow) dan ingest pertama mencatat headerRow eksplisit.

## Acceptance criteria
- [ ] Gerbang T-gcn8 di upgrade.sh memakai COALESCE(SegmentTyped.headerRow, Segment.headerRow): baris NULL yang benar lolos, ketidakcocokan sungguhan tetap tertangkap (diuji di DB dev pada data ingest nyata)
- [ ] Ingest pertama mencatat SegmentTyped.headerRow (uji tests/features/ingest/ingest.test.ts)

## Risk
Impact: satu kueri gerbang di deploy/upgrade.sh + satu isian yang ditulis ingest pertama (nilai sama dengan Segment.headerRow; pembaca data sudah memakai `t.headerRow ?? segment.headerRow`, jadi perilaku baca tidak berubah). Data produksi tidak diubah.
Security (STRIDE): tanpa permukaan baru; gerbang tetap fail-closed (kueri error → gagal).
Rollback: revert commit; data yang sudah ditulis bernilai sama dengan segmen.
Validation: kueri lama vs baru di DB dev dalam transaksi yang dibatalkan (NULL: lama 1/baru 0; ketidakcocokan 999: baru 1), uji unit ingest, e2e ingest.

## Notes
