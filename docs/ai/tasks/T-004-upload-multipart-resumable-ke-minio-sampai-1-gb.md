---
id: T-004
title: Upload multipart resumable ke MinIO sampai 1 GB
status: todo
profile: standard
goal: G-3
tags:
  - security
depends_on:
  - T-003
created: "2026-10-11T14:45:08Z"
updated: "2026-10-11T14:45:08Z"
created_by: claude-code
---

## Objective
Alur B2. Presigned multipart 16 MiB langsung browser→MinIO; S3 client menandatangani dengan S3_PUBLIC_ENDPOINT (D5). initUpload menolak DATASET_BUSY bila ada versi non-terminal, ukuran > MAX_UPLOAD_BYTES, ekstensi bukan .xlsx/.csv; fingerprint (nama+ukuran+lastModified) di-scope (userId, datasetId). Sebelum complete: ListParts (jumlah part = diterbitkan, part ≤ 16 MiB kecuali terakhir); setelah complete: HeadObject ≤ batas, GetObject 64 KB validasi (xlsx ZIP signature; csv teks tanpa NUL, BOM UTF-16 ditolak). Valid → UPLOADED + enqueue; tidak → DeleteObject + FAILED + INVALID_FORMAT. Job terjadwal: UPLOADING > 24 jam → FAILED. storage.deleteDatasetObjects menghapus semua prefix dataset.

## Acceptance criteria
- [ ] Given file .xlsx 200 MB, when user upload, then progress tampil, versi UPLOADED tercatat dengan ukuran dan ETag multipart, dan job ingest ter-enqueue
- [ ] Given ukuran dideklarasikan 1 GB + 1 byte, when initUpload, then ditolak code FILE_TOO_LARGE tanpa createMultipartUpload
- [ ] Given client mengunggah part berukuran 20 MiB pada upload yang dideklarasikan 16 MiB per part, when completeUpload, then ListParts mendeteksi, multipart di-abort, versi FAILED
- [ ] Given file .exe diganti ekstensi .xlsx, when completeUpload, then validasi signature gagal, objek dihapus, versi FAILED, user melihat code INVALID_FORMAT
- [ ] Given upload terputus di tengah, when user memuat ulang halaman dan memilih file yang sama, then upload dilanjutkan dari part terakhir yang ber-ETag; user lain dengan file identik tidak bisa melanjutkan upload itu
- [ ] Given dataset punya versi INGESTING, when user memulai upload lagi, then ditolak code DATASET_BUSY

## Risk
(Required for strict profile. Impact:, Security (STRIDE):, Rollback:, Validation:)

## Notes
