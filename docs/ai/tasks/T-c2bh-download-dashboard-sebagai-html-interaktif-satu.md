---
id: T-c2bh
title: Download dashboard sebagai HTML interaktif (satu file, offline, angka sesuai filter aktif)
status: todo
profile: standard
created: "2026-11-17T07:29:13Z"
updated: "2026-11-17T08:23:56Z"
created_by: claude-code
review:
  passes:
    - "n": 1
      by: claude-reviewer-subagent
      at: "2026-11-17T08:09:18Z"
      findings: 5
    - "n": 2
      by: claude-reviewer-subagent
      at: "2026-11-17T08:18:49Z"
      findings: 0
---

## Objective
Unduh dashboard sebagai satu file HTML mandiri: snapshot DOM halaman cetak dengan CSS di-inline, tanpa skrip (grafik SVG statis), bisa dibuka offline tanpa login. Keputusan: snapshot statis, bukan HTML interaktif (interaktif butuh membundel data + pustaka grafik — risiko kebocoran data/ukuran besar).

## Acceptance criteria
- [x] Format html menghasilkan satu file berawalan <!doctype html> dengan CSS inline
- [x] Tanpa script/handler/URL javascript: di file hasil
- [x] Diunduh sebagai lampiran, angka sesuai filter aktif

## Risk
Impact: renderer + jalur ekspor. Security (STRIDE): file HTML dibersihkan dari script/iframe/object/embed/link/base, atribut on* dan URL javascript:; diunduh sebagai attachment (Content-Disposition), bukan disajikan inline di origin app. Rollback: image sebelumnya. Validation: uji looksLike, renderer body, cek Chromium lokal (script hilang, CSS inline).

## Notes

- 2026-11-17T08:23:47Z Keputusan: HTML snapshot statis (bukan interaktif) — data mentah tidak ikut file.

## Security checklist (OWASP ASVS 4.0.3)
<!-- Check each item when verified, or write "N/A: <reason>" after the text and check it. -->
- [x] V1 Architecture: trust boundaries and the components handling sensitive data are identified for this change — jalur render tetap: browser→API→antrean→renderer (token sekali pakai, tanpa URL); file HTML dibuka di luar origin app
- [x] V2 Authentication: credentials are verified server-side; no default, hard-coded, or weak secrets — N/A: tidak ada perubahan autentikasi
- [x] V3 Session management: session tokens are random, protected, invalidated on logout and expiry — token/sesi render sekali pakai 60 dtk tidak berubah (widgetId ikut klaim)
- [x] V4 Access control: every endpoint/action checks authorization server-side, deny by default (no IDOR) — createPdfExport cek akses dashboard + widgetId milik dashboard; sesi render cek ulang peran sekarang
- [x] V5 Validation, sanitization and encoding: all input validated; output encoded; no injection (SQL, OS, template) — zod: format enum, widgetId cuid, widgetId hanya png; HTML snapshot disanitasi (script/handler/URL non-#/data:image, CSS url/escape)
- [x] V6 Stored cryptography: sensitive data at rest uses approved algorithms; keys are not in the code — N/A: tidak ada data rahasia tersimpan baru
- [x] V7 Error handling and logging: errors reveal no internals; security events are logged without secrets — galat renderer berkode tetap tanpa detail internal; audit dashboard.export / dashboard.widget.export
- [x] V8 Data protection: personal/sensitive data is minimized, not cached or logged, and removable — HTML hanya snapshot tampilan (tanpa data mentah); file kedaluwarsa + dihapus cleanup seperti PDF
- [x] V9 Communication: TLS for all external traffic; certificates validated — N/A: lalu lintas internal sama dengan PDF
- [x] V10 Malicious code: no backdoors, time bombs, or unexplained network calls; dependencies are trusted — next 16.4.5 (perbaikan advisori); tanpa panggilan jaringan baru
- [x] V11 Business logic: flows cannot be abused (limits, ordering, replay, race conditions) — batas laju + satu ekspor berjalan per sasaran sama dengan PDF; token sekali pakai (tanpa replay)
- [x] V12 Files and resources: uploads are type/size limited and stored safely; no path traversal or SSRF — N/A: tidak ada unggahan; kunci S3 exports/<user>/<id>.<ext> dari regex tetap; renderer tidak menerima URL (tanpa SSRF)
- [x] V13 API and web service: API inputs/outputs are schema-validated; CORS and rate limits are deliberate — body POST tervalidasi zod strict; body renderer {token, format?} strict
- [x] V14 Configuration: secure defaults, security headers, no debug in production, dependencies up to date — next dinaikkan ke 16.4.5; aitk audit hijau
