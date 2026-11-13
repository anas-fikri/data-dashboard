---
id: T-yg3z
title: 'v1.20 lanjutan: Perbarui berdasarkan kunci — baca kolom kunci saja (tanpa unduh typed penuh), urutan baris kronologis s…'
status: in_progress
profile: standard
created: "2026-11-12T07:02:22Z"
updated: "2026-11-13T03:08:33Z"
created_by: claude-code
workers:
  - claude-code
branch: claude/cool-babbage-t5yojt
base: 170b89311bfbe36b09367ff0c8266dd5cd1d3c8b
---

## Objective
(describe the outcome in one paragraph)

## Acceptance criteria

## Risk
(Required for strict profile. Impact:, Security (STRIDE):, Rollback:, Validation:)

## Notes

- 2026-11-12T07:02:34Z Dari review T-rbrb (2026-11-12): M5 unduh typed penuh semua segmen tiap Perbarui (baca kolom kunci via S3/httpfs atau berkas kunci per segmen); L2 urutan baris periode terbalik setelah pemadatan (alokasi rentang padat sebelum file); L6 kolom kunci tidak dibekukan di rencana (Terapkan setelah kunci diubah); L1 rencana awal (sebelum typing) memakai semantik Ganti; L2' penolakan PERIOD_OUT_OF_WINDOW untuk periode yang hanya kehilangan baris; L3 disk puncak Ganti (typed lokal ditahan sampai 5c); L7 Perbarui ditolak bila satu sheet data tanpa kunci; recast sheet satu segmen headerRow 0 (lihat T-zjwh); nama asal/uploader salinan padat hanya file pertama.
