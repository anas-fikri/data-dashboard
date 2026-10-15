---
id: T-065
title: 'Ingest XLSX: tanggal 1 Jan–28 Feb 1900 terbaca mundur satu hari (bug tahun kabisat 1900 Excel)'
status: todo
profile: standard
goal: G-3
tags:
  - bug
created: "2026-10-15T19:47:05Z"
updated: "2026-10-15T19:47:05Z"
created_by: claude-code
---

## Objective
Ditemukan saat review T-017 INT-2: src/lib/xlsx/parser.ts memakai epoch 1899-12-30 tanpa koreksi bug tahun kabisat 1900 Excel, sedangkan writer ekspor T-017 sudah mengoreksinya. Dampak praktis kecil (data pengiriman jarang berisi Jan–Feb 1900), tapi impor harus cocok dengan Excel. Perbaiki di parser + regression test; jangan ubah perilaku ekspor.

## Acceptance criteria
- [ ] Given file XLSX dari Excel berisi tanggal 1900-01-01, 1900-02-28, 1900-03-01 dan 2024-01-02 (serial 1, 59, 61, 45293), when diingest, then nilai tanggal di dataset sama persis dengan yang tampil di Excel (bukan mundur satu hari untuk serial < 61)
- [ ] Given serial 60 (29 Feb 1900 fiktif Excel), when diingest, then tidak menjadi tanggal salah diam-diam (ditandai gagal cast atau dipetakan jelas) dan tanggal 1900-03-01 ke atas tidak berubah

## Risk
(Required for strict profile. Impact:, Security (STRIDE):, Rollback:, Validation:)

## Notes
