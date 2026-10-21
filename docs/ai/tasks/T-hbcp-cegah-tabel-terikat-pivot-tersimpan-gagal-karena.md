---
id: T-hbcp
title: Cegah tabel terikat pivot tersimpan gagal karena total berjalan dan Top N di baris terdalam
status: todo
profile: standard
goal: G-7
tags:
  - bug
created: "2026-10-21T19:46:57Z"
updated: "2026-10-21T19:46:57Z"
created_by: claude-code
---

## Objective
Ditemukan T-075: pivot tersimpan dengan Pisahkan per (kolom pemisah) + Top N pada baris terdalam + nilai Total berjalan/Selisih sah (sumbu = kolom pemisah). Widget tabel terikat membuang kolom pemisah (src/features/widgets/bound.ts effectiveConfig case table) sehingga sumbu pindah ke baris terdalam ber-Top N dan spec efektif ditolak TOP_N_AXIS_TEXT; pengguna melihat 'Pengaturan widget ini tidak cocok lagi dengan sumber datanya. Pilih ulang nilai…' yang tidak bisa diperbaiki dari panel tabel (tabel tidak memilih nilai). Keputusan standar yang aman: di tabel, nilai bercara tampil sumbu (running/diff_prev/pct_diff_prev) ditampilkan sebagai nilai biasa dengan catatan, atau panel pivot tersimpan memperingatkan saat menyimpan; catat pilihan di ADR-0009.

## Acceptance criteria
- [ ] Given pivot tersimpan kolom pemisah + Top N baris terdalam + Total berjalan, when widget tabel diikat, then tabel tampil (bukan galat) dengan catatan cara tampil yang tidak berlaku, dan uji unit effectiveConfig

## Risk
(Required for strict profile. Impact:, Security (STRIDE):, Rollback:, Validation:)

## Notes
