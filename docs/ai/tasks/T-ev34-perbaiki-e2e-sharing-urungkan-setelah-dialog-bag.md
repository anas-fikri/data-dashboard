---
id: T-ev34
title: 'Perbaiki e2e sharing: urungkan setelah dialog Bagikan menutup kanvas mode edit'
status: todo
profile: standard
tags:
  - e2e
created: "2026-10-21T18:24:30Z"
updated: "2026-10-21T18:24:30Z"
created_by: claude-code
---

## Objective
Ditemukan saat T-074: tests/e2e/sharing.spec.ts:1849 ('peringatan kolom filter … #kolom-filter', bagian Ctrl+Z di dialog Bagikan) gagal deterministik di HEAD 1ad5b22 tanpa perubahan T-074 (diverifikasi dengan git stash, 2/2 run): setelah closeShare halaman berada di /dashboards (daftar) sehingga widget 'Urungkan nanti' tidak ditemukan. Cari apakah aplikasi bernavigasi (mis. Escape/Back, refresh akses) atau tesnya salah; perbaiki akarnya.

## Acceptance criteria
- [ ] Given --project=sharing dijalankan dua kali berturut-turut, then semua tes lulus tanpa waitForTimeout baru

## Risk
(Required for strict profile. Impact:, Security (STRIDE):, Rollback:, Validation:)

## Notes
- Diagnosis T-075 (2026-10-21, belum diperbaiki): direproduksi (--project=sharing, 25 lulus, 1 gagal di
  :1849). Halaman TIDAK bernavigasi ke /dashboards — snapshot error-context diambil dari halaman lain di
  konteks (tes memakai halaman bersama `a`, bukan fixture `page`). Trace jaringan: tepat saat "Bagikan"
  diklik dengan panel widget baru "Urungkan nanti" masih terbuka, klien mengirim
  PATCH /api/dashboards/<d>/widgets/<w> {"title":""} (sesudah PATCH judul "Urungkan nanti" dan PATCH
  type) → judul widget terhapus, jadi widgetTitled(...) = 0. Satu-satunya pengirim judul adalah
  WidgetPanel.saveTitle (onBlur input Judul); state `title` panel bernilai "" saat blur — kemungkinan panel
  dipasang ulang dengan props widget basi (judul "") lalu input kehilangan fokus. Ini bug kehilangan data
  (judul) di aplikasi, bukan hanya tes. Langkah berikut: reproduksi dengan tes kecil (tambah widget, isi
  judul + Enter, pilih jenis, klik Bagikan, cek PATCH), cari pemicu pasang ulang (AccessRefreshProvider
  stateKey / refresh setelah aksi server listShares) dan buat saveTitle hanya mengirim bila input pernah
  diubah pengguna sejak pasang.

