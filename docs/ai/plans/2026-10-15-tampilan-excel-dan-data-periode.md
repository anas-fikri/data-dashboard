# Rencana: tampilan data gaya Excel dan data per periode

- Tanggal: 2026-10-15
- Status: **rencana, belum dikerjakan**. Dikerjakan setelah semua task yang sekarang terbuka selesai (T-016, T-017, T-018, T-020–T-024, T-028–T-032, T-033).
- Task aitk: goal **G-6**, task **T-034–T-064** (pemetaan kode P di §7.1). Bug P-3 dipisah menjadi **T-033** di antrean biasa (goal G-5, Q7).
- Menggantikan: T-015 "Mode tambah baris (append)" (lihat §4.11).
- Dasar:
  - riset kode (2026-10-15) dan spike DuckDB 10 jt baris
  - riset komponen grid dan pola industri (Metabase, Looker Studio, Domo, Power BI, BigQuery, Delta/Iceberg/DuckLake)
  - tiga usulan (user-first, ops/biaya-first, integritas-first) dan dua penilaian juri

Singkatan:
- **AC**: acceptance criteria (kriteria terima)
- **ADR**: catatan keputusan arsitektur
- **GC**: pembersihan objek storage yang tidak dirujuk lagi
- **p95**: waktu respons persentil ke-95
- **LRU**: cache yang membuang entri yang paling lama tidak dipakai
- **TTL**: umur maksimum entri
- **TSV**: teks dipisah tab (format tempel ke Excel)
- **CSP**: Content Security Policy
- **ARIA**: atribut aksesibilitas untuk pembaca layar
- **YoY**: perbandingan tahun ke tahun

---

## 1. Ringkasan keputusan

### 1.1 Apakah tampilan gaya Excel desktop memungkinkan untuk file besar?

**Bisa, dalam bentuk penampil baca-saja bernama "Lihat data".** Server (DuckDB di atas typed parquet) yang mengurutkan, menyaring, dan memotong data. Browser hanya mengambil blok sekitar 200 baris × kolom yang terlihat saat digulir. File 1 GB tidak pernah dikirim ke browser.

Excel desktop sendiri berhenti di 1.048.576 baris per sheet, sedangkan sheet kita bisa sampai 10 jt baris. Jadi yang ditiru dari Excel adalah **rupa dan cara pakainya**, bukan membuka seluruh file di browser.

| Bisa (v1) | Tidak (v1) dan alasannya |
|---|---|
| Gulir jutaan baris (scroll diregangkan melewati batas tinggi browser) | Edit sel, rumus, makro/VBA, undo/redo. Data adalah parquet imutabel (ADR-0001), dan flow-kerja C5 menetapkan "tidak ada formula sel" |
| Tab sheet di bawah, header beku, kolom nomor baris beku, bekukan ≤ 3 kolom kiri | Pivot table penuh, conditional formatting |
| Huruf kolom A/B/C + nama kolom + ikon tipe | Warna, gaya, merge cell, dan format asli file. Ingest hanya menyimpan tipe, dan file sumber dihapus setelah 7 hari |
| Ubah lebar, autofit, sembunyikan, dan geser kolom (disimpan per pengguna) | Seret-pilih rentang sel lalu salin banyak sel. Ini butuh AG Grid Enterprise (berbayar) dan masuk gerbang keputusan nanti |
| Urut sampai 3 kolom; saring per kolom (daftar nilai, rentang angka, rentang tanggal + preset); cari | Grafik di dalam sel, kolaborasi realtime |
| "Ke baris N", Ctrl+Home/End, bilah status (jumlah baris; Jumlah/Rata-rata/Min/Maks kolom) | Akses seluruh sheet untuk viewer. Viewer hanya boleh melihat kolom widget (D6) |
| Panel "Isi sel" berisi isi lengkap, termasuk nilai asli bila sel gagal dibaca sebagai tipenya | |
| Salin sel, salin baris (≤ 1.000) ke Excel, "Unduh tampilan" (CSV/XLSX lewat job T-017) | |

### 1.2 File dengan kolom sama tapi periode berbeda: update yang ada atau buat baru?

**Update dataset dan sheet yang sama, dengan periode sebagai satuannya.**

- Periode baru **ditambahkan**.
- Periode yang sudah ada **diganti utuh**, tidak digandakan. Mengunggah file yang sama dua kali memberi hasil yang sama dengan mengunggahnya sekali.
- Setiap perubahan menghasilkan **versi baru**, sehingga rollback T-013 tetap berlaku.
- **Tidak membuat dataset atau sheet baru per periode.** Dashboard terikat ke satu `datasetId`, setiap widget ke satu `sheetId`, dan tidak ada union lintas sheet. Kalau periode dipisah, perbandingan antarbulan di dashboard tidak mungkin dibuat.
- **Model penyimpanan:** setiap periode disimpan sebagai **segmen** yang ditulis sekali, dan sebuah versi hanyalah **daftar segmen** (manifest). Dengan begitu biaya unggah sebanding dengan ukuran periode baru, bukan total data. Unggahan bulan ke-24 secepat unggahan pertama.
- Model ini difinalkan setelah spike P-1. Fallback-nya adalah union self-contained berbatas (§4.12) dengan UX yang sama.

### 1.3 Batasnya apa, dan bagaimana periode tidak terpotong?

- **Satuan utama: jumlah periode.** Pengaturan "Simpan N periode terbaru", default 24, maksimum 60.
- **Pagar pengaman:**
  - ≤ 10 jt baris per sheet (skala yang sudah terverifikasi di D10/T-009)
  - ≤ 16 GiB data per dataset
  - kuota per pengguna 20 GiB, dihitung dari **byte yang benar-benar tersimpan**
- **Kenapa bukan total baris saja.** Batas baris yang ditegakkan dengan memangkas baris pasti memotong periode. Di rencana ini batas baris hanya menentukan **berapa periode utuh** yang harus dilepas, atau apakah unggahan ditolak. Baris tidak pernah menjadi satuan penghapusan.
- **Saat batas penuh:**
  - Default: **tolak unggahan** dan sebutkan periode terlama yang perlu dihapus.
  - Pemilik bisa memilih "Lepas periode terlama otomatis" (jendela bergulir).
  - Kedua pilihan selalu lewat layar tinjauan sebelum diterapkan.
- **Satu periode yang sendirian melebihi batas** ditolak, dan data aktif tidak berubah. Periode tidak pernah dipecah.
- **Konsekuensi yang perlu diketahui:**
  - Total data bisa berhenti sedikit di bawah batas, karena sisa ruang yang tidak cukup untuk satu periode utuh dibiarkan kosong.
  - Data 1 jt baris/bulan hanya muat ±10 bulan dalam batas 10 jt baris, jadi YoY (13 bulan) belum muat. Lihat pertanyaan Q2.

---

## 2. Latar dan fakta kode saat ini

| Area | Fakta | Rujukan |
|---|---|---|
| Lapisan parquet | `raw.parquet` berisi `_row INTEGER` (baris fisik, ada celah) + `c1..cN VARCHAR`.<br>`typed-<rev>.parquet` hanya memuat baris > headerRow, ditulis urut `_row`, sehingga `file_row_number` typed = indeks baris data padat 0..N-1. | `src/features/ingest/raw-writer.ts`, `src/features/ingest/typed.ts`, `src/lib/duckdb/index.ts` |
| Versi | Self-contained (D4), hanya REPLACE.<br>`VersionMode {REPLACE, APPEND}` ada di DB tapi tidak pernah dibaca atau ditulis.<br>Retensi: 3 versi READY + versi aktif, dihapus setelah masa tenggang 1 jam. File sumber dihapus setelah 7 hari. | `prisma/schema.prisma`, `src/features/versions/retention.ts`, `cleanup.ts` |
| Aktivasi ingest | `repo.finish` mengaktifkan versi **tanpa** `sheetMap` (temuan T-014 R5-1), sehingga widget pada rantai alias bisa berstatus `SHEET_UNAVAILABLE`. | `src/features/ingest/repo.ts`, `src/features/versions/activation.ts` |
| Query | Setiap pembangun SQL membaca satu `read_parquet($path)`.<br>`ParquetCache` menyewa satu kunci: 2 unduhan total, 1 per pengguna, tunggu 10 s.<br>13 modul memakai `typedKey`. | `src/features/query/service.ts`, `src/lib/duckdb/parquet-cache.ts` |
| Batas query | DuckDB `memory_limit` 1 GB, 2 thread.<br>4 slot global, 2 per pengguna, antrean 8.<br>Timeout 30 s, hasil ≤ 5 MB.<br>Cache hasil LRU 64 MiB dengan kunci yang memuat `versionId`.<br>Rate 600/menit/pengguna. | `src/lib/env.ts`, `src/lib/duckdb/engine.ts`, `src/features/query/cache.ts`, `src/features/auth/rate-limit.ts` |
| Tampilan data sekarang | Sampel skema 50 baris × 60 kolom, hanya untuk pemilik.<br>Widget tabel: 100 baris/halaman, ≤ 20 kolom, urut satu kolom, tombol Prev/Next, late materialization (`_row IN ids`). | `src/features/schema/service.ts`, `src/features/query/table.ts`, `src/components/widgets/table-view.tsx` |
| Akses | D6: viewer hanya mengirim `{widgetId, dashboardFilters}`; editor (T-016, sedang berjalan) mengirim `{dashboardId, spec}`.<br>Query bebas dan sampel skema hanya untuk pemilik. | `docs/flow-kerja.md` D6, `src/features/query/runtime.ts` |
| Kuota | Hanya menghitung `sizeBytes` file unggahan (20 GiB). Byte parquet tidak dihitung. | `src/features/uploads/service.ts`, `src/lib/env.ts` |
| Tanggal | Tipe `date`/`timestamp` sudah ada, tapi min/max tidak disimpan.<br>Filter rentang tanggal, preset this_month/this_quarter/ytd, dan grain bulan/kuartal sudah ada.<br>Tanggal naive (D8). | `src/features/ingest/infer.ts`, `src/features/query/filters.ts`, `spec.ts` |
| Frontend | Belum ada dependensi grid atau virtualisasi. CSP mengizinkan inline style dan worker blob.<br>Bisa dipakai ulang: `format-cell.tsx`, `SheetTabs`, filter-values (DISTINCT ≤ 1.000 + cari). | `package.json`, `src/lib/security-headers.ts`, `src/components/schema/*` |
| Ekspor | T-017 (belum dikerjakan): job, ≤ 1 jt baris (`EXPORT_TOO_LARGE` bila lebih), tautan presigned 1 jam. | `docs/ai/tasks/T-017-*.md` |

Angka performa yang menjadi dasar rencana:

| Pengukuran | Hasil |
|---|---|
| T-011: tabel 1 jt baris | p95 94 ms |
| T-011: tabel lebar 1 jt × 20 kolom teks, terurut | 749–791 ms |
| T-009: group-by 10 jt baris | p95 608 ms |
| Spike: jendela 200 baris via `file_row_number BETWEEN`, di kedalaman mana pun | 7–11 ms |
| Spike: `ORDER BY _row OFFSET 9.999.000` (late materialization) | 82 ms |
| Spike: urut teks dengan collation, halaman dalam | 1,4–1,5 s |
| Spike: GROUP BY per bulan | 62 ms |
| Spike: min/max kolom tanggal | 1 ms |
| Ingest xlsx 1 GB (3 sheet × 1 jt × 30 kolom) | parse 301 s, typing ±25 s per sheet, parquet ±1,2 GB |
| Tinggi elemen maksimum browser | Chrome/Safari ±33,5 jt px, Firefox ±17,9 jt px. Virtualisasi naif dengan baris 28 px mentok di 0,6–1,2 jt baris |

Kondisi spike 2026-10-15: M4, 10 jt × 12 kolom, memory 1 GB, 2 thread, SSD lokal, tanpa beban lain.

---

## 3. Bagian A: penampil "Lihat data" gaya Excel

### 3.1 Cakupan masuk

**Halaman dan akses**
- Halaman `/datasets/[id]/data`, dibuka dari tombol "Lihat data" di halaman dataset dan halaman skema.
- Untuk pemilik dan editor.
- Pemilik juga memakainya untuk pratinjau versi yang menunggu konfirmasi (dengan `versionId` eksplisit).

**Tata letak**
- Tab sheet di bawah, memakai `SheetTabs`.
- Header beku dan kolom nomor baris beku.
- "Bekukan sampai kolom ini" untuk ≤ 3 kolom kiri.
- Huruf kolom (A, B, C…) mengikuti urutan kolom skema, jadi tidak berubah saat pengguna menyembunyikan atau menggeser kolom (sama seperti Excel).
  - Di bawah huruf: nama kolom dan ikon tipe Tabler.
  - Tooltip header menyebut kolom asal di file ("Kolom D di file asli").
- Nomor baris = posisi di tampilan saat ini (1..N), dan nomor inilah yang dipakai "Ke baris". Baris asli di file ditampilkan di panel Isi sel.

**Pengaturan kolom per pengguna**
- Lebar (seret; klik ganda di tepi untuk autofit dari blok yang sudah dimuat), sembunyikan, dan geser.
- Disimpan di `localStorage` dengan kunci `(sheet, schemaRevision)`.
- Setiap akses dibungkus try/catch; grid tetap berfungsi tanpa `localStorage`.

**Format tampilan** (memakai `format-cell.tsx`)
- Angka `1.234.567,89`.
- Tanggal `d Mmm yyyy`; timestamp `d Mmm yyyy HH.mm`.
- Rp dan Ya/Tidak.
- NULL ditampilkan sebagai sel kosong.
- Teks dipotong di 500 karakter dengan penanda.
- Menu header "Format tampilan" (Angka/Rupiah/Persen/desimal 0–4) disimpan per pengguna. Skema tidak berubah.

**Urut, saring, cari**
- Urut: klik header (naik → turun → tanpa urut), Shift+klik sampai 3 kolom. Dihitung di server.
- Saring per kolom (Alt+↓):
  - teks: daftar nilai + cari (filter-values, ≤ 1.000)
  - angka: rentang
  - tanggal: rentang + preset (`filters.ts`)
  - Saringan aktif tampil sebagai chip, plus tombol "Hapus semua saringan".
- Cari (Ctrl+F, hanya saat fokus di dalam grid):
  - berlaku sebagai saringan "baris yang mengandung…"
  - teks ≤ 100 karakter, di ≤ 10 kolom teks yang terlihat
  - sel yang cocok disorot, dengan keterangan "Ditemukan di N baris"

**Navigasi dan status**
- "Ke baris N" dan Ctrl+Home/End.
- Bilah status, misalnya: "Baris 1.234.567–1.234.606 dari 9.812.334 (tersaring dari 10.000.000)".
- Ringkasan kolom angka: Jumlah, Rata-rata, Min, Maks, Hitung atas seluruh baris tersaring (`runAggPlan`).

**Panel "Isi sel"** (F2/Enter)
- Isi lengkap sampai 32.767 karakter.
- Sumber, misalnya: "maret-2026.xlsx · baris 1.234 · Maret 2026".
- Untuk sel yang gagal cast (typed NULL, raw berisi), panel menampilkan nilai asli dengan label "Tidak terbaca sebagai <tipe>", supaya kehilangan data saat cast terlihat.

**Lainnya**
- Salin dan "Unduh tampilan": lihat §3.5.
- Banner "Data sudah diperbarui — Muat ulang" muncul bila versi aktif berganti saat pengguna sedang menggulir.
- Setelah fitur periode ada: pemilih "Periode: Semua ▾".
- Viewer: tombol "Perbesar" pada widget tabel membuka tabel layar penuh bergaya lembar kerja. Data tetap lewat jalur widget `{widgetId, dashboardFilters, page, sort}`, jadi viewer hanya melihat kolom widget (D6).

### 3.2 Cakupan keluar

Hal berikut tidak masuk v1, dan ditulis juga di UI serta panduan:
- Edit sel, rumus, makro, undo/redo.
- Pivot, conditional formatting, serta gaya/warna/merge dari file asli.
- Grafik di dalam sel, kolaborasi realtime.
- Seret-pilih rentang sel dengan salin banyak sel (gerbang Q6).
- Grid seluruh sheet untuk viewer.

### 3.3 Pilihan komponen

| Kandidat | Lisensi | Kesimpulan |
|---|---|---|
| **AG Grid Community 36.x, Infinite Row Model** | MIT | **Default.** Alasannya:<br>• Peer React 19 resmi.<br>• "Stretching" untuk melewati batas tinggi scroll browser sudah gratis di core.<br>• Kolom beku, resize/geser, urut di header, keyboard, dan ARIA grid sudah tersedia.<br>• Tema lewat CSS variables bisa dipetakan ke token terang/gelap; ikon bisa diganti Tabler.<br>• Pemeliharaan paling aktif.<br>Celah Community (salin rentang, Set Filter, status bar) ditutup dengan komponen sendiri. |
| Glide Data Grid 6.x | MIT | **Pembanding di spike.** Berbasis canvas, salin rentang bawaan, dan sudah menangani batas scroll. Kekurangannya: React 19 baru tersedia di versi alpha, a11y lebih lemah, dan UI urut/saring harus dibangun sendiri. |
| TanStack Virtual + paging blok | MIT | **Fallback** bila kedua kandidat gagal di spike. Semua fitur dibangun sendiri; batas tinggi scroll diatasi dengan halaman blok 50 rb baris. |
| AG Grid Enterprise | $999/developer, perpetual | Hanya bila salin rentang benar-benar dibutuhkan (Q6). Impor `ag-grid-enterprise` dilarang lewat lint sampai diputuskan, untuk menghindari watermark dan jebakan lisensi. |
| Handsontable, Univer/FortuneSheet, Luckysheet, Jspreadsheet, react-data-grid, RevoGrid | – | **Ditolak.**<br>• Handsontable: lisensi berbayar, data di memori.<br>• Univer/FortuneSheet: seluruh workbook dimuat di browser.<br>• Luckysheet: sudah diarsipkan.<br>• react-data-grid: tidak menangani batas tinggi scroll.<br>• RevoGrid: pemuatan dari server hanya di versi Pro. |

Aturan pemakaian komponen:
- Daftarkan hanya modul yang dipakai.
- Rute dimuat lazy khusus di klien, chunk ≤ 300 KB gzip, dan tidak pernah dimuat di rute dashboard.
- Versi dipin persis.
- Syarat lisensi dicek ulang saat spike P-2.

### 3.4 Arsitektur server

Route Handler baru ini tidak memakai `/api/query`, jadi otorisasi widget tidak tersentuh.

**Endpoint**
- `POST /api/sheets/:sheetId/rows` (zod strict)
  - Body: `{versionId, rowStart ≥ 0, rowCount 1..500 (klien memakai 200), cols: pos[] ≤ 64 (tanpa kolom tersembunyi), sort?: ≤ 3 × {pos, dir}, filters?: ≤ 20 (bentuk filters.ts), search?: {text ≤ 100, cols ≤ 10}, period?: string[]}`
  - Respons: `{versionId, schemaRevision, total, filteredTotal, rows: [{n, _row, cells[], cut[]}]}`
- `GET /api/sheets/:sheetId/cell?versionId&row&pos`: isi penuh (≤ 32.767 karakter), nilai raw bila cast gagal, dan sumbernya (file, baris asli, periode).
- `POST /api/sheets/:sheetId/stats`: count/sum/avg/min/max di bawah saringan yang sama.
- Ekspor: job T-017 dengan spec tampilan (kolom, urut, saring).

**Jalur eksekusi**

1. **Tanpa urut/saring/cari.** Posisi global dipetakan ke `(segmen, file_row_number)` dari jumlah kumulatif baris segmen (diurutkan per periode, lalu ordinal). Query-nya `read_parquet(seg, file_row_number=true) WHERE file_row_number BETWEEN a AND b`, dan hanya segmen yang beririsan dengan jendela yang disewa. Hasil spike: 7–23 ms di kedalaman mana pun.
2. **Dengan urut/saring/cari.** Late materialization `table.ts` digeneralisasi ke daftar segmen:
   1. CTE berisi `_row` + kunci urut, `ORDER BY kunci…, _row`, lalu `LIMIT/OFFSET`.
   2. Kolom yang diproyeksikan diambil dengan `WHERE _row IN ids`.
   3. `count` di-cache terpisah di cache hasil yang sudah ada.
3. **Kondisional (P-30)**, hanya bila P-29 mengukur blok dalam terurut p95 > 2 s: permutasi `_row` hasil urut/saring disimpan sebagai berkas di disk lokal.
   - Kunci: kunci typed segmen + urut + saring.
   - Anggaran 1 GiB (LRU), TTL 30 menit.

**Keamanan dan akses**
- Hanya pemilik dan editor, lewat resolver T-016. Sheet di-resolve dengan `id` dan `versionId` = versi aktif dataset.
- Respons penolakan:
  - viewer atau pengguna asing → 403
  - kolom tersembunyi → 400
  - Body respons tidak pernah memuat nama kolom atau sheet.
- Identifier hanya `c<pos>`, `_row`, atau `_period`. Semua nilai dikirim sebagai parameter.
- `versionId` ≠ versi aktif → **409 `VERSION_CHANGED`** + `activeVersionId`. Dengan begitu baris dari dua versi tidak pernah tercampur. Pengecualian: pemilik yang meminta versi `AWAITING_CONFIRM` miliknya sendiri.
- Ekspor dicatat di AuditLog.

**Isolasi beban** (supaya pengguna yang menggulir tidak membuat dashboard kehabisan slot)
- Aturan rate terpisah: `GRID_RATE_PER_MIN` = 300/menit/pengguna. Aturan 600/menit untuk widget tidak ikut terpakai.
- Grid memakai maksimal **2 dari 4** slot query global (`GRID_MAX_CONCURRENCY`), jadi dashboard selalu kebagian 2 slot.
- Maksimal 2 permintaan grid in-flight per pengguna.
- Blok grid **tidak** masuk cache hasil 64 MiB. Yang di-cache hanya count dan ringkasan.
- Klien: `cacheBlockSize` 200, `maxBlocksInCache` 50 (≤ 10 rb baris di memori), debounce 150 ms, `AbortController` untuk blok yang sudah lewat.
- Batas yang sudah ada tetap berlaku: timeout 30 s dan `RESULT_MAX_BYTES`. Timeout ditampilkan sebagai "Pengurutan ini terlalu berat; saring data dulu".

### 3.5 UX salin dan ekspor

**Salin**
- Sel: Ctrl/Cmd+C pada sel yang difokus.
- Baris: klik nomor baris, Shift+klik untuk rentang ≤ 1.000 baris, lalu Ctrl+C. Hasilnya TSV + baris judul.
- Lebih dari 1.000 baris → tawaran "Unduh tampilan".

**Nilai salinan harus terbaca Excel**
- Angka tanpa pemisah ribuan.
- Pemisah desimal mengikuti pilihan "Excel saya pakai koma/titik" (default dari bahasa browser).
- Tanggal ISO `yyyy-mm-dd`.
- Netralisasi formula (sama dengan D14) hanya untuk sel **bertipe teks** yang diawali `= + - @`. Angka negatif tidak diubah.

**Unduh tampilan**
- Kolom terlihat, urutan, dan saringan aktif dikirim ke job T-017.
- Tautan presigned berlaku 1 jam, dan unduhan dicatat di AuditLog.
- Batas mengikuti T-017 (≤ 1 jt baris). XLSX memang tidak bisa lebih dari 1.048.575 baris data.
- Bila tampilan lebih besar, dialog menyarankan menyaring dulu. File tidak pernah dipotong diam-diam.

### 3.6 Target performa

Diukur di VM T-023 (4 vCPU/16 GB), fixture 10 jt × 30 kolom, cache lokal hangat.

| Skenario | Target |
|---|---|
| Blok tanpa urut, di kedalaman mana pun | p95 server ≤ 300 ms, tampil ≤ 500 ms |
| Blok pertama dengan urut/saring | p95 ≤ 3 s |
| Blok dalam dengan urut teks | Diukur. Bila > 2 s, P-30 dibangun dengan target ≤ 500 ms untuk blok berikutnya |
| "Ke baris 9.000.000" tanpa urut | ≤ 1 s sampai baris terlihat |
| Ringkasan kolom | ≤ 2 s |
| 5 penggulir bersamaan + dashboard 6 widget | p95 widget ≤ 2× baseline T-012, tanpa QUERY_BUSY pada widget |
| Klien | ≤ 10 rb baris di memori, chunk rute ≤ 300 KB gzip, baris terakhir tercapai di Firefox |
| Data cadangan untuk Q2 | Angka yang sama diukur juga pada 13 jt baris |

### 3.7 Aksesibilitas (WCAG 2.2 AA)

- Semantik grid: `role=grid`, `aria-rowcount` = total + 1, `aria-colcount`, `aria-rowindex` nyata, dan `aria-sort`.
- Keyboard:
  - panah, Tab, PageUp/Down, Home/End
  - Ctrl+Home/End (melompat lewat jendela server)
  - Alt+↓ untuk saringan, F2/Enter untuk Isi sel, Ctrl+F untuk cari, Shift+Spasi untuk pilih baris
- Live region mengumumkan, misalnya, "Memuat baris 5.000.001–5.000.200", "Diurutkan berdasarkan Tanggal naik", dan "1.234 baris cocok".
- Fokus terlihat (dari token), kontras AA di tema terang dan gelap, zoom 200%, reduced motion.
- Gerbang lulus:
  - axe tanpa pelanggaran serius
  - `/frontend-expert:audit` tanpa Critical/High (D13; ikon hanya Tabler)
  - smoke test NVDA/VoiceOver

### 3.8 Ponsel (< 768 px)

- Halaman tidak punya scroll horizontal; grid menggulir di dalam wadahnya.
- Hanya kolom nomor baris yang beku.
- Toolbar dilipat ke menu "Lainnya"; urut dan saring dibuka di bottom sheet.
- Ketuk atau tekan lama sel membuka menu Isi sel / Salin.
- Target sentuh ≥ 44 px, dan tidak ada aksi yang hanya muncul saat hover.
- Resize dan geser kolom dimatikan; blok 100 baris.
- Pemberitahuan satu kali: "Tampilan terbaik di layar ≥ 1024 px".

---

## 4. Bagian B: data per periode

### 4.1 Keputusan dan alternatif yang ditolak

| Opsi | Putusan | Alasan |
|---|---|---|
| A. Hanya "Ganti semua" (pengguna menggabung file sendiri) | Ditolak | Beban Excel kembali ke pengguna, dan kena batas 1.048.576 baris/sheet serta 1 GiB per file. |
| B. Dataset atau sheet baru per periode | Ditolak | Dashboard terikat ke 1 `datasetId` dan widget ke 1 `sheetId`, tanpa union lintas sheet. Dashboard antarbulan menjadi mustahil. |
| C. Append buta T-015 (raw aktif ∪ raw file) | Ditolak | • Unggah ulang satu bulan menggandakan baris.<br>• Tidak ada satuan untuk melepas data lama.<br>• Biaya O(total baris) setiap unggahan.<br>• Penyimpanan ±4× lewat versi yang ditahan, dan kuota tidak menghitungnya.<br>• Vonis cast 98% terencerkan oleh seluruh union. |
| **D. Segmen per periode + manifest versi** | **Dipilih** (final setelah spike P-1) | • Biaya unggah O(baris periode baru).<br>• Periode yang tidak berubah dibagi antarversi lewat referensi.<br>• Rollback hanya mengganti manifest.<br>• Hapus/pulihkan periode instan. |
| E. Union self-contained berbatas dengan upsert per periode | **Fallback** bila P-1 gagal | Menjaga D4 dan risiko refactor paling kecil. Tapi I/O O(total) per unggahan, penyimpanan 4×, dan dengan 1 GB/bulan hanya ±3 periode muat di kuota 20 GiB. |
| F. DuckLake | Ditolak untuk v1 | Menjadi sumber kebenaran kedua di samping Prisma, butuh extension yang dipasang offline, dan formatnya masih 0.x. |

Pola ini sejalan dengan praktik industri:
- Domo "Partition" dan BigQuery partition overwrite: mengganti satu potongan data utuh.
- Delta `replaceWhere` dan dbt `insert_overwrite`: muat ulang yang idempoten per partisi.
- Iceberg/Delta/DuckLake: snapshot berupa daftar file, dengan GC berbasis referensi.

### 4.2 Biaya union vs segmen

Skenario: xlsx 1 GB/bulan, 3 sheet × 1 jt × 30 kolom (±1,2 GB parquet per bulan). Angka untuk bulan ke-10, diperkirakan dari baseline T-006/T-007.

| Biaya per unggahan | Union (T-015 / opsi E) | Segmen (opsi D) |
|---|---|---|
| Kerja worker | Unduh ±6 GB raw aktif, tulis ulang ±12 GB raw+typed, typing 30 jt baris (±12,5 menit) + parse ±5 menit | Parse ±5 menit + typing ±75 s, sama setiap bulan |
| Objek baru di storage (= pertumbuhan backup) | ±12 GB | ±1,2 GB |
| Penyimpanan yang ditahan (3 READY + aktif) | ±48 GB | ±12 GB + periode lama yang masih dirujuk versi tersimpan |
| Unduh ulang ke cache lokal app (10 GiB) | ±6 GB typed; cache terus terkuras | ±0,6 GB (hanya segmen baru) |
| Deadline ingest 60 menit / recast 20 menit | Akhirnya terlewati | Aman (recast per segmen) |

### 4.3 Model data (opsi D)

```
Dataset        + keepPeriods?                   (≤ PERIOD_KEEP_MAX; null = default admin)
               + onLimit: REJECT | EVICT_OLDEST (default REJECT)
               + missingDatePolicy: REJECT | DROP_WITH_CONFIRM (default REJECT)
DatasetVersion   mode: REPLACE | PERIOD | PERIOD_SETUP | PERIOD_REMOVE | PERIOD_RESTORE   (APPEND dihapus)
               + status AWAITING_CONFIRM (non-terminal, seperti AWAITING_MAPPING)
               + periodGrain? (null = versi non-periode), baseVersionId?, plan Json?, changeSummary Json?
               + dataBytes (byte parquet yang dirujuk versi)
Sheet          + lineageId (identitas sheet logis lintas versi; dibawa lewat sheetMap)
               + periodSource?: COLUMN | LABEL, periodColumn? (judul asli ternormalisasi + ordinal, di-resolve seperti remap)
SheetLineage     id, datasetId, rowHighWater BIGINT          (sumber _row global)
Segment          id, datasetId, lineageId, periodKey?, periodStart?, rowBase BIGINT,
                 rawKey, rawRows, dataRows, headerRow, colCount, columns (set posisi kanonik),
                 sourceKind (xlsx|csv + locale), sha256, originalName, uploadedById,
                 minDate?, maxDate?, rawBytes, createdByVersionId
SegmentTyped     segmentId, schemaRevision, typedKey, typedBytes
SheetSegment     sheetId, segmentTypedId, ordinal            (= manifest versi)
```

**Objek storage**
- Segmen baru: `parquet/<datasetId>/seg/<segmentId>/raw.parquet` dan `typed-<rev>.parquet`, bersifat imutabel.
- Sheet lama dimigrasikan menjadi **satu segmen legacy per sheet** (`rowBase` 0) yang tetap merujuk kunci lamanya di prefix versi. Tidak ada objek yang dipindah.

**Isi typed segmen**
- `c<pos>` kanonik, mengikuti skema aktif sheet logis.
- `_row BIGINT = rowBase + baris fisik`. Nilainya unik per sheet logis, tidak pernah dipakai ulang, dan deterministik di setiap recast. `rowBase` diambil secara atomik dari `SheetLineage.rowHighWater`.
- `_src_row`: baris fisik di file, untuk menampilkan sumber.
- `_period DATE` (tanggal awal periode), hanya di versi periode.

Karena `_row` unik global, pemutus seri dan `_row IN ids` di `table.ts` tetap berlaku tanpa kunci komposit.

**Query**
- Membaca `read_parquet([kunci typed segmen…])` sebagai **daftar biasa**.
- Bila set kolom antarsegmen berbeda (misalnya kolom ditambahkan belakangan), query memproyeksikan `NULL AS c<pos>` untuk segmen yang tidak punya kolom itu. `union_by_name` hanya cadangan.
- Urutan default:
  - sheet non-periode: `_row` (sama seperti sekarang)
  - sheet periode: `(_period, _row)`, sehingga kronologis
- `ParquetCache` menyewa **semua kunci segmen satu sheet dalam satu admission** (batch lease). Setelah aktivasi, yang di-prefetch **hanya segmen baru**.
- Filter pada kolom periode memangkas segmen berdasarkan `minDate/maxDate` aktual, bukan label.

**GC (mark-and-sweep, tanpa counter yang bisa melenceng)**
- Sebuah kunci dihapus hanya bila memenuhi dua syarat:
  - tidak dirujuk versi hidup mana pun (aktif, READY tersimpan, non-terminal), **dan**
  - sudah tidak dirujuk selama ≥ 24 jam (`SEGMENT_GC_GRACE_HOURS`).
- Job malam melakukan HEAD pada setiap kunci yang dirujuk dan memberi alert bila ada yang hilang.

**Gerbang integritas**
- `verifyVersionIntegrity` (fail-closed) berjalan sebelum **setiap** aktivasi dan memeriksa:
  - jumlah baris per segmen/periode sama dengan metadata
  - tidak ada `_period` NULL di baris data
  - `_row` unik
  - semua kunci yang dirujuk ada
- Bila ada selisih, versi baru menjadi FAILED dan versi aktif tidak tersentuh.

### 4.4 Identifikasi periode

Pemilik mengaturnya sekali per dataset di **"Atur periode"**.

**Satuan**
- Bulan (default), Kuartal, Tahun.
- Minggu tidak dipakai di v1: minggu ISO ambigu di pergantian tahun.
- Hari tidak dipakai di v1: 365 segmen kecil per tahun buruk untuk DuckDB dan GC.

**Sumber periode, per sheet**
- **Kolom tanggal** (disarankan bila ada kolom date/timestamp yang andal):
  - `_period = date_trunc(satuan, tanggal typed)`, tanggal naive (D8).
  - Satu file boleh berisi banyak periode; file dipecah menjadi satu segmen per periode dalam satu pass DuckDB.
- **Label** (untuk file tanpa kolom tanggal):
  - Pemilih periode sesuai satuan dataset, bukan teks bebas, dan terisi dari nama file (`laporan_2026-03.xlsx` → Maret 2026).
  - Bila ada kolom tanggal acuan, min/max-nya ditampilkan dan muncul peringatan untuk baris di luar label.
  - **Unggahan label selalu berhenti di konfirmasi**, karena label adalah pernyataan manusia.
- Nama file hanya saran, tidak pernah dianggap kebenaran.

**Baris tanpa tanggal valid**
- Default `REJECT`: tombol "Terapkan" nonaktif dan ≤ 20 contoh nomor baris ditampilkan.
- Pemilik bisa memilih "Buang N baris" secara eksplisit; jumlahnya dicatat di riwayat versi.
- **Tidak ada** keranjang "tanpa periode" dan tidak ada penugasan diam-diam ke periode dominan. Baris seperti itu tidak akan pernah bisa dilepas dan bertentangan dengan filter tanggal.

**Periode "kemungkinan nyasar"**
- Definisi: periode dengan baris < 10% periode terbesar di file yang sama (misalnya 3 baris bertanggal 31 Jan di file Februari).
- Selalu masuk tinjauan dengan default **"Kecualikan"**; jumlahnya ditampilkan dan dicatat.
- Pemilik bisa memilih "Masukkan"; dampaknya (periode ditambah, atau diganti utuh) ditampilkan.

**Aturan beku**
- `_period` dibekukan saat unggah.
- Di mode periode, ubah tipe/format kolom periode dan pilih ulang baris header ditolak, supaya recast tidak bisa memindahkan baris antarperiode.
- Mengganti sumber atau satuan periode harus lewat "Atur periode" ulang (versi `PERIOD_SETUP` baru) atau "Ganti semua data".

**Letak penyimpanan mode**
- Mode periode disimpan di versi dan sheet, bukan di dataset.
- Akibatnya, rollback ke versi sebelum periode diaktifkan mengembalikan dataset ke mode biasa dengan rapi.

**Mengaktifkan periode pada data yang sudah ada**
1. "Tinjau" menampilkan sebaran baris per periode, baris tanpa tanggal, dan proyeksi kapasitas. Kesalahan dd/mm vs mm/dd terlihat di tahap ini.
2. "Terapkan" menjalankan job sekali (biaya O(total)) yang memecah data aktif menjadi segmen per periode sebagai versi `PERIOD_SETUP`. Versi ini bisa di-rollback.

### 4.5 Alur unggah (dataset periode)

1. **Panel unggah.**
   - Dropzone utama: **"Tambah atau perbarui periode — periode yang sudah ada akan diganti, bukan digandakan"**.
   - Tautan sekunder: "Ganti semua data…", dengan konfirmasi "Semua 18 periode akan diganti".
   - Dataset non-periode tetap memakai panel yang sekarang, ditambah tautan "Ingin menyimpan data per bulan? Atur periode". Helper e2e lama tetap lolos.
2. **Init** membawa mode, label (untuk sheet berlabel), dan `baseVersionId`.
   - Resume-by-fingerprint harus cocok **mode dan label**; `InitOk` menggemakan mode efektif.
   - Kuota diproyeksikan dari ukuran file.
   - Perkiraan baris dihitung dari rasio byte/baris historis dataset. Hasilnya hanya peringatan, tidak memblokir.
3. **Worker:**
   1. Parse file ke prefix segmen baru.
   2. Cast dengan skema aktif tanpa inferensi (D4). Setiap segmen memakai jenis sumber dan locale-nya sendiri, jadi xlsx dan CSV id-ID yang bergantian antarbulan aman.
   3. Hitung vonis cast 98% **hanya atas baris baru**. Gagal → `AWAITING_MAPPING`.
   4. Hitung baris per periode (GROUP BY, ±62 ms per 10 jt baris).
   5. **Tolak lebih awal** bila melewati batas, supaya worker tidak terbuang:
      - mode label: setelah parse, sebelum typing
      - mode kolom: setelah query hitung per periode, sebelum `writeTyped` penuh
   6. Tulis segmen per periode.
   7. Jalankan `computePeriodPlan` (fungsi murni). Rencananya dibekukan di versi.
4. **Aktif otomatis** hanya bila semua syarat ini terpenuhi: murni menambah periode baru, masih dalam batas, mode kolom, dan tanpa peringatan.
   - `verifyVersionIntegrity` dijalankan, lalu versi diaktifkan dengan `sheetMap`.
   - Notifikasi: "Maret 2026 ditambahkan (12.950 baris) · Batalkan". Batalkan = rollback.
5. **Kasus lain menjadi `AWAITING_CONFIRM`.** Pemicunya: penggantian, pelepasan karena batas, penyusutan > 50%, periode kemungkinan nyasar, baris tanpa tanggal, label, atau file identik.
   - Layar tinjauan berisi tabel **Periode | Sekarang | Setelah | Keterangan** (Baru / Diganti / Dilepas karena batas 24 periode / Dikecualikan).
   - Aksi: "Lihat isi file" (grid pada versi tertunda), "Terapkan", "Batalkan upload".
   - Saat "Terapkan", bila versi aktif ≠ `baseVersionId` atau `schemaRevision` berubah → **`PLAN_STALE`**. Rencana dihitung ulang, lalu dikonfirmasi ulang bila ada yang merusak.
   - Versi yang tidak diputuskan dalam 7 hari dibuang otomatis.
6. **Banyak file sekaligus** (mengisi riwayat 12–24 bulan):
   - File diantre dan diproses berurutan ("File 3 dari 12"), karena hanya boleh ada satu versi non-terminal per dataset.
   - Antrean berhenti bila satu file butuh tinjauan.

### 4.6 Unggah ulang periode yang sudah ada

- Periode itu **diganti utuh** di setiap sheet yang ada di file. Periode lain tidak tersentuh, dan objeknya tidak ditulis ulang.
- Sheet yang tidak ada di file baru: default "Pertahankan data lama sheet itu", dan ini ditampilkan di tinjauan.
- Penyusutan > 50% wajib dicentang ("Saya paham Februari 2026 diganti dengan data yang lebih sedikit"). Ini mencegah bulan parsial menimpa bulan penuh.
- sha256 identik dengan file asal sebuah periode → "File ini identik dengan periode Maret 2026". Mengganti dengan data yang sama tidak berbahaya karena hasilnya idempoten.
- **Satu bulan > 1.048.576 baris (batas xlsx):**
  - v1 menyarankan ekspor CSV (tanpa batas baris, sampai 1 GiB).
  - Task opsional P-28: "satu periode dari beberapa file". Semua bagian diunggah sebagai satu kelompok yang mengganti periode utuh. Tidak memakai heuristik tumpang-tindih rentang tanggal.

### 4.7 Hapus, koreksi, pulihkan

**Kartu "Periode" di halaman dataset**
- Kolom: Periode, Baris per sheet, File, Diunggah oleh, Tanggal.
- Aksi: "Unggah ulang" (dengan periode terisi) dan "Hapus".

**Hapus periode**
- Membuat versi `PERIOD_REMOVE` yang hanya mengubah manifest. Aktif dalam hitungan detik tanpa job worker, dicatat di AuditLog, dan bisa di-rollback.
- Ditolak dengan `DATASET_BUSY` bila ada unggahan non-terminal.
- Periode terakhir tidak bisa dihapus; pengguna diarahkan ke "Ganti semua data".

**Koreksi bulan lama**
- Caranya: unggah ulang bulan itu.
- Koreksi untuk periode yang lebih tua dari jendela simpan, saat jendela sudah penuh, ditolak dengan `PERIOD_OUT_OF_WINDOW`. Menerimanya berarti melepas data yang lebih baru.

**"Pulihkan periode"**
- Menyalin referensi segmen satu periode dari versi lama yang **masih tersimpan** ke versi `PERIOD_RESTORE` baru, tanpa membatalkan periode lain.
- Dibatasi retensi versi; tidak ada penahanan GC tambahan.
- Bila versi lama sudah terhapus, aksi tidak tersedia dan ada penjelasannya.

### 4.8 Interaksi dengan versi (T-013)

- Setiap operasi periode menghasilkan tepat satu versi.
- Retensi tetap 3 READY + aktif (`VERSION_KEEP_READY`). Versi menjadi murah karena hanya manifest.
- Rollback mengaktifkan manifest lama. UI memperingatkan, misalnya "Mei 2026 yang ditambahkan setelahnya ikut hilang dari data aktif".
- Riwayat versi memakai kalimat seperti:
  - "Maret 2026 ditambahkan"
  - "Februari 2026 diganti (12.400 → 12.950 baris)"
  - "Maret 2024 dilepas (batas 24 periode)"
  - "Februari 2026 dihapus"
  - "Februari 2026 dipulihkan"
- Periode yang diganti atau dilepas hanya bisa dipulihkan lewat versi lama yang masih tersimpan. Teks konfirmasi menyebutkan hal ini.
- Penghapusan file sumber setelah 7 hari tidak berubah (berlaku per unggahan).

### 4.9 Pemetaan kolom dan skema (T-014 / T-008)

- **Kolom terlihat hilang atau judul berganti** → `AWAITING_MAPPING`. Pemetaan **hanya diterapkan pada segmen baru**; periode lama tidak berubah.
- **"Kosongkan"** = NULL **hanya untuk periode baru**. Kolom tidak menjadi absent, dan periode lama tetap berisi.
- **Kolom tambahan** menjadi kolom tersembunyi baru dengan posisi kanonik baru dan judul tersimpan. Periode lama bernilai NULL lewat proyeksi, tanpa cast ulang.
- **Ubah tipe tidak ditawarkan di layar pemetaan periode.** Pengguna diarahkan ke halaman Skema, tempat recast berjalan sebagai **job per segmen**:
  - prioritas di bawah ingest
  - deadline per segmen
  - progres "Segmen 7 dari 24"
  - bisa dilanjutkan setelah worker mati
  - revisi baru aktif atomik setelah semua segmen selesai
- **Rename yang sudah dikonfirmasi diingat sebagai alias kolom**, sehingga bulan berikutnya dengan judul yang sama terpetakan otomatis.
- **Perbaikan R5-1** (`sheetMap` diteruskan di `repo.finish`) dikerjakan lebih dulu (P-3), karena juga berguna untuk REPLACE.

### 4.10 Dashboard dan filter tanggal

- **Mode kolom:** widget dan query tidak berubah. Filter tanggal, preset, grain bulan/kuartal, dan line chart yang mengisi bulan kosong sudah bisa membandingkan periode. Optimasinya adalah pemangkasan segmen berdasarkan min/max.
- **Kolom sistem "Periode" (`_period`):**
  - Tersedia sebagai dimensi dan filter, terurut kronologis, dengan label seperti "Mar 2026".
  - Wajib untuk dataset mode label yang tidak punya kolom tanggal.
  - Bila namanya bentrok dengan kolom pengguna, tampil sebagai "Periode (sistem)".
  - Viewer hanya bisa memakainya bila pemilik memasangnya sebagai filter dashboard (D6).
- **Preset "Periode terbaru"** ditambahkan.
- **Cache hasil** sudah dikunci dengan `versionId`, jadi setiap operasi periode otomatis membatalkan cache lama.

### 4.11 Nasib T-015

**T-015 tidak dikerjakan seperti tertulis.** Di P-1, task ini ditutup sebagai digantikan lewat aitk (bukan dengan mengedit status manual). Alasannya ada di §4.1 opsi C.

**Yang dibawa dari T-015 dan peta kodenya:**

| Item | Pindah ke |
|---|---|
| Perbaikan `sheetMap` R5-1 | P-3 |
| Mode di `InitInput`/`validateInit`/create; resume mencocokkan mode (+ label); echo mode di `InitOk` | P-20 |
| `load()` worker memilih `rawKey/colCount/rawRows` dan daftar segmen aktif | P-20 |
| Vonis cast atas baris baru | P-20 |
| "Kosongkan" tidak membuat kolom absent; kolom tambahan mendapat posisi kanonik + judul tersimpan | P-25 |
| Kolom kuota `dataBytes`, dengan `sizeBytes` tetap ukuran unggahan | P-7 |
| Regex `deleteObject` diperluas ke kunci `seg/`; `removeStaleWorkDirs` juga membersihkan `mapping-*` | P-6 |
| Label progres dan riwayat versi, atribut `data-mode` untuk e2e, pola AC retensi dari `versions.spec.ts` | P-21, P-24, P-31 |

**Yang dibuang:**
- opsi UI "Tambah baris" tanpa kunci periode
- aritmetika offset `_row` pada union
- sintesis header union
- vonis cast atas seluruh union
- penyalinan objek sheet aktif ke prefix baru
- batas lebar K+E ≤ 2048 pada union

**Pemetaan AC T-015:**

| AC T-015 | Menjadi |
|---|---|
| AC1: 1.000 + 500 → 1.500 | AC1 P-20 (periode ditambahkan; objek Jan–Mar tidak ditulis ulang) |
| AC2: data lengkap setelah retensi | P-6 + e2e P-31 |
| AC3: kolom berganti nama → `AWAITING_MAPPING` | P-25 |

**Dokumen yang diperbarui di P-1:**
- flow-kerja A4: "Ganti semua data" / "Tambah atau perbarui periode".
- D4 diamandemen menjadi "versi = manifest segmen imutabel; self-contained secara logis; GC berbasis referensi".
- Keputusan baru: D15 (periode) dan D16 (Lihat data).

### 4.12 Fallback bila spike P-1 gagal

**Kriteria gagal** (salah satu cukup):
- `read_parquet` atas daftar 24 segmen p95 > 1,1× file tunggal
- jendela posisi → segmen > 50 ms
- binding daftar path tidak jalan di sandbox `@duckdb/node-api`
- segmen legacy (`_row INTEGER`) dan segmen baru (`_row BIGINT`) tidak bisa dibaca bersama

**Bila gagal, pakai opsi E (union self-contained berbatas):**
- Commit menggabungkan **typed** aktif (minus periode yang diganti/dilepas) dengan typed baru **tanpa cast ulang** baris lama. Typing tetap O(baris baru), tetapi I/O O(total).
- `_period` ditulis di raw dan typed; `_row` tetap unik.
- v1 mewajibkan jenis sumber sama dengan versi aktif (`PERIOD_SOURCE_MISMATCH`), untuk mencegah salah baca locale.
- Batas tambahan `PERIOD_VERSION_MAX_BYTES` disesuaikan dengan kuota.

**Yang tetap sama:** UX, `computePeriodPlan`, `verifyVersionIntegrity`, layar tinjauan, dan semua task P-17 dst. Yang diganti hanya P-4–P-6 dan P-8.

**Konsekuensi yang harus dikomunikasikan:** dengan 1 GB/bulan, hanya ±3 periode yang muat di kuota 20 GiB.

---

## 5. Batas dan retensi

### 5.1 Prinsip

1. Semua batas dievaluasi pada **kunci periode utuh** dan bersifat keras: tidak pernah dilampaui dan tidak pernah memotong periode.
2. Urutan evaluasi:
   1. Hitung proyeksi: periode aktif − diganti − dikecualikan + baru.
   2. Bila melewati batas dan `onLimit=EVICT_OLDEST`: lepas periode **terlama menurut kunci periode** (bukan tanggal unggah), utuh, di semua sheet. Periode dari unggahan yang sedang diproses tidak pernah dilepas.
   3. Bila masih melewati batas, atau `onLimit=REJECT`: tolak sebelum commit, dengan nama batas dan periodenya.
3. Semua pemeriksaan terjadi **sebelum aktivasi**:
   - byte dan kuota: saat init
   - baris: setelah cast, di rencana
   - Tidak ada pemangkasan setelah versi aktif.

### 5.2 Nilai default (env, diatur admin)

Pengaturan pemilik per dataset hanya boleh lebih rendah dari batas admin.

| Env / pengaturan | Default | Satuan dan arti |
|---|---|---|
| `PERIOD_KEEP_DEFAULT` | 24 | Periode yang disimpan per dataset ("Simpan N periode terbaru"). Dihitung per kunci periode yang ada, bukan kalender, sehingga unggahan terlambat tidak melepas data diam-diam |
| `PERIOD_KEEP_MAX` | 60 | Batas atas pengaturan pemilik; sekaligus membatasi jumlah file per query |
| `PERIOD_SHEET_MAX_ROWS` | 10.000.000 | Baris data per sheet, dijumlah atas semua periode versi baru. Skala terverifikasi D10/T-009 |
| `DATASET_MAX_DATA_BYTES` | 16 GiB | Byte parquet unik (raw + typed) yang dirujuk versi aktif |
| `PERIOD_SHEET_MAX_SEGMENTS` | 120 | Segmen per sheet, supaya daftar file DuckDB tetap kecil |
| `PERIOD_MAX_FILES` | 10 | File per periode (hanya bila P-28 dibangun) |
| `PERIOD_WARN_PCT` | 80 | Ambang peringatan untuk semua batas |
| `PERIOD_SHRINK_CONFIRM_PCT` | 50 | Penggantian yang menyusut lebih dari ini wajib dicentang |
| `PERIOD_STRAY_PCT` | 10 | Periode dengan baris < 10% periode terbesar di file dianggap "kemungkinan nyasar" |
| `PERIOD_CONFIRM_TTL_HOURS` | 168 | `AWAITING_CONFIRM` dibuang otomatis setelah 7 hari |
| `SEGMENT_GC_GRACE_HOURS` | 24 | Masa tenggang sebelum objek tak terujuk dihapus |
| `USER_STORAGE_QUOTA_BYTES` | 20 GiB (tetap) | **Makna berubah:** dihitung dari byte nyata (§5.7) |
| `QUOTA_GRACE_DAYS` | 14 | Masa transisi makna kuota; pelanggaran hanya diberi peringatan |
| `VERSION_KEEP_READY` | 3 (+ aktif) | Tidak berubah |
| Pengaturan dataset | `onLimit=REJECT`, `missingDatePolicy=REJECT`, satuan Bulan | Pemilik bisa memilih `EVICT_OLDEST` (jendela bergulir) dan "Buang N baris" secara eksplisit |
| Tidak berubah | `MAX_UPLOAD_BYTES` 1 GiB; xlsx 1.048.576 baris/sheet; `MAX_RAW_COLS` 2.048; `INGEST_DEADLINE_MS` 60 menit; `RECAST_DEADLINE_MS` 20 menit (kini per segmen) | Batas per file dan per job |

Batas Lihat data:

| Env | Default |
|---|---|
| `GRID_BLOCK_ROWS` / `GRID_WINDOW_MAX_ROWS` | 200 / 500 |
| `GRID_MAX_COLS` | 64 |
| `GRID_CELL_CHARS` / isi sel penuh | 500 / 32.767 |
| `GRID_RATE_PER_MIN` | 300 per pengguna (terpisah dari 600 untuk query) |
| `GRID_MAX_CONCURRENCY` / in-flight per pengguna | 2 dari 4 slot global / 2 |
| `GRID_SEARCH_TIMEOUT_MS` / kolom cari | 10.000 / 10 |
| `GRID_COPY_MAX_ROWS` | 1.000 |
| `GRID_ORDER_CACHE_BYTES` / TTL | 1 GiB / 30 menit (hanya bila P-30 dibangun) |
| Ekspor tampilan | Mengikuti T-017 (≤ 1 jt baris) |

### 5.3 Saat batas tercapai

- **`REJECT` (default):** unggahan ditolak setelah cast (atau lebih awal, lihat §4.5), dan data aktif tidak berubah. Contoh pesan: "Menyimpan April 2026 akan melewati batas 24 periode. Hapus periode Maret 2024 dulu, atau ubah pengaturan 'Saat batas tercapai'."
- **`EVICT_OLDEST` (opsi pemilik):** periode terlama dilepas utuh, dan versi selalu berhenti di `AWAITING_CONFIRM`. Contoh pesan: "Mengunggah April 2026 akan melepas Maret 2024 dari data aktif (batas 24 periode). Masih bisa dipulihkan selama versi lama tersimpan."
- **Periode lebih tua dari periode tertua saat jendela penuh:** ditolak dengan pesan "Periode Jan 2024 di luar batas simpan 24 periode."
- **Efek chunk utuh:** sheet bisa berhenti sedikit di bawah batas baris, karena periode utuh berikutnya yang tidak muat dilepas, bukan dipotong.

### 5.4 Peringatan sebelum batas

Ketika pemakaian ≥ 80% dari batas mana pun, kartu Periode dan panel unggah menampilkan:
- **Meter**, misalnya: "18 dari 24 periode · 8,2 jt dari 10 jt baris (sheet Pengiriman) · 11,3 dari 16 GB · kuota 14,8 dari 20 GB".
- **Proyeksi kapasitas yang jujur**, misalnya: "Dengan rata-rata 1,0 jt baris per bulan, dataset ini menyimpan ±10 bulan" dan "±1 unggahan lagi akan menyentuh batas".
- **Perkiraan saat init** dari ukuran file, misalnya: "Perkiraan ±14 jt baris, kemungkinan ditolak". Hanya peringatan, tidak memblokir.

### 5.5 Satu periode melebihi batas

- Ditolak dengan `PERIOD_TOO_LARGE`; data aktif tidak berubah. Contoh pesan: "Periode Mei 2026 berisi 14,2 juta baris, melebihi batas 10 juta baris per sheet. Hubungi admin untuk menaikkan batas, atau unggah hanya sheet/kolom yang diperlukan."
- Periode tidak pernah dipecah. Tidak ada opsi "lepas semua periode lain", karena hasilnya tetap melebihi batas.
- Dengan nilai default, kasus ini hampir tidak mungkin: xlsx maksimum 1.048.576 baris/sheet, dan CSV 1 GiB ±8 jt baris. Kasus ini baru relevan bila admin menurunkan batas.

### 5.6 Retensi versi dan GC

- Retensi versi tetap 3 READY + aktif.
- Objek segmen dihapus oleh mark-and-sweep (§4.3), bukan berdasarkan prefix versi.
- Kunci legacy di prefix versi lama juga hanya dihapus bila sudah tidak dirujuk.

### 5.7 Kuota

**Rumus pemakaian**, jumlah dari:
- byte segmen unik yang dirujuk versi hidup (raw + typed semua revisi yang dirujuk; setiap segmen dihitung sekali)
- byte file sumber yang belum dihapus
- ukuran terdeklarasi unggahan yang masih `UPLOADING`

`sizeBytes` tetap berarti ukuran file unggahan, karena logika multipart bergantung padanya.

**Pemeriksaan**
- Saat init: proyeksi dari ukuran file + perkiraan parquet. Bila melewati kuota → `QUOTA_EXCEEDED` "terpakai X dari Y", sebelum byte pertama terunggah.
- Setelah cast: diperiksa ulang dengan byte segmen nyata.
- Kuota **tidak pernah** dipenuhi dengan melepas data dari dataset lain.

**Transisi**
- Laporan pemakaian per pengguna dicetak lebih dulu.
- Selama 14 hari pelanggaran hanya diberi peringatan.
- e2e kuota diperbarui.

**Gambaran kapasitas**
- 1 GB xlsx ≈ 1,2 GB parquet.
- Satu dataset 1 GB/bulan × 10 bulan ≈ 12 GB, ditambah periode diganti yang masih ditahan dan file sumber 7 hari, total ≈ 14 GB. Masih muat di 20 GiB.
- Dataset 300 rb baris/bulan × 24 bulan ≈ 7,2 jt baris, sekitar 8–9 GB.

### 5.8 Ukuran disk (masuk runbook T-023 di P-31)

- Volume RustFS ≥ Σ kuota pengguna yang diharapkan + 20%.
- Cache lokal app: `MAX_LOCAL_PARQUET_BYTES` 10 GiB. Pertimbangkan 20 GiB bila dataset periode banyak dipakai.
- Tmp worker ≥ 5 GB per replika.
- Cache urutan 1 GiB, bila P-30 dibangun.
- Backup harus inkremental atau dedup (misalnya restic). Kunci segmen imutabel, jadi satu unggahan bulanan menambah backup sekitar ukuran parquet periodenya.

---

## 6. Risiko dan mitigasi

| # | Risiko | Dampak | Mitigasi |
|---|---|---|---|
| R1 | Bug GC menghapus segmen yang masih dirujuk versi hidup | Data hilang diam-diam | • Mark-and-sweep tanpa counter, tenggang 24 jam.<br>• Hanya kunci tak terujuk di `seg/` dan prefix legacy yang dihapus.<br>• Job malam HEAD semua kunci terujuk + alert.<br>• `verifyVersionIntegrity` sebelum aktivasi.<br>• Test retensi → cleanup → query → rollback. |
| R2 | Refactor segmen menyentuh 13 modul `typedKey`, lease satu kunci, dan retensi berbasis prefix | Regresi luas | • Spike P-1 dengan kriteria gagal.<br>• Fase 1 tanpa perubahan perilaku: satu segmen per sheet, migrasi metadata, semua e2e hijau, baseline T-009/T-011 ≤ +10%.<br>• Fallback opsi E. |
| R3 | Periode salah: label keliru, satu baris nyasar menimpa periode lain, atau dd/mm vs mm/dd | Data periode yang benar tertimpa | • Unggahan label selalu dikonfirmasi; min/max kolom acuan dicek.<br>• Periode kecil default "Kecualikan".<br>• Tinjauan Sekarang → Setelah; centang bila menyusut > 50%.<br>• Pratinjau sebaran saat Atur periode.<br>• Rollback dan "Pulihkan". |
| R4 | Baris tanpa tanggal valid | Data hilang, atau baris yang tidak bisa dilepas | Default `REJECT` dengan contoh nomor baris. "Buang N baris" harus eksplisit dan tercatat. Tidak ada keranjang tersembunyi. |
| R5 | Perlombaan antara rencana dan konfirmasi (rollback atau recast terjadi di tengah) | Rencana diterapkan ke basis yang salah | Pin `baseVersionId` + `schemaRevision`. `PLAN_STALE` menghitung ulang dan meminta konfirmasi ulang. `DATASET_BUSY` tetap berlaku. |
| R6 | `_period` bergeser karena recast kolom tanggal atau pilih ulang header | Baris pindah periode | `_period` dibekukan saat unggah. Ubah tipe/format kolom periode dan pilih ulang header diblokir di mode periode. |
| R7 | Pelepasan periode otomatis mengejutkan pengguna | Data lama hilang dari dashboard | Default `REJECT`. `EVICT_OLDEST` adalah opsi pemilik yang selalu ditinjau. Meter dan proyeksi di 80%. Riwayat versi eksplisit. |
| R8 | Batas 10 jt baris hanya muat ±10 bulan untuk data 1 jt/bulan | YoY tidak muat | Proyeksi kapasitas di UI. P-29/P-31 mengukur 13 jt baris sebagai dasar menaikkan batas (Q2). |
| R9 | `AWAITING_CONFIRM` dibiarkan menggantung | Unggahan lain terblokir | Banner untuk pemilik, tombol "Batalkan", dibuang otomatis setelah 7 hari, dan sapuan pemulihan mencakup status baru. |
| R10 | Grid membanjiri sumber daya query | Dashboard lambat atau QUERY_BUSY | Rate terpisah, maksimal 2 dari 4 slot global, blok tidak masuk LRU, debounce/abort di klien, dan uji beban P-29 dengan anggaran latensi widget. |
| R11 | Kebocoran akses lewat grid | Viewer membaca kolom di luar widget (melanggar D6) | Endpoint sheet hanya untuk pemilik/editor lewat T-016. Viewer hanya "Perbesar". 403/400 tanpa nama. Uji keamanan respons. |
| R12 | Urut/saring dalam pada 10 jt baris lambat (±1,5 s di M4; lebih lambat di 4 vCPU dan sheet lebar) | Scroll tersendat, timeout | Target terukur di P-29, cache urutan P-30 bersyarat, pesan timeout yang ramah. |
| R13 | Batas tinggi scroll browser (Firefox ±17,9 jt px) | Baris terakhir tidak tercapai | Stretching dari library, "Ke baris N" + penunjuk posisi, uji Firefox 10 jt baris di P-2/P-29, fallback paging blok. |
| R14 | Library grid: React 19/CSP, impor enterprise tak sengaja, bobot bundle, perubahan lisensi | Watermark, pelanggaran CSP, halaman berat | Spike P-2, lint melarang `ag-grid-enterprise`, versi dipin, rute lazy ≤ 300 KB, lisensi dicek ulang saat implementasi. |
| R15 | Ekspektasi "seperti Excel" (edit, rumus, seret-pilih) | Kecewa saat UAT | Label "baca-saja" dan daftar cakupan keluar di UI/panduan; gerbang Q6 untuk salin rentang. |
| R16 | Salinan ke Excel salah dibaca (koma/titik) atau injeksi formula | Angka salah, formula ikut jalan | Angka tanpa pemisah ribuan, pilihan pemisah desimal, tanggal ISO, netralisasi `= + - @` hanya di sel teks. |
| R17 | Makna kuota berubah | Pengguna lama tiba-tiba mendekati atau melewati kuota | Laporan pemakaian, 14 hari hanya peringatan, admin menyesuaikan dengan disk. |
| R18 | Recast 24 segmen melewati deadline 20 menit | Ubah skema gagal | Job per segmen dengan deadline sendiri, bisa dilanjutkan, prioritas di bawah ingest, swap revisi atomik. |
| R19 | Banyak segmen kecil | Overhead metadata DuckDB | Satuan minimal Bulan, ≤ 120 segmen/sheet, ≤ 10 file/periode; kompaksi menjadi opsi nanti. |
| R20 | Resume-by-fingerprint mengabaikan mode atau label | Pilihan lama dipakai diam-diam | Fingerprint mencocokkan mode + label; `InitOk` menggemakan mode efektif. |
| R21 | Rencana ini baru berjalan setelah T-016/T-017/T-023/T-024 | Asumsi bentuk API sudah berubah | Setiap task Fase 2/3 diawali pengecekan ulang kontrak T-016 (authz) dan T-017 (ekspor). |

---

## 7. Rencana task bertahap

- **Kapan dikerjakan:** setelah semua task yang terbuka sekarang selesai.
- **Kode P-n bersifat sementara.** Saat dibuat lewat `aitk task new`, setiap task mendapat ID T-0xx, dan dependensinya ditulis ulang.
- **Urutan fase:**
  - Fase 0: keputusan dan spike (P-1 dan P-2 paralel; P-3 kecil).
  - Fase 1: fondasi segmen, tanpa perubahan perilaku.
  - Fase 2 (Lihat data) dan Fase 3 (periode) bisa berjalan paralel setelah Fase 1.
  - Fase 4: ukur, e2e, dokumentasi.
- **Bila P-1 memilih fallback (§4.12):** P-4–P-6 dan P-8 diganti task union berbatas; P-17 dst. tetap.
- **Perkiraan total:** ±75–85 hari kerja, belum termasuk P-28 (opsional) dan P-30 (bersyarat).

### 7.1 Pemetaan kode P ke task aitk

Dibuat 2026-10-15. Tag `strict` di tabel di bawah menjadi profil `strict` task. T-034 (P-1) dan T-035 (P-2) bergantung pada semua task yang terbuka saat rencana dibuat (T-016–T-018, T-020–T-024, T-028–T-033), sehingga `aitk task next` baru menawarkan rencana ini setelah semuanya selesai.

| Kode | Task | Kode | Task | Kode | Task | Kode | Task |
|---|---|---|---|---|---|---|---|
| P-1 | T-034 | P-9 | T-041 | P-17 | T-049 | P-25 | T-057 |
| P-2 | T-035 | P-10 | T-042 | P-18 | T-050 | P-26 | T-058 |
| P-3 | T-033 (bug, antrean biasa) | P-11 | T-043 | P-19 | T-051 | P-27 | T-059 |
| P-4 | T-036 | P-12 | T-044 | P-20 | T-052 | P-28 | T-060 |
| P-5 | T-037 | P-13 | T-045 | P-21 | T-053 | P-29 | T-061 |
| P-6 | T-038 | P-14 | T-046 | P-22 | T-054 | P-30 | T-062 |
| P-7 | T-039 | P-15 | T-047 | P-23 | T-055 | P-31 | T-063 |
| P-8 | T-040 | P-16 | T-048 | P-24 | T-056 | P-32 | T-064 |

### Fase 0: keputusan dan spike

| Kode | Judul | AC (Given/When/Then) | Tag | Dependensi | Perkiraan |
|---|---|---|---|---|---|
| P-1 | Spike penyimpanan segmen per periode dan tetapkan ADR model data periode | 1. Given 24 segmen typed × 400 rb baris dan satu file gabungan 9,6 jt baris (fixture T-024, profil T-023), when group-by, tabel berhalaman, count, dan filter-values dijalankan lewat `read_parquet([daftar])`, then hasil identik dan p95 ≤ 1,1× file tunggal, tercatat di `docs/ai/perf/<task>.md`<br>2. Given pemetaan posisi global → (segmen, file_row_number), when jendela 200 baris diminta di 100 posisi acak, then p95 ≤ 50 ms dan barisnya benar<br>3. Given daftar path sebagai parameter di `@duckdb/node-api` dengan sandbox aktif, serta campuran segmen legacy (`_row INTEGER`) dan baru (`_row BIGINT`, kolom tambahan diproyeksikan `NULL AS c<pos>`), when di-query, then tanpa error dan hasil benar<br>4. Given hasil spike, then ADR (aitk adr new) berstatus accepted memuat opsi A–F, tabel biaya ops per unggahan, keputusan, dan kriteria fallback; flow-kerja A4, D4 (diamandemen), D15, dan D16 diperbarui; T-015 ditutup sebagai digantikan lewat aitk dengan rujukan ke task baru | architecture, adr, perf, spike | T-024 | 3–4 hari |
| P-2 | Spike komponen grid: AG Grid Community vs Glide Data Grid di React 19/Next 16 | 1. Given prototipe kedua grid dengan sumber data sintetis 10.000.000 baris, when digulir/diseret ke akhir di Chrome, Safari, dan Firefox, then baris terakhir tercapai dan "Ke baris 9.999.999" tepat<br>2. Given header CSP T-027 aktif, when grid dimuat, then nol pelanggaran CSP, chunk rute lazy ≤ 300 KB gzip, dan aturan lint menggagalkan impor `ag-grid-enterprise`<br>3. Given checklist keyboard/ARIA (NVDA/VoiceOver), tema token terang/gelap, ikon Tabler, dan salin sel ke Excel, then hasil per kandidat tercatat dan ADR memilih satu komponen dengan versi dipin, syarat lisensi terkini, dan fallback (TanStack Virtual + paging blok) | ui, spike, adr | – | 2–3 hari |
| P-3 | Teruskan sheetMap saat aktivasi ingest biasa (R5-1) | 1. Given widget pada sheet dengan rantai alias ambigu, when file "Ganti semua" diaktifkan otomatis, then widget tetap terpasang dan tidak `SHEET_UNAVAILABLE`<br>2. Given unit test ingest dan `FakeRepo.finish`, then `sheetMap` dari loop sheet `ingest.ts` diteruskan ke `repo.finish` → `activateVersionInTx` dan teruji | bug, ingest | – | 0,5–1 hari |

### Fase 1: fondasi segmen (tanpa perubahan perilaku)

| Kode | Judul | AC (Given/When/Then) | Tag | Dependensi | Perkiraan |
|---|---|---|---|---|---|
| P-4 | Pindahkan penyimpanan sheet ke model segmen + manifest versi lewat migrasi metadata | 1. Given database berisi dataset lama, when migrasi berjalan, then setiap Sheet punya tepat satu segmen legacy (`rowBase` 0) yang merujuk `rawKey`/`typedKey` lamanya tanpa objek disalin, dan seluruh test + e2e lolos tanpa perubahan<br>2. Given segmen baru ditulis, then typed memuat `c<pos>` kanonik, `_row BIGINT = rowBase + baris fisik` (unik per sheet logis, tidak pernah dipakai ulang, sama di setiap recast), dan `_src_row`, sementara `SheetLineage.rowHighWater` naik secara atomik<br>3. Given REPLACE, rollback, atau aktivasi dengan `sheetMap`, then `lineageId` terbawa ke sheet versi baru | data-model, migration, strict | P-1, P-3 | 4–5 hari |
| P-5 | Baca daftar segmen di lapisan query dan cache parquet | 1. Given sheet dengan 1 dan 24 segmen, when semua jenis widget, filter-values, sampel skema, dan count dijalankan, then hasil identik dengan satu file gabungan dan baseline T-009/T-011 tidak memburuk > 10%<br>2. Given cache dingin pada sheet 24 segmen, when dashboard dibuka, then semua kunci disewa dalam satu admission (batch lease) tanpa QUERY_BUSY berulang, dan batas unduhan bersamaan tetap berlaku<br>3. Given segmen dengan set kolom berbeda, then query memproyeksikan `NULL AS c<pos>` dan kunci cache hasil tetap memuat `versionId`<br>4. Given versi baru aktif dengan satu segmen tambahan, then hanya segmen baru yang di-prefetch ke cache lokal app | query, perf | P-4 | 4–5 hari |
| P-6 | Ganti retensi dan pembersihan menjadi mark-and-sweep segmen dengan gerbang integritas | 1. Given segmen yang dirujuk versi hidup (aktif, READY tersimpan, non-terminal), when retensi dan cleanup berjalan, then objeknya tidak dihapus; segmen tak terujuk ≥ `SEGMENT_GC_GRACE_HOURS` dihapus beserta raw dan typed semua revisinya<br>2. Given job invarian malam, when ada kunci terujuk yang hilang, then alert tercatat di log dan status admin<br>3. Given `verifyVersionIntegrity` sebelum aktivasi menemukan selisih (jumlah baris ≠ metadata, `_row` ganda, atau kunci terujuk tidak ada), then versi FAILED dan versi aktif tidak berubah<br>4. Given crash di tengah unggahan atau pemetaan, then objek yatim di `seg/` dan direktori kerja `mapping-*` dibersihkan (regex `deleteObject` diperluas)<br>5. Given test berulang retensi → cleanup → query → rollback, then tidak ada kunci terujuk yang hilang | data-safety, storage, strict | P-4 | 3–4 hari |
| P-7 | Hitung kuota dari byte data yang benar-benar tersimpan | 1. Given pengguna dengan segmen hidup, file sumber yang belum dihapus, dan versi UPLOADING, when kuota dihitung, then pemakaian = byte segmen unik terujuk + byte sumber tersimpan + ukuran terdeklarasi UPLOADING, dengan setiap segmen dihitung sekali<br>2. Given proyeksi melewati `USER_STORAGE_QUOTA_BYTES`, when init, then `QUOTA_EXCEEDED` "terpakai X dari Y" sebelum byte pertama terunggah, `sizeBytes` tetap ukuran file, dan test multipart lama lolos<br>3. Given migrasi makna kuota, then laporan pemakaian per pengguna tercetak, selama `QUOTA_GRACE_DAYS` pelanggaran hanya diberi peringatan, banner tampil di ≥ 80%, dan e2e kuota diperbarui | quota, security, migration | P-6 | 2 hari |
| P-8 | Jalankan ubah tipe kolom/recast sebagai job per segmen | 1. Given sheet 24 segmen, when pemilik mengubah tipe kolom, then job per segmen berjalan dengan prioritas di bawah ingest, progres "Segmen 7 dari 24" tampil, dan revisi baru aktif atomik hanya setelah semua segmen selesai<br>2. Given worker mati di tengah recast, when worker hidup lagi, then segmen yang sudah selesai tidak diulang dan hasil akhir identik<br>3. Given versi lama berbagi segmen, when recast selesai, then typed revisi lama tetap utuh sehingga rollback tetap bisa<br>4. Given kolom tersembunyi baru ditambahkan, then segmen lama tidak di-cast ulang (diproyeksikan NULL) | worker, schema | P-5 | 3–4 hari |

### Fase 2: Lihat data

| Kode | Judul | AC (Given/When/Then) | Tag | Dependensi | Perkiraan |
|---|---|---|---|---|---|
| P-9 | Sediakan endpoint jendela baris sheet untuk pemilik dan editor | 1. Given pemilik/editor dan sheet aktif 10 jt baris, when `POST /api/sheets/:sheetId/rows {versionId, rowStart 9.999.800, rowCount 200, cols ≤ 64}` tanpa urut/saring, then 200 baris benar kembali (`n`, `_row`, `cells`, `cut`) dengan p95 server ≤ 300 ms lewat jendela `file_row_number`, dan hanya segmen yang beririsan yang disewa<br>2. Given viewer, pengguna asing, posisi kolom tersembunyi, atau batas dilewati (rowCount > 500, cols > 64, sort > 3, filter > 20, cari > 100 karakter/10 kolom), then 403/400 tanpa nama kolom/sheet di body; identifier hanya `c<pos>`/`_row`/`_period` dan nilai selalu dikirim sebagai parameter<br>3. Given `versionId` ≠ versi aktif, then 409 `VERSION_CHANGED` + `activeVersionId`, kecuali pemilik yang meminta versi `AWAITING_CONFIRM` miliknya<br>4. Given urut ≤ 3 kolom dan filter, when jendela yang sama diminta dua kali, then barisnya identik (pemutus seri `_row`); `GET …/cell` mengembalikan isi penuh ≤ 32.767 karakter, nilai raw bila cast gagal, dan sumber (file, baris asli, periode) | api, security, perf, strict | P-5, P-2, T-016 | 3–4 hari |
| P-10 | Pisahkan batas laju, slot, dan cache grid dari query widget | 1. Given pengguna menggulir sampai 300 permintaan/menit, when dashboard miliknya dimuat bersamaan, then widget tidak terkena RATE_LIMITED karena aturan rate grid terpisah<br>2. Given permintaan grid, then grid memakai maksimal 2 dari 4 slot global dan 2 in-flight per pengguna, dan blok grid tidak masuk cache hasil 64 MiB (hanya count dan ringkasan yang masuk)<br>3. Given 5 pengguna menggulir sheet 10 jt + dashboard 6 widget, then p95 widget ≤ 2× baseline T-012 dan tidak ada QUERY_BUSY pada widget | perf, security | P-9 | 1,5 hari |
| P-11 | Bangun halaman "Lihat data" bergaya lembar kerja (baca-saja) | 1. Given pemilik/editor klik "Lihat data", when halaman dimuat, then grid menampilkan sheet aktif dengan huruf kolom + nama + ikon tipe, header dan nomor baris beku, tab sheet di bawah, format id-ID (angka, `d Mmm yyyy`, Rp, Ya/Tidak, NULL kosong), dan status "Baris 1–40 dari 9.812.334"<br>2. Given sheet 10 jt tanpa urut, when "Ke baris 9.000.000" atau Ctrl+End, then baris itu tampil ≤ 1 detik, termasuk di Firefox<br>3. Given lebar kolom diubah atau di-autofit, kolom dibekukan (≤ 3), disembunyikan, atau digeser, when halaman dibuka lagi, then pengaturan pulih per (sheet, revisi skema); bila `localStorage` diblokir, grid tetap berfungsi<br>4. Given versi berganti saat menggulir, then muncul banner "Data sudah diperbarui — Muat ulang" dan tidak ada baris dari dua versi yang tercampur | ui | P-9, P-2 | 4–5 hari |
| P-12 | Tambahkan urut multi-kolom, saring per kolom, dan cari di Lihat data | 1. Given klik header (naik → turun → tanpa urut) atau Shift+klik (≤ 3 kolom), then urutan dihitung server, `aria-sort` benar, dan nomor baris mengikuti urutan baru<br>2. Given menu saring (Alt+↓) berupa daftar nilai + cari untuk teks, rentang untuk angka, serta rentang + preset untuk tanggal, when diterapkan, then chip saringan tampil, status "x baris (tersaring dari y)", dan "Hapus semua saringan" berfungsi<br>3. Given Ctrl+F "jakarta" di dalam grid, then hanya baris yang mengandung teks itu di ≤ 10 kolom teks terlihat yang tampil, sel cocok disorot, muncul "Ditemukan di N baris", dan pencarian dibatasi 10 detik serta bisa dibatalkan<br>4. Given urut teks pada 10 jt baris melewati `QUERY_TIMEOUT_MS`, then tampil "Pengurutan ini terlalu berat; saring data dulu" dan grid tetap bisa dipakai | ui, api | P-11, P-10 | 3–4 hari |
| P-13 | Tambahkan panel Isi sel, salin ke Excel, dan ringkasan kolom | 1. Given sel terpotong atau gagal cast dipilih (F2/Enter), then panel Isi sel menampilkan isi lengkap, nilai asli + "Tidak terbaca sebagai <tipe>" untuk sel gagal cast, dan sumber "maret-2026.xlsx · baris 1.234 · Maret 2026"<br>2. Given sel fokus, when Ctrl/Cmd+C, then nilai terbaca Excel sebagai angka/tanggal (tanpa pemisah ribuan, desimal sesuai pilihan koma/titik, tanggal ISO)<br>3. Given ≤ 1.000 baris dipilih lewat nomor baris, when Ctrl+C, then TSV + baris judul tersalin, sel teks berawalan `= + - @` dinetralkan, dan angka negatif tidak berubah; pilihan > 1.000 baris memunculkan tawaran "Unduh tampilan"<br>4. Given kolom angka dipilih, then bilah status menampilkan Jumlah, Rata-rata, Min, Maks, dan Hitung atas seluruh baris tersaring, sama dengan widget KPI setara | ui, security | P-11 | 2,5–3 hari |
| P-14 | Unduh tampilan Lihat data lewat job ekspor | 1. Given saringan, urutan, dan kolom terlihat aktif, when "Unduh tampilan" CSV/XLSX, then job T-017 menghasilkan file dengan kolom, urutan, dan baris sama dengan grid (diuji pada fixture 1.000 baris), tautan presigned berlaku 1 jam, dan AuditLog tercatat<br>2. Given tampilan melewati batas T-017, then dialog menjelaskan batasnya (termasuk batas Excel 1.048.575 baris untuk XLSX) dan menyarankan saringan; file tidak pernah dipotong diam-diam<br>3. Given viewer mencoba mengekspor tampilan sheet, then FORBIDDEN | api, security, ui | P-12, T-017 | 2 hari |
| P-15 | Tampilkan widget tabel layar penuh ("Perbesar") untuk viewer | 1. Given viewer dashboard bersama, when "Perbesar" pada widget tabel, then tabel layar penuh bergaya lembar kerja memakai `/api/query {widgetId, dashboardFilters, page, sort}` yang sama, hanya dengan kolom widget, tanpa tautan Lihat data<br>2. Given viewer membuka URL Lihat data atau endpoint sheet secara langsung, then ditolak tanpa menampilkan nama kolom tersembunyi atau lama<br>3. Given pemilik/editor, when "Perbesar", then tersedia tautan "Buka di Lihat data" | ui, security | P-11, T-016 | 1,5 hari |
| P-16 | Sesuaikan Lihat data untuk ponsel, keyboard, dan pembaca layar | 1. Given lebar 360 px, then halaman tidak bergulir horizontal, hanya nomor baris yang beku, toolbar terlipat ke "Lainnya", urut/saring di bottom sheet, ketuk sel membuka isi penuh, dan target sentuh ≥ 44 px<br>2. Given hanya keyboard, then panah, Tab, PageUp/Down, Home/End, Ctrl+Home/End, Alt+↓, F2/Enter, Ctrl+F, dan Shift+Spasi berfungsi dengan fokus terlihat<br>3. Given axe dan NVDA/VoiceOver, then `role=grid`, `aria-rowcount` = total + 1, `aria-colcount`, dan `aria-rowindex` nyata terpasang, status memuat diumumkan, axe tanpa pelanggaran serius, dan `/frontend-expert:audit` tanpa Critical/High | ui, a11y, responsive | P-12, P-13 | 1,5–2 hari |

### Fase 3: data per periode

| Kode | Judul | AC (Given/When/Then) | Tag | Dependensi | Perkiraan |
|---|---|---|---|---|---|
| P-17 | Siapkan model data periode: mode versi, status AWAITING_CONFIRM, kolom `_period`, dan aturan beku | 1. Given migrasi, then `VersionMode` = REPLACE/PERIOD/PERIOD_SETUP/PERIOD_REMOVE/PERIOD_RESTORE (migrasi gagal dengan pesan bila ada baris APPEND); `AWAITING_CONFIRM` masuk semua daftar non-terminal dan peta label (memblokir unggahan dan rollback seperti `AWAITING_MAPPING`); Segment punya `periodKey`, `periodStart`, `minDate/maxDate`, `sha256`, `originalName`, dan `sourceKind`<br>2. Given dataset non-periode, when ingest, recast, mapping, dan query berjalan, then layout parquet dan hasil identik dengan sebelumnya (tanpa `_period`, test lama lolos)<br>3. Given versi periode, then `periodGrain`/`periodSource` tersimpan di versi/sheet (bukan dataset), `_period` tertulis di typed segmen dan bertahan saat recast, sedangkan ubah tipe/format kolom periode dan pilih ulang header ditolak dengan pesan<br>4. Given `verifyVersionIntegrity` pada versi periode, then pemeriksaan juga mencakup `_period` NULL di baris data dan kesesuaian jumlah baris per periode dengan metadata | data-model, data-integrity, migration, strict | P-6, P-8 | 2–3 hari |
| P-18 | Hitung rencana periode dan batas sebagai fungsi murni `computePeriodPlan` | 1. Given periode aktif, periode file baru, pengaturan dataset, dan batas env, when `computePeriodPlan` dijalankan, then hasilnya daftar periode ditambah/diganti/dilepas/dikecualikan/ditolak beserta baris sebelum → sesudah, tanpa pernah menyisakan periode sebagian<br>2. Given batas terlewati dengan `onLimit=EVICT_OLDEST`, then yang dilepas adalah periode terlama menurut kunci periode, utuh, dan tidak pernah periode dari unggahan ini; given `onLimit=REJECT` (default), then `PERIOD_LIMIT` beserta periode yang harus dihapus pemilik<br>3. Given satu periode melebihi batas, atau periode lebih tua dari periode tertua saat jendela penuh, then `PERIOD_TOO_LARGE`/`PERIOD_OUT_OF_WINDOW` tanpa ada periode yang dilepas<br>4. Given uji berbasis properti ≥ 1.000 kasus acak, then semua invarian di atas selalu terpenuhi dan rencana dibekukan (JSON) di versi | data-integrity, test | P-17 | 2 hari |
| P-19 | Aktifkan mode periode pada dataset lewat "Atur periode" | 1. Given versi aktif READY, when pemilik memilih "Dari kolom tanggal: Tanggal Kirim · per bulan" atau "Saya pilih saat upload" lalu "Tinjau", then tampil sebaran baris per periode, jumlah baris tanpa tanggal valid (dengan ≤ 20 contoh nomor baris), dan proyeksi kapasitas, tanpa ada data yang berubah<br>2. Given ada baris tanpa tanggal valid, then "Terapkan" nonaktif sampai pemilik memilih eksplisit "Buang N baris", dan pilihan itu tercatat di riwayat<br>3. Given "Terapkan", when job selesai, then versi `PERIOD_SETUP` aktif dengan satu segmen per periode, total dan angka dashboard sama (dikurangi baris yang dibuang eksplisit), dan rollback mengembalikan dataset ke mode biasa<br>4. Given "Simpan N periode" > `PERIOD_KEEP_MAX` atau pengguna bukan pemilik, then ditolak; AuditLog mencatat aktivasi, dan pilihan "Saat batas tercapai: Tolak unggahan (default) / Lepas periode terlama otomatis" dijelaskan di layar | ui, data-integrity, security | P-17, P-18 | 3 hari |
| P-20 | Proses unggahan periode: cast hanya baris baru, pecah per periode, susun rencana, aktifkan dengan aman | 1. Given dataset periode bulanan berisi Jan–Mar dan file April (mode kolom), when ingest selesai, then hanya file baru yang di-parse dan di-cast (durasi ≤ 1,2× unggahan file yang sama ke dataset kosong), rencana berbunyi "April 2026 ditambahkan (n baris)", versi aktif otomatis, dan tidak ada objek baru untuk Jan–Mar<br>2. Given 500 baris baru dengan 20 tanggal gagal cast di atas basis 100.000 baris valid, then vonis cast dihitung atas 500 baris baru (4% > 2%) sehingga hasilnya `AWAITING_MAPPING`<br>3. Given file arsip 12 bulan, then file dipecah menjadi satu segmen per periode dalam satu pass, dan periode dengan baris < 10% periode terbesar di file ditandai "kemungkinan nyasar" sehingga rencana masuk `AWAITING_CONFIRM`<br>4. Given mode label, then penolakan karena batas terjadi setelah parse (sebelum typing); given mode kolom, then penolakan terjadi setelah query hitung per periode (sebelum `writeTyped` penuh)<br>5. Given versi aktif atau `schemaRevision` berubah antara rencana dan konfirmasi, then `PLAN_STALE`, rencana dihitung ulang, dan konfirmasi diminta ulang bila ada yang merusak; aktivasi meneruskan `sheetMap` dan melewati `verifyVersionIntegrity`<br>6. Given file yang sama dipilih ulang dengan mode/label berbeda, then resume tidak melanjutkan versi lama, dan `InitOk` menggemakan mode efektif | ingest, data-integrity, api, strict | P-19, P-7 | 5–6 hari |
| P-21 | Ubah panel unggah: "Tambah atau perbarui periode" dan pemilih periode | 1. Given dataset periode, when panel unggah dibuka, then tampil dropzone utama "Tambah atau perbarui periode — periode yang sudah ada akan diganti, bukan digandakan" dan tautan sekunder "Ganti semua data…" dengan konfirmasi "Semua 18 periode akan diganti"<br>2. Given sheet berlabel, when file dipilih, then pemilih periode (satuan dataset, bukan teks bebas) terisi dari nama file dan bisa diubah sebelum diproses; tanpa tebakan, pemilih wajib diisi<br>3. Given dataset non-periode, then panel sama seperti sekarang dengan tautan "Ingin menyimpan data per bulan? Atur periode", dan helper e2e lama lolos<br>4. Given unggahan sedang diproses, then tahap "Membaca periode" tampil di progres | ui, upload | P-20 | 2–3 hari |
| P-22 | Bangun layar tinjauan perubahan periode sebelum data diganti atau dilepas | 1. Given rencana mengganti periode, melepas periode karena batas, menyusutkan periode > 50%, memuat periode kemungkinan nyasar, atau berasal dari label, then versi menjadi `AWAITING_CONFIRM` dan pemilik melihat tabel Periode \| Sekarang \| Setelah \| Keterangan sebelum "Terapkan"<br>2. Given penyusutan > 50%, then "Terapkan" baru aktif setelah centang "Saya paham Februari 2026 diganti dengan data yang lebih sedikit"; given periode kemungkinan nyasar, then default-nya "Kecualikan" dengan jumlah baris tercatat, dan bisa diubah ke "Masukkan"<br>3. Given sha256 sama dengan file asal sebuah periode, then tampil "File ini identik dengan periode Maret 2026"; given label dengan rentang kolom tanggal acuan di luar label, then peringatan tampil<br>4. Given "Lihat isi file", then grid membuka versi tertunda (hanya pemilik); given "Batalkan upload" atau > 7 hari tanpa keputusan, then versi dibuang dan data aktif tidak berubah<br>5. Given sheet periode lama tidak ada di file baru, then tampil default "Pertahankan data lama sheet itu" | ui, data-safety, a11y | P-20, P-11 | 3–4 hari |
| P-23 | Tegakkan batas periode, baris, dan ukuran per periode utuh, dengan meter dan proyeksi | 1. Given batas 24 periode / 10 jt baris per sheet / 16 GiB per dataset, when unggahan melewati batas dengan `EVICT_OLDEST`, then periode terlama dilepas utuh di semua sheet, pelepasannya tampil di tinjauan, dan tidak ada baris yang dipotong; dengan `REJECT`, unggahan ditolak dengan menyebut nama periodenya<br>2. Given satu periode melebihi batas, then unggahan ditolak dengan jumlah baris dan batasnya, dan data aktif tidak berubah<br>3. Given pemakaian ≥ 80% batas mana pun, then kartu Periode dan panel unggah menampilkan meter ("18 dari 24 periode · 8,2 jt dari 10 jt baris · 11,3 dari 16 GB"), proyeksi ("Dengan rata-rata 1,0 jt baris per bulan, dataset ini menyimpan ±10 bulan"), dan perkiraan dari ukuran file saat init (hanya peringatan, tidak memblokir) | limits, ui | P-22, P-7 | 2–3 hari |
| P-24 | Kelola daftar periode: unggah ulang, hapus, pulihkan, riwayat berlabel | 1. Given dataset periode, then kartu Periode menampilkan Periode, Baris per sheet, File, Diunggah oleh, dan Tanggal, beserta aksi "Unggah ulang" (periode terisi) dan "Hapus"<br>2. Given "Hapus Februari 2026" dikonfirmasi, then versi `PERIOD_REMOVE` aktif dalam hitungan detik tanpa job worker, periode lain tidak berubah, dan AuditLog tercatat; periode terakhir tidak bisa dihapus (diarahkan ke "Ganti semua data")<br>3. Given periode diganti/dihapus dan versi lama yang memuatnya masih tersimpan, when "Pulihkan", then versi `PERIOD_RESTORE` memuat segmen lama periode itu tanpa membatalkan periode lain; bila versi lama sudah terhapus retensi, aksi tidak tersedia dan ada penjelasannya<br>4. Given riwayat versi, then setiap baris menyebut perubahan periodenya (ditambahkan / diganti 12.400 → 12.950 / dilepas (batas 24 periode) / dihapus / dipulihkan), dan rollback memperingatkan periode yang ikut hilang | ui, data-safety, security | P-22 | 3 hari |
| P-25 | Terapkan pemetaan kolom (T-014) pada unggahan periode | 1. Given file periode dengan "Tgl Kirim" sementara kolom aktif bernama "Tanggal Kirim", then hasilnya `AWAITING_MAPPING`; setelah dipetakan, hanya segmen baru yang di-cast dan periode lama tidak berubah<br>2. Given "Kosongkan", then nilainya NULL hanya untuk periode baru dan kolom tidak menjadi absent; kolom tambahan menjadi kolom tersembunyi baru dengan judul tersimpan, dan periode lama bernilai NULL tanpa cast ulang<br>3. Given layar pemetaan pada dataset periode, then ubah tipe tidak ditawarkan dan ada arahan ke halaman Skema<br>4. Given bulan berikutnya kembali memakai "Tgl Kirim", then kolom terpetakan otomatis lewat alias tersimpan tanpa `AWAITING_MAPPING` | ingest, schema, ui | P-20 | 3 hari |
| P-26 | Tambahkan kolom sistem "Periode", pemangkasan segmen, dan pemilih periode | 1. Given dataset periode (termasuk mode label tanpa kolom tanggal), when membuat widget, then dimensi/filter "Periode" tersedia, terurut kronologis, berlabel seperti "Mar 2026", dan tampil sebagai "Periode (sistem)" bila namanya bentrok<br>2. Given filter tanggal pada kolom periode atau filter "Periode", when widget di-query, then hanya segmen yang min/max-nya beririsan yang disewa, dan hasilnya identik dengan query tanpa pemangkasan (teruji)<br>3. Given sheet periode, then urutan default widget tabel dan grid = (`_period`, `_row`); viewer hanya bisa memakai filter Periode bila dipasang pemilik (D6); preset "Periode terbaru" tersedia<br>4. Given Lihat data, then pemilih "Periode: Semua ▾" membatasi grid, dan totalnya sama dengan metadata periode | query, ui, security | P-20, P-12 | 2–3 hari |
| P-27 | Unggah banyak file periode sekaligus lewat antrean | 1. Given pemilik memilih 12 file bulanan, then file diantre dan diproses berurutan dengan progres "File 3 dari 12"; satu file gagal tidak menghentikan antrean dan tercantum di ringkasan<br>2. Given satu file memicu tinjauan, then antrean berhenti menunggu keputusan lalu bisa dilanjutkan; menutup tab tidak menghilangkan file yang sudah terunggah | upload, ui | P-22, P-21 | 2–3 hari |
| P-28 | (Opsional) Satu periode dari beberapa file sebagai satu kelompok | 1. Given bulan > 1.048.576 baris yang dipecah ke 3 file xlsx, when ketiganya diunggah sebagai satu kelompok untuk Maret 2026, then satu versi berisi 3 segmen Maret menggantikan seluruh Maret, dan mengunggah ulang kelompok yang sama menghasilkan data identik tanpa baris ganda<br>2. Given kelompok > `PERIOD_MAX_FILES`, then ditolak dengan pesan | upload, ingest, optional | P-22, P-27 | 3 hari |

### Fase 4: ukur, e2e, dokumentasi

| Kode | Judul | AC (Given/When/Then) | Tag | Dependensi | Perkiraan |
|---|---|---|---|---|---|
| P-29 | Ukur performa dan beban Lihat data pada 10 jt baris | 1. Given profil T-023 dan fixture 10 jt × 30 kolom dengan cache hangat, when `npm run perf` skenario grid dijalankan, then laporan mencatat p95 blok tanpa urut ≤ 300 ms server / ≤ 500 ms tampil, blok pertama urut/saring ≤ 3 detik, "Ke baris" ≤ 1 detik, dan waktu blok dalam urut teks<br>2. Given 5 pengguna menggulir + dashboard 6 widget, then p95 widget ≤ 2× baseline, tanpa QUERY_TIMEOUT/QUERY_BUSY pada widget<br>3. Given fixture 13 jt baris, then angka yang sama tercatat sebagai dasar keputusan menaikkan `PERIOD_SHEET_MAX_ROWS`<br>4. Given blok dalam terurut p95 > 2 detik, then P-30 diaktifkan; bila tidak, P-30 ditutup tanpa dikerjakan | perf | P-12, P-10, T-023, T-024 | 2 hari |
| P-30 | (Bersyarat) Cache urutan baris untuk gulir dalam yang terurut | 1. Given urut teks pada 10 jt baris, when blok dalam berikutnya diminta, then p95 ≤ 500 ms dengan memakai berkas permutasi `_row` (kunci: typed segmen + urut + saring)<br>2. Given `GRID_ORDER_CACHE_BYTES` penuh, TTL 30 menit lewat, atau versi/revisi berganti, then entri lama dibuang dan tidak pernah dipakai untuk versi lain | perf, query, conditional | P-29 | 2–3 hari |
| P-31 | Uji performa dan e2e siklus periode bulanan, serta runbook disk | 1. Given 24 unggahan bulanan 400 rb baris (ditambah 10 × 1 jt baris), then durasi unggahan ke-N ≤ 1,2× unggahan ke-1 dan byte objek baru per unggahan ≈ ukuran parquet periodenya, tercatat di `docs/ai/perf/<task>.md`<br>2. Given retensi + GC setelah 24 unggahan, then total storage ≈ data aktif + periode yang masih dirujuk versi tersimpan, dan job invarian lolos<br>3. Given e2e atur periode → tambah Jan, Feb → ganti Feb (lewat tinjauan) → keepPeriods=2 dengan `EVICT_OLDEST` → rollback → hapus → pulihkan, then KPI "Jumlah baris" dan baris per periode sesuai di setiap langkah, dan alur REPLACE lama lolos tanpa mengubah helper<br>4. Given backup harian T-023, then pertambahan backup per unggahan ≈ parquet periode itu, dan runbook memuat rumus ukuran disk (RustFS, cache app, tmp worker, cache urutan) | perf, e2e, ops | P-23, P-24, P-25, P-26, P-27, T-023, T-024 | 2–3 hari |
| P-32 | Dokumentasikan Lihat data dan data per periode untuk pengguna, siapkan UAT | 1. Given semua task selesai, then project-context, decisions, dan flow-kerja mencerminkan perilaku akhir (D15, D16, A4, D4)<br>2. Given panduan per peran (T-020), then terbit artikel "Mengunggah data per periode" (batas, tinjauan, pulihkan) dan "Melihat data seperti Excel" (yang bisa dan tidak bisa, salin, unduh)<br>3. Given `aitk uat`, then skrip UAT pemilik untuk kedua fitur tersedia dalam bahasa Indonesia | docs, uat | P-31, P-29, P-16, T-020 | 1–2 hari |

---

## 8. Keputusan default yang diambil (bisa diubah user)

Sesuai arahan user ("ambil keputusan standard paling ideal dan relevan"), semua pertanyaan di bawah diputuskan memakai rekomendasinya pada 2026-10-15. Rencana dan task di atas sudah mengikuti keputusan ini. Bila user memilih lain, ubah task terkait sebelum dikerjakan. Q2, Q5, Q6, dan Q8 ditinjau ulang memakai data ukur P-29/P-31 dan hasil UAT.

| # | Pertanyaan | Keputusan (rekomendasi) |
|---|---|---|
| Q1 | Saat batas periode penuh, unggahan baru **ditolak** (pemilik menghapus periode lama sendiri) atau periode terlama **dilepas otomatis** (jendela bergulir)? | **Tolak** sebagai default. "Lepas otomatis" menjadi pilihan pemilik per dataset dan selalu lewat tinjauan. |
| Q2 | Batas 10 jt baris per sheet hanya muat ±10 bulan untuk data 1 jt baris/bulan. Apakah perlu YoY (≥ 13 bulan) untuk dataset sebesar itu? | Tetap 10 jt sampai P-29/P-31 mengukur 13 jt baris di VM T-023. Bila lolos target, admin menaikkan ke 13–15 jt lewat env. |
| Q3 | Kuota per pengguna tetap 20 GiB (kini dihitung dari byte nyata) atau dinaikkan? | Tetap 20 GiB sebagai default (cukup untuk ±1 dataset 1 GB/bulan × 10 bulan). Admin menaikkan sesuai disk VM memakai rumus di runbook. |
| Q4 | Satuan periode cukup Bulan/Kuartal/Tahun, atau perlu mingguan/harian? | Bulan/Kuartal/Tahun saja di v1. Harian/mingguan butuh kompaksi segmen dan definisi minggu yang tegas. |
| Q5 | Seberapa sering satu bulan melebihi 1.048.576 baris (xlsx harus dipecah)? | Bila jarang: v1 menyarankan ekspor CSV, dan P-28 ditunda. Bila sering: P-28 dikerjakan. |
| Q6 | Perlukah seret-pilih rentang sel + salin banyak sel persis seperti Excel? | Tidak di v1, karena salin sel dan salin baris sudah ada. Dievaluasi setelah UAT; bila perlu, pilih antara AG Grid Enterprise ($999/developer, perpetual) dan Glide. |
| Q7 | Perbaikan `sheetMap` (P-3, R5-1) juga memengaruhi REPLACE hari ini. Tarik ke depan sebagai task bug kecil sekarang? | Ya, sebagai task bug terpisah sekarang (0,5–1 hari), yaitu **T-033**. Tidak bergantung pada rencana ini. |
| Q8 | "Unduh tampilan" cukup mengikuti batas T-017 (≤ 1 jt baris), atau perlu CSV lebih besar (sampai 10 jt baris)? | Ikuti T-017 dulu. Naikkan batas CSV hanya bila ada permintaan nyata setelah UAT. |
| Q9 | Apakah viewer cukup mendapat "Perbesar" pada widget tabel (kolom widget saja), tanpa akses seluruh sheet? | Ya, sesuai D6. Akses seluruh sheet hanya untuk pemilik dan editor. |
