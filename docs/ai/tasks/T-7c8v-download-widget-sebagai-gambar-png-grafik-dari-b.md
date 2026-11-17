---
id: T-7c8v
title: 'Download widget sebagai gambar (PNG): grafik dari browser, Angka/Pivot lewat renderer; data (Excel/CSV) jadi pilihan ke…'
status: in_review
profile: standard
created: "2026-11-17T07:28:06Z"
updated: "2026-11-17T08:09:17Z"
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
---

## Objective
Menu unduh di kartu widget menawarkan Gambar (PNG) sebagai pilihan pertama: tampilan widget (grafik/angka/pivot/tabel) dirender server lewat renderer yang sama dengan PDF, sesuai filter aktif kanvas; CSV/Excel tetap pilihan data. Backend: format ekspor PNG/HTML (migrasi enum), token render membawa widgetId, sesi render memuat hanya widget itu.

## Acceptance criteria
- [ ] Menu ekspor widget: Gambar (PNG) pertama, lalu CSV, Excel (keyboard: fokus awal ke PNG)
- [ ] PNG memakai filter yang diterapkan kanvas dan hanya memuat widget itu (sesi render 1 widget, widget hilang → 404)
- [ ] Body ekspor render tervalidasi: format pdf/png/html, widgetId hanya untuk png
- [ ] Isi jawaban renderer dicek per format (PNG magic, HTML doctype, PDF)

## Risk
Impact: menu ekspor semua widget; tabel Export + enum ExportFormat (migrasi ADD VALUE, maju saja). Security (STRIDE): widgetId divalidasi cuid + harus milik dashboard (cek akses getDashboard ulang saat render), token sekali pakai 60 dtk tidak berubah; renderer menerima format dari daftar tetap, tanpa URL. Rollback: kembali ke image sebelumnya; nilai enum baru tidak dipakai versi lama (baris PNG/HTML lama dibiarkan, kedaluwarsa normal). Validation: uji unit skema/looksLike/sesi render, e2e exports+pivot.

## Notes
