---
id: T-068
title: Bangun model field terhitung (pohon ekspresi) dan pembangun SQL aman
status: todo
profile: strict
profile_pinned: true
goal: G-7
tags:
  - security
  - query
depends_on:
  - T-067
created: "2026-10-21T10:24:07Z"
updated: "2026-10-21T10:24:07Z"
created_by: claude-code
---

## Objective
Field terhitung antar ukuran teragregasi disimpan sebagai pohon ekspresi JSON tervalidasi (ADR-0009), bukan teks SQL; dikompilasi server di atas measureExpr dengan pembagian aman. Dipakai pivot, grafik, KPI, dan (lewat pivot tersimpan) tabel. Rencana G-7 §3.2, §4.1.

## Acceptance criteria
- [ ] Given nilai {kind:'calc', label:'Margin', expr: div(sub(sum Pendapatan, sum Biaya), sum Pendapatan)} pada pivot Wilayah, when dimuat, then sel, subtotal, total baris/kolom, dan total keseluruhan = (Σpendapatan − Σbiaya)/Σpendapatan dari agregat masing-masing (bukan jumlah margin per baris), teruji terhadap fixture kecil dengan nilai yang dihitung manual
- [ ] Given pembagi 0 atau NULL di sel mana pun (mis. rata-rata per kiriman = sum(pendapatan)/count(kiriman) pada kelompok tanpa kiriman), then sel bernilai NULL (tampil '–'), tidak ada error DuckDB, tidak ada Infinity/NaN di JSON, dan sel lain tetap benar
- [ ] Given body/spec dengan teks SQL, operator di luar enum (add, sub, mul, div, neg), > 32 node, kedalaman > 6, > 8 agregat unik, konstanta tidak berhingga atau |x| > 1e15, agregat tidak cocok tipe kolom (sum teks), atau kolom tersembunyi, when disimpan/di-query, then ditolak zod/resolve dengan pesan Indonesia (400/INVALID), konstanta selalu di-bind parameter, identifier hanya c<pos> dari skema; test injeksi (nama kolom berisi kutip/;--) lolos
- [ ] Given field terhitung yang semua daunnya DECIMAL dan hanya +/− , then hasil DECIMAL(38,6) tanpa float; dengan ÷ atau × konstanta non-bulat, then DOUBLE; showAs T-067 berlaku pada field terhitung; urut value_* dan Top N memakai nilai terhitung
- [ ] Given remap versi (widgets/remap.ts, columnsOf) dan aktivasi/rollback, then kolom di dalam ekspresi ikut dipetakan; kolom yang hilang → MISSING_COLUMN dan pesan 'kolom tidak ada di data terbaru' per widget; checklist ASVS V5 (validasi input) dan review keamanan tercatat

## Risk
(Required for strict profile. Impact:, Security (STRIDE):, Rollback:, Validation:)

## Notes
