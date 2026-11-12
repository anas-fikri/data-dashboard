---
id: T-1216
title: 'v1.19.1: sheet lanjutan tanpa judul kolom (ekspor Excel terpecah) dikenali dan digabung; Gabungkan tercentang bawaan un…'
status: in_progress
profile: standard
created: "2026-11-12T05:34:25Z"
updated: "2026-11-12T05:34:27Z"
created_by: claude-code
workers:
  - claude-code
branch: claude/cool-babbage-t5yojt
base: 9cfda543cd373a88fefeae946d34dccfea97a7eb
---

## Objective
(describe the outcome in one paragraph)

## Acceptance criteria
- [ ] Sheet tanpa baris judul (jumlah kolom sama, baris pertama bukan judul, jenis nilai per kolom cocok dengan data sheet sebelumnya) dikenali sebagai lanjutan: memakai judul sheet sebelumnya, semua barisnya data, digabung (mode biasa dengan Gabungkan, dan mode periode)
- [ ] Gabungkan sheet tercentang bawaan untuk dataset baru dan data aktif yang hasil gabungan
- [ ] Sheet berbeda tidak ikut tergabung (uji negatif); uji unit + integrasi + e2e; panduan

## Risk
(Required for strict profile. Impact:, Security (STRIDE):, Rollback:, Validation:)

## Notes

- 2026-11-12T05:34:27Z Kasus pemilik 2026-11-12: Billing os invoice … os invoice(5), sheet (2)–(5) tanpa judul (judul terbaca sebagai data). headerRow 0 = semua baris data (_row > 0).
