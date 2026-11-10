---
id: T-d5ev
title: 'Klik-tembus grafik: klik kategori → tabel baris detail'
status: todo
profile: standard
tags:
  - widgets
  - query
created: "2026-11-10T04:16:38Z"
updated: "2026-11-10T04:16:53Z"
created_by: claude-code
---

## Objective
Grafik Batang/Garis/Pai bisa diatur "Klik-tembus": klik kategori (atau Enter pada kategori di keyboard) membuka dialog tabel baris data kategori itu — kolom pilihan pemilik/editor, berhalaman, bisa diurutkan, mengikuti filter dashboard — dengan tombol "Saring dashboard dengan ini" bila filter silang aktif. Viewer hanya melihat kolom yang dipilih untuk widget itu (D6).

## Acceptance criteria
- [ ] Given grafik Batang/Garis/Pai dengan klik-tembus aktif (kolom detail dipilih), when user mengklik kategori, then dialog menampilkan baris data kategori itu saja (kolom detail, 100 per halaman, urut per kolom), mengikuti filter dashboard yang berlaku
- [ ] Given kategori tanggal ber-periode (mis. Per bulan) atau kategori (kosong), when diklik, then baris = rentang periode itu / nilai kosong; irisan 'Lainnya' tidak bisa diklik-tembus
- [ ] Given viewer dashboard, when membuka klik-tembus, then hanya kolom detail widget itu yang terbaca; permintaan dengan nilai yang tidak cocok tipe dimensi, widget tanpa klik-tembus, atau kolom detail tersembunyi ditolak
- [ ] Given filter silang aktif di widget, when user menekan 'Saring dashboard dengan ini' di dialog, then filter silang diterapkan seperti klik biasa; tanpa klik-tembus, klik tetap langsung menyaring

## Risk
(Required for strict profile. Impact:, Security (STRIDE):, Rollback:, Validation:)

## Notes
