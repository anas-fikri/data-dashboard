---
id: T-2myj
title: 'Lanjutan T-85tb: temuan Low pemilih sheet'
status: todo
profile: standard
created: "2026-10-23T15:57:52Z"
updated: "2026-10-23T15:57:52Z"
created_by: claude-code
---

## Objective
Temuan Low review T-85tb (tidak memblokir): (1) tanpa umpan balik "Membaca daftar sheet…" saat file dibaca; (2) unggahan tertunda tidak bisa ganti pilihan sheet (kartu tertunda sebaiknya menyebut sheet terpilih); (3) regex atribut pembaca browser kuadratik pada tag raksasa / nama sheet berisi `>` mentah tampil tanpa nama; (4) picker tersembunyi muncul lagi setelah `processing` selesai; (5) fokus setelah "Unggah file" jatuh ke body (pindahkan ke kartu progres); (6) unggahan periode > 50 sheet tidak punya pemilih; (7) unggahan tertunda lama berpilihan kosong pada buku > 50 sheet; (8) uji untuk batas stored entry dan penjaga urutan baca; (9) pesan pemetaan "Sheet X tidak ada di file baru" sebaiknya menyebut "atau tidak dipilih saat unggah".

## Acceptance criteria

## Risk
(Required for strict profile. Impact:, Security (STRIDE):, Rollback:, Validation:)

## Notes
