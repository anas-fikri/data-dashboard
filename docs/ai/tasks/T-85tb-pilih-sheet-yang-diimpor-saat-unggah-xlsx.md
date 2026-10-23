---
id: T-85tb
title: Pilih sheet yang diimpor saat unggah xlsx
status: in_review
profile: standard
tags:
  - ui
created: "2026-10-23T11:22:17Z"
updated: "2026-10-23T15:57:48Z"
created_by: claude-code
workers:
  - claude-code
branch: claude/intelligent-albattani-fd1va8
base: 9c9b2f28c09b11e0d5f878e895a158ef3714a1c2
review:
  passes:
    - "n": 1
      by: claude-reviewer-subagent
      at: "2026-10-23T15:50:33Z"
      findings: 1
    - "n": 2
      by: claude-reviewer-subagent
      at: "2026-10-23T15:56:08Z"
      findings: 1
    - "n": 3
      by: claude-reviewer-subagent
      at: "2026-10-23T15:57:47Z"
      findings: 0
---

## Objective
Saat mengunggah xlsx berisi ≥ 2 worksheet (ganti semua data), pemilik memilih sheet yang diimpor sebelum file dikirim; sheet ringkasan/pivot/grafik tidak lagi ikut terimpor (contoh nyata: sheet "Pivot" menghasilkan kolom_1, kolom_3, …). Worker hanya membaca sheet terpilih; sheet data aktif yang tidak dipilih masuk alur pemetaan biasa (tidak pernah hilang diam-diam).

## Acceptance criteria
- [x] Setelah file xlsx diunggah, pemilik memilih sheet yang diimpor (centang per sheet + Pilih semua) dengan saran: pilih hanya sheet berisi data (bukan ringkasan/pivot/grafik)
- [x] Sheet yang tidak dipilih tidak di-ingest (hemat waktu dan kuota); versi pengganti tetap memetakan widget ke sheet yang dipilih
- [x] CSV tidak berubah (satu sheet)
- [x] CSV, mode per periode, dan antrean banyak file tidak berubah (pilihan kosong = semua sheet)

## Risk
Impact: panel unggah dataset (alur ganti data), init unggah, ingest xlsx (berurutan + paralel), skema (kolom aditif `DatasetVersion.selectedSheets TEXT[] DEFAULT '{}'`, tanpa backfill). Pilihan kosong = perilaku lama (semua sheet), jadi CSV, mode periode, antrean, dan unggahan lama tidak berubah. Bawaan centang = worksheet tampil tanpa PivotTable + sheet aktif yang cocok; sheet aktif yang dilepas → AWAITING_MAPPING (perilaku pemetaan yang ada).
Security (STRIDE): Tampering — nama sheet dari klien divalidasi server (array 1–50 nama unik ≤ 255 karakter, hanya xlsx + REPLACE) dan worker otoritatif: nama yang tidak ada di file → FAILED dengan pesan jelas; nama dipakai hanya sebagai pembanding (tanpa SQL/path). DoS — pembaca browser membatasi central directory 4 MB, XML 2 MB (dekompresi streaming dihentikan), 200 sheet; batas parser server (50 sheet/buku, dsb.) tetap. XML dibaca dengan regex tanpa entitas eksternal (DOCTYPE ditolak).
Rollback: kode lama mengabaikan kolom baru (unggahan berjalan dengan semua sheet); migrasi aditif tidak perlu di-rollback.
Validation: uji unit pembaca sheet (paritas nama dengan parser server, zip64, stored, prefix namespace, file rusak → null), aturan pilihan, validateInit, ingest berurutan/paralel (sheet tak dipilih tidak dibaca, indeks rapat, nama hilang → FAILED); e2e ingest (picker, galat kosong, pilih sebagian, ganti data → pemetaan); helper e2e mengonfirmasi pemilih otomatis di spec lama.

## Notes

- 2026-10-23T12:01:42Z Rencana: docs/ai/plans/2026-10-23-pilih-sheet-unggah.md (baca daftar sheet di browser, kolom selectedSheets, worker onlySheets, picker; mode periode di luar v1).

## Security checklist (OWASP ASVS 4.0.3)
<!-- Check each item when verified, or write "N/A: <reason>" after the text and check it. -->
- [x] V1 Architecture: trust boundaries and the components handling sensitive data are identified for this change — batas kepercayaan: daftar sheet dibaca di browser hanya untuk UX; server (validateInit) + worker (wantedSheets) otoritatif.
- [x] V2 Authentication: credentials are verified server-side; no default, hard-coded, or weak secrets — N/A: tidak menyentuh autentikasi.
- [x] V3 Session management: session tokens are random, protected, invalidated on logout and expiry — N/A: tidak menyentuh sesi.
- [x] V4 Access control: every endpoint/action checks authorization server-side, deny by default (no IDOR) — init unggah tetap memeriksa dataset milik pemilik (ownerId) sebelum pilihan disimpan; tidak ada endpoint baru.
- [x] V5 Validation, sanitization and encoding: all input validated; output encoded; no injection (SQL, OS, template) — sheets divalidasi server: array 1–50 string unik ≤ 255 karakter tanpa karakter kontrol, hanya xlsx + REPLACE; nama dipakai sebagai pembanding saja (Prisma parameter, tanpa SQL/OS/path); UI merender teks (React escape).
- [x] V6 Stored cryptography: sensitive data at rest uses approved algorithms; keys are not in the code — N/A: tidak ada data sensitif/kripto baru.
- [x] V7 Error handling and logging: errors reveal no internals; security events are logged without secrets — galat jelas berbahasa Indonesia tanpa detail internal (nama sheet tidak ada → FAILED; > 50 sheet → saran memilih sheet).
- [x] V8 Data protection: personal/sensitive data is minimized, not cached or logged, and removable — N/A: nama sheet bukan data pribadi; tidak dicatat di log.
- [x] V9 Communication: TLS for all external traffic; certificates validated — N/A: tanpa lalu lintas eksternal baru (pembacaan di browser lokal).
- [x] V10 Malicious code: no backdoors, time bombs, or unexplained network calls; dependencies are trusted — tanpa dependensi baru; pembaca zip murni (Blob + DecompressionStream bawaan).
- [x] V11 Business logic: flows cannot be abused (limits, ordering, replay, race conditions) — resume hanya untuk pilihan sheet yang sama (sameSheets); pembacaan async basi diabaikan (penghitung urutan); sheet aktif yang dilepas masuk pemetaan, tidak hilang diam-diam.
- [x] V12 Files and resources: uploads are type/size limited and stored safely; no path traversal or SSRF — batas parser tetap (ukuran, rasio, baris, kolom) + batas buku kerja 200 sheet; pembaca browser membatasi central directory 4 MB dan XML 2 MB (dekompresi dihentikan), DOCTYPE ditolak.
- [x] V13 API and web service: API inputs/outputs are schema-validated; CORS and rate limits are deliberate — route init meneruskan sheets ke validateInit (skema manual yang sama dengan isian lain); rate limit/Origin tidak berubah.
- [x] V14 Configuration: secure defaults, security headers, no debug in production, dependencies up to date — N/A: tanpa konfigurasi/header baru; migrasi aditif.
