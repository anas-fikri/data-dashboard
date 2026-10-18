---
id: T-byys
title: Halaman konfigurasi SMTP di Admin (uji kirim, dipakai app dan notifikasi backup)
status: in_progress
profile: standard
tags:
  - security
created: "2026-10-18T14:43:13Z"
updated: "2026-10-18T14:43:55Z"
created_by: claude-code
workers:
  - claude-code
branch: worktree-t-001-scaffold
base: d200a8e9108ae4b0fc885043738cacf266cd9c12
---

## Objective
(describe the outcome in one paragraph)

## Acceptance criteria
- [ ] Given admin membuka Admin › Email, when halaman tampil, then pengaturan SMTP yang berlaku (dari aplikasi atau bawaan server) terisi tanpa menampilkan password
- [ ] Given admin mengisi host, port, keamanan, username, password, email dan nama pengirim lalu menekan Kirim email uji atau Simpan, then email uji terkirim ke alamat tujuan atau galat yang bisa ditindak tampil, dan pengaturan tersimpan (password tidak pernah dikirim balik, dicatat di log, audit, atau DB) serta audit tercatat
- [ ] Given pengaturan SMTP tersimpan, when aplikasi atau service backup mengirim email, then pengaturan itu yang dipakai tanpa restart atau edit .env; tanpa pengaturan aplikasi, SMTP_URL dari .env tetap dipakai

## Risk
(Required for strict profile. Impact:, Security (STRIDE):, Rollback:, Validation:)

## Notes
