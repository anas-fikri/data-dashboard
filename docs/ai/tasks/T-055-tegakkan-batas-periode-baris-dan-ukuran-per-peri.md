---
id: T-055
title: Tegakkan batas periode, baris, dan ukuran per periode utuh, dengan meter dan proyeksi
status: todo
profile: standard
goal: G-6
tags:
  - limits
  - ui
depends_on:
  - T-054
  - T-039
created: "2026-10-15T02:30:58Z"
updated: "2026-10-15T02:30:58Z"
created_by: claude-code
---

## Objective
Bagian rencana docs/ai/plans/2026-10-15-tampilan-excel-dan-data-periode.md — P-23, Fase 3. Perkiraan 2–3 hari. Baca bagian rencana yang relevan (§3 Lihat data, §4 periode, §5 batas, §6 risiko) sebelum mulai; cek ulang kontrak T-016 (otorisasi) dan T-017 (ekspor) sesuai risiko R21.

## Acceptance criteria
- [ ] Given batas 24 periode / 10 jt baris per sheet / 16 GiB per dataset, when unggahan melewati batas dengan EVICT_OLDEST, then periode terlama dilepas utuh di semua sheet, pelepasannya tampil di tinjauan, dan tidak ada baris yang dipotong; dengan REJECT, unggahan ditolak dengan menyebut nama periodenya
- [ ] Given satu periode melebihi batas, then unggahan ditolak dengan jumlah baris dan batasnya, dan data aktif tidak berubah
- [ ] Given pemakaian ≥ 80% batas mana pun, then kartu Periode dan panel unggah menampilkan meter ('18 dari 24 periode · 8,2 jt dari 10 jt baris · 11,3 dari 16 GB'), proyeksi ('Dengan rata-rata 1,0 jt baris per bulan, dataset ini menyimpan ±10 bulan'), dan perkiraan dari ukuran file saat init (hanya peringatan, tidak memblokir)

## Risk
(Required for strict profile. Impact:, Security (STRIDE):, Rollback:, Validation:)

## Notes
