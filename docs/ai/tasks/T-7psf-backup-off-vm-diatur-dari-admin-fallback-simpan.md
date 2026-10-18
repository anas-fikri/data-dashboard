---
id: T-7psf
title: Backup off-VM diatur dari Admin, fallback simpan lokal + kirim ulang, notifikasi admin
status: in_progress
profile: standard
tags:
  - security
created: "2026-10-18T13:25:38Z"
updated: "2026-10-18T13:25:44Z"
created_by: claude-code
workers:
  - claude-code
branch: worktree-t-001-scaffold
base: 628e5548c5469068726f116c6107186785fcdc39
---

## Objective
(describe the outcome in one paragraph)

## Acceptance criteria
- [ ] Given admin membuka Admin › Backup, when mengisi endpoint S3, bucket, folder, access key, dan secret lalu menekan Tes koneksi atau Simpan, then koneksi diuji tulis-baca-hapus dengan pesan yang jelas, konfigurasi tersimpan tanpa secret pernah ditampilkan ulang atau dicatat di log/DB, audit tercatat, dan backup berikutnya memakai target itu tanpa edit .env atau SSH
- [ ] Given target off-VM tidak terjangkau (down, jaringan, kunci salah), when backup harian berjalan, then arsip tetap dibuat dan ditahan di VM (tidak dihapus retensi lokal sebelum tersalin, kecuali melewati retensi penuh), dicoba kirim ulang tiap 30 menit, dan semua arsip tertunda tersalin begitu target terjangkau lagi
- [ ] Given backup gagal atau salinan off-VM tertunda, when status berubah, then setiap admin aktif menerima email sekali per perubahan (termasuk saat pulih) dan admin melihat banner serta status di Admin › Backup; backup yang tidak berjalan > 26 jam juga tampil sebagai peringatan

## Risk
(Required for strict profile. Impact:, Security (STRIDE):, Rollback:, Validation:)

## Notes
