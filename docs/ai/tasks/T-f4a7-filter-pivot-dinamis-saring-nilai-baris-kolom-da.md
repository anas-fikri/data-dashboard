---
id: T-f4a7
title: 'Filter pivot dinamis: saring nilai baris/kolom dari tabel, bagian Saring, dan klik untuk menyaring widget lain'
status: todo
profile: standard
created: "2026-10-19T15:04:54Z"
updated: "2026-10-19T15:04:54Z"
created_by: claude-code
---

## Objective
(describe the outcome in one paragraph)

## Acceptance criteria
- [ ] Given widget pivot di dashboard, when pembaca membuka menu saring di kepala kolom baris atau kolom pemisah, then bisa mencari dan mencentang nilai yang ditampilkan (seperti filter PivotTable Excel) tanpa mengubah pengaturan widget, dan subtotal serta total mengikuti nilai yang dipilih
- [ ] Given editor mengatur pivot, when menambah bagian Saring (kolom + nilai, seperti Filters di PivotTable), then pivot hanya menghitung baris yang cocok dan pengaturan itu tersimpan
- [ ] Given pivot dengan Klik untuk menyaring widget lain aktif, when pembaca mengklik label baris atau kolom, then widget lain di dashboard tersaring ke nilai itu (filter silang) dan filter itu bisa dihapus dari bilah filter
- [ ] Given saringan pivot aktif, when pivot diekspor CSV/XLSX atau dashboard diekspor PDF, then hasilnya mengikuti saringan yang sama

## Risk
(Required for strict profile. Impact:, Security (STRIDE):, Rollback:, Validation:)

## Notes
