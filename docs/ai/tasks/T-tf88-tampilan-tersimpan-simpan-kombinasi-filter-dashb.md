---
id: T-tf88
title: 'Tampilan tersimpan: simpan kombinasi filter dashboard dengan nama'
status: todo
profile: standard
tags:
  - dashboards
created: "2026-11-10T01:17:13Z"
updated: "2026-11-10T01:17:13Z"
created_by: claude-code
---

## Objective
Pengguna menyimpan kombinasi filter dashboard dengan nama (mis. Jakarta – bulan ini), memilihnya kembali dari menu Tampilan, dan membagikannya lewat link; tampilan pribadi per pengguna, pemilik/editor bisa membuat tampilan bersama untuk semua yang punya akses.

## Acceptance criteria
- [ ] Given filter dashboard aktif, when pengguna memilih Simpan tampilan dan memberi nama, then tampilan tersimpan (pribadi) dan muncul di menu Tampilan dashboard itu
- [ ] Given pemilik/editor, when menyimpan tampilan sebagai bersama, then semua yang punya akses dashboard melihatnya; viewer hanya bisa membuat tampilan pribadi
- [ ] Given tampilan dipilih, when diterapkan, then filter di URL diganti dengan filter tampilan itu (link bisa dibagikan); tampilan bisa diganti nama dan dihapus oleh pembuatnya (bersama: pemilik/editor)
- [ ] Given kolom filter dihapus dari dashboard, when tampilan lama dipilih, then filter untuk kolom yang hilang diabaikan tanpa galat

## Risk
(Required for strict profile. Impact:, Security (STRIDE):, Rollback:, Validation:)

## Notes
