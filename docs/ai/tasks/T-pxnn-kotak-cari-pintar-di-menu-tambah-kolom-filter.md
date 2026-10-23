---
id: T-pxnn
title: Kotak cari pintar di menu Tambah kolom filter
status: in_review
profile: standard
tags:
  - ui
created: "2026-10-23T01:28:45Z"
updated: "2026-10-23T13:16:47Z"
created_by: claude-code
workers:
  - claude-code
branch: claude/intelligent-albattani-fd1va8
base: f21a6ecbde85af8c204e98d04e3b0df5ae7e4abd
review:
  passes:
    - "n": 1
      by: claude-reviewer-subagent
      at: "2026-10-23T12:01:18Z"
      findings: 9
    - "n": 2
      by: claude-reviewer-subagent
      at: "2026-10-23T12:07:54Z"
      findings: 3
    - "n": 3
      by: claude-reviewer-subagent
      at: "2026-10-23T13:16:32Z"
      findings: 0
---

## Objective
Setiap daftar pilihan punya kotak cari pintar (keputusan pemilik 2026-10-23; laporan: menu Tambah kolom filter di produksi tanpa smart search). Komponen dasar Select (ui/select.tsx) selalu berkotak cari — semua dropdown pilihan ikut; menu pilihan berbasis DropdownMenu memakai ui/menu-search (Tambah kolom filter, Pilih periode Lihat data, filter status pengguna); daftar Kolom yang ditampilkan di Lihat data diberi kotak cari. Menu aksi tidak.

## Acceptance criteria
- [x] Menu Tambah kolom filter dengan ≥ 8 kolom punya kotak cari yang langsung fokus; pencarian pintar (src/lib/search: awalan, potongan, singkatan, inisial) menyaring kolom semua sheet dan menyorot huruf yang cocok
- [x] Keyboard: ketik menyaring, ↓ pindah ke hasil, Enter di kotak cari menambah hasil pertama yang bisa dipakai, Esc menutup; kolom yang sudah dipakai tetap tampil nonaktif dengan alasannya
- [x] Berlaku di bilah filter (Atur kolom filter) dan kartu Pengaturan dashboard
- [x] Semua daftar pilihan (Select, menu pilihan, daftar Kolom yang ditampilkan) punya kotak cari pintar; menu aksi tidak (keputusan pemilik 2026-10-23)

## Risk
Impact: semua Select di aplikasi (fokus awal pindah ke kotak cari; Enter kosong tidak mengganti nilai; ↓ ke pilihan saat ini). Rollback: revert commit (tanpa migrasi). Validation: aitk check, e2e filters T-pxnn + sharing keyboard, suite e2e penuh per proyek, review 3 putaran (9 → 3 → 0); sisa non-blokir → T-yabt.

## Notes
