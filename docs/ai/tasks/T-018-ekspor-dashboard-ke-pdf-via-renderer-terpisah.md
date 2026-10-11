---
id: T-018
title: Ekspor dashboard ke PDF via renderer terpisah
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
Layanan renderer (Chromium/Playwright) terpisah dari app dan worker. App menerbitkan token render sekali pakai 60 detik terikat (dashboardId, userId, filter); renderer membuka /render/<token> yang hanya menerima token itu, mencetak A4 landscape, menyimpan ke exports/, presigned 1 jam.

## Acceptance criteria
- [ ] Given dashboard 6 widget dengan filter aktif, when ekspor PDF, then PDF memuat semua widget dengan nilai sama seperti layar
- [ ] Given token render sudah dipakai atau > 60 detik, when /render/<token> dibuka, then 404
- [ ] Given renderer mati, when user ekspor PDF, then user melihat code RENDERER_UNAVAILABLE dalam ≤ 10 detik, bukan hang
- [ ] Given halaman/komponen task ini selesai, when /frontend-expert:audit dijalankan (anti-slop-design, responsive 320/768/1024/1440, accessibility), then tidak ada temuan Critical/High dan blok Conventions check (Tokens: preset project; Icons: waiver @tabler/icons-react; States loading/empty/error; Responsive; A11y) dicatat sebagai note task
- [ ] Given permintaan ke renderer tanpa header RENDERER_SECRET yang benar, when dikirim, then ditolak; renderer hanya menerima {token} dan membuka APP_INTERNAL_URL/render/<token> sendiri (tidak menerima URL)
- [ ] Given halaman render mencoba memuat resource di luar origin app, when Chromium meminta, then diblokir oleh route allowlist; Chromium berjalan non-root dengan seccomp profile Playwright

## Risk
(Required for strict profile. Impact:, Security (STRIDE):, Rollback:, Validation:)

## Notes
- 2026-10-11T14:49:25Z UI wajib lewat rantai frontend-expert: design-foundations → tokens (preset dari T-025) → (+forms/data-fetching/app-shell sesuai kebutuhan) → components → anti-slop-code → responsive → motion ringan → anti-slop-design → polish → accessibility. Skip design-direction karena arah sudah dipilih di T-025, kecuali layar baru yang ambigu. Chart via skill dataviz; filter/select pakai Select kustom dari T-025, bukan native.
- 2026-10-11T14:57:00Z Token dipindah dari URL ke cookie render-scope pada respons pertama; path /render/* diredaksi dari access log proxy dan pino; renderer hanya di network frontend (tidak bisa mencapai minio/redis/postgres).

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
