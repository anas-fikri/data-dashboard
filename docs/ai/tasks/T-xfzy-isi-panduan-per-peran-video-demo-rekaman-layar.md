---
id: T-xfzy
title: Isi panduan per peran + video demo rekaman layar
status: todo
profile: standard
depends_on:
  - T-022
created: "2026-10-16T22:16:50Z"
updated: "2026-10-16T22:16:50Z"
created_by: claude-code
---

## Objective
(describe the outcome in one paragraph)

## Acceptance criteria
- [ ] Given aplikasi baru dipasang, when skrip seed panduan dijalankan (idempoten per slug), then artikel terbit untuk Pemilik data, Editor, Viewer, Admin, dan Umum tersedia dengan isi Bahasa Indonesia dan konteks bantuan unggah/skema/penyusun
- [ ] Given skrip rekam video dijalankan di mesin ini terhadap app yang berjalan, when selesai, then tiap peran punya video walkthrough (webm, takarir langkah di layar, tanpa data pribadi) yang terunggah ke artikelnya dan bisa diputar di /panduan
- [ ] Given pengguna tiap peran membuka /panduan, when memilih tab perannya, then artikel urut sesuai alur kerja dan video tampil dengan durasi + poster

## Risk
(Required for strict profile. Impact:, Security (STRIDE):, Rollback:, Validation:)

## Notes
