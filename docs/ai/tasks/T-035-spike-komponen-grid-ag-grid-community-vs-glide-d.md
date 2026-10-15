---
id: T-035
title: 'Spike komponen grid: AG Grid Community vs Glide Data Grid di React 19/Next 16'
status: todo
profile: standard
goal: G-6
tags:
  - ui
  - spike
  - adr
depends_on:
  - T-016
  - T-017
  - T-018
  - T-020
  - T-021
  - T-022
  - T-023
  - T-024
  - T-028
  - T-029
  - T-030
  - T-031
  - T-032
  - T-033
created: "2026-10-15T02:30:54Z"
updated: "2026-10-15T02:30:54Z"
created_by: claude-code
---

## Objective
Bagian rencana docs/ai/plans/2026-10-15-tampilan-excel-dan-data-periode.md — P-2, Fase 0. Perkiraan 2–3 hari. Baca bagian rencana yang relevan (§3 Lihat data, §4 periode, §5 batas, §6 risiko) sebelum mulai; cek ulang kontrak T-016 (otorisasi) dan T-017 (ekspor) sesuai risiko R21.

## Acceptance criteria
- [ ] Given prototipe kedua grid dengan sumber data sintetis 10.000.000 baris, when digulir/diseret ke akhir di Chrome, Safari, dan Firefox, then baris terakhir tercapai dan 'Ke baris 9.999.999' tepat
- [ ] Given header CSP T-027 aktif, when grid dimuat, then nol pelanggaran CSP, chunk rute lazy ≤ 300 KB gzip, dan aturan lint menggagalkan impor ag-grid-enterprise
- [ ] Given checklist keyboard/ARIA (NVDA/VoiceOver), tema token terang/gelap, ikon Tabler, dan salin sel ke Excel, then hasil per kandidat tercatat dan ADR memilih satu komponen dengan versi dipin, syarat lisensi terkini, dan fallback (TanStack Virtual + paging blok)

## Risk
(Required for strict profile. Impact:, Security (STRIDE):, Rollback:, Validation:)

## Notes
