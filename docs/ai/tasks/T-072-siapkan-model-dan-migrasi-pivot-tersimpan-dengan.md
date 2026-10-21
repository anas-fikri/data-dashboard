---
id: T-072
title: Siapkan model dan migrasi pivot tersimpan dengan perlindungan hapus dan remap versi
status: todo
profile: strict
profile_pinned: true
goal: G-7
tags:
  - security
  - data-model
depends_on:
  - T-071
created: "2026-10-21T10:24:12Z"
updated: "2026-10-21T10:24:12Z"
created_by: claude-code
---

## Objective
Model SavedPivot tingkat dataset (ADR-0009): spec pivot tervalidasi (skema zod sama dengan widget pivot), revisi, CRUD Server Action pemilik dataset, perlindungan hapus IN_USE, remap pada aktivasi/rollback versi, AuditLog. Rencana G-7 §4.2, §5.

## Acceptance criteria
- [ ] Given migrasi Prisma baru, then tabel SavedPivot {id, datasetId (cascade), name, nameKey unik per dataset, spec, missingColumns, revision, createdById?, createdAt, updatedAt} dan Widget.savedPivotId opsional (FK NoAction) dibuat; prisma migrate deploy di DB berisi data 1.0.0 berhasil tanpa mengubah widget lama; rollback image prev + dump terdokumentasi di runbook
- [ ] Given pemilik dataset, when membuat/mengubah/mengganti nama pivot tersimpan lewat Server Action, then spec divalidasi terhadap skema sheet aktif, revision naik tiap simpan (CAS: revisi basi → CONFLICT, tidak menimpa), maks 50 per dataset (LIMIT_REACHED), AuditLog savedPivot.create/update/delete tercatat; non-pemilik (editor/viewer/orang lain) → NOT_FOUND
- [ ] Given pivot tersimpan dipakai 3 widget di 2 dashboard, when pemilik menghapusnya, then ditolak IN_USE dengan daftar dashboard; given tidak dipakai, then terhapus; given dataset dihapus, then dashboard, widget, dan pivot tersimpan terhapus dalam satu transaksi tanpa galat FK
- [ ] Given versi baru diaktifkan atau rollback dengan kolom berganti nama/hilang, then spec pivot tersimpan dipetakan dalam transaksi aktivasi yang sama dengan remap widget (sheet + kolom, termasuk kolom di field terhitung dan Saring); kolom tak ketemu → MISSING_COLUMN + missingColumns; versi yang hanya dipratinjau (AWAITING_CONFIRM) tidak mengubahnya
- [ ] Given checklist ASVS (V4 akses, V5 validasi, V7 log) dan aitk audit, then hijau; review keamanan fokus IDOR (savedPivotId lintas dataset/pemilik) tanpa temuan Critical/High

## Risk
(Required for strict profile. Impact:, Security (STRIDE):, Rollback:, Validation:)

## Notes
