---
id: T-048
title: Sesuaikan Lihat data untuk ponsel, keyboard, dan pembaca layar
status: todo
profile: standard
goal: G-6
tags:
  - ui
  - a11y
  - responsive
depends_on:
  - T-044
  - T-045
created: "2026-10-15T02:30:57Z"
updated: "2026-10-15T02:30:57Z"
created_by: claude-code
---

## Objective
Bagian rencana docs/ai/plans/2026-10-15-tampilan-excel-dan-data-periode.md — P-16, Fase 2. Perkiraan 1,5–2 hari. Baca bagian rencana yang relevan (§3 Lihat data, §4 periode, §5 batas, §6 risiko) sebelum mulai; cek ulang kontrak T-016 (otorisasi) dan T-017 (ekspor) sesuai risiko R21.

## Acceptance criteria
- [ ] Given lebar 360 px, then halaman tidak bergulir horizontal, hanya nomor baris yang beku, toolbar terlipat ke 'Lainnya', urut/saring di bottom sheet, ketuk sel membuka isi penuh, dan target sentuh ≥ 44 px
- [ ] Given hanya keyboard, then panah, Tab, PageUp/Down, Home/End, Ctrl+Home/End, Alt+↓, F2/Enter, Ctrl+F, dan Shift+Spasi berfungsi dengan fokus terlihat
- [ ] Given axe dan NVDA/VoiceOver, then role=grid, aria-rowcount = total + 1, aria-colcount, dan aria-rowindex nyata terpasang, status memuat diumumkan, axe tanpa pelanggaran serius, dan /frontend-expert:audit tanpa Critical/High

## Risk
(Required for strict profile. Impact:, Security (STRIDE):, Rollback:, Validation:)

## Notes
