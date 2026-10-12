---
id: T-004
title: Upload multipart resumable ke MinIO sampai 1 GB
status: in_progress
profile: strict
profile_pinned: true
goal: G-3
tags:
  - security
depends_on:
  - T-003
created: "2026-10-11T14:45:08Z"
updated: "2026-10-12T01:11:53Z"
created_by: claude-code
workers:
  - claude-code
branch: worktree-t-001-scaffold
base: b330d22fa74f6e7377ffca485c5f0b1c0fad330e
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
Risk level: HIGH (jalur masuk file tak tepercaya sampai 1 GB, presigned URL ke storage, kuota/DoS).
Impact surface: prisma DatasetVersion (+uploadedById, fingerprint, uploadId, partSize, partCount, completingAt; migrasi version_upload), src/features/uploads/* (service, http, client, parts, sniff), Route Handler /api/uploads, /api/uploads/[id]/parts|complete, DELETE /api/uploads/[id], src/lib/storage/multipart.ts, src/lib/storage/objects.ts (abort multipart saat hapus dataset), src/lib/queue/* (BullMQ ingest + cancel), src/worker/index.ts (job terjadwal), halaman /datasets/[id] (panel unggah), docker-compose Redis noeviction (ADR-0004), env USER_STORAGE_QUOTA_BYTES.
Security (STRIDE): Spoofing/CSRF — Route Handler mewajibkan Origin = APP_URL + cookie SameSite=Lax + requireUser Node-side. Elevation/IDOR — semua kueri versi di-scope {uploadedById, dataset.ownerId}; id orang lain → 404. Tampering — Content-Length signed header di presigned UploadPart (storage menolak ukuran lain, dibuktikan check-presign), ListParts memverifikasi nomor + ukuran persis setiap part, HeadObject = ukuran terdeklarasi, signature 64 KB (xlsx ZIP, csv teks tanpa NUL/UTF-16), ContentType ditetapkan server; tidak ada presigned GET untuk raw/. DoS — batas 1 GB, 2 unggahan berjalan/user, kuota storage per user (termasuk ukuran terdeklarasi UPLOADING), rate limit init 60/jam dan sign 600/jam per user, body JSON ≤ 8 KB, batch sign ≤ 16. Repudiation — log terstruktur versionId/datasetId per langkah. Information disclosure — pesan error tanpa detail storage; nama file dibersihkan dari karakter kontrol/bidi.
Compatibility: label UPLOADED kini "Menunggu diproses"; Server Action konvensi D2 tetap, Route Handler memakai HTTP status + {code}. Endpoint unggah = Route Handler karena Server Action dieksekusi berurutan per halaman dan tidak memberi progres.
Failure modes/edge cases: dua complete bersamaan → klaim completingAt (BUSY); batal saat complete → ditolak; dataset dihapus saat unggah → multipart di-abort + objek hasil complete dibuang; Redis mati saat enqueue → versi tetap UPLOADED (T-006 menyapu); multipart hilang → FAILED/UPLOAD_FAILED; unggahan > 24 jam → FAILED (lazy saat init + job maintenance per jam); part hilang saat complete → INCOMPLETE + daftar part, klien mengunggah ulang.
Rollback: revert commit + migrasi (kolom nullable baru, aman di-drop); Redis policy kembali lewat compose.
Validation: unit (parts, sniff, validasi init, Origin, cabang completeUpload); e2e 9 skenario (200 MB + ETag -13 + job, FILE_TOO_LARGE, part 20 MiB, exe→xlsx, resume + user lain 404, DATASET_BUSY, signed Content-Length + ContentType, LIMIT_REACHED + QUOTA_EXCEEDED, hapus dataset abort multipart + batal); scripts/check-presign.mjs; audit desain frontend-expert.
Open risks/assumptions: kuota diimplementasikan di sini (T-024 tinggal uji performa); validasi struktur xlsx penuh di worker (T-006); proxy produksi harus meneruskan Content-Length (T-023).

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
