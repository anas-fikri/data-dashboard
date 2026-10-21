---
id: T-075
title: Uji e2e dan performa pivot lanjutan, ekspor PDF, dan ponsel
status: todo
profile: standard
profile_pinned: true
goal: G-7
tags:
  - test
  - perf
depends_on:
  - T-074
created: "2026-10-21T10:24:16Z"
updated: "2026-10-21T10:24:16Z"
created_by: claude-code
---

## Objective
Bukti menyeluruh G-7: e2e jalur kritis (pemilik membuat pivot tersimpan dengan field terhitung + Tampilkan nilai sebagai + Top N, mengikat 4 jenis widget, berbagi ke viewer, ekspor), dan perf di profil produksi. Rencana G-7 §7 fase 5.

## Acceptance criteria
- [ ] Given e2e Playwright (project baru pivot-lanjutan), when pemilik membuat pivot tersimpan 3 level × 5 nilai (2 terhitung, 1 pct_col, Top 5 + Lainnya), mengikat pivot, bar, KPI, tabel, mengubah sumber, lalu viewer membuka dashboard bersama, then keempat widget berubah serempak, viewer melihat nilai benar dan tidak bisa membuka definisi, dan suite penuh hijau sekali sebelum close
- [ ] Given npm run perf skenario pivot pada fixture 10 jt baris (profil T-023, cache hangat), then laporan docs/ai/perf/T-075.md mencatat p95 pivot 4 level × 8 nilai + Top N + field terhitung, dashboard 6 widget terikat satu sumber, dan perbandingan dengan baseline T-009/T-011; target p95 pivot ≤ 3 s dan tidak ada widget lain kena QUERY_TIMEOUT
- [ ] Given ekspor PDF dashboard berisi pivot terbesar yang diizinkan, then PDF selesai ≤ batas EXPORT_TIMEOUT dengan catatan potongan; given CSV/XLSX pivot 4 level, then nilai identik dengan tampilan (uji pembanding)
- [ ] Given viewport 360 px dan 768 px, then e2e tangkapan layar pivot 4 level, editor field terhitung, dan daftar pivot tersimpan tanpa gulir horizontal halaman; axe-core tanpa pelanggaran serius

## Risk
(Required for strict profile. Impact:, Security (STRIDE):, Rollback:, Validation:)

## Notes
