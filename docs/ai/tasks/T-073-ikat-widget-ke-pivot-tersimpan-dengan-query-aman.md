---
id: T-073
title: Ikat widget ke pivot tersimpan dengan query aman D6 dan invalidasi cache
status: todo
profile: strict
profile_pinned: true
goal: G-7
tags:
  - security
  - query
depends_on:
  - T-072
created: "2026-10-21T10:24:14Z"
updated: "2026-10-21T10:24:14Z"
created_by: claude-code
---

## Objective
Widget pivot/bar/line/pie/KPI/tabel bisa memakai pivot tersimpan sebagai sumber: spec widget berisi tampilan saja, server menyusun spec efektif. Viewer tetap {widgetId, dashboardFilters} (D6); cache hasil dan sumber filter memuat revisi pivot tersimpan. Rencana G-7 §4.3, §5.

## Acceptance criteria
- [ ] Given widget pivot, bar, line, pie, KPI, dan tabel yang merujuk pivot tersimpan yang sama, when pemilik mengubah nilai/field terhitung di pivot tersimpan, then keenam widget menampilkan definisi baru pada muat berikutnya tanpa menunggu TTL (kunci cache hasil + filterSourcesFor memuat SavedPivot.revision), dan widget lain tidak berubah
- [ ] Given viewer dashboard bersama, when POST /api/query dengan {widgetId, dashboardFilters} untuk widget terikat, then hasil benar; given body memuat savedPivotId, spec, atau field lain, then 400 INVALID; given widgetId dari dashboard lain atau pivot tersimpan dataset lain, then 404 NOT_FOUND; endpoint definisi pivot tersimpan tidak bisa dipanggil viewer (NOT_FOUND)
- [ ] Given kolom cross-filter yang diizinkan dashboard, then diturunkan dari spec efektif (baris/kolom pivot tersimpan + tampilan widget, crossFilter === true) sehingga viewer tidak bisa memfilter kolom yang tidak tampil di widget mana pun; uji D6 regresi (tests/features/query) hijau
- [ ] Given pivot tersimpan berisi MISSING_COLUMN setelah aktivasi versi, then setiap widget terikat menampilkan pesan kolom hilang per widget (bukan error dashboard) dan ekspor/PDF widget itu melewatinya dengan catatan; given tampilan widget tidak cocok sumber (mis. grafik memilih nilai ke-6 yang sudah dihapus), then pesan 'Pilih ulang nilai di pengaturan widget'
- [ ] Given ekspor CSV/XLSX widget terikat dan PDF dashboard, then memakai spec efektif yang sama dengan tampilan (job ekspor membaca revisi saat job dibuat) dan AuditLog ekspor tetap tercatat; checklist ASVS V4 dan review keamanan tanpa Critical/High

## Risk
(Required for strict profile. Impact:, Security (STRIDE):, Rollback:, Validation:)

## Notes
