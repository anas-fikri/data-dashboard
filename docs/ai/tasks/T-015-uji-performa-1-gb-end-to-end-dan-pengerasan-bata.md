---
id: T-015
title: Uji performa 1 GB end-to-end dan pengerasan batas sumber daya
status: todo
profile: standard
goal: G-5
depends_on:
  - T-014
  - T-013
created: "2026-10-11T10:22:46Z"
updated: "2026-10-11T10:22:46Z"
created_by: claude-code
---

## Objective
Skrip sintesis fixture xlsx 1 GB (±8 juta baris, 25 kolom, 3 sheet). Jalankan upload → ingest → 10 widget dashboard; ukur waktu, RAM, p95 query. Terapkan batas: antrean ingest 2 job paralel, kuota storage per user, batas 10 dashboard/dataset. Hasil didokumentasikan.

## Acceptance criteria
- [ ] Given fixture 1 GB, when alur upload sampai dashboard 10 widget selesai, then total waktu < 20 menit dan laporan angka waktu/RAM/p95 tersimpan di docs
- [ ] Given 5 upload bersamaan dari 5 user, when ingest berjalan, then maksimal 2 job berjalan paralel dan sisanya antre dengan posisi antrean terlihat di UI
- [ ] Given user mencapai kuota storage, when upload file berikutnya, then ditolak dengan pesan kuota dan angka terpakai/limit

## Risk
(Required for strict profile. Impact:, Security (STRIDE):, Rollback:, Validation:)

## Notes
