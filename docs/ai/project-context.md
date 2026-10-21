# Project context

Data Dashboard: aplikasi web pengganti dashboard Excel untuk PCP Express. User (registrasi dibatasi domain email perusahaan) membuat profil dataset, upload file Excel/CSV sampai 1 GB, lalu merakit dashboard sendiri (widget, chart, filter) tanpa coding.

## Masalah yang diselesaikan
- Dashboard Excel berat, tidak kolaboratif, rawan rusak formula, dan file 100 MB+ sudah tidak bisa dibuka lancar.
- Setiap departemen punya format Excel berbeda (header di baris ke-N, sheet ganda, tipe campuran, tanggal format Indonesia). Aplikasi harus toleran terhadap karakteristik data yang beragam.

## Keputusan arsitektur kunci (lihat docs/adr)
- File 1 GB TIDAK pernah di-parse di browser atau dimuat utuh ke RAM server. Alur: chunked resumable upload → object storage (MinIO) → worker streaming parse (xlsx/csv) → Parquet per sheet → query via DuckDB.
- Query dashboard berbasis spesifikasi deklaratif (dimensi, ukuran, filter, agregasi), bukan SQL mentah dari user.
- Versi dataset = manifest segmen typed imutabel (ADR-0008, D4): data per periode (Bulan/Kuartal/Tahun) menambah periode baru dan mengganti periode yang ada secara utuh tanpa menulis ulang periode lain; hapus/pulihkan periode dan rollback hanya mengganti manifest; objek dihapus GC mark-and-sweep (D15).
- "Lihat data" (D16): penampil baca-saja gaya Excel untuk pemilik/editor lewat endpoint sheet sendiri (server mengurutkan/menyaring/memotong blok 200 baris, AG Grid Community dipin, ADR-0007); viewer hanya "Perbesar" widget tabel (kolom widget saja).
- Pivot lanjutan (G-7, ADR-0009, D17): "Tampilkan sebagai" dan field terhitung (pohon ekspresi tervalidasi atas agregat, tanpa SQL/rumus teks dari klien) dihitung DuckDB dari seluruh data yang lolos filter; pivot ≤ 4 tingkat baris × ≤ 8 nilai, anggaran 24.000 sel, Top N per tingkat + "(Lainnya)" dari baris mentah; **pivot tersimpan** per dataset (≤ 50) menjadi sumber widget pivot/grafik/KPI/tabel — hanya pemilik dataset yang mengubah (CAS revisi, konfirmasi dampak, IN_USE), editor memilih/lepas, viewer tetap D6 (`savedPivotId` sedataset dibaca server, revisi di kunci cache).
- Versi aplikasi (T-066): `package.json` = satu sumber; tampil di menu akun dan detail admin `/health`; tag image bawaan `v<versi>`; rilis minor lewat `aitk release` (1.1.0, 1.2.0, 1.3.0 per tonggak G-7).
- Metadata (user, profil dataset, skema kolom, layout dashboard) di PostgreSQL via Prisma. Data tabular di Parquet, bukan di PostgreSQL.
- Deploy on-prem VM PCP Express via Docker Compose (app, worker ×2, renderer PDF, PostgreSQL, object storage S3 (RustFS) di subdomain sendiri, Redis, reverse proxy). Zero-capex. Single-tenant: organisasi = semua user aktif instance.

## Stack
Next.js (App Router, TypeScript) · Tailwind · Prisma + PostgreSQL · MinIO (S3 API) · DuckDB (node binding) · BullMQ + Redis (job antrean ingest) · ECharts (chart) · @tabler/icons-react.

## Panduan penggunaan (wajib)
Halaman /panduan berisi artikel teks (markdown) dan video per role: pemilik dataset, editor, viewer, admin. Konten dikelola admin dari UI tanpa deploy ulang; video disimpan di MinIO dan diputar HTML5 (bukan embed eksternal, karena on-prem). Tombol bantuan kontekstual di halaman upload, skema, dan builder.

## UI
Semua UI lewat plugin frontend-expert (rantai di conventions.md). Fondasi desain ditetapkan di T-025 dan didokumentasikan di docs/ai/design-system.md. Ikon hanya @tabler/icons-react.

## Batasan
- Maks file 1 GB per upload; format .xlsx dan .csv (xls lama tidak didukung di v1).
- Registrasi hanya email dengan domain yang di-whitelist (konfigurasi env), verifikasi email wajib.
- Tiap segmen sheet = raw.parquet (posisional c1..cN VARCHAR, semua baris, dipertahankan) + typed-<schemaRevision>.parquet; header = metadata per file typed; koreksi/pemetaan menulis typed revisi baru dari raw (recast per segmen), tanpa file asli dan tanpa parse ulang. Acuan alur dan keputusan mengikat D1–D17: docs/flow-kerja.md.
- Batas data per periode (bawaan, env admin): 24 periode (maks 60), 10 jt baris/sheet, 16 GiB/dataset, 120 segmen/sheet, kuota 20 GiB/pengguna dari byte nyata; batas dievaluasi per periode utuh sebelum aktivasi, default tolak.
- Target ingest 1 GB: selesai < 15 menit, puncak RAM worker < 2 GB.
- Target query widget pada dataset 10 juta baris: p95 < 3 detik. Pivot lanjutan 4×8 dingin pada 10 jt baris belum memenuhi di kontainer uji (p95 4,6–10,6 s, cache hangat 2–6 ms; T-075) — percepatan atau keputusan target di T-hfqf.
