---
id: T-013
title: 'Versi dataset: ganti data, aktivasi, rollback, retensi'
status: todo
profile: strict
profile_pinned: true
goal: G-5
tags:
  - security
depends_on:
  - T-008
  - T-011
created: "2026-10-11T14:45:09Z"
updated: "2026-10-12T07:59:19Z"
created_by: claude-code
---

## Objective
Mode REPLACE. Ingest versi refresh men-cast raw dengan skema aktif per nama asli tanpa inferensi (D4); cocok → READY + aktif. Rollback: pemilik mengaktifkan salah satu dari 2 versi READY sebelumnya. Retensi 3 versi READY; job pembersihan menghapus metadata + Parquet versi lebih lama dan file asli > 7 hari sejak ingestFinishedAt. Jalur AWAITING_MAPPING di T-014.

## Acceptance criteria
- [ ] Given file baru dengan kolom sama (nama asli cocok setelah normalisasi spasi/kapital), when ingest REPLACE selesai, then versi baru aktif dan semua widget menampilkan data baru tanpa konfigurasi ulang; tipe yang dipaksa user di skema aktif tetap berlaku
- [ ] Given ingest versi baru gagal, when user membuka dashboard, then data versi aktif lama tampil dan badge gagal terlihat di profil
- [ ] Given 3 versi READY, when versi ke-4 READY, then versi tertua dihapus beserta Parquet-nya; when pemilik memilih rollback ke versi sebelumnya, then activeVersionId berpindah dan cache miss
- [ ] Given file asli berumur > 7 hari sejak ingestFinishedAt (sukses atau gagal), when job pembersihan berjalan, then file asli terhapus dan dashboard tetap berfungsi
- [ ] Given halaman/komponen task ini selesai, when /frontend-expert:audit dijalankan (anti-slop-design, responsive 320/768/1024/1440, accessibility), then tidak ada temuan Critical/High dan blok Conventions check (Tokens: preset project; Icons: waiver @tabler/icons-react; States loading/empty/error; Responsive; A11y) dicatat sebagai note task

## Risk
(Required for strict profile. Impact:, Security (STRIDE):, Rollback:, Validation:)

## Notes
- 2026-10-11T14:49:25Z UI wajib lewat rantai frontend-expert: design-foundations → tokens (preset dari T-025) → (+forms/data-fetching/app-shell sesuai kebutuhan) → components → anti-slop-code → responsive → motion ringan → anti-slop-design → polish → accessibility. Skip design-direction karena arah sudah dipilih di T-025, kecuali layar baru yang ambigu. Chart via skill dataviz; filter/select pakai Select kustom dari T-025, bukan native.
- 2026-10-11T14:56:59Z Aktivasi/rollback hanya pemilik; job pembersihan menghapus prefix dengan '/' penutup; retensi raw 7 hari dan typed lama via job (MinIO lifecycle granularitas hari).
- 2026-10-11T23:58:30Z Dari review T-003: job pembersihan StorageCleanup wajib memvalidasi bentuk prefix (raw|parquet)/<cuid>/ sebelum menghapus, menaikkan attempts, dan menghapus baris setelah sukses.
- 2026-10-12T07:59:19Z Dari T-007: saat ini setiap versi yang selesai ingest diinferensi tipenya lalu langsung READY + aktif (finish di src/features/ingest/repo.ts). Jalur refresh T-013 harus menggantinya dengan cast memakai skema aktif per nama asli (tanpa inferensi), dan memperbarui kriteria macet bila menambah tahap.

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
