---
id: T-005
title: Worker ingest streaming xlsx/csv ke Parquet
status: todo
profile: standard
goal: G-3
depends_on:
  - T-004
created: "2026-10-11T10:22:45Z"
updated: "2026-10-11T10:22:45Z"
created_by: claude-code
---

## Objective
Job BullMQ: baca file dari MinIO secara streaming (ExcelJS stream reader / csv-parse), per sheet tulis Parquet (DuckDB COPY) dalam batch 50k baris. Inferensi tipe (angka, tanggal termasuk format dd/mm/yyyy, boolean, teks), deteksi baris header, lewati baris kosong. Status job dan progres per sheet tersimpan.

## Acceptance criteria
- [ ] Given file xlsx 1 GB dengan 3 sheet, when job ingest berjalan, then selesai < 15 menit dengan puncak RSS worker < 2 GB dan 3 file Parquet terbentuk
- [ ] Given sheet dengan header di baris ke-4 dan kolom campuran angka/teks, when ingest selesai, then header terdeteksi benar dan kolom campuran bertipe teks tanpa kehilangan baris
- [ ] Given file csv ber-encoding Windows-1252 dengan delimiter titik koma, when ingest, then delimiter dan encoding terdeteksi otomatis dan karakter aksen utuh
- [ ] Given file rusak di tengah, when ingest gagal, then status profil menjadi gagal dengan pesan baris/sheet penyebab dan file Parquet parsial dibersihkan

## Risk
(Required for strict profile. Impact:, Security (STRIDE):, Rollback:, Validation:)

## Notes
