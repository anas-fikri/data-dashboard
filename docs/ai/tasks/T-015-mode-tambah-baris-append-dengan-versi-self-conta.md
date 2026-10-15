---
id: T-015
title: Mode tambah baris (append) dengan versi self-contained
status: blocked
profile: standard
goal: G-5
depends_on:
  - T-014
created: "2026-10-11T14:45:09Z"
updated: "2026-10-15T02:31:08Z"
created_by: claude-code
workers:
  - claude-code
branch: worktree-t-001-scaffold
base: 94df0a4153bf645653471d49852b3eb78591ced8
---

## Objective
Mode APPEND: worker menulis raw versi baru = raw versi aktif ∪ raw file baru (satu COPY DuckDB, kolom dipetakan per nama asli, _row dilanjutkan), lalu cast dengan skema aktif seperti REPLACE; mismatch → AWAITING_MAPPING. Versi self-contained, menghapus versi lama aman.

## Acceptance criteria
- [ ] Given versi aktif 1.000 baris dan file baru 500 baris kolom sama, when APPEND selesai, then versi baru 1.500 baris dan aktif; versi lama tidak berubah
- [ ] Given versi aktif dihapus oleh retensi setelah 3 append berikutnya, when widget dibuka, then data lengkap karena versi aktif self-contained
- [ ] Given file baru APPEND dengan kolom beda nama, when ingest selesai, then AWAITING_MAPPING dan alur T-014 berlaku

## Risk
(Required for strict profile. Impact:, Security (STRIDE):, Rollback:, Validation:)

## Notes
- 2026-10-15T01:33:00Z Dari T-014 (review R5-1, Low): finish ingest biasa (repo.ts ~194) mengaktifkan versi tanpa sheetMap, jadi widget dipindah lewat matchSheet; pada rantai nama akar dipakai ulang (alias ganda) hasilnya null dan widget tertinggal SHEET_UNAVAILABLE padahal planSheets sudah tahu pasangan pastinya. Saat menyentuh jalur ingest (append), catat sheetMap[active.id] = sheetId di loop sheet ingest.ts dan teruskan ke repo.finish → activateVersionInTx({ sheetMap }).
- 2026-10-15T01:43:47Z Blocked: Ditahan atas arahan user (2026-10-15): perlakuan file berkolom sama beda periode (append vs versi baru, batas periode/ukuran/baris tanpa memotong periode) direncanakan ulang dulu bersama tampilan gaya Excel; T-015 digabung ke rencana itu dan dikerjakan setelah semua task lain selesai.
- 2026-10-15T02:31:08Z Digantikan rencana docs/ai/plans/2026-10-15-tampilan-excel-dan-data-periode.md (goal G-6): append baris diganti model periode (tambah periode baru, ganti periode yang ada utuh, batas per periode utuh). Bug sheetMap R5-1 dipisah ke T-033. T-034 (spike P-1) AC4 menutup task ini sebagai digantikan lewat aitk; peta kode lama tetap berguna untuk T-036/T-052.
