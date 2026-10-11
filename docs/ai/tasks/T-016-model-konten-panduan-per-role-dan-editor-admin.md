---
id: T-016
title: Model konten panduan per role dan editor admin
status: todo
profile: standard
goal: G-4
depends_on:
  - T-012
created: "2026-10-11T10:33:15Z"
updated: "2026-10-11T10:33:15Z"
created_by: claude-code
---

## Objective
Tabel GuideArticle {role: owner|editor|viewer|admin|all, judul, slug, body markdown, urutan, status draft/terbit} dan GuideVideo {articleId, judul, objectKey MinIO, durasi, poster}. Halaman /admin/panduan: admin membuat/mengurutkan artikel, menulis markdown dengan pratinjau, upload video mp4 ≤ 500 MB ke MinIO via multipart (pakai komponen upload T-004), set poster otomatis dari frame pertama. Hanya role admin yang boleh mengelola.

## Acceptance criteria
- [ ] Given admin login, when membuat artikel untuk role viewer dengan markdown dan satu video mp4, then artikel tersimpan sebagai draft dan video tampil di pratinjau dengan durasi terdeteksi
- [ ] Given user non-admin, when membuka /admin/panduan atau memanggil Server Action-nya, then mendapat 404 dan tidak ada data berubah
- [ ] Given file video bukan mp4/webm atau > 500 MB, when admin upload, then ditolak sebelum tersimpan dengan pesan format/ukuran
- [ ] Given dua artikel dengan urutan 1 dan 2, when admin menukar urutan dan menerbitkan, then urutan baru tersimpan dan hanya artikel berstatus terbit yang tampil di halaman panduan

## Risk
(Required for strict profile. Impact:, Security (STRIDE):, Rollback:, Validation:)

## Notes
