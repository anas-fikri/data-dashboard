---
id: T-010
title: 'Kanvas dashboard builder: grid, drag/resize, autosave layout'
status: in_progress
profile: standard
goal: G-4
depends_on:
  - T-003
created: "2026-10-11T14:45:08Z"
updated: "2026-10-12T13:56:16Z"
created_by: claude-code
workers:
  - claude-code
branch: worktree-t-001-scaffold
base: 13b3d0b81229d28544cf5d428adf24673f64cb5e
---

## Objective
Model Dashboard {datasetId, name, layout JSON} dan Widget {dashboardId, type, spec JSON, position}. Grid 12 kolom (react-grid-layout), drag/resize, mode edit vs lihat, undo satu langkah, autosave. Maks 10 dashboard per dataset. UI via plugin frontend-expert.

## Acceptance criteria
- [ ] Given dashboard baru, when user menambah widget kosong lalu menggeser dan mengubah ukurannya, then posisi dan ukuran identik setelah halaman dimuat ulang
- [ ] Given mode lihat, when user mencoba drag widget, then widget tidak bergerak dan panel konfigurasi tidak ada
- [ ] Given lebar layar < 768 px, when membuka dashboard, then widget tersusun satu kolom tanpa scroll horizontal
- [ ] Given dataset sudah punya 10 dashboard, when membuat yang ke-11, then ditolak code LIMIT_REACHED
- [ ] Given halaman/komponen task ini selesai, when /frontend-expert:audit dijalankan (anti-slop-design, responsive 320/768/1024/1440, accessibility), then tidak ada temuan Critical/High dan blok Conventions check (Tokens: preset project; Icons: waiver @tabler/icons-react; States loading/empty/error; Responsive; A11y) dicatat sebagai note task

## Risk
(Required for strict profile. Impact:, Security (STRIDE):, Rollback:, Validation:)

## Notes

- 2026-10-11T14:49:25Z UI wajib lewat rantai frontend-expert: design-foundations → tokens (preset dari T-025) → (+forms/data-fetching/app-shell sesuai kebutuhan) → components → anti-slop-code → responsive → motion ringan → anti-slop-design → polish → accessibility. Skip design-direction karena arah sudah dipilih di T-025, kecuali layar baru yang ambigu. Chart via skill dataviz; filter/select pakai Select kustom dari T-025, bukan native.

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
