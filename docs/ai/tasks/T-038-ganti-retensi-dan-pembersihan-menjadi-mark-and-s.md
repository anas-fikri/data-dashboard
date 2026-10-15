---
id: T-038
title: Ganti retensi dan pembersihan menjadi mark-and-sweep segmen dengan gerbang integritas
status: todo
profile: strict
profile_pinned: true
goal: G-6
tags:
  - data-safety
  - storage
depends_on:
  - T-036
created: "2026-10-15T02:30:55Z"
updated: "2026-10-15T02:30:55Z"
created_by: claude-code
---

## Objective
Bagian rencana docs/ai/plans/2026-10-15-tampilan-excel-dan-data-periode.md — P-6, Fase 1. Perkiraan 3–4 hari. Baca bagian rencana yang relevan (§3 Lihat data, §4 periode, §5 batas, §6 risiko) sebelum mulai; cek ulang kontrak T-016 (otorisasi) dan T-017 (ekspor) sesuai risiko R21.

## Acceptance criteria
- [ ] Given segmen dirujuk versi hidup (aktif, READY tersimpan, non-terminal), when retensi dan cleanup berjalan, then objeknya tidak dihapus; segmen tak terujuk ≥ SEGMENT_GC_GRACE_HOURS dihapus beserta raw dan typed semua revisinya
- [ ] Given job invarian malam, when ada kunci terujuk yang hilang, then alert tercatat di log dan status admin
- [ ] Given verifyVersionIntegrity sebelum aktivasi menemukan selisih (jumlah baris ≠ metadata, _row ganda, atau kunci terujuk tidak ada), then versi FAILED dan versi aktif tidak berubah
- [ ] Given crash di tengah unggahan atau pemetaan, then objek yatim di seg/ dan direktori kerja mapping-* dibersihkan (regex deleteObject diperluas)
- [ ] Given test berulang retensi → cleanup → query → rollback, then tidak ada kunci terujuk yang hilang

## Risk
(Required for strict profile. Impact:, Security (STRIDE):, Rollback:, Validation:)

## Notes
