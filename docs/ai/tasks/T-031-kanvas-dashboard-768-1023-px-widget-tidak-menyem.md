---
id: T-031
title: 'Kanvas dashboard 768–1023 px: widget tidak menyempit sampai tak terbaca'
status: todo
profile: standard
profile_pinned: true
goal: G-4
depends_on:
  - T-011
created: "2026-10-13T01:15:20Z"
updated: "2026-10-13T03:44:55Z"
created_by: claude-code
---

## Objective
Pada lebar 768–1023 px grid 12 kolom di area ±480 px (sidebar tetap tampil) membuat widget MIN_W 2 hanya 66–67 px: judul tinggal satu huruf dan fallback terpotong (verifikasi T-011 putaran 2, Medium). Atur breakpoint grid/sidebar agar widget tetap terbaca tanpa merusak layout yang tersimpan.

## Acceptance criteria
- [ ] Given dashboard dengan widget lebar 2 kolom, when dibuka di layar 768 px dan 1023 px, then setiap widget tampil minimal 160 px lebar dan judulnya terbaca (tidak hanya satu huruf)
- [ ] Given layout tersimpan dari layar ≥ 1024 px, when dibuka di 768 px lalu kembali ke 1440 px, then layout ≥ 1024 px tidak berubah

## Risk
(Required for strict profile. Impact:, Security (STRIDE):, Rollback:, Validation:)

## Notes
- 2026-10-13T02:42:40Z Dari verifikasi T-011 putaran 3–4: judul kartu 2 kolom di mode edit (panel menempel 1280/1440, 1024) kini tetap tampil — ambang di widget-card.tsx: mouse → tombol data disembunyikan < 12rem, pegangan < 10rem, padding rapat < 8rem; sentuh → judul baris sendiri < 10rem, pegangan disembunyikan < 6.5rem; sr-only hanya < 5rem. Saat menata ulang grid 768–1023 px, pertahankan ambang ini.
- 2026-10-13T03:44:55Z Dari T-011 putaran 5: tabel data grafik di kartu 66–67 px (768, 2 kolom) masih memotong nilai ringkas dan header — perlu ambang kartu T-031. Di mode edit tombol data disembunyikan < 12rem (sentuh 14.5rem), jadi baris '+N' daftar peringkat di kartu sempit baru terjangkau di mode lihat.
