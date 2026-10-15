---
id: T-039
title: Hitung kuota dari byte data yang benar-benar tersimpan
status: todo
profile: standard
goal: G-6
tags:
  - quota
  - security
  - migration
depends_on:
  - T-038
created: "2026-10-15T02:30:55Z"
updated: "2026-10-15T02:30:55Z"
created_by: claude-code
---

## Objective
Bagian rencana docs/ai/plans/2026-10-15-tampilan-excel-dan-data-periode.md — P-7, Fase 1. Perkiraan 2 hari. Baca bagian rencana yang relevan (§3 Lihat data, §4 periode, §5 batas, §6 risiko) sebelum mulai; cek ulang kontrak T-016 (otorisasi) dan T-017 (ekspor) sesuai risiko R21.

## Acceptance criteria
- [ ] Given pengguna dengan segmen hidup, file sumber yang belum dihapus, dan versi UPLOADING, when kuota dihitung, then pemakaian = byte segmen unik terujuk + byte sumber tersimpan + ukuran terdeklarasi UPLOADING, dengan setiap segmen dihitung sekali
- [ ] Given proyeksi melewati USER_STORAGE_QUOTA_BYTES, when init, then QUOTA_EXCEEDED 'terpakai X dari Y' sebelum byte pertama terunggah, sizeBytes tetap ukuran file, dan test multipart lama lolos
- [ ] Given migrasi makna kuota, then laporan pemakaian per pengguna tercetak, selama QUOTA_GRACE_DAYS pelanggaran hanya diberi peringatan, banner tampil di ≥ 80%, dan e2e kuota diperbarui

## Risk
(Required for strict profile. Impact:, Security (STRIDE):, Rollback:, Validation:)

## Notes
