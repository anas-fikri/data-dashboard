---
id: T-jdmk
title: 'T-bwza lanjutan: kolom bawaan Jumlah kosong jangan memilih kolom pembanding KPI'
status: todo
profile: standard
created: "2026-11-11T07:50:33Z"
updated: "2026-11-11T08:42:10Z"
created_by: claude-code
---

## Objective
(describe the outcome in one paragraph)

## Acceptance criteria

## Risk
(Required for strict profile. Impact:, Security (STRIDE):, Rollback:, Validation:)

## Notes
- 2026-11-11T07:50:45Z Low review r2 T-bwza (L-b): KPI Jumlah baris + pembanding pada 'Tgl terima', ganti ke Jumlah kosong → measureForChoice (widget-config-model.ts ±117, pilih nullPct > 0) bisa memilih 'Tgl terima' = kolom pembanding → widget langsung INVALID (panel memberi pesan). Lewati kolom pembanding KPI saat memilih otomatis. Juga: belum ada uji untuk kolom absent di daun field terhitung (probe review mengonfirmasi SQL).
- 2026-11-11T08:42:10Z Low review r3 T-bwza (L2): Nilai/Hitung/Ukuran kini 8 pilihan → SearchSelect; di layar sentuh kotak cari langsung fokus (keyboard ponsel terbuka untuk daftar pendek), beda dengan Select biasa yang sengaja tidak memfokus di pointer coarse (select.tsx ±150). Pilihan: samakan cek coarsePointer di search-select.tsx, atau naikkan SEARCH_MIN / kecualikan daftar ukuran.
