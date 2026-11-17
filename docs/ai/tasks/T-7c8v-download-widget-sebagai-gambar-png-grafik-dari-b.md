---
id: T-7c8v
title: 'Download widget sebagai gambar (PNG): grafik dari browser, Angka/Pivot lewat renderer; data (Excel/CSV) jadi pilihan ke…'
status: in_review
profile: standard
created: "2026-11-17T07:28:06Z"
updated: "2026-11-17T08:23:55Z"
created_by: claude-code
workers:
  - claude-code
branch: claude/cool-babbage-t5yojt
base: 944d17758473a09b02f652f71b50ffd61961764f
review:
  passes:
    - "n": 1
      by: claude-reviewer-subagent
      at: "2026-11-17T08:09:17Z"
      findings: 5
    - "n": 2
      by: claude-reviewer-subagent
      at: "2026-11-17T08:18:47Z"
      findings: 0
---

## Objective
Menu unduh di kartu widget menawarkan Gambar (PNG) sebagai pilihan pertama: tampilan widget (grafik/angka/pivot/tabel) dirender server lewat renderer yang sama dengan PDF, sesuai filter aktif kanvas; CSV/Excel tetap pilihan data. Backend: format ekspor PNG/HTML (migrasi enum), token render membawa widgetId, sesi render memuat hanya widget itu.

## Acceptance criteria
- [x] Menu ekspor widget: Gambar (PNG) pertama, lalu CSV, Excel (keyboard: fokus awal ke PNG)
- [x] PNG memakai filter yang diterapkan kanvas dan hanya memuat widget itu (sesi render 1 widget, widget hilang → 404)
- [x] Body ekspor render tervalidasi: format pdf/png/html, widgetId hanya untuk png
- [x] Isi jawaban renderer dicek per format (PNG magic, HTML doctype, PDF)

## Risk
Impact: menu ekspor semua widget; tabel Export + enum ExportFormat (migrasi ADD VALUE, maju saja). Security (STRIDE): widgetId divalidasi cuid + harus milik dashboard (cek akses getDashboard ulang saat render), token sekali pakai 60 dtk tidak berubah; renderer menerima format dari daftar tetap, tanpa URL. Rollback: kembali ke image sebelumnya; nilai enum baru tidak dipakai versi lama (baris PNG/HTML lama dibiarkan, kedaluwarsa normal). Validation: uji unit skema/looksLike/sesi render, e2e exports+pivot.

## Notes

- 2026-11-17T08:23:45Z e2e exports/pivot lulus; render PNG/HTML sungguhan belum diuji ujung-ke-ujung di VM (renderer menolak jalan sebagai root) — sanitasi HTML diuji di Chromium lokal.

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
