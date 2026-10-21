---
id: T-071
title: Tambahkan Top N per kelompok dengan kelompok Lainnya pada pivot dan grafik
status: todo
profile: standard
profile_pinned: true
goal: G-7
tags:
  - query
  - ui
depends_on:
  - T-070
created: "2026-10-21T10:24:11Z"
updated: "2026-10-21T10:24:11Z"
created_by: claude-code
---

## Objective
Top N per level baris pivot (N teratas per kelompok induk menurut nilai pilihan) dengan sisa digabung ke 'Lainnya' yang dihitung ulang dari baris mentah, juga untuk dimensi grafik bar. Rencana G-7 §3.4.

## Acceptance criteria
- [ ] Given pivot Wilayah > Kota dengan Top 5 Kota per Wilayah menurut Total Pendapatan, then setiap wilayah menampilkan ≤ 5 kota teratas + baris 'Lainnya' berisi agregat sisa kota wilayah itu, dan subtotal wilayah = jumlah tampil + Lainnya = subtotal tanpa Top N
- [ ] Given nilai rata-rata, jumlah unik, minimum/maksimum, atau field terhitung, then nilai 'Lainnya' dihitung ulang dari baris mentah kelompok sisa (bukan menjumlah rata-rata), teruji terhadap fixture dengan nilai manual
- [ ] Given dimensi yang dipakai total berjalan/selisih (T-067), then Top N pada dimensi itu ditolak validasi dengan pesan yang menjelaskan alasannya; given label data asli bernama 'Lainnya', then tetap terbedakan dari kelompok sistem (penanda internal, label '(Lainnya)')
- [ ] Given klik baris 'Lainnya' untuk filter silang, then tidak menyaring widget lain (tidak bisa dipilih) dan tidak menambah nilai ke dashboardFilters; given ekspor dan PDF, then 'Lainnya' ikut dengan label yang sama
- [ ] Given Top N bar chart yang sudah ada (topN + irisan Lainnya pai), then perilaku lama tidak berubah (uji regresi) dan opsi Top N pivot memakai komponen select kustom yang sama

## Risk
(Required for strict profile. Impact:, Security (STRIDE):, Rollback:, Validation:)

## Notes
