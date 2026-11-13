---
id: T-g8ht
title: 'v1.21 pembanding KPI: rasio ke ukuran lain (mis. diterima ÷ total) dan target angka tetap'
status: in_progress
profile: standard
created: "2026-11-13T01:38:46Z"
updated: "2026-11-13T01:38:54Z"
created_by: claude-code
workers:
  - claude-code
branch: claude/cool-babbage-t5yojt
base: 648ad69539b7c4ad5a2afe17e74e923cea112809
---

## Objective
(describe the outcome in one paragraph)

## Acceptance criteria
- [ ] Pembanding 'Ukuran lain': KPI menampilkan nilai ÷ ukuran kedua (sheet + filter sama) sebagai persen, mis. '95,1% dari Jumlah baris (5,0 jt)'
- [ ] Pembanding 'Target angka': persen pencapaian + selisih ▲/▼ terhadap target tetap, warna mengikuti penilaian (bawaan: lebih tinggi lebih baik)
- [ ] Pembanding periode tetap seperti sebelumnya; ukuran pembanding ikut remap kolom saat ganti data; PDF/ekspor konsisten
- [ ] Uji unit + e2e; panduan susun-dashboard + Yang baru

## Risk
(Required for strict profile. Impact:, Security (STRIDE):, Rollback:, Validation:)

## Notes

- 2026-11-13T01:38:54Z Permintaan pemilik 2026-11-13: pembanding selain periode, opsi 1 (rasio ke ukuran lain) + 2 (target angka).
