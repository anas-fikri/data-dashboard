---
id: T-2jwv
title: 'Lencana kepala kartu: ukur tanpa jeda satu frame dan tidak merebut ruang tombol yang disembunyikan CSS'
status: todo
profile: standard
depends_on:
  - T-7ke3
created: "2026-10-17T10:37:19Z"
updated: "2026-10-17T10:37:19Z"
created_by: claude-code
---

## Objective
(describe the outcome in one paragraph)

## Acceptance criteria
- [ ] Given kartu grafik melewati ambang container query tombol data saat diubah ukurannya, when lencana diukur ulang, then tidak ada frame dengan judul < 4rem (pengukuran sebelum paint)
- [ ] Given tombol kepala disembunyikan CSS di pita sempit, when ruang lencana dihitung, then lencana tidak muncul hanya di pita 2 px lalu hilang lagi (tidak berkedip saat resize)
- [ ] Given aturan headRoom (elemen absolut/tersembunyi dilewati, elemen fleksibel dihitung min-width, mode bungkus), when diuji unit dengan tata letak tiruan, then setiap aturan teruji

## Risk
(Required for strict profile. Impact:, Security (STRIDE):, Rollback:, Validation:)

## Notes
