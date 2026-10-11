# Project context

Data Dashboard: aplikasi web pengganti dashboard Excel untuk PCP Express. User (registrasi dibatasi domain email perusahaan) membuat profil dataset, upload file Excel/CSV sampai 1 GB, lalu merakit dashboard sendiri (widget, chart, filter) tanpa coding.

## Masalah yang diselesaikan
- Dashboard Excel berat, tidak kolaboratif, rawan rusak formula, dan file 100 MB+ sudah tidak bisa dibuka lancar.
- Setiap departemen punya format Excel berbeda (header di baris ke-N, sheet ganda, tipe campuran, tanggal format Indonesia). Aplikasi harus toleran terhadap karakteristik data yang beragam.

## Keputusan arsitektur kunci (lihat docs/adr)
- File 1 GB TIDAK pernah di-parse di browser atau dimuat utuh ke RAM server. Alur: chunked resumable upload → object storage (MinIO) → worker streaming parse (xlsx/csv) → Parquet per sheet → query via DuckDB.
- Query dashboard berbasis spesifikasi deklaratif (dimensi, ukuran, filter, agregasi), bukan SQL mentah dari user.
- Metadata (user, profil dataset, skema kolom, layout dashboard) di PostgreSQL via Prisma. Data tabular di Parquet, bukan di PostgreSQL.
- Deploy on-prem VM PCP Express via Docker Compose (app, worker, PostgreSQL, MinIO, Redis). Zero-capex.

## Stack
Next.js (App Router, TypeScript) · Tailwind · Prisma + PostgreSQL · MinIO (S3 API) · DuckDB (node binding) · BullMQ + Redis (job antrean ingest) · ECharts (chart) · @tabler/icons-react.

## Panduan penggunaan (wajib)
Halaman /panduan berisi artikel teks (markdown) dan video per role: pemilik dataset, editor, viewer, admin. Konten dikelola admin dari UI tanpa deploy ulang; video disimpan di MinIO dan diputar HTML5 (bukan embed eksternal, karena on-prem). Tombol bantuan kontekstual di halaman upload, skema, dan builder.

## Batasan
- Maks file 1 GB per upload; format .xlsx dan .csv (xls lama tidak didukung di v1).
- Registrasi hanya email dengan domain yang di-whitelist (konfigurasi env), verifikasi email wajib.
- Tiap sheet = raw.parquet (VARCHAR, dipertahankan) + typed.parquet (bertipe); koreksi/pemetaan menulis ulang typed dari raw, tanpa file asli. Acuan alur: docs/flow-kerja.md.
- Target ingest 1 GB: selesai < 15 menit, puncak RAM worker < 2 GB.
- Target query widget pada dataset 10 juta baris: p95 < 3 detik.
