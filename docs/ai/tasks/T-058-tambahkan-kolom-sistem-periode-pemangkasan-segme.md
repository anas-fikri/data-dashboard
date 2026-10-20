---
id: T-058
title: Tambahkan kolom sistem 'Periode', pemangkasan segmen, dan pemilih periode
status: todo
profile: standard
goal: G-6
tags:
  - query
  - ui
  - security
depends_on:
  - T-052
  - T-044
created: "2026-10-15T02:30:58Z"
updated: "2026-10-15T02:30:58Z"
created_by: claude-code
---

## Objective
Bagian rencana docs/ai/plans/2026-10-15-tampilan-excel-dan-data-periode.md — P-26, Fase 3. Perkiraan 2–3 hari. Baca bagian rencana yang relevan (§3 Lihat data, §4 periode, §5 batas, §6 risiko) sebelum mulai; cek ulang kontrak T-016 (otorisasi) dan T-017 (ekspor) sesuai risiko R21.

## Acceptance criteria
- [ ] Given dataset periode (termasuk mode label tanpa kolom tanggal), when membuat widget, then dimensi/filter 'Periode' tersedia, terurut kronologis, berlabel seperti 'Mar 2026', dan tampil sebagai 'Periode (sistem)' bila namanya bentrok
- [ ] Given filter tanggal pada kolom periode atau filter 'Periode', when widget di-query, then hanya segmen yang min/max-nya beririsan yang disewa, dan hasilnya identik dengan query tanpa pemangkasan (teruji)
- [ ] Given sheet periode, then urutan default widget tabel dan grid = (_period, _row); viewer hanya bisa memakai filter Periode bila dipasang pemilik (D6); preset 'Periode terbaru' tersedia
- [ ] Given Lihat data, then pemilih 'Periode: Semua ▾' membatasi grid, dan totalnya sama dengan metadata periode

## Risk
(Required for strict profile. Impact:, Security (STRIDE):, Rollback:, Validation:)

## Notes
- Dari T-054: pada sheet bersumber LABEL, Segment.minDate/maxDate berisi rentang kolom tanggal acuan
  (labelReferenceColumn), bukan rentang periode. Pemangkasan untuk filter Periode/tanggal kolom periode
  harus memakai periodStart/periodKey untuk segmen berlabel; minDate/maxDate hanya sah untuk filter pada
  kolom acuan itu sendiri.

- Dari review T-049 (L3): proyeksi skema campuran di query/source.ts membuang _period — filter _period gagal pada sheet bersegmen campuran.
