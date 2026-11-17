---
id: T-4q8n
title: 'Kolom filter: cegah lost update antar pemilik/editor + rapikan batas editor'
status: in_progress
profile: standard
tags:
  - security
  - ui
created: "2026-10-22T10:45:53Z"
updated: "2026-11-17T10:35:39Z"
created_by: claude-code
workers:
  - claude-code
branch: claude/cool-babbage-t5yojt
base: 32e2388f3dcd86785e85f1f20adcf500381b4cd1
---

## Objective
Lanjutan review T-k2ec (temuan non-blokir). Simpan kolom filter memakai revisi/lock sehingga tab basi tidak menimpa perubahan orang lain, baca-tulis kolom tersembunyi dalam satu transaksi, penghitung editor ikut kolom tersembunyi, pemilik bisa menambah kolom saat ada kolom tidak tersedia, dan peringatan tumpang-tindih sheet untuk editor.

## Acceptance criteria
- [x] Simpan kolom filter dari daftar basi → CONFLICT/STALE dengan pesan muat ulang, bukan menimpa diam-diam (review T-k2ec #1)
- [x] Baca kolom tersimpan + tulis dalam satu transaksi lockDashboard (review T-k2ec #2)
- [ ] Penghitung/batas penuh editor menghitung kolom tersembunyi yang dipertahankan (review T-k2ec #3)
- [ ] Pemilik bisa menambah kolom walau ada kolom tersimpan tidak tersedia yang tidak diubah (review T-k2ec #4)
- [ ] Editor diberi tahu bila kolom filter yang ditambahkan menyaring lebih dari satu sheet (review T-k2ec #6)
- [ ] Pemilik bisa menyimpan filter bawaan walau ada kolom filter tidak tersedia (review T-vb7q #2)
- [ ] Cadangan PDF saat status filter belum diterbitkan memakai filter bawaan (review T-vb7q #3)
- [ ] Bawaan basi (tipe kolom diubah) ditandai di pengaturan sebelum terhapus saat simpan berikutnya (review T-vb7q pass 2 #1)

## Risk
Impact: simpan kolom filter (pemilik/editor) dan filter bawaan; cadangan filter ekspor PDF/PNG/HTML. Tanpa migrasi. Security (STRIDE): Tampering — simpan basi ditolak STALE (tanpa lost update); akses dibaca setelah kunci dashboard (tanpa TOCTOU); editor tetap tidak menerima nama kolom tak tersedia (hanya jumlahnya). Rollback: image sebelumnya; klien lama tanpa `expected` tetap diterima (tanpa cek basi). Validation: uji unit filter-columns/pdf-export-ui/multisheet, e2e sharing + filters + exports.

## Notes

- 2026-11-17T09:23:29Z AC1/AC2: expected + transaksi lockDashboard; unit + e2e sharing/filters lulus.

## Security checklist (OWASP ASVS 4.0.3)
<!-- Check each item when verified, or write "N/A: <reason>" after the text and check it. -->
- [x] V1 Architecture: trust boundaries and the components handling sensitive data are identified for this change — batas kepercayaan tetap: browser → PATCH /api/dashboards/[id]/filter-columns → transaksi Postgres
- [x] V2 Authentication: credentials are verified server-side; no default, hard-coded, or weak secrets — N/A: tidak ada perubahan autentikasi
- [x] V3 Session management: session tokens are random, protected, invalidated on logout and expiry — N/A: sesi tidak berubah
- [x] V4 Access control: every endpoint/action checks authorization server-side, deny by default (no IDOR) — canEditWhere dibaca setelah lockDashboard di transaksi yang sama; editor hanya menerima jumlah kolom tak tersedia, bukan namanya
- [x] V5 Validation, sanitization and encoding: all input validated; output encoded; no injection (SQL, OS, template) — `expected` diurai lewat storedFilterColumns (zod, entri rusak dibuang); daftar baru tetap lewat checkFilterColumns
- [x] V6 Stored cryptography: sensitive data at rest uses approved algorithms; keys are not in the code — N/A: tanpa data rahasia baru
- [x] V7 Error handling and logging: errors reveal no internals; security events are logged without secrets — STALE = 409 dengan pesan muat ulang, tanpa detail internal
- [x] V8 Data protection: personal/sensitive data is minimized, not cached or logged, and removable — N/A: hanya pengaturan dashboard
- [x] V9 Communication: TLS for all external traffic; certificates validated — N/A: tanpa lalu lintas baru
- [x] V10 Malicious code: no backdoors, time bombs, or unexplained network calls; dependencies are trusted — tanpa dependensi atau panggilan jaringan baru
- [x] V11 Business logic: flows cannot be abused (limits, ordering, replay, race conditions) — lost update dicegah (STALE + kunci dashboard); batas 8 kolom termasuk kolom tersembunyi
- [x] V12 Files and resources: uploads are type/size limited and stored safely; no path traversal or SSRF — N/A: tanpa file
- [x] V13 API and web service: API inputs/outputs are schema-validated; CORS and rate limits are deliberate — body PATCH divalidasi; `expected` opsional untuk klien lama
- [x] V14 Configuration: secure defaults, security headers, no debug in production, dependencies up to date — N/A: konfigurasi tidak berubah
