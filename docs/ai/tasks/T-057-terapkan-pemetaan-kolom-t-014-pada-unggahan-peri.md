---
id: T-057
title: Terapkan pemetaan kolom (T-014) pada unggahan periode
status: todo
profile: standard
goal: G-6
tags:
  - ingest
  - schema
  - ui
depends_on:
  - T-052
created: "2026-10-15T02:30:58Z"
updated: "2026-10-15T02:30:58Z"
created_by: claude-code
---

## Objective
Bagian rencana docs/ai/plans/2026-10-15-tampilan-excel-dan-data-periode.md — P-25, Fase 3. Perkiraan 3 hari. Baca bagian rencana yang relevan (§3 Lihat data, §4 periode, §5 batas, §6 risiko) sebelum mulai; cek ulang kontrak T-016 (otorisasi) dan T-017 (ekspor) sesuai risiko R21.

## Acceptance criteria
- [ ] Given file periode dengan 'Tgl Kirim' sementara kolom aktif bernama 'Tanggal Kirim', then hasilnya AWAITING_MAPPING; setelah dipetakan, hanya segmen baru yang di-cast dan periode lama tidak berubah
- [ ] Given 'Kosongkan', then nilainya NULL hanya untuk periode baru dan kolom tidak menjadi absent; kolom tambahan menjadi kolom tersembunyi baru dengan judul tersimpan, dan periode lama bernilai NULL tanpa cast ulang
- [ ] Given layar pemetaan pada dataset periode, then ubah tipe tidak ditawarkan dan ada arahan ke halaman Skema
- [ ] Given bulan berikutnya kembali memakai 'Tgl Kirim', then kolom terpetakan otomatis lewat alias tersimpan tanpa AWAITING_MAPPING

## Risk
(Required for strict profile. Impact:, Security (STRIDE):, Rollback:, Validation:)

## Notes

- Dari review T-049 (M1): job pemetaan (src/features/ingest/mapping.ts:240-253) menulis typed tanpa period dan typedFileProblems tidak memeriksa _period — WAJIB ditangani di task ini (versi periode AWAITING_MAPPING).
