---
id: T-017
title: Ekspor widget ke CSV dan XLSX
status: todo
profile: strict
profile_pinned: true
goal: G-4
tags:
  - security
depends_on:
  - T-016
created: "2026-10-11T14:45:09Z"
updated: "2026-10-11T14:57:01Z"
created_by: claude-code
---

## Objective
Job ekspor hasil widget dengan filter aktif (jalur query tanpa limit 10k, maks 1 juta baris) ke CSV dan XLSX, ditulis ke exports/<userId>/<jobId>.*, unduh via presigned 1 jam, lifecycle hapus 1 jam. Dijalankan di worker (job ringan, antrean terpisah dari ingest).

## Acceptance criteria
- [ ] Given widget tabel dengan filter aktif, when ekspor CSV, then file berisi persis baris terfilter dengan header nama tampil kolom
- [ ] Given hasil > 1 juta baris, when ekspor, then ditolak code EXPORT_TOO_LARGE dengan saran mempersempit filter
- [ ] Given ekspor XLSX selesai, when 61 menit berlalu, then tautan unduh tidak lagi valid dan objek terhapus
- [ ] Given halaman/komponen task ini selesai, when /frontend-expert:audit dijalankan (anti-slop-design, responsive 320/768/1024/1440, accessibility), then tidak ada temuan Critical/High dan blok Conventions check (Tokens: preset project; Icons: waiver @tabler/icons-react; States loading/empty/error; Responsive; A11y) dicatat sebagai note task
- [ ] Given sel atau nama kolom berawalan '=', '+', '-', '@', tab, atau CR, when ekspor CSV, then diawali tanda kutip tunggal; XLSX menulisnya sebagai string
- [ ] Given user B meminta GET /api/exports/<jobId>/download untuk job milik A, when dikirim, then 404; given pemilik, then 302 ke presigned 5 menit dengan response-content-disposition=attachment dan AuditLog ekspor tercatat

## Risk
(Required for strict profile. Impact:, Security (STRIDE):, Rollback:, Validation:)

## Notes
- 2026-10-11T14:49:25Z UI wajib lewat rantai frontend-expert: design-foundations → tokens (preset dari T-025) → (+forms/data-fetching/app-shell sesuai kebutuhan) → components → anti-slop-code → responsive → motion ringan → anti-slop-design → polish → accessibility. Skip design-direction karena arah sudah dipilih di T-025, kecuali layar baru yang ambigu. Chart via skill dataviz; filter/select pakai Select kustom dari T-025, bukan native.
- 2026-10-11T14:57:00Z Worker re-validasi filter terhadap allowedFilterColumns; streaming COPY … TO, bukan fetch 1 juta baris ke Node; pembersihan exports/ > 1 jam via job.

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
