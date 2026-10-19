---
id: T-sew3
title: 'Panduan developer: peta kode, resep modifikasi, tes, dan rilis'
status: todo
profile: standard
created: "2026-10-19T07:19:36Z"
updated: "2026-10-19T07:19:36Z"
created_by: claude-code
---

## Objective
(describe the outcome in one paragraph)

## Acceptance criteria
- [ ] Given programmer baru yang belum pernah membuka repo, when membaca docs/panduan-developer.md, then ia bisa menyiapkan lingkungan lokal, menjalankan aplikasi + worker + tes, dan menemukan modul untuk tiap fitur (upload/ingest, query, dashboard/widget, ekspor/PDF, berbagi, admin, backup, panduan)
- [ ] Given kebutuhan modifikasi umum (tipe widget, agregasi, filter, halaman admin, job worker, model Prisma, variabel env, artikel panduan), when mengikuti resep di panduan, then daftar file yang harus diubah sesuai kode saat ini
- [ ] Given rilis ke produksi, when mengikuti panduan, then langkah tes, review, deploy, dan rollback merujuk runbook dan alur aitk yang berlaku

## Risk
(Required for strict profile. Impact:, Security (STRIDE):, Rollback:, Validation:)

## Notes
