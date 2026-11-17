---
id: T-c2bh
title: Download dashboard sebagai HTML interaktif (satu file, offline, angka sesuai filter aktif)
status: todo
profile: standard
created: "2026-11-17T07:29:13Z"
updated: "2026-11-17T07:47:07Z"
created_by: claude-code
---

## Objective
Unduh dashboard sebagai satu file HTML mandiri: snapshot DOM halaman cetak dengan CSS di-inline, tanpa skrip (grafik SVG statis), bisa dibuka offline tanpa login. Keputusan: snapshot statis, bukan HTML interaktif (interaktif butuh membundel data + pustaka grafik — risiko kebocoran data/ukuran besar).

## Acceptance criteria
- [ ] Format html menghasilkan satu file berawalan <!doctype html> dengan CSS inline
- [ ] Tanpa script/handler/URL javascript: di file hasil
- [ ] Diunduh sebagai lampiran, angka sesuai filter aktif

## Risk
Impact: renderer + jalur ekspor. Security (STRIDE): file HTML dibersihkan dari script/iframe/object/embed/link/base, atribut on* dan URL javascript:; diunduh sebagai attachment (Content-Disposition), bukan disajikan inline di origin app. Rollback: image sebelumnya. Validation: uji looksLike, renderer body, cek Chromium lokal (script hilang, CSS inline).

## Notes
