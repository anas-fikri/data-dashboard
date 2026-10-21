---
id: T-074
title: Bangun UI kelola pivot tersimpan dan pilih sumber di panel widget
status: todo
profile: standard
profile_pinned: true
goal: G-7
tags:
  - ui
depends_on:
  - T-073
  - T-069
created: "2026-10-21T10:24:15Z"
updated: "2026-10-21T10:24:15Z"
created_by: claude-code
---

## Objective
Daftar 'Pivot tersimpan' di halaman dataset, editor pivot tersimpan (baris, kolom, nilai + field terhitung + Tampilkan nilai sebagai, Saring, Top N) dengan pratinjau, simpan dari widget pivot yang ada, dan pilihan 'Sumber: Pivot tersimpan' di panel widget. Lewat frontend-expert. Rencana G-7 §3.3.

## Acceptance criteria
- [ ] Given pemilik dataset, when membuka tab 'Pivot tersimpan' di halaman dataset, then tampil daftar Nama | Sheet | Dipakai di (N widget, M dashboard) | Diubah, dengan aksi Ubah, Ganti nama, Duplikat, Hapus (Hapus nonaktif + tooltip daftar dashboard bila dipakai)
- [ ] Given editor pivot tersimpan, when pemilik mengubah lalu Simpan, then dialog konfirmasi 'Perubahan berlaku di N widget pada M dashboard' muncul bila N > 0; given revisi basi (tab lain menyimpan dulu), then pesan konflik dengan opsi muat ulang, tanpa menimpa
- [ ] Given widget pivot biasa, when 'Simpan sebagai pivot tersimpan', then pivot tersimpan baru dibuat dan widget langsung terikat; given panel widget bar/line/pie/KPI/tabel, when 'Sumber: Pivot tersimpan' dipilih, then hanya pilihan tampilan yang relevan muncul (dimensi = baris pertama/kolom pemisah, satu nilai; KPI satu nilai) dan 'Lepas dari sumber' menyalin spec menjadi widget mandiri
- [ ] Given editor dashboard (bukan pemilik dataset), then bisa memilih pivot tersimpan sebagai sumber dan melihat definisinya (baca-saja) tetapi tidak mengubah/menghapus; viewer tidak melihat menu ini sama sekali
- [ ] Given lebar 360 px dan hanya keyboard, then daftar dan editor bisa dipakai tanpa gulir horizontal, dialog konfirmasi fokus terkunci, ikon Tabler size 20 stroke 1.5; /frontend-expert:audit tanpa Critical/High dan Conventions check terisi

## Risk
(Required for strict profile. Impact:, Security (STRIDE):, Rollback:, Validation:)

## Notes
