---
id: T-041
title: Sediakan endpoint jendela baris sheet untuk pemilik dan editor
status: todo
profile: strict
profile_pinned: true
goal: G-6
tags:
  - api
  - security
  - perf
depends_on:
  - T-037
  - T-035
  - T-016
created: "2026-10-15T02:30:55Z"
updated: "2026-10-15T02:30:55Z"
created_by: claude-code
---

## Objective
Bagian rencana docs/ai/plans/2026-10-15-tampilan-excel-dan-data-periode.md — P-9, Fase 2. Perkiraan 3–4 hari. Baca bagian rencana yang relevan (§3 Lihat data, §4 periode, §5 batas, §6 risiko) sebelum mulai; cek ulang kontrak T-016 (otorisasi) dan T-017 (ekspor) sesuai risiko R21.

## Acceptance criteria
- [ ] Given pemilik/editor dan sheet aktif 10 jt baris, when POST /api/sheets/:sheetId/rows {versionId, rowStart 9.999.800, rowCount 200, cols ≤ 64} tanpa urut/saring, then 200 baris benar kembali (n, _row, cells, cut) dengan p95 server ≤ 300 ms lewat jendela file_row_number, dan hanya segmen yang beririsan yang disewa
- [ ] Given viewer, pengguna asing, posisi kolom tersembunyi, atau batas dilewati (rowCount > 500, cols > 64, sort > 3, filter > 20, cari > 100 karakter/10 kolom), then 403/400 tanpa nama kolom/sheet di body; identifier hanya c<pos>/_row/_period dan nilai selalu dikirim sebagai parameter
- [ ] Given versionId ≠ versi aktif, then 409 VERSION_CHANGED + activeVersionId, kecuali pemilik yang meminta versi AWAITING_CONFIRM miliknya
- [ ] Given urut ≤ 3 kolom dan filter, when jendela yang sama diminta dua kali, then barisnya identik (pemutus seri _row); GET …/cell mengembalikan isi penuh ≤ 32.767 karakter, nilai raw bila cast gagal, dan sumber (file, baris asli, periode)

## Risk
(Required for strict profile. Impact:, Security (STRIDE):, Rollback:, Validation:)

## Notes
