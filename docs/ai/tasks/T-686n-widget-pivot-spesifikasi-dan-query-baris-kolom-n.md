---
id: T-686n
title: 'Widget pivot: spesifikasi dan query (baris, kolom, nilai, subtotal, total)'
status: in_review
profile: standard
created: "2026-10-19T08:26:17Z"
updated: "2026-10-19T09:34:03Z"
created_by: claude-code
workers:
  - claude-code
branch: worktree-t-001-scaffold
base: 3bb3baa5bada8f11f6acd698a0497d56871195e3
review:
  passes:
    - "n": 1
      by: claude-reviewer-subagent
      at: "2026-10-19T09:33:57Z"
      findings: 1
    - "n": 2
      by: claude-code
      at: "2026-10-19T09:34:03Z"
      findings: 0
---

## Objective
Dashboard bisa menampilkan widget seperti PivotTable Excel: 1–2 kolom baris, 0–1 kolom pemisah (mis. tanggal per bulan → satu kolom per periode di kiri kolom Total), dan 1–3 nilai, dihitung server dalam satu query DuckDB dengan subtotal kelompok pertama, total baris/kolom/keseluruhan atas semua data, batas tampil 200 baris × 40 kolom beserta jumlah yang tersembunyi, mengikuti filter dashboard dan pemetaan kolom versi data seperti widget lain.

## Acceptance criteria
- [ ] Given dataset siap dan widget pivot dengan 1–2 kolom baris, 0–1 kolom kolom, dan 1–3 nilai, when dashboard memuat widget, then server mengembalikan sel pivot beserta subtotal baris level pertama, total baris, total kolom, dan total keseluruhan yang sama dengan hasil agregasi langsung di data
- [ ] Given kolom pada bagian Kolom punya lebih dari 50 nilai unik atau baris melebihi batas, when pivot dimuat, then hanya nilai teratas yang tampil dan respons menyatakan berapa yang disembunyikan, tanpa query berat yang menggantung
- [ ] Given filter dashboard, filter silang, dan versi data baru, when pivot dimuat, then pivot mengikuti filter yang sama dengan widget lain dan kolom yang hilang ditandai seperti widget lain

## Risk
- Impact: jenis widget baru "pivot" (spec + query DuckDB satu permintaan: CTE + UNION ALL, batas tampil 200 baris × 40 kolom, total dihitung atas semua data). Widget lain tidak berubah; jalur query/cache/filter/remap yang sama diperluas dengan cabang pivot. Ekspor CSV/XLSX pivot ditolak eksplisit sampai T-9bc2 (tombol ekspor disembunyikan untuk pivot).
- Security (STRIDE): Tampering/injeksi — kolom spec divalidasi Zod (posisi kolom, agregasi dari daftar tetap, grain dari daftar tetap) dan diubah ke identifier lewat ident()/dimensionExpr yang sama dengan widget lain; tidak ada teks pengguna yang masuk SQL. Information disclosure — otorisasi widget/dashboard/peran sama dengan query widget lain (widgetResult), kunci cache memuat spec + bentuk + filter dashboard. DoS — batas baris/kolom lewat QUALIFY dan timeout query yang ada; bench 5 juta baris ≤ 430 ms.
- Rollback: revert commit; widget pivot yang sudah tersimpan akan ditolak parseWidgetConfig (tampil "belum berisi data") — tidak ada migrasi DB.
- Validation: tests/features/query/pivot.test.ts (DuckDB sungguhan: sel, subtotal, total kolom/baris/keseluruhan = agregasi langsung, batas 200×40 + jumlah tersembunyi, filter dashboard, kolom hilang), resolve-widget.test.ts, vitest penuh, e2e tests/e2e/pivot.spec.ts.

## Notes
