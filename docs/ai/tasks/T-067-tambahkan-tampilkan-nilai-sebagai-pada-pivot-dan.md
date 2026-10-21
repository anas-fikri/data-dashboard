---
id: T-067
title: Tambahkan Tampilkan nilai sebagai pada pivot dan grafik
status: todo
profile: standard
profile_pinned: true
goal: G-7
tags:
  - query
  - ui
depends_on:
  - T-066
created: "2026-10-21T10:24:05Z"
updated: "2026-10-21T10:24:05Z"
created_by: claude-code
---

## Objective
Setara 'Show Values As' Excel: % dari total keseluruhan, % dari total baris, % dari total kolom, total berjalan, selisih dan % selisih dari item sebelumnya. Dihitung server dari agregat seluruh data (bukan hanya baris yang tampil). Rencana G-7 §3.1.

## Acceptance criteria
- [ ] Given pivot Wilayah × Bulan dengan nilai Total Pendapatan showAs pct_grand, when dimuat, then setiap sel = sel / total keseluruhan seluruh data yang lolos filter (termasuk baris di luar batas 200 tampil), total keseluruhan = 100%, dan format persen 1 desimal id-ID (mis. 12,5%)
- [ ] Given showAs pct_row / pct_col, then sel dibagi total baris / total kolom yang sama (subtotal dibagi total barisnya), dihitung walau sakelar Total dimatikan, dan total baris pct_row = 100%
- [ ] Given showAs running / diff_prev / pct_diff_prev, then dihitung sepanjang kolom pemisah bila ada, selain itu sepanjang baris terdalam di dalam kelompok induknya (reset per kelompok), dalam urutan label naik termasuk item sebelum potongan tampilan; item pertama selisih = kosong ('–'), sebelumnya 0 atau NULL → % selisih kosong, bukan error; sel total/subtotal untuk running/diff kosong
- [ ] Given grafik bar/line dengan satu dimensi, then pct_grand, running, diff_prev, pct_diff_prev tersedia (pai hanya pct_grand); given running pada grafik garis N periode terbaru, then nilai pertama yang tampil sudah memuat periode sebelumnya yang terpotong
- [ ] Given ekspor CSV/XLSX dan PDF pivot/grafik, then nilai yang diekspor = nilai yang tampil (XLSX sebagai angka dengan format persen), judul kolom menyebut cara tampil (mis. '% dari total kolom · Total Pendapatan'); given spec lama tanpa showAs, then hasil identik dengan sebelum task (uji regresi)

## Risk
(Required for strict profile. Impact:, Security (STRIDE):, Rollback:, Validation:)

## Notes
