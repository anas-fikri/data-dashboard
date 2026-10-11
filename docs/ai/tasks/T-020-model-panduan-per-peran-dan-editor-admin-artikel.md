---
id: T-020
title: Model panduan per peran dan editor admin (artikel markdown)
status: todo
profile: strict
profile_pinned: true
goal: G-4
tags:
  - security
depends_on:
  - T-019
created: "2026-10-11T14:45:09Z"
updated: "2026-10-11T14:57:02Z"
created_by: claude-code
---

## Objective
GuideArticle {role: owner|editor|viewer|admin|all, contextKey?: upload|schema|builder, title, slug, bodyMarkdown, order, status: draft|published}. /admin/panduan: buat, edit dengan pratinjau tersanitasi, urutkan, terbitkan. Hanya isAdmin.

## Acceptance criteria
- [ ] Given admin, when membuat artikel role viewer dengan contextKey schema dan menerbitkannya, then artikel tersimpan published dan muncul di query artikel untuk role viewer
- [ ] Given markdown berisi tag <script>, when pratinjau/render, then tag dihapus dan tidak dieksekusi
- [ ] Given user non-admin, when membuka /admin/panduan atau memanggil Server Action-nya, then 404 / code NOT_FOUND
- [ ] Given dua artikel urutan 1 dan 2, when admin menukar urutan, then urutan baru tersimpan dan hanya artikel published tampil di /panduan
- [ ] Given halaman/komponen task ini selesai, when /frontend-expert:audit dijalankan (anti-slop-design, responsive 320/768/1024/1440, accessibility), then tidak ada temuan Critical/High dan blok Conventions check (Tokens: preset project; Icons: waiver @tabler/icons-react; States loading/empty/error; Responsive; A11y) dicatat sebagai note task
- [ ] Given markdown berisi href javascript:, data:, <iframe>, <object>, <form>, <style>, atau <img src=https://evil.example>, when dirender, then semuanya dihapus; tautan eksternal mendapat rel='noopener noreferrer'; img hanya dari self/storage.<domain>

## Risk
(Required for strict profile. Impact:, Security (STRIDE):, Rollback:, Validation:)

## Notes
- 2026-10-11T14:49:25Z UI wajib lewat rantai frontend-expert: design-foundations → tokens (preset dari T-025) → (+forms/data-fetching/app-shell sesuai kebutuhan) → components → anti-slop-code → responsive → motion ringan → anti-slop-design → polish → accessibility. Skip design-direction karena arah sudah dipilih di T-025, kecuali layar baru yang ambigu. Chart via skill dataviz; filter/select pakai Select kustom dari T-025, bukan native.
- 2026-10-11T14:57:00Z rehype-sanitize schema allowlist; skema URL hanya http/https/mailto/relatif; sanitasi setelah render.

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
