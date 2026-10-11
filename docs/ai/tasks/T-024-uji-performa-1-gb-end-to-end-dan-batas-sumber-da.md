---
id: T-024
title: Uji performa 1 GB end-to-end dan batas sumber daya
status: todo
profile: standard
goal: G-5
depends_on:
  - T-023
  - T-015
  - T-017
created: "2026-10-11T14:45:09Z"
updated: "2026-10-11T14:57:00Z"
created_by: claude-code
---

## Objective
npm run perf: fixture T-005 (xlsx 1 GB 3 sheet × 1 juta baris; csv 1 GB ≈ 8 juta baris) → upload → ingest → 10 widget → filter; ukur waktu, RSS, p95 query. Batas: kuota storage per user (USER_STORAGE_QUOTA_BYTES, dihitung dari ukuran versi di PostgreSQL), posisi antrean ingest di UI. Laporan docs/ai/perf/T-024.md.

## Acceptance criteria
- [ ] Given fixture 1 GB, when alur upload sampai dashboard 10 widget selesai di VM spek minimum, then total < 20 menit dan laporan waktu/RSS/p95 tersimpan di docs/ai/perf/T-024.md
- [ ] Given 5 upload bersamaan dari 5 user, when ingest berjalan, then maksimal 2 job aktif (2 worker × 1) dan sisanya menampilkan posisi antrean di UI
- [ ] Given user mencapai kuota storage, when initUpload, then code QUOTA_EXCEEDED dengan angka terpakai/limit

## Risk
(Required for strict profile. Impact:, Security (STRIDE):, Rollback:, Validation:)

## Notes

- 2026-10-11T14:57:00Z AC kuota mencakup upload berjalan (versi UPLOADING).
