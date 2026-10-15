---
id: T-034
title: Spike penyimpanan segmen per periode dan tetapkan ADR model data periode
status: todo
profile: standard
goal: G-6
tags:
  - architecture
  - adr
  - perf
  - spike
depends_on:
  - T-024
  - T-016
  - T-017
  - T-018
  - T-020
  - T-021
  - T-022
  - T-023
  - T-028
  - T-029
  - T-030
  - T-031
  - T-032
  - T-033
created: "2026-10-15T02:30:54Z"
updated: "2026-10-15T15:16:21Z"
created_by: claude-code
---

## Objective
Bagian rencana docs/ai/plans/2026-10-15-tampilan-excel-dan-data-periode.md — P-1, Fase 0. Perkiraan 3–4 hari. Baca bagian rencana yang relevan (§3 Lihat data, §4 periode, §5 batas, §6 risiko) sebelum mulai; cek ulang kontrak T-016 (otorisasi) dan T-017 (ekspor) sesuai risiko R21.

## Acceptance criteria
- [ ] Given 24 segmen typed × 400 rb baris dan satu file gabungan 9,6 jt baris (fixture T-024, profil T-023), when group-by, tabel berhalaman, count, dan filter-values dijalankan lewat read_parquet([daftar]), then hasil identik dan p95 ≤ 1,1× file tunggal, tercatat di docs/ai/perf/<task>.md
- [ ] Given pemetaan posisi global → (segmen, file_row_number), when jendela 200 baris diminta di 100 posisi acak, then p95 ≤ 50 ms dan baris benar
- [ ] Given daftar path sebagai parameter di @duckdb/node-api dengan sandbox aktif, serta campuran segmen legacy (_row INTEGER) dan segmen baru (_row BIGINT, kolom tambahan diproyeksikan NULL AS c<pos>), when di-query, then tanpa error dan hasil benar
- [ ] Given hasil spike, then ADR (aitk adr new) berstatus accepted memuat opsi A–F, tabel biaya ops per unggahan, keputusan, dan kriteria fallback; flow-kerja A4, D4 (diamandemen), D15, dan D16 diperbarui; T-015 ditutup sebagai digantikan lewat aitk dengan rujukan ke task baru

## Risk
(Required for strict profile. Impact:, Security (STRIDE):, Rollback:, Validation:)

## Notes

- 2026-10-15T15:16:21Z T-015 sudah dibatalkan sebagai digantikan pada 2026-10-15 (memutus ketergantungan melingkar T-024 → T-015); bagian AC4 'T-015 ditutup sebagai digantikan' tinggal diverifikasi dengan aitk task show T-015.
