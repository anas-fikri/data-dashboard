---
status: accepted
date: 2026-10-12
---

# ADR-0005: Parser xlsx streaming sendiri (yauzl + saxes) dengan spill sharedStrings; CSV lewat DuckDB read_csv

## Context and Problem Statement

Worker ingest (T-006) harus membaca xlsx sampai 1 GB, dengan 40 juta shared strings dan 6,4 GB XML setelah dekompresi, ke raw.parquet posisional. Batasnya: `memory_limit` DuckDB 1 GB dan worker 3 GB (D7), nomor baris fisik untuk `_row`, dan batas melawan file berbahaya (DOCTYPE, zip-bomb; D14). Task T-005 meminta benchmark ExcelJS vs DuckDB `read_xlsx` dan menetapkan parser serta mitigasi bila RSS > 2 GB. Bukti lengkap ada di `docs/ai/perf/T-005.md`. (Rencana awal menyebut ADR-0002; nomor itu sudah dipakai keputusan RustFS.)

## Considered Options

1. **ExcelJS `WorkbookReader`**
   - Pada urutan entri Excel (worksheet sebelum `sharedStrings.xml`), pembaca macet di fixture 1 GB.
   - Dengan sharedStrings di awal, heap JS habis di 4 GB.
   - Tidak ada batas rasio dekompresi.
   - Membawa `uuid` versi rentan (moderate).
2. **DuckDB `read_xlsx` (ekstensi excel)**
   - Gagal OOM pada `memory_limit` 1 GB; dengan 4 GB lolos, tetapi RSS 2.266 MB.
   - Tanpa `range`, kolom di luar baris pertama hilang diam-diam.
   - Tidak memberi nomor baris fisik dan memproses zip-bomb tanpa batas.
   - Ekstensi harus diunduh atau dibundel untuk on-prem tanpa internet.
3. **Parser sendiri: yauzl (akses acak via central directory, `validateEntrySizes`) + saxes (SAX, DOCTYPE ditolak)**, dengan sharedStrings di-spill ke file sementara bila > 128 MB
   - 351 s, RSS 639 MB, 3 juta baris dan 88 juta sel benar.
   - Batas rasio dan total ukuran diperiksa dari central directory sebelum dekompresi.
   - Tanpa spill, heap habis, jadi spill adalah bagian wajib dari opsi ini.

## Decision Outcome

Chosen option: "3. Parser sendiri (yauzl + saxes) dengan spill sharedStrings", because hanya opsi ini yang lolos fixture teks-berat 1 GB di bawah batas memori D7 dengan hasil benar per sel. Opsi ini juga satu-satunya yang bisa dibatasi secara eksplisit melawan file berbahaya, dan memberi nomor baris fisik.

CSV tidak lewat parser Node. Worker memakai DuckDB `read_csv` langsung ke Parquet. Hasilnya untuk 974 MB, 8,1 juta baris: 22 s dan RSS 292 MB pada `memory_limit` 1 GB, termasuk memindahkan baris ke JS. Kolom diberikan eksplisit (`all_varchar`, `null_padding`) dari sniff 64 KB.

Parameter awal yang mengikat T-006:
- **Batas zip:** ≤ 10.000 entri dan total tak terkompresi ≤ 24 GiB.
  - Rasio per entri (> 1 MB) ≤ 200x; worksheet nyata 6–8x.
  - `validateEntrySizes` memastikan ukuran di central directory jujur.
  - DOCTYPE ditolak sebelum sel pertama.
- **Shared strings:** di memori sampai 128 MB, lalu file sementara + indeks offset `Float64Array` dan cache 50k entri.
- **Nomor baris dan kolom:** dari atribut `r`, dengan fallback urutan.
- **Konversi tanggal:** sel bergaya tanggal (numFmt bawaan 14–22/27/30/36/45–47/50/57, atau format kustom berisi d/m/y/h/s) diubah ke tanggal naive (D8).
- **Akses berkas:** worker mengunduh objek sumber ke disk sementara karena akses acak zip butuh file lokal. Disk sementara worker harus ≥ ukuran file + spill (± 2× ukuran file).

### Consequences

* Good, because RSS terkendali (< 1 GB) pada kasus terberat dan batas keamanan eksplisit teruji (`tests/scripts/fixtures.test.ts`).
* Good, because tidak ada dependency produksi bermasalah. ExcelJS hanya devDependency untuk benchmark dan boleh dihapus setelah T-006.
* Bad, because parser milik sendiri harus dirawat. Cakupan OOXML yang tidak didukung (rich text phonetic, formula tanpa nilai cache, sheet chart) diperlakukan sebagai nilai teks/kosong dan dicatat di T-006.
* Bad, because parse xlsx 1 GB ± 6 menit di M4. Bila T-024 menunjukkan alur penuh mendekati 20 menit di VM minimum, optimasi berikutnya adalah pemindai `<c>`/`<v>` khusus dan cache sharedStrings yang lebih besar.
* Bad, because spill membutuhkan disk sementara worker. T-023 menyediakan volume temp dan batasnya.
