---
id: T-7377
title: 'Lihat data: PageDown memindah fokus ke kolom nomor baris (e2e data-view-a11y AC2 gagal di main)'
status: in_review
profile: standard
tags:
  - data-view
  - a11y
created: "2026-11-10T02:55:37Z"
updated: "2026-11-13T13:56:51Z"
created_by: claude-code
workers:
  - claude-code
branch: claude/cool-babbage-t5yojt
base: 9416e4766524bc5368bfebc1adf0e40e339a1732
review:
  passes:
    - "n": 1
      by: claude-reviewer-subagent
      at: "2026-11-13T13:52:58Z"
      findings: 0
evidence:
  check:
    cmd: npm run check
    exit_code: 1
    duration_ms: 62652
    summary: |-
      > data-dashboard@1.21.7 check
      > npm run lint && npm run typecheck && npm run test && npm run audit


      > data-dashboard@1.21.7 lint
      > eslint . && prettier --check .

      Checking formatting...
      [warn] src/components/grid/sheet-grid.tsx
      [warn] Code style issues found in the above file. Run Prettier with --write to fix.
    at: "2026-11-13T13:56:51Z"
    tree: a0f813ff665e07f16734e11a8ed39aaded7499abf1cfbb4af59e4a2a291a658b
  check_failures: 2
---

## Objective
Uji e2e data-view-a11y AC2 gagal konsisten di main (ditemukan saat suite penuh v1.14, juga gagal tanpa perubahan v1.14 — uji banding tanpa tombol Cari): setelah Home lalu ArrowRight (fokus c1), PageDown memindah fokus ke kolom nomor baris (n), bukan tetap di c1. Terakhir tercatat lulus 2026-10-23 (T-tzxt). Cari commit penyebab (git bisect pada proyek data-view-a11y) dan perbaiki navigasi keyboard grid.

## Acceptance criteria
- [x] Given sel c1 terfokus di Lihat data, when PageDown/PageUp ditekan, then fokus tetap di kolom c1 dan baris berpindah satu halaman; e2e data-view-a11y lulus
- [x] Given sel di Lihat data, when Esc menutup dialog saring lalu F2 ditekan, then panel Isi sel terbuka untuk sel yang sama (e2e data-view-a11y AC3 lulus)

## Risk
Impact: navigasi keyboard grid Lihat data (Home/End, pengembalian fokus setelah dialog saring). Security: N/A (UI). Rollback: versi sebelumnya. Validation: e2e data-view-a11y 2× lulus + proyek data-view lain.

## Notes
- 2026-11-10T05:32:06Z v1.15 (2026-11-10): AC3 juga gagal — F2 setelah Esc dari dialog saring tidak membuka panel Isi sel (data-view-a11y.spec.ts:298); uji banding di 7809c7d (v1.14) gagal sama → bukan regresi v1.15. AC1 dijalankan terpisah.
- 2026-11-13T13:52:12Z Akar masalah AC2: Home/End memfokus sel lewat dua requestAnimationFrame → tombol berikutnya berangkat dari sel lama. Kini fokus langsung bila sel sudah dirender. AC3: uji menekan F2 sebelum dialog tertutup; disamakan dengan AC2 (tunggu tertutup) + fokus kembali ke sel menurut baris/kolom bila sel asal dirender ulang.
- 2026-11-13T13:52:59Z Review: 0 blocking. Low: fokus kembali menurut nomor baris (bukan rekaman) bila data berubah saat dialog terbuka; focus() tanpa preventScroll; selektor sel ditulis 3×.
