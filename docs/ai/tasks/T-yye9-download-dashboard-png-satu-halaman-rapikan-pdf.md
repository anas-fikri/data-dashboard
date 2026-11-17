---
id: T-yye9
title: 'Download dashboard: PNG satu halaman + rapikan PDF snapshot (tombol mudah ditemukan, filter aktif tertulis)'
status: todo
profile: standard
created: "2026-11-17T07:28:07Z"
updated: "2026-11-17T07:47:06Z"
created_by: claude-code
---

## Objective
Tombol kepala halaman menjadi 'Unduh dashboard' dengan pilihan PDF (A4 lanskap), Gambar (PNG satu halaman penuh) dan Halaman (HTML), semuanya snapshot sesuai filter aktif; teks status/galat menyebut format yang dipilih.

## Acceptance criteria
- [ ] Panel 'Unduh dashboard' berisi PDF, Gambar (PNG), Halaman (HTML)
- [ ] PNG halaman penuh (fullPage, skala 2) sesuai filter aktif
- [ ] Pengumuman/galat menyebut format (PDF/Gambar/Halaman HTML)

## Risk
Impact: panel unduh kepala dashboard. Security (STRIDE): jalur sama dengan PDF (auth, batas laju, akses dicek ulang saat render). Rollback: image sebelumnya. Validation: uji unit pdf-export-ui, export-model.

## Notes
