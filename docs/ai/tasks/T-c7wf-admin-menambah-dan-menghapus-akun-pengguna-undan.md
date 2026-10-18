---
id: T-c7wf
title: Admin menambah dan menghapus akun pengguna (undangan email), panduan dan video diperbarui
status: todo
profile: standard
tags:
  - security
created: "2026-10-18T11:20:21Z"
updated: "2026-10-18T11:20:21Z"
created_by: claude-code
---

## Objective
(describe the outcome in one paragraph)

## Acceptance criteria
- [ ] Given admin di Admin › Pengguna, when menambah pengguna dengan email domain perusahaan, nama, dan peran, then akun terbuat terverifikasi tanpa password, email undangan berisi tautan buat password sekali pakai berlaku 72 jam terkirim, dan audit user.create tercatat; email di luar domain atau sudah terdaftar ditolak dengan pesan yang jelas
- [ ] Given pengguna terundang membuka tautan undangan, when menetapkan password, then ia bisa masuk; tautan kedaluwarsa atau terpakai ditolak dan pengguna bisa meminta tautan baru lewat Lupa password
- [ ] Given admin menghapus akun dengan konfirmasi mengetik email, then akun beserta sesi dan akses berbaginya terhapus dan audit user.delete (email di meta) tercatat; menghapus diri sendiri, admin aktif terakhir, atau akun yang masih punya dataset ditolak dengan pesan yang menunjuk langkah berikutnya
- [ ] Given panduan admin, then artikel dan video Mengelola pengguna memuat tambah dan hapus akun, dan terpasang di produksi

## Risk
(Required for strict profile. Impact:, Security (STRIDE):, Rollback:, Validation:)

## Notes
