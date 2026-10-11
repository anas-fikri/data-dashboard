---
id: T-021
title: 'Video panduan: upload, validasi, poster dari browser, streaming'
status: todo
profile: strict
profile_pinned: true
goal: G-4
tags:
  - security
depends_on:
  - T-020
  - T-004
created: "2026-10-11T14:45:09Z"
updated: "2026-10-11T14:57:02Z"
created_by: claude-code
---

## Objective
GuideVideo {articleId, title, objectKey, posterKey, durationSec}. Upload multipart B2 untuk mp4/webm ≤ 500 MB; signature dengan offset (mp4 ftyp byte 4–8, webm 1A45DFA3). Durasi dan poster diambil di browser (loadedmetadata + canvas → PNG) lalu diunggah (D12). Pemutar <video> via presigned 1 jam dengan Range.

## Acceptance criteria
- [ ] Given admin memilih mp4 valid, when upload selesai, then durasi tersimpan, poster PNG ada di MinIO, dan video tampil di pratinjau
- [ ] Given file .mkv diganti ekstensi .mp4 atau video > 500 MB, when upload, then ditolak sebelum tersimpan dengan code INVALID_FORMAT / FILE_TOO_LARGE
- [ ] Given user menekan putar dan melompat ke menit ke-5, when video berlanjut, then permintaan ke MinIO menjawab 206 Partial Content tanpa unduh penuh
- [ ] Given halaman/komponen task ini selesai, when /frontend-expert:audit dijalankan (anti-slop-design, responsive 320/768/1024/1440, accessibility), then tidak ada temuan Critical/High dan blok Conventions check (Tokens: preset project; Icons: waiver @tabler/icons-react; States loading/empty/error; Responsive; A11y) dicatat sebagai note task
- [ ] Given poster PNG dari browser, when diunggah, then lewat Route Handler yang memeriksa signature PNG 8 byte dan ukuran ≤ 2 MB, ContentType ditetapkan server; given file bukan PNG, then INVALID_FORMAT

## Risk
(Required for strict profile. Impact:, Security (STRIDE):, Rollback:, Validation:)

## Notes
- 2026-10-11T14:49:26Z UI wajib lewat rantai frontend-expert: design-foundations → tokens (preset dari T-025) → (+forms/data-fetching/app-shell sesuai kebutuhan) → components → anti-slop-code → responsive → motion ringan → anti-slop-design → polish → accessibility. Skip design-direction karena arah sudah dipilih di T-025, kecuali layar baru yang ambigu. Chart via skill dataviz; filter/select pakai Select kustom dari T-025, bukan native.
- 2026-10-11T14:57:00Z ContentType video ditetapkan server saat createMultipartUpload (video/mp4|webm), bukan dari klien.

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
