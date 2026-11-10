---
id: T-d5ev
title: 'Klik-tembus grafik: klik kategori → tabel baris detail'
status: in_progress
profile: strict
profile_pinned: true
tags:
  - widgets
  - query
created: "2026-11-10T04:16:38Z"
updated: "2026-11-10T04:38:41Z"
created_by: claude-code
workers:
  - claude-code
branch: claude/cool-babbage-t5yojt
base: 9ee22e233657afaafd0993f8f54a202bc2ccc4a2
---

## Objective
Grafik Batang/Garis/Pai bisa diatur "Klik-tembus": klik kategori (atau Enter pada kategori di keyboard) membuka dialog tabel baris data kategori itu — kolom pilihan pemilik/editor, berhalaman, bisa diurutkan, mengikuti filter dashboard — dengan tombol "Saring dashboard dengan ini" bila filter silang aktif. Viewer hanya melihat kolom yang dipilih untuk widget itu (D6).

## Acceptance criteria
- [ ] Given grafik Batang/Garis/Pai dengan klik-tembus aktif (kolom detail dipilih), when user mengklik kategori, then dialog menampilkan baris data kategori itu saja (kolom detail, 100 per halaman, urut per kolom), mengikuti filter dashboard yang berlaku
- [ ] Given kategori tanggal ber-periode (mis. Per bulan) atau kategori (kosong), when diklik, then baris = rentang periode itu / nilai kosong; irisan 'Lainnya' tidak bisa diklik-tembus
- [ ] Given viewer dashboard, when membuka klik-tembus, then hanya kolom detail widget itu yang terbaca; permintaan dengan nilai yang tidak cocok tipe dimensi, widget tanpa klik-tembus, atau kolom detail tersembunyi ditolak
- [ ] Given filter silang aktif di widget, when user menekan 'Saring dashboard dengan ini' di dialog, then filter silang diterapkan seperti klik biasa; tanpa klik-tembus, klik tetap langsung menyaring

## Risk
Impact: spec grafik drill {columns} (spec.ts, remap.ts), body /api/query drill {value} (widget.ts widgetBodySchema, drillClause), resolveWidget (service.ts: rencana tabel + klausa kategori), checkConfig (kolom detail tersembunyi ditolak), UI drill-dialog.tsx, chart-widget.tsx, chart-table.tsx, DrillField di config-sections.tsx.
Security (STRIDE): Information disclosure/D6 — viewer hanya mengirim nilai kategori; kolom yang dibaca = drill.columns tersimpan (bagian columnsOf widget, dipilih pemilik/editor, petunjuk panel menyebut terbaca viewer); klausa dibangun server dari dimensi widget sendiri lewat crossFilterFor + columnClause (posisi, bukan nama kiriman klien), di-AND dengan filter dashboard yang tetap melewati disallowedFilter; widget terikat pivot tersimpan tidak bisa klik-tembus; Tampering/Injection — nilai divalidasi zod (teks ≤ 2000, angka finite) lalu dashFilterSchema + columnClause (parameter, identifier c<pos> dari program); nilai beda tipe / tanggal tidak sah → INVALID; cache — klausa kategori ikut kunci resultKey (dash), rencana tabel ≠ rencana grafik; DoS — tabel berhalaman 100 baris, query lewat rate limit RULES.query + antrean DuckDB terbatas per user.
Rollback: image v1.14.0 — grafik ber-drill tampil 'Pengaturan widget tidak valid' (skema strict) sampai roll-forward; data tetap; tanpa migrasi.
Validation: widget-query.test.ts (klik-tembus teks/bulan/(kosong)/filter/penolakan/kolom tersembunyi/urut), remap.test.ts, drill.test.ts, e2e kpi-drill (owner, ponsel + axe, viewer + penolakan API), suite e2e per proyek.

## Notes

## Security checklist (OWASP ASVS 4.0.3)
<!-- Check each item when verified, or write "N/A: <reason>" after the text and check it. -->
- [x] V1 Architecture: trust boundaries and the components handling sensitive data are identified for this change — Batas kepercayaan: klien hanya mengirim nilai kategori; spec/kolom dari DB widget; resolveWidget memegang aturan D6.
- [x] V2 Authentication: credentials are verified server-side; no default, hard-coded, or weak secrets — N/A: tidak disentuh perubahan ini
- [x] V3 Session management: session tokens are random, protected, invalidated on logout and expiry — N/A: tidak disentuh perubahan ini
- [x] V4 Access control: every endpoint/action checks authorization server-side, deny by default (no IDOR) — Akses widget lewat authorize widget yang sama dengan /api/query (dashboardAccess per permintaan); kolom terbaca hanya drill.columns widget itu; widget tanpa drill → INVALID; widget terikat ditolak.
- [x] V5 Validation, sanitization and encoding: all input validated; output encoded; no injection (SQL, OS, template) — Body strict zod (drill.value teks ≤ 2000/angka finite/boolean/null); dashFilterSchema + columnClause memvalidasi tipe/tanggal; SQL berparameter, identifier c<pos> dari program.
- [x] V6 Stored cryptography: sensitive data at rest uses approved algorithms; keys are not in the code — N/A: tidak disentuh perubahan ini
- [x] V7 Error handling and logging: errors reveal no internals; security events are logged without secrets — Galat INVALID/COLUMN_UNAVAILABLE memakai pesan yang sama dengan jalur widget (forRole: viewer tanpa nama kolom tersembunyi).
- [x] V8 Data protection: personal/sensitive data is minimized, not cached or logged, and removable — Kolom detail = data yang sudah boleh dilihat (kolom widget, D6) dan dipilih pemilik/editor dengan petunjuk eksplisit; hasil di-cache per kunci spec+filter seperti widget lain (tidak per user, sama dengan widget).
- [x] V9 Communication: TLS for all external traffic; certificates validated — N/A: tidak disentuh perubahan ini
- [x] V10 Malicious code: no backdoors, time bombs, or unexplained network calls; dependencies are trusted — N/A: tidak disentuh perubahan ini
- [x] V11 Business logic: flows cannot be abused (limits, ordering, replay, race conditions) — Klausa kategori dari dimensi widget sendiri (bukan filter kiriman klien) sehingga filter silang yang dimatikan tidak membuka kolom lain; urutan hanya kolom detail; halaman ≤ TABLE_PAGE_MAX.
- [x] V12 Files and resources: uploads are type/size limited and stored safely; no path traversal or SSRF — N/A: tidak disentuh perubahan ini
- [x] V13 API and web service: API inputs/outputs are schema-validated; CORS and rate limits are deliberate — /api/query tetap cek Origin (isSameOrigin) + rate limit RULES.query per user + batas body (readTextLimited) + antrean DuckDB per user; skema body strict menolak field lain.
- [x] V14 Configuration: secure defaults, security headers, no debug in production, dependencies up to date — N/A: tidak disentuh perubahan ini
