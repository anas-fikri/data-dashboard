---
status: accepted
date: 2026-10-11
---

# ADR-0001: File 1 GB diproses streaming ke Parquet dan diquery DuckDB, bukan dimuat ke PostgreSQL atau browser

## Context and Problem Statement

User mengunggah Excel/CSV sampai 1 GB (±8 juta baris) dengan struktur beragam, lalu membangun dashboard interaktif. Parser xlsx umum (SheetJS) memuat seluruh workbook ke memori (xlsx terkompresi zip, 1 GB file ≈ 5–10 GB di RAM). Browser dan proses Next.js tidak sanggup. Query agregasi dashboard harus p95 < 3 detik.

## Considered Options

1. Parse di browser (SheetJS) lalu kirim JSON ke server.
2. Muat semua baris ke tabel PostgreSQL per dataset (JSONB atau tabel dinamis), query via SQL.
3. Streaming parse di worker terpisah → Parquet per sheet di object storage → query DuckDB (embedded, kolumnar) dari spec deklaratif.
4. Layanan OLAP eksternal (ClickHouse) sebagai mesin query.

## Decision Outcome

Chosen option: "3. Streaming → Parquet → DuckDB", because: memori worker terikat ukuran batch bukan ukuran file; Parquet kolumnar + DuckDB memberi agregasi cepat untuk puluhan juta baris tanpa server DB tambahan; skema per dataset dinamis tanpa migrasi; cocok deploy on-prem satu VM (zero-capex). Setiap sheet disimpan dua lapis: `raw.parquet` (kolom posisional VARCHAR, semua baris termasuk di atas header, dipertahankan) dan `typed-<schemaRevision>.parquet` (bertipe, dibaca widget). Baris header adalah metadata. Koreksi tipe, pemilihan header, dan pemetaan kolom menulis file bertipe revisi baru dari lapis mentah, pointer diganti atomik, tanpa membaca ulang file asli; key cache memuat revisi sehingga re-cast tidak pernah menyajikan data basi atau file setengah tulis. PostgreSQL tetap dipakai hanya untuk metadata (user, profil dataset, skema, layout dashboard, akses).

Opsi 1 ditolak: RAM browser. Opsi 2 ditolak: tabel dinamis per dataset menyulitkan migrasi dan agregasi 8 juta baris row-store lambat tanpa indeks khusus. Opsi 4 ditunda: menambah komponen operasional; DuckDB cukup sampai ratusan juta baris, dan Parquet sebagai format penyimpanan memungkinkan migrasi ke ClickHouse nanti tanpa re-ingest.

### Consequences

* Good, because puncak RAM ingest terkendali (< 2 GB target), query cepat, format penyimpanan terbuka (Parquet) dan portabel.
* Good, because query dibangun server dari spec tervalidasi (zod + parameter binding), bukan SQL dari client, sehingga permukaan injeksi kecil.
* Bad, because DuckDB bersifat single-process per node: query bersamaan bersaing CPU; perlu cache hasil (Redis), batas waktu 30 detik, dan batas paralelisme.
* Bad, because dua tempat penyimpanan (PostgreSQL + Parquet) harus dijaga konsisten lewat versi dataset; hapus profil harus membersihkan storage.
