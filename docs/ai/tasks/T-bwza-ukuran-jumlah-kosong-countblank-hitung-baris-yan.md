---
id: T-bwza
title: 'Ukuran Jumlah kosong (COUNTBLANK): hitung baris yang kolomnya tidak terisi'
status: in_progress
profile: standard
created: "2026-11-11T06:12:26Z"
updated: "2026-11-11T07:26:44Z"
created_by: claude-code
workers:
  - claude-code
branch: claude/cool-babbage-t5yojt
base: 06f26ffd5a819da4a20a1e24ed13a263c5ec7dcb
---

## Objective
Nilai baru "Jumlah kosong" (agg `count_blank`, COUNTBLANK = COUNT(*) − COUNT(kolom)) agar pemilik bisa langsung
menghitung baris yang kolomnya belum terisi (resi belum POD, kiriman tanpa kurir, alamat tidak lengkap) di widget
Angka/Batang/Garis/Pai/Tabel ringkas/Pivot dan field terhitung, lengkap dengan pembanding KPI dan klik-tembus ke
baris yang kosong. Tanpa migrasi (v1.17.0).

## Acceptance criteria
- [x] Nilai 'Jumlah kosong' (agg count_blank = COUNT(*) − COUNT(kolom)) di semua widget yang punya Nilai (Angka, Batang, Garis, Pai, Tabel ringkas, Pivot) + label panel/ekspor/PDF; bisa dijumlahkan (Total pivot, Lainnya pai, field terhitung)
- [x] Kosong = sel kosong/hanya spasi (sudah NULL sejak ingest); kolom yang tidak ada di versi data (absent) tampil '(kosong)', bukan jumlah semua baris
- [x] Pembanding KPI dan klik-tembus bekerja untuk Jumlah kosong; klik-tembus dari ukuran ini bisa membuka baris yang kolomnya kosong
- [x] Panduan 06 + Yang baru; tanpa migrasi; rollback image ke versi tanpa count_blank dicatat di CHANGELOG/runbook

## Risk
Impact: daftar agregasi query (spec.ts AGGS/AGG_TYPES/label, sql.ts measureExpr + total pai), spec widget
(AGGS, PIE_AGGS), field terhitung (CALC_AGGS, aditif), panel (opsi Nilai), KPI/grafik (0 bila tidak ada baris),
klik-tembus (klausa kolom kosong). Spec lama tidak berubah arti.
Security (STRIDE): Tampering — agregasi divalidasi zod enum di spec widget dan spec query; tidak ada input bebas ke
SQL (ekspresi tetap, kolom lewat ident()). Info disclosure: klik-tembus tetap hanya kolom drill widget (D6).
Rollback: image ke v1.16.0 → widget ber-Jumlah kosong "Pengaturan widget tidak valid" sampai roll-forward.
Validation: vitest count-blank (KPI, pembanding, batang, pai + total, pivot + total + field terhitung, klik-tembus),
uji panel; e2e widgets T-bwza.

## Notes
- 2026-11-11T06:12:37Z Permintaan pemilik 2026-11-11: pertimbangkan kebutuhan perhitungan baris yang kolomnya tidak terisi. Saat ini: Jumlah baris (COUNT *), Jumlah terisi (COUNTA), filter nilai '(kosong)' di slicer/Saring pivot, nullPct di skema. Belum ada COUNTBLANK langsung. Contoh kebutuhan logistik: resi belum POD (tanggal terima kosong), kiriman tanpa kurir, alamat tidak lengkap. Rencana v1.17.0 setelah v1.16.0 ditutup.
- 2026-11-11T06:16:40Z Keputusan pemilik 2026-11-11: v1.16 dulu, Jumlah kosong di v1.17.
