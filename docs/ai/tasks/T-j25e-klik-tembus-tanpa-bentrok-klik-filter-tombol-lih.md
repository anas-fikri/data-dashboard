---
id: T-j25e
title: 'Klik-tembus tanpa bentrok klik-filter: tombol Lihat baris data untuk kategori terpilih'
status: in_review
profile: standard
tags:
  - widgets
created: "2026-11-11T02:18:55Z"
updated: "2026-11-11T02:45:40Z"
created_by: claude-code
workers:
  - claude-code
branch: claude/cool-babbage-t5yojt
base: 998095958b143111ed09228764d3fbaca501a2f9
review:
  passes:
    - "n": 1
      by: claude-reviewer-subagent
      at: "2026-11-11T02:45:40Z"
      findings: 4
---

## Objective
Masukan pemilik setelah v1.15.0: klik-tembus terasa tidak berfungsi dan bentrok dengan klik-filter; pemilik ingin klik satu kali pada grafik tetap mengaktifkan filter silang. Alur baru: klik kategori = filter silang (seperti sebelum v1.15); bila grafik punya klik-tembus, bilah kecil di atas grafik menampilkan petunjuk lalu tombol "Lihat baris data “<kategori>”" untuk kategori yang sedang dipilih (keyboard: tombol yang sama). Grafik yang filter silangnya dimatikan: klik langsung membuka baris. Data, D6, dan dialog baris tidak berubah.

## Acceptance criteria
- [ ] Given grafik dengan klik-tembus dan filter silang aktif, when user mengklik kategori (atau Enter pada kategori di tabel data grafik), then kategori menjadi filter silang seperti biasa dan tidak membuka dialog
- [ ] Given kategori dari grafik itu sedang dipilih, when user menekan tombol 'Lihat baris data “<kategori>”' di atas grafik, then dialog baris kategori itu terbuka (fokus kembali ke tombol saat ditutup); tanpa pilihan, bilah menampilkan petunjuk
- [ ] Given filter silang widget dimatikan, when user mengklik kategori, then dialog baris langsung terbuka (tanpa bilah)
- [ ] Given panduan dan halaman Yang baru, when dibaca, then menjelaskan alur tombol Lihat baris data

## Risk
(Required for strict profile. Impact:, Security (STRIDE):, Rollback:, Validation:)

## Notes
