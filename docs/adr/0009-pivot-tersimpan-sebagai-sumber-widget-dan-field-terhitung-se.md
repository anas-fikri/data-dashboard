---
status: proposed
date: 2026-10-21
---

# ADR-0009: Pivot tersimpan sebagai sumber widget dan field terhitung sebagai pohon ekspresi tervalidasi

> Status **proposed** 2026-10-21 bersama rencana `docs/ai/plans/2026-10-21-pivot-lanjutan.md` (goal G-7).
> Menjadi accepted setelah T-068 (pohon ekspresi + SQL) dan T-072 (model `SavedPivot` + migrasi) selesai
> tanpa mengubah keputusan di bawah; perubahan bentuk dicatat sebagai amandemen di akhir dokumen ini.

## Context and Problem Statement

Pemilik ingin dashboard dari perhitungan baru seperti PivotTable Excel (rencana G-7 §1): "Tampilkan nilai
sebagai", field terhitung (mis. margin = (pendapatan − biaya) / pendapatan), satu pivot yang dipakai beberapa
widget sekaligus, serta batas yang lebih longgar dengan Top N per kelompok.

Hari ini (rilis 1.0.0):

- Setiap widget menyimpan spec sendiri di `Widget.spec` (zod, `src/features/widgets/spec.ts`), merujuk kolom
  lewat posisi `c<pos>`; pivot: baris 1–2, kolom pemisah 0–1, nilai 1–3, Saring ≤ 3 kolom.
- Viewer hanya mengirim `{widgetId, dashboardFilters}` (D6); spec dibaca server dari DB, identifier hanya dari
  skema, nilai lewat parameter, tidak ada SQL dari klien (conventions Security).
- Aktivasi versi/rollback memetakan ulang spec widget ke sheet/kolom versi aktif (`widgets/remap.ts`,
  `versions/activation.ts`); kolom yang hilang menjadi `MISSING_COLUMN` + `Widget.missingColumns`.
- Agregasi dibangun di `query/sql.ts` (`measureExpr`) dan pivot di `query/pivot.ts` (UNION ALL per jenis baris,
  total/subtotal dari seluruh data).

Pertanyaan: (1) bagaimana field terhitung disimpan dan dieksekusi tanpa membuka jalan SQL dari klien, dengan
pembagian aman dan hasil benar pada total/subtotal; (2) bagaimana satu definisi pivot dipakai banyak widget
tanpa melemahkan D6, remap versi, rollback, dan aturan hapus.

## Considered Options

Field terhitung:

1. **Pohon ekspresi JSON tervalidasi atas agregat** — node `{op: add|sub|mul|div|neg, args}`, `{agg, column}`
   (agregat dengan aturan tipe `AGG_TYPES` yang sama), `{const: number}`; dikompilasi server menjadi SQL atas
   ekspresi agregat.
2. Teks rumus gaya Excel (`=(SUM(Pendapatan)-SUM(Biaya))/SUM(Pendapatan)`) yang di-parse server.
3. Ekspresi per baris (sebelum agregasi), mis. `pendapatan - biaya` lalu `SUM`.
4. Hitung di klien dari hasil pivot.

Sumber bersama:

A. **Model baru `SavedPivot` tingkat dataset** dengan spec tervalidasi; widget merujuk `savedPivotId` +
   "tampilan" per widget kecil.
B. Salin spec ke tiap widget dengan penanda grup ("sinkronkan" saat disimpan).
C. Widget merujuk widget pivot lain (widget sebagai sumber).

## Decision Outcome

Chosen option: **"1 + A"**, because:

- Pohon ekspresi tidak pernah berupa teks SQL: setiap daun divalidasi terhadap skema seperti ukuran biasa
  (identifier `c<pos>` dari skema, konstanta di-bind sebagai parameter `DOUBLE`), operator dari enum tertutup,
  dan batas bentuk (≤ 32 node, kedalaman ≤ 6, ≤ 8 agregat unik, konstanta berhingga |x| ≤ 1e15) mencegah
  ekspresi raksasa. Opsi 2 bisa ditambahkan nanti sebagai lapisan UI yang menghasilkan pohon yang sama.
- Ekspresi atas **agregat** (bukan per baris) memberi hasil benar di subtotal, total, dan "Lainnya": margin total
  = (Σpendapatan − Σbiaya) / Σpendapatan, bukan jumlah margin per baris (masalah klasik field terhitung per
  baris; opsi 3 ditunda ke luar cakupan). Opsi 4 salah untuk total yang dihitung dari seluruh data dan
  tidak bisa dipakai di urutan/Top N server.
- Pembagian dikompilasi sebagai `CASE WHEN d IS NULL OR d = 0 THEN NULL ELSE CAST(n AS DOUBLE) / CAST(d AS
  DOUBLE) END`; hasil NULL tampil "–" (bukan error, bukan ∞). Penjumlahan/pengurangan uang yang semua daunnya
  DECIMAL tetap DECIMAL(38,6); setelah ada pembagian/perkalian dengan konstanta non-bulat hasilnya DOUBLE.
- `SavedPivot` (opsi A) adalah satu baris DB per definisi; mengedit sekali memperbarui semua widget yang
  merujuknya. Opsi B rawan beda diam-diam; opsi C membuat siklus/rantai hapus antar dashboard.

Bentuk yang ditetapkan:

- `SavedPivot { id, datasetId, name, nameKey (unik per dataset), spec Json, missingColumns String[],
  revision Int, createdById?, createdAt, updatedAt }`; ≤ 50 per dataset (`LIMIT_REACHED`).
- `spec` = spec pivot (sheetId, baris ≤ 4, kolom pemisah ≤ 1, nilai ≤ 8 berupa ukuran atau field terhitung,
  masing-masing dengan `showAs` opsional, Saring, Top N per level) — skema zod yang sama dengan widget pivot
  biasa, jadi validasi, remap, dan pembangun SQL tidak bercabang.
- `Widget.savedPivotId String?` (FK `onDelete: NoAction` — di PostgreSQL diperiksa di akhir statement, jadi hapus
  dataset yang meng-cascade dashboard → widget dan pivot tersimpan sekaligus tidak gagal; `Restrict` diperiksa
  seketika dan bisa menggagalkannya) + `Widget.spec` berisi hanya **tampilan**:
  pivot (subtotal/total/urut tampil), grafik (dimensi = baris pertama atau kolom pemisah, satu nilai), KPI
  (satu nilai, total keseluruhan), tabel (baris + nilai, rata, berhalaman).
- Hapus `SavedPivot` yang masih dirujuk ditolak `IN_USE` dengan daftar dashboard; tidak ada cascade ke widget.
- Remap versi dan rollback memakai fungsi remap yang sama dengan widget dan dijalankan di transaksi aktivasi
  untuk `SavedPivot` juga; kolom hilang → `MISSING_COLUMN` + `missingColumns`, widget menampilkan pesan per
  widget seperti hari ini.
- D6 tidak berubah: viewer tetap `{widgetId, dashboardFilters}`; server membaca widget → `savedPivotId` →
  spec di dataset dashboard yang sama. `savedPivotId` di body klien ditolak (`INVALID`). Kolom cross-filter
  yang diizinkan diturunkan dari spec efektif (pivot tersimpan + tampilan widget). Definisi pivot tersimpan
  hanya bisa dibaca/diubah pemilik dataset (dan dibaca editor dashboard pada dataset itu), tidak pernah lewat
  endpoint viewer.
- Kunci cache hasil dan cache sumber filter memuat `SavedPivot.revision`, sehingga edit langsung berlaku
  tanpa menunggu TTL.

### Consequences

* Good, because tidak ada teks SQL atau nama kolom dari klien yang masuk query; aturan tipe agregasi dan
  pengikatan parameter yang sudah diaudit dipakai ulang.
* Good, because total/subtotal/"Lainnya" field terhitung dan "Tampilkan nilai sebagai" dihitung dari agregat
  seluruh data, konsisten dengan pivot hari ini.
* Good, because satu definisi = satu sumber kebenaran; edit memperbarui semua widget, remap versi satu jalur.
* Bad, because migrasi Prisma baru + FK `NoAction` menambah satu aturan hapus (dataset dihapus → pivot
  tersimpan ikut cascade lewat `datasetId`, widget lebih dulu ikut cascade lewat dashboard).
* Bad, because ekspresi per baris (opsi 3) belum tersedia; kebutuhan seperti "Σ(qty × harga)" harus menunggu
  kolom turunan di tingkat dataset (luar cakupan G-7).
* Bad, because pemilik dataset yang mengedit pivot tersimpan mengubah dashboard yang mungkin dibagikan ke
  orang lain; UI wajib menampilkan "Dipakai di N widget pada M dashboard" sebelum menyimpan.

## Amandemen

- **2026-10-21 (T-068)**: pembagian dikompilasi sebagai `n / d` atas operand DOUBLE lalu dibuang bila tidak
  berhingga — penyebut 0 (±Infinity/NaN IEEE) atau NULL → NULL, sama dengan `CASE WHEN d IS NULL OR d = 0
  THEN NULL ELSE n/d END`. Setiap operasi DOUBLE dibungkus `list_filter([x], lambda v: isfinite(v))[1]`
  (overflow → NULL "–"). Bentuk CASE/NULLIF tidak dipakai karena DuckDB menguraikannya menjadi CASE yang
  menyalin operand: rumus 6 tingkat membuat perencana tumbuh eksponensial (query macet, ditemukan uji
  properti). Konstanta di-bind sebagai parameter `$m<i>k<n>` dan di-cast sesuai jenis hasil (DOUBLE;
  DECIMAL(38,6)/HUGEINT pada rumus tepat ± dengan konstanta bulat). Pai hanya menerima field terhitung
  aditif (±Total/Jumlah baris tanpa konstanta). Keputusan lain tidak berubah.
- **2026-10-21 (T-072)**: model `SavedPivot` + `Widget.savedPivotId` (FK `NO ACTION`) dibuat sesuai bentuk di
  atas (migrasi `20261021170000_t072_saved_pivot`, aditif). Rincian yang ditetapkan: `revision` mulai 1 dan
  naik pada setiap simpan **dan** setiap tulis remap aktivasi/rollback (CAS editor yang memegang spec
  sebelum remap mendapat `CONFLICT`); kode galat baru `IN_USE` dan `CONFLICT` (revisi basi — `STALE` tetap
  dipakai untuk "versi data berganti sejak validasi", sama dengan widget). Semua tulis pivot tersimpan dan
  remap-nya mengunci baris `Dataset` (FOR UPDATE, urutan sama dengan aktivasi/hapus dataset). Hapus dataset
  dengan widget terikat diuji di PostgreSQL: cascade Dashboard → Widget dan SavedPivot dalam satu statement
  lolos FK `NO ACTION`. AuditLog `targetType` baru `savedPivot`. Keputusan lain tidak berubah.
