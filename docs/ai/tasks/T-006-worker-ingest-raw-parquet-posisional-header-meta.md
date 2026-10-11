---
id: T-006
title: 'Worker ingest: raw.parquet posisional, header metadata, idempoten'
status: todo
profile: standard
goal: G-3
depends_on:
  - T-004
  - T-005
created: "2026-10-11T14:45:08Z"
updated: "2026-10-11T14:45:08Z"
created_by: claude-code
---

## Objective
Alur B3 tahap raw. Proses worker/ terpisah, BullMQ concurrency 1, DuckDB memory_limit 1GB + temp_directory. Stream dari MinIO, SHA-256 sambil jalan. CSV: sniff 64 KB (encoding UTF-8/Windows-1252, delimiter, quote). xlsx: verifikasi ZIP/workbook, sheet satu per satu dengan parser ADR-0002, sel tanggal → ISO. Batch 50k → raw.parquet kolom posisional c1..cN VARCHAR + _row, semua baris. Tiap batch cek dataset masih ada. Setelah sheet: tebak headerRow (heuristik ≥ 60% sel teks unik non-kosong), nama kolom unik deterministik (kosong → kolom_<pos>, duplikat → _2), nama asli disimpan. Progres per sheet (baris diproses, total perkiraan) ditulis ke versi tiap ≤ 5 detik. Error → hapus semua objek Parquet versi, FAILED + pesan sheet/baris. Job diulang → hapus objek versi dulu (idempoten). Lib bersama src/lib/duckdb (koneksi, baca Parquet lokal/S3, interrupt) dibangun di sini.

## Acceptance criteria
- [ ] Given fixture xlsx 3 sheet dengan header di baris ke-4, header kosong dan duplikat, when ingest, then headerRow=4 tersimpan, kolom bernama unik deterministik dengan nama asli tersimpan, dan jumlah baris raw per sheet = baris data + baris di atas header
- [ ] Given fixture csv Windows-1252 delimiter titik koma, when ingest, then encoding dan delimiter terdeteksi dan karakter aksen utuh di raw.parquet
- [ ] Given job dibunuh di tengah lalu diulang BullMQ, when job kedua selesai, then objek Parquet versi identik dengan ingest tanpa gangguan dan tidak ada objek parsial tersisa
- [ ] Given dataset dihapus saat ingest berjalan, when batch berikutnya diproses, then worker berhenti dan objek versi dihapus
- [ ] Given file xlsx rusak di tengah, when ingest gagal, then versi FAILED dengan pesan sheet/baris dan tidak ada objek Parquet versi tersisa
- [ ] Given fixture xlsx 1 GB (perf), when ingest penuh, then selesai < 15 menit dengan puncak RSS < 2 GB; bukti di docs/ai/perf/T-006.md

## Risk
(Required for strict profile. Impact:, Security (STRIDE):, Rollback:, Validation:)

## Notes
