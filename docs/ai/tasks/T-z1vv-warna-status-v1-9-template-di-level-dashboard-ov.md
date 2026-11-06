---
id: T-z1vv
title: 'Warna status v1.9: template di level dashboard (override per widget) + Tabel, Garis, Pai'
status: in_review
profile: standard
tags:
  - ui
created: "2026-11-06T22:53:38Z"
updated: "2026-11-06T23:41:09Z"
created_by: claude-code
workers:
  - claude-code
branch: claude/cool-babbage-t5yojt
base: 7d1d4e00cf553ff989f29b99c92729da24845843
review:
  passes:
    - "n": 1
      by: claude-reviewer-subagent
      at: "2026-11-06T23:34:24Z"
      findings: 8
    - "n": 2
      by: claude-reviewer-subagent
      at: "2026-11-06T23:41:09Z"
      findings: 4
---

## Objective
Template warna status melekat ke dashboard (tombol Warna dashboard; widget bawaan "Ikuti dashboard", bisa override per widget; widget terikat pivot tersimpan ikut dashboard), dan warna status tersedia di Garis (titik), Pai (irisan + swatch legenda), serta Tabel (per kolom angka) — layar dan PDF. Rilis v1.9.0 (migrasi Dashboard.colors).

## Acceptance criteria
- [ ] Given template diatur di dashboard, when widget tanpa template sendiri dirender (layar/PDF), then memakai template dashboard
- [ ] Given widget memilih template sendiri, when dirender, then template widget menang
- [ ] Given Garis/Pai dengan penilaian warna, when dirender, then titik/irisan berwarna status + legenda
- [ ] Given kolom angka tabel diberi penilaian warna, when dirender, then sel kolom itu berwarna status

## Risk
Impact: tampilan warna status semua widget dashboard (pivot, batang, garis, pai, Angka, tabel) di layar dan PDF; skema widget Tabel + tampilan tabel terikat bertambah field opsional; migrasi menambah kolom nullable Dashboard.colors. Security (STRIDE): Tampering/Elevation — PATCH /api/dashboards/[id]/colors lewat pembungkus mutation (sesi + CSRF/origin), updateMany dengan canEditWhere (pemilik/editor), id divalidasi bentuknya, body divalidasi colorsSchema strict (hex 6 digit, tanpa CSS bebas); Information disclosure — bukan pemilik/viewer: NOT_FOUND/FORBIDDEN seperti route dashboard lain. Rollback: image v1.8.x tanpa membatalkan migrasi (kolom diabaikan); widget Tabel berwarna/tabel terikat bertemplate sendiri tampil tidak valid sampai roll-forward (CHANGELOG Notes, runbook §18). Validation: vitest penuh, typecheck, lint, e2e status-colors (6 tes: garis/pai/tabel, sisir jenis, template dashboard layar+PDF, widget terikat), e2e widgets/chart-polish/pivot, review subagen.

## Notes

## Security checklist (OWASP ASVS 4.0.3)
<!-- Check each item when verified, or write "N/A: <reason>" after the text and check it. -->
- [x] V1 Architecture: trust boundaries and the components handling sensitive data are identified for this change — batas kepercayaan: route API → service (canEditWhere) → Prisma; data warna bukan data sensitif
- [x] V2 Authentication: credentials are verified server-side; no default, hard-coded, or weak secrets — N/A: tidak disentuh perubahan ini
- [x] V3 Session management: session tokens are random, protected, invalidated on logout and expiry — N/A: tidak disentuh perubahan ini
- [x] V4 Access control: every endpoint/action checks authorization server-side, deny by default (no IDOR) — updateMany where id + canEditWhere(userId); gagal → denied() membedakan NOT_FOUND/FORBIDDEN seperti route lain; diuji tests/features/dashboards/filter-columns.test.ts
- [x] V5 Validation, sanitization and encoding: all input validated; output encoded; no injection (SQL, OS, template) — colorsSchema zod strict (enum template, hex #RRGGBB), spec tabel strict + refine kolom ⊂ kolom tampil; warna dipakai sebagai nilai CSS variable/ECharts, bukan HTML
- [x] V6 Stored cryptography: sensitive data at rest uses approved algorithms; keys are not in the code — N/A: tidak disentuh perubahan ini
- [x] V7 Error handling and logging: errors reveal no internals; security events are logged without secrets — galat ke klien hanya kode + pesan umum ("Template warna tidak valid.")
- [x] V8 Data protection: personal/sensitive data is minimized, not cached or logged, and removable — N/A: tidak disentuh perubahan ini
- [x] V9 Communication: TLS for all external traffic; certificates validated — N/A: tidak disentuh perubahan ini
- [x] V10 Malicious code: no backdoors, time bombs, or unexplained network calls; dependencies are trusted — N/A: tidak disentuh perubahan ini
- [x] V11 Business logic: flows cannot be abused (limits, ordering, replay, race conditions) — simpan optimistis dengan rollback bila gagal; tidak ada batas/limit baru yang bisa disalahgunakan
- [x] V12 Files and resources: uploads are type/size limited and stored safely; no path traversal or SSRF — N/A: tidak disentuh perubahan ini
- [x] V13 API and web service: API inputs/outputs are schema-validated; CORS and rate limits are deliberate — input API divalidasi skema; mutation wrapper yang sama dengan route PATCH dashboard lain (rate limit/CSRF sama)
- [x] V14 Configuration: secure defaults, security headers, no debug in production, dependencies up to date — N/A: tidak disentuh perubahan ini
