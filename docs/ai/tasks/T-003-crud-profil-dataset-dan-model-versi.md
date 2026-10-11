---
id: T-003
title: CRUD profil dataset dan model versi
status: todo
profile: strict
profile_pinned: true
goal: G-2
tags:
  - security
depends_on:
  - T-002
  - T-025
created: "2026-10-11T14:45:08Z"
updated: "2026-10-11T14:57:00Z"
created_by: claude-code
---

## Objective
Model Dataset {name, description, ownerId, activeVersionId?} dan DatasetVersion {status: UPLOADING|UPLOADED|INGESTING|AWAITING_MAPPING|READY|FAILED, mode: REPLACE|APPEND, sourceKey, etag, sha256?, errorMessage?, ingestFinishedAt?}. Label profil diturunkan (kosong/siap + badge versi terbaru), bukan kolom (B5). Daftar hanya milik user atau yang dibagikan. Hapus = konfirmasi dua langkah; memanggil hook storage.deleteDatasetObjects (diimplementasikan penuh di T-004) dan queue.cancelVersionJobs.

## Acceptance criteria
- [ ] Given user login, when membuat profil dataset dengan nama unik per pemilik, then profil muncul di daftar dengan label kosong
- [ ] Given profil milik user lain yang tidak dibagikan, when user membuka URL-nya langsung atau memanggil Server Action-nya, then halaman 404 / code NOT_FOUND dan tidak ada perubahan
- [ ] Given profil dengan versi READY aktif dan versi terbaru FAILED, when membuka daftar, then label siap dengan badge gagal beserta pesan
- [ ] Given profil dataset, when user menghapus dengan konfirmasi dua langkah, then profil, versi, dan dashboard terkait hilang dan hook penghapusan storage serta pembatalan job terpanggil (diverifikasi test)
- [ ] Given halaman/komponen task ini selesai, when /frontend-expert:audit dijalankan (anti-slop-design, responsive 320/768/1024/1440, accessibility), then tidak ada temuan Critical/High dan blok Conventions check (Tokens: preset project; Icons: waiver @tabler/icons-react; States loading/empty/error; Responsive; A11y) dicatat sebagai note task

## Risk
(Required for strict profile. Impact:, Security (STRIDE):, Rollback:, Validation:)

## Notes
- 2026-10-11T14:49:25Z UI wajib lewat rantai frontend-expert: design-foundations → tokens (preset dari T-025) → (+forms/data-fetching/app-shell sesuai kebutuhan) → components → anti-slop-code → responsive → motion ringan → anti-slop-design → polish → accessibility. Skip design-direction karena arah sudah dipilih di T-025, kecuali layar baru yang ambigu. Chart via skill dataviz; filter/select pakai Select kustom dari T-025, bukan native.
- 2026-10-11T14:56:59Z Hapus prefix storage selalu dengan '/' penutup (parquet/<datasetId>/) agar cuid berawalan sama tidak ikut terhapus. Batas 50 dataset per user (code LIMIT_REACHED).

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
