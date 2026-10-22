---
id: T-zm9k
title: Dashboard awal otomatis dari skema dataset
status: in_review
profile: standard
tags:
  - ui
created: "2026-10-22T03:20:01Z"
updated: "2026-10-22T11:43:20Z"
created_by: claude-code
workers:
  - claude-code
branch: claude/intelligent-albattani-fd1va8
base: 09e9b98154342f3d671ecec0ffead272d341a1a4
review:
  passes:
    - "n": 1
      by: claude-reviewer-subagent
      at: "2026-10-22T11:39:35Z"
      findings: 5
    - "n": 2
      by: claude-reviewer-subagent
      at: "2026-10-22T11:42:01Z"
      findings: 1
    - "n": 3
      by: claude-reviewer-subagent
      at: "2026-10-22T11:43:00Z"
      findings: 0
---

## Objective
Kotak centang "Mulai dengan dashboard contoh" di form buat dashboard menyusun widget awal di server dari skema versi aktif: KPI total besaran + jumlah baris, garis per tanggal, batang per kategori (2–50 nilai), tabel data, serta kolom filter tanggal + kategori — memakai isian bawaan pintar T-12zs dan judul otomatis, divalidasi checkConfig/checkFilterColumns, ditulis dalam transaksi pembuatan dashboard. Dataset tanpa angka/tanggal mendapat KPI jumlah baris + tabel; tanpa data siap → dashboard kosong.

## Acceptance criteria
- [x] Buat dashboard dengan pilihan Mulai dengan dashboard contoh pada dataset bertanggal+angka+kategori menghasilkan >= 4 widget berisi data dan >= 2 kolom filter tanpa langkah tambahan
- [x] Dataset tanpa kolom angka/tanggal tetap berhasil (KPI jumlah baris + tabel)
- [x] Panduan susun dashboard diperbarui

## Risk
Impact: createDashboard (pemilik saja) menulis widget + layout + filterColumns saat dicentang; tanpa centang perilaku lama. Security (STRIDE): skema dibaca hanya untuk dataset milik user (getDatasetSources/findFirst ownerId), sheet divalidasi terhadap versi aktif dataset itu. Race aktivasi versi: versi dibaca sebelum skema + FOR SHARE di transaksi (review pass 2–3). Rollback: revert commit; dashboard contoh yang sudah dibuat tetap dashboard biasa. Validation: unit starter.test, e2e filters T-zm9k, review 3 putaran (5 → 1 → 0).

## Notes
