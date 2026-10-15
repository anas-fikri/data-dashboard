---
id: T-052
title: 'Proses unggahan periode: cast hanya baris baru, pecah per periode, susun rencana, aktifkan dengan aman'
status: todo
profile: strict
profile_pinned: true
goal: G-6
tags:
  - ingest
  - data-integrity
  - api
depends_on:
  - T-051
  - T-039
created: "2026-10-15T02:30:57Z"
updated: "2026-10-15T02:30:57Z"
created_by: claude-code
---

## Objective
Bagian rencana docs/ai/plans/2026-10-15-tampilan-excel-dan-data-periode.md — P-20, Fase 3. Perkiraan 5–6 hari. Baca bagian rencana yang relevan (§3 Lihat data, §4 periode, §5 batas, §6 risiko) sebelum mulai; cek ulang kontrak T-016 (otorisasi) dan T-017 (ekspor) sesuai risiko R21.

## Acceptance criteria
- [ ] Given dataset periode bulanan berisi Jan–Mar dan file April (mode kolom), when ingest selesai, then hanya file baru yang di-parse dan di-cast (durasi ≤ 1,2× unggahan file yang sama ke dataset kosong), rencana berbunyi 'April 2026 ditambahkan (n baris)', versi aktif otomatis, dan tidak ada objek baru untuk Jan–Mar
- [ ] Given 500 baris baru dengan 20 tanggal gagal cast di atas basis 100.000 baris valid, then vonis cast dihitung atas 500 baris baru (4% > 2%) sehingga hasilnya AWAITING_MAPPING
- [ ] Given file arsip 12 bulan, then file dipecah menjadi satu segmen per periode dalam satu pass, dan periode dengan baris < 10% periode terbesar di file ditandai 'kemungkinan nyasar' sehingga rencana masuk AWAITING_CONFIRM
- [ ] Given mode label, then penolakan karena batas terjadi setelah parse (sebelum typing); given mode kolom, then penolakan terjadi setelah query hitung per periode (sebelum writeTyped penuh)
- [ ] Given versi aktif atau schemaRevision berubah antara rencana dan konfirmasi, then PLAN_STALE, rencana dihitung ulang, dan konfirmasi diminta ulang bila ada yang merusak; aktivasi meneruskan sheetMap dan melewati verifyVersionIntegrity
- [ ] Given file yang sama dipilih ulang dengan mode/label berbeda, then resume tidak melanjutkan versi lama, dan InitOk menggemakan mode efektif

## Risk
(Required for strict profile. Impact:, Security (STRIDE):, Rollback:, Validation:)

## Notes
