# Rencana T-85tb — pilih sheet yang diimpor saat unggah xlsx

Permintaan pemilik 2026-10-23: saat unggah xlsx, pilih sheet yang diimpor (centang per sheet + "Pilih semua"),
dengan catatan "Disarankan hanya memilih sheet berisi data. Sheet ringkasan, pivot, atau grafik tidak perlu
diimpor." Contoh nyata: sheet "Pivot" ikut terimpor dengan kolom `kolom_1`, `kolom_3`, ….

## Keputusan

- **Daftar sheet dibaca di browser sebelum unggah** (`src/features/uploads/xlsx-sheets.ts`, murni, dipakai klien
  dan server/tes): EOCD + central directory (zip64 didukung) + `_rels/.rels`, `xl/workbook.xml`, `.rels`
  workbook dan tiap worksheet lewat `File.slice` + `DecompressionStream('deflate-raw')`; hanya beberapa KB untuk
  file 1 GB. Per sheet: nama, jenis (worksheet/chartsheet/lain), status (visible/hidden/veryHidden), berisi
  PivotTable. Gagal baca apa pun → `null` → unggah tanpa pilihan (perilaku lama: semua sheet).
- **Kolom baru** `DatasetVersion.selectedSheets TEXT[] DEFAULT '{}'` (kosong = semua; aditif, tanpa backfill).
  Divalidasi saat init unggah (array string, 1–50, unik, ≤ 255 karakter, bukan CSV, bukan mode PERIOD).
- **Worker otoritatif**: parser xlsx `onlySheets` (urut workbook, indeks rapat di jalur berurutan dan paralel),
  sheet tak dipilih tidak dibaca XML-nya; nama tak ada → FAILED dengan pesan jelas. `maxSheets` (50) berlaku
  pada pilihan; batas tingkat buku dipertahankan (keamanan). sharedStrings tetap dibaca penuh.
- **Penggantian data**: sheet aktif yang tidak dipilih → alur pemetaan biasa (AWAITING_MAPPING, "tidak dipakai
  lagi") — widget tidak pernah kosong diam-diam (asumsi aman; dapat diubah pemilik). Bawaan centang: sheet
  yang cocok dengan sheet aktif; unggah pertama: worksheet tampil tanpa PivotTable. Sheet tersembunyi dan
  ber-PivotTable tidak dicentang (dengan label); chartsheet ditampilkan nonaktif.
- **Mode per periode**: di luar cakupan v1 (lanjutan: lewati sheet tak berpasangan sebelum parsing).
- **UI**: `src/components/datasets/upload-sheet-picker.tsx` (pola `UploadPeriodPicker`): fieldset + legend,
  checkbox native, "Pilih semua" tri-state, hitungan "2 dari 5 sheet dipilih", galat "Pilih minimal satu
  sheet.". Ditampilkan bila ≥ 2 worksheet yang bisa dipilih.

## Urutan kerja

1. Skema + migrasi. 2. Parser (`kind`/`state`, `onlySheets`). 3. Ingest + jalur paralel + repo (+ uji).
4. Service/route/klien unggah (+ validasi). 5. `xlsx-sheets.ts` + `sheet-selection.ts` (+ uji paritas nama
dengan parser server, zip64, chartsheet, tersembunyi, PivotTable, berkas palsu → null). 6. Picker + panel +
salinan pemetaan. 7. e2e: helper `confirmSheetPicker` untuk spec yang mengunggah berkas multi-sheet
(ingest/schema/sharing/kpi-fit), spec baru di uploads/ingest/mapping.

## Risiko

Nama sheet harus identik antara pembaca browser dan saxes (uji paritas); spec e2e lama tertahan di picker
tanpa helper; makna `maxSheets` bergeser; indeks sheet jalur paralel berubah ke ordinal rapat; bawaan untuk
sheet tersembunyi/pivot mengubah perilaku lama; penghematan parsial (sharedStrings, kuota proyeksi tetap).
