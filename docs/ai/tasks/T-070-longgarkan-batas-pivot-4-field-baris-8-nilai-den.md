---
id: T-070
title: 'Longgarkan batas pivot: 4 field baris, 8 nilai, dengan anggaran sel'
status: todo
profile: standard
profile_pinned: true
goal: G-7
tags:
  - query
  - ui
depends_on:
  - T-068
created: "2026-10-21T10:24:09Z"
updated: "2026-10-21T10:24:09Z"
created_by: claude-code
---

## Objective
Pivot baris 1–4 (kini 2) dan nilai 1–8 (kini 3), subtotal per level, dengan anggaran sel agar hasil ≤ 5 MB, PDF, dan ponsel tetap aman. Rencana G-7 §3.4, §6.

## Acceptance criteria
- [ ] Given pivot 4 field baris × kolom pemisah × 8 nilai pada fixture, when dimuat, then baris bertingkat tampil dengan subtotal per level (sakelar 'Subtotal' per level), total dari seluruh data, dan hasil identik dengan kueri GROUP BY acuan untuk 1–4 level (uji properti/regresi pada spec 1–2 level lama)
- [ ] Given baris tampil × kolom tampil × nilai > PIVOT_CELLS_MAX (24.000), then kolom tampil dipangkas otomatis (minimal 1) dengan catatan 'Menampilkan N dari M kolom — kurangi nilai atau tambah Saring', ukuran JSON ≤ batas hasil 5 MB, dan total tetap mencakup semua kolom
- [ ] Given ekspor PDF dashboard dengan pivot 4 level × 8 nilai, then PrintPivot memotong kolom/baris yang muat per halaman dengan catatan 'terpotong' (fittingPivotRows/keepColumns) dan tidak ada teks bertumpuk; given CSV/XLSX, then semua level baris menjadi kolom terpisah
- [ ] Given lebar 360 px, then pivot bergulir di dalam kartu (bukan halaman), kolom label baris beku, level 3–4 diindentasi dengan label ringkas, dan panel konfigurasi tetap muat; /frontend-expert:audit tanpa Critical/High
- [ ] Given perf lokal (fixture 1 jt baris, 4 level × 8 nilai), then p95 kueri pivot dicatat di docs/ai/perf/T-070.md dan ≤ 2× pivot 2 level × 3 nilai yang sama; bila tidak, batas default diturunkan (mis. 6 nilai) dan dicatat

## Risk
(Required for strict profile. Impact:, Security (STRIDE):, Rollback:, Validation:)

## Notes
