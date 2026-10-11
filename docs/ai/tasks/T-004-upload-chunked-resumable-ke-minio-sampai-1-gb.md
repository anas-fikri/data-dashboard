---
id: T-004
title: Upload chunked resumable ke MinIO sampai 1 GB
status: todo
profile: standard
goal: G-3
tags:
  - security
depends_on:
  - T-003
created: "2026-10-11T10:22:45Z"
updated: "2026-10-11T10:22:45Z"
created_by: claude-code
---

## Objective
Upload langsung dari browser ke MinIO via presigned multipart (chunk 16 MB), bisa dilanjutkan setelah koneksi putus, progress bar. Validasi server: ekstensi .xlsx/.csv, magic bytes, ukuran ≤ 1 GB (env MAX_UPLOAD_BYTES).

## Acceptance criteria
- [ ] Given file .xlsx 1 GB, when user upload, then progress tampil dan setelah selesai file tercatat di profil dataset dengan ukuran dan checksum
- [ ] Given file 1 GB + 1 byte, when user mencoba upload, then ditolak di sisi server sebelum chunk pertama disimpan
- [ ] Given file .exe diganti ekstensi .xlsx, when upload selesai, then validasi magic bytes gagal, file dihapus dari storage, dan user melihat pesan format tidak valid
- [ ] Given upload terputus di tengah, when user memuat ulang halaman dan memilih file yang sama, then upload dilanjutkan dari chunk terakhir yang berhasil

## Risk
(Required for strict profile. Impact:, Security (STRIDE):, Rollback:, Validation:)

## Notes
