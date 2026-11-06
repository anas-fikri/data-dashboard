---
id: T-4q8n
title: 'Kolom filter: cegah lost update antar pemilik/editor + rapikan batas editor'
status: todo
profile: standard
tags:
  - security
  - ui
created: "2026-10-22T10:45:53Z"
updated: "2026-10-22T11:22:45Z"
created_by: claude-code
---

## Objective
Lanjutan review T-k2ec (temuan non-blokir). Simpan kolom filter memakai revisi/lock sehingga tab basi tidak menimpa perubahan orang lain, baca-tulis kolom tersembunyi dalam satu transaksi, penghitung editor ikut kolom tersembunyi, pemilik bisa menambah kolom saat ada kolom tidak tersedia, dan peringatan tumpang-tindih sheet untuk editor.

## Acceptance criteria
- [ ] Simpan kolom filter dari daftar basi → CONFLICT/STALE dengan pesan muat ulang, bukan menimpa diam-diam (review T-k2ec #1)
- [ ] Baca kolom tersimpan + tulis dalam satu transaksi lockDashboard (review T-k2ec #2)
- [ ] Penghitung/batas penuh editor menghitung kolom tersembunyi yang dipertahankan (review T-k2ec #3)
- [ ] Pemilik bisa menambah kolom walau ada kolom tersimpan tidak tersedia yang tidak diubah (review T-k2ec #4)
- [ ] Editor diberi tahu bila kolom filter yang ditambahkan menyaring lebih dari satu sheet (review T-k2ec #6)
- [ ] Pemilik bisa menyimpan filter bawaan walau ada kolom filter tidak tersedia (review T-vb7q #2)
- [ ] Cadangan PDF saat status filter belum diterbitkan memakai filter bawaan (review T-vb7q #3)
- [ ] Bawaan basi (tipe kolom diubah) ditandai di pengaturan sebelum terhapus saat simpan berikutnya (review T-vb7q pass 2 #1)

## Risk
(Required for strict profile. Impact:, Security (STRIDE):, Rollback:, Validation:)

## Notes
