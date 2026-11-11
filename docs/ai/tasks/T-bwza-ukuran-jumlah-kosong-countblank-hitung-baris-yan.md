---
id: T-bwza
title: 'Ukuran Jumlah kosong (COUNTBLANK): hitung baris yang kolomnya tidak terisi'
status: todo
profile: standard
created: "2026-11-11T06:12:26Z"
updated: "2026-11-11T06:12:37Z"
created_by: claude-code
---

## Objective
(describe the outcome in one paragraph)

## Acceptance criteria
- [ ] Nilai 'Jumlah kosong' (agg count_blank = COUNT(*) − COUNT(kolom)) di semua widget yang punya Nilai (Angka, Batang, Garis, Pai, Tabel ringkas, Pivot) + label panel/ekspor/PDF; bisa dijumlahkan (Total pivot, Lainnya pai, field terhitung)
- [ ] Kosong = sel kosong/hanya spasi (sudah NULL sejak ingest); kolom yang tidak ada di versi data (absent) tampil '(kosong)', bukan jumlah semua baris
- [ ] Pembanding KPI dan klik-tembus bekerja untuk Jumlah kosong; klik-tembus dari ukuran ini bisa membuka baris yang kolomnya kosong
- [ ] Panduan 06 + Yang baru; tanpa migrasi; rollback image ke versi tanpa count_blank dicatat di CHANGELOG/runbook

## Risk
(Required for strict profile. Impact:, Security (STRIDE):, Rollback:, Validation:)

## Notes

- 2026-11-11T06:12:37Z Permintaan pemilik 2026-11-11: pertimbangkan kebutuhan perhitungan baris yang kolomnya tidak terisi. Saat ini: Jumlah baris (COUNT *), Jumlah terisi (COUNTA), filter nilai '(kosong)' di slicer/Saring pivot, nullPct di skema. Belum ada COUNTBLANK langsung. Contoh kebutuhan logistik: resi belum POD (tanggal terima kosong), kiriman tanpa kurir, alamat tidak lengkap. Rencana v1.17.0 setelah v1.16.0 ditutup.
