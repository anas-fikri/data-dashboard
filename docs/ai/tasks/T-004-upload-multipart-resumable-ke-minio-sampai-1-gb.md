---
id: T-004
title: Upload multipart resumable ke MinIO sampai 1 GB
status: todo
profile: strict
profile_pinned: true
goal: G-3
tags:
  - security
depends_on:
  - T-003
created: "2026-10-11T14:45:08Z"
updated: "2026-10-11T23:56:00Z"
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
- [ ] Given halaman/komponen task ini selesai, when /frontend-expert:audit dijalankan (anti-slop-design, responsive 320/768/1024/1440, accessibility), then tidak ada temuan Critical/High dan blok Conventions check (Tokens: preset project; Icons: waiver @tabler/icons-react; States loading/empty/error; Responsive; A11y) dicatat sebagai note task
- [ ] Given presigned UploadPart, when client mengirim part dengan Content-Length berbeda dari yang ditandatangani, then MinIO menolak (ContentLength sebagai signed header) dan ContentType objek ditetapkan server (application/octet-stream), bukan dari klien
- [ ] Given user sudah punya 2 versi UPLOADING, when initUpload lagi, then code LIMIT_REACHED; kuota storage menghitung ukuran terdeklarasi versi UPLOADING

## Risk
(Required for strict profile. Impact:, Security (STRIDE):, Rollback:, Validation:)

## Notes
- 2026-10-11T14:49:25Z UI wajib lewat rantai frontend-expert: design-foundations → tokens (preset dari T-025) → (+forms/data-fetching/app-shell sesuai kebutuhan) → components → anti-slop-code → responsive → motion ringan → anti-slop-design → polish → accessibility. Skip design-direction karena arah sudah dipilih di T-025, kecuali layar baru yang ambigu. Chart via skill dataviz; filter/select pakai Select kustom dari T-025, bukan native.
- 2026-10-11T14:56:59Z Tidak pernah menerbitkan presigned GET untuk prefix raw/ atau parquet/. Cap dataset/user 50, versi UPLOADING/user 2.
- 2026-10-11T23:56:00Z Dari review T-003: complete/finalize upload wajib memeriksa dataset masih ada (where {id, ownerId}) dan menghapus objek bila sudah dihapus (hapus dataset tidak mengunci upload yang sedang berjalan).

## Security checklist (OWASP ASVS 4.0.3)
<!-- Check each item when verified, or write "N/A: <reason>" after the text and check it. -->
- [ ] V1 Architecture: trust boundaries and the components handling sensitive data are identified for this change
- [ ] V2 Authentication: credentials are verified server-side; no default, hard-coded, or weak secrets
- [ ] V3 Session management: session tokens are random, protected, invalidated on logout and expiry
- [ ] V4 Access control: every endpoint/action checks authorization server-side, deny by default (no IDOR)
- [ ] V5 Validation, sanitization and encoding: all input validated; output encoded; no injection (SQL, OS, template)
- [ ] V6 Stored cryptography: sensitive data at rest uses approved algorithms; keys are not in the code
- [ ] V7 Error handling and logging: errors reveal no internals; security events are logged without secrets
- [ ] V8 Data protection: personal/sensitive data is minimized, not cached or logged, and removable
- [ ] V9 Communication: TLS for all external traffic; certificates validated
- [ ] V10 Malicious code: no backdoors, time bombs, or unexplained network calls; dependencies are trusted
- [ ] V11 Business logic: flows cannot be abused (limits, ordering, replay, race conditions)
- [ ] V12 Files and resources: uploads are type/size limited and stored safely; no path traversal or SSRF
- [ ] V13 API and web service: API inputs/outputs are schema-validated; CORS and rate limits are deliberate
- [ ] V14 Configuration: secure defaults, security headers, no debug in production, dependencies up to date
