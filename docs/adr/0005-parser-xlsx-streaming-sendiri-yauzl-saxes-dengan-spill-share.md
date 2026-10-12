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
   - 192 s, RSS 323 MB; 3 juta baris, 88 juta sel, dan checksum isi teks benar (versi final setelah review; run awal 351 s / 639 MB).
   - Batas rasio dan total ukuran diperiksa dari central directory sebelum dekompresi.
   - Tanpa spill, heap habis, jadi spill adalah bagian wajib dari opsi ini.

## Decision Outcome

Chosen option: "3. Parser sendiri (yauzl + saxes) dengan spill sharedStrings", because hanya opsi ini yang lolos fixture teks-berat 1 GB di bawah batas memori D7 dengan hasil benar per sel. Opsi ini juga satu-satunya yang bisa dibatasi secara eksplisit melawan file berbahaya, dan memberi nomor baris fisik.

CSV tidak lewat parser Node. Worker memakai DuckDB `read_csv` langsung ke Parquet. Hasilnya untuk 974 MB, 8,1 juta baris: 22 s dan RSS 292 MB pada `memory_limit` 1 GB, termasuk memindahkan baris ke JS. Kolom diberikan eksplisit (`all_varchar`, `null_padding`) dari sniff 64 KB.

Parameter awal yang mengikat T-006:
- **Batas zip** (semua diperiksa dari central directory sebelum dekompresi):
  - ≤ 10.000 entri.
  - Total tak terkompresi ≤ min(24 GiB, 100 × ukuran file).
  - Rasio per entri (> 1 MB) ≤ 100x; worksheet nyata 6–8x, fixture zip-bomb ± 117x ditolak.
  - Entri yang tumpang tindih ditolak. `validateEntrySizes` hanya menjamin ukuran **tak terkompresi** jujur; ukuran terkompresi bisa dipalsukan sehingga batas total relatif ukuran file dan cek tumpang tindih wajib ada.
  - DOCTYPE ditolak sebelum sel pertama; CDATA dibaca sebagai teks.
- **Batas isi:** ≤ 50 sheet, ≤ 1.048.576 baris, ≤ 16.384 kolom, nomor baris wajib naik. Sel/string > 32.767 karakter dipotong (aman terhadap pasangan surrogate, setelah escape didekode) dan dihitung per sel. Buffer internal saxes (satu node teks, nilai atribut, atau nama tag) diperiksa per potongan stream; node > ± 294 ribu karakter ditolak; kedalaman elemen > 64, > 256 atribut pada satu tag, dan total nilai atribut > 16.384 karakter per tag juga ditolak (diperiksa per tag dan per potongan dari tumpukan internal saxes), sehingga tumpukan elemen terbuka menahan paling banyak ± 1 juta karakter. Jumlah sheet (≤ 50) dan relasi (≤ 10.000) diperiksa saat elemen dibaca, nama sheet ≤ 255 karakter, total isi satu baris ≤ 4 juta karakter, cache sharedStrings hanya menyimpan string ≤ 512 karakter (≤ ± 50 MB), jumlah sharedStrings ≤ 64 juta (indeks ≤ 256 MB), numFmt ≤ 1.000, cellXfs ≤ 65.536, dan entri zip dengan nama > 1.024, extra field > 4.096, atau komentar > 1.024 byte ditolak. Nilai string hasil substring disalin mandiri (`own()`) agar tidak menahan potongan stream ± 16 KB. Deadline diperiksa per potongan di semua part. Indeks shared string yang kosong = sel kosong; di luar rentang = file rusak (ditolak).
- **Batas lebar ingest (T-006):** raw.parquet ≤ 2.048 kolom (`MAX_RAW_COLS`). Batas ini berlaku untuk xlsx maupun CSV, karena parser sendiri menerima sampai 16.384 kolom; sheet yang lebih lebar ditolak dengan pesan.
  - Lebar ini teruji di `memory_limit` 1 GB, baik untuk nilai berulang maupun string unik.
  - Dua hal yang membuatnya muat:
    - Tabel > 256 kolom (`WIDE_COLS`) disimpan di DB DuckDB kedua ber-blok 16 KiB, sebab tabel lebar menahan satu segmen per kolom dan blok default 256 KiB tidak muat. Tabel yang lebih sempit tetap di DB utama ber-blok default, yang lebih cepat untuk jutaan baris.
    - Untuk sheet > 128 kolom, batas halaman kamus string Parquet per kolom = 128 MB / jumlah kolom (sheet yang lebih sempit memakai default DuckDB). Penulis Parquet menyiapkan buffer kamus sebesar batas itu untuk setiap kolom.
  - Memori DuckDB yang tetap habis diperlakukan sebagai kegagalan permanen dengan pesan, kecuali karena disk temp penuh.
- **Shared strings:** di memori sampai 128 MB, lalu file sementara per parse (dihapus setelah selesai). Indeks = basis per 1.024 string + offset relatif `Uint32` (± 4 byte/string), cache 50k entri.
- **OOXML:** nama tag dibandingkan tanpa prefix namespace (ekspor .NET OpenXML SDK); workbook, sharedStrings, dan styles ditemukan lewat file relasi, bukan nama tetap; escape `_xHHHH_` didekode; baris tanpa nilai tidak dipancarkan.
- **Nomor baris dan kolom:** dari atribut `r`, dengan fallback urutan.
- **Konversi tanggal:** sel bergaya tanggal (numFmt bawaan 14–22, 27–36, 45–47, 50–58, atau format kustom berisi d/m/y/h/s setelah literal, escape, dan padding dibuang) diubah ke tanggal naive (D8), dengan epoch 1904 bila `workbookPr date1904`. Sel `t="d"` (ISO) dibaca sebagai tanggal naive. Format durasi `[h]:mm` masih menjadi tanggal; T-007 memperlakukannya sebagai durasi.
- **Akses berkas:** worker mengunduh objek sumber ke disk sementara karena akses acak zip butuh file lokal. Disk sementara worker harus ≥ ukuran file + spill; file spill dibatasi 8 GiB (mutlak; teks hasil dekode tidak pernah melebihi XML sharedStrings yang sudah dibatasi), jadi sediakan ± ukuran upload maksimum + 8 GiB per replika worker (± 9 GB untuk 1 GB). Faktor relatif ukuran file tidak dipakai karena menolak ekspor ERP bertemplate yang sah.

### Consequences

* Good, because RSS terkendali (< 1 GB) pada kasus terberat dan batas keamanan eksplisit teruji (`tests/scripts/fixtures.test.ts`, `tests/scripts/parser-sax-edge.test.ts`).
* Good, because tidak ada dependency produksi bermasalah. ExcelJS hanya devDependency untuk benchmark dan boleh dihapus setelah T-006.
* Bad, because parser milik sendiri harus dirawat. Cakupan OOXML yang tidak didukung (rich text phonetic, formula tanpa nilai cache, sheet chart) diperlakukan sebagai nilai teks/kosong dan dicatat di T-006.
* Bad, because parse xlsx 1 GB ± 3 menit di M4 (VM produksi lebih lambat). Bila T-024 menunjukkan alur penuh mendekati 20 menit di VM minimum, optimasi berikutnya adalah pemindai `<c>`/`<v>` khusus dan cache sharedStrings yang lebih besar.
* Bad, because spill membutuhkan disk sementara worker. T-023 menyediakan volume temp dan batasnya.
