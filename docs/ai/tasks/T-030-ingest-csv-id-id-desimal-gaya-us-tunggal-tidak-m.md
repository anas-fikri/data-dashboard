---
id: T-030
title: 'Ingest CSV id-ID: desimal gaya US tunggal tidak membalik locale satu kolom'
status: todo
profile: standard
profile_pinned: true
tags:
  - bug
created: "2026-10-12T23:39:25Z"
updated: "2026-10-12T23:39:25Z"
created_by: claude-code
---

## Objective
Ditemukan verifikasi integritas T-011: pickLocale di src/features/ingest/infer.ts memilih locale US begitu ada satu bukti kuat US (mis. '1.5'), padahal mayoritas sel adalah ribuan id-ID ('1.234.567'); total widget jadi sekitar 1000x lebih kecil tanpa peringatan.

## Acceptance criteria
- [ ] Given CSV ber-locale id-ID dengan mayoritas angka ribuan bertitik dan satu sel '1.5', when di-ingest, then kolom tetap locale id-ID (total sesuai perhitungan id-ID) atau kolom ditandai ambigu dengan peringatan yang terlihat di halaman skema
- [ ] Given kolom yang ditandai ambigu, when user membuka skema, then pilihan locale tersedia dan koreksi menghasilkan angka yang benar

## Risk
(Required for strict profile. Impact:, Security (STRIDE):, Rollback:, Validation:)

## Notes
