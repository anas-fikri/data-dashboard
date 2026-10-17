# T-de1b — Parse sheet xlsx paralel saat ingest

- **Tanggal / mesin:** 2026-10-17, Apple M4 (10 core, 16 GB, SSD), macOS, Node 26, dipakai bersama (load average
  5,8–8,3 selama run). `scripts/perf-ingest.ts` (parser + DuckDB sungguhan, setelan worker: memory_limit 1 GB,
  `INGEST_DUCKDB_THREADS` 2), dijalankan dengan `/usr/bin/time -l`.
- **Fixture:** `teks-berat-1gb.xlsx` (903 MB; 3 sheet × 1 juta baris × 30 kolom, 60 % teks, 70 % unik, baris judul 3,
  tanggal campuran, judul ganda — parameter `tests/fixtures/README.md`), dibuat lalu dihapus sesudah run.

## Hasil 1 GB (AC 2)

| `INGEST_XLSX_SHEET_THREADS` | Baca sheet | Total (raw + typed) | Waktu CPU | Puncak RSS (skrip / `time -l`) | Hasil |
|---|---|---|---|---|---|
| 2 (bawaan) | **241,7 s** | 340 s | 527 s | **764 MB / 800 MB** | done, 3 sheet × 1.000.002 baris |
| 1 (berurutan lama) | 304,7 s | 387 s | 462 s | 615 MB / 644 MB | done, 3 sheet × 1.000.002 baris |

- **Identik:** `digest` (SHA-256 metadata sheet + skema typed + isi raw/typed parquet) sama untuk 1 dan 2 thread:
  `dfd875fa021b619632b9d84f609044b59f637e1bccf369000aa2becdcaccf5b4`; tipe per sheet sama (25 teks, 1 tanggal,
  2 desimal, 1 bulat, 1 boolean); raw 595 MB, typed 596 MB.
- **Memori:** 2 thread menambah ± 150–160 MB puncak RSS; ± 0,8 GB jauh di bawah batas worker 3 GB (sisa > 2 GB untuk
  kompresi memori macOS / arena malloc glibc yang tidak terhitung di angka ini). `peak memory footprint` dari
  `time -l` milik proses pembungkus `npx`, jadi tidak dipakai.
- **Waktu:** baca 21 % lebih cepat (mesin sibuk; run lebih tenang sebelumnya pada 3 × 200 rb baris: 25–45 %).
  Penulis DuckDB di thread utama menjadi batas, sehingga 3–4 thread hampir tidak menambah kecepatan; bawaan 2.

## Catatan

1. Belum diukur di olympus (HDD) maupun di image Docker produksi; jalur produksi (tsx di Node 22.23.3) diverifikasi
   reviewer dengan tsx CLI sungguhan, dan worker gagal start → otomatis jalur berurutan.
2. Anggaran CPU: `WORKER_REPLICAS × (1 + INGEST_XLSX_SHEET_THREADS) ≤ vCPU − 2` (env.ts, docker-compose.prod.yml).
3. Lanjutan potensial: sharedStrings masih diurai berurutan (± 18 % waktu baca) dan jalur berurutan masih
   `readSync` per sel tanpa cache halaman.
