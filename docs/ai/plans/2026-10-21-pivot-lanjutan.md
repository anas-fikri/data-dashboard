# Rencana: pivot lanjutan gaya Excel (perhitungan baru untuk dashboard)

- Tanggal: 2026-10-21
- Status: **rencana, belum dikerjakan**. Tidak ada task yang dimulai. Task G-6 yang masih blocked (T-023,
  T-043, T-048, T-061–T-064) menunggu pemilik dan tidak menghalangi rencana ini.
- Task aitk: goal **G-7**, task **T-066–T-076** (pemetaan kode P di §7.1).
- Keputusan arsitektur: **ADR-0009** (pivot tersimpan sebagai sumber widget + field terhitung sebagai pohon
  ekspresi tervalidasi), status proposed.
- Versi: aplikasi dirilis **v1.0.0** (2026-10-21, `aitk release`, `CHANGELOG.md`, `aitk.toml [release]`).
  G-7 dirilis per tonggak sebagai versi minor (§7.2).
- Dasar: permintaan pemilik 2026-10-21 (empat fitur PivotTable Excel) dan riset kode pivot/widget yang ada.

Singkatan:
- **AC**: acceptance criteria (kriteria terima)
- **ADR**: catatan keputusan arsitektur
- **D6**: aturan akses query viewer (`docs/ai/decisions.md` D6)
- **CAS**: compare-and-swap (simpan hanya bila revisi belum berubah)
- **IDOR**: akses objek orang lain lewat menebak ID
- **p95**: waktu respons persentil ke-95
- **TTL**: umur maksimum entri cache
- **ASVS**: standar verifikasi keamanan aplikasi OWASP

---

## 1. Ringkasan keputusan

Pemilik ingin dashboard dari **perhitungan baru** seperti PivotTable Excel. Keempat fitur dikerjakan:

| # | Fitur | Inti keputusan |
|---|---|---|
| 1 | **Tampilkan nilai sebagai** | % dari total keseluruhan / total baris / total kolom, total berjalan, selisih dan % selisih dari item sebelumnya. Dihitung **server** dari agregat seluruh data, bukan dari baris yang tampil saja. |
| 2 | **Field terhitung** | Aritmetika (+ − × ÷, kurung, konstanta) **antar ukuran teragregasi**, disimpan sebagai **pohon ekspresi JSON tervalidasi**, tidak pernah teks SQL dari klien. Pembagian dengan 0/NULL → kosong ("–"). Total/subtotal = rumus atas total, bukan jumlah hasil per baris. |
| 3 | **Pivot tersimpan sebagai sumber** | Model baru `SavedPivot` per dataset; widget pivot/grafik/KPI/tabel merujuknya dan hanya menyimpan "tampilan". Edit sekali → semua widget berubah. D6 tetap: viewer hanya `{widgetId, dashboardFilters}`. |
| 4 | **Batas longgar + Top N** | Baris pivot 1–4 (kini 2), nilai 1–8 (kini 3), anggaran sel 24.000 agar hasil/PDF/ponsel aman; Top N per kelompok dengan baris "Lainnya" yang dihitung ulang dari data mentah. |
| + | **Versi aplikasi** | Versi dari `package.json` tampil di menu akun dan `/health` (admin), dan menjadi tag image Docker bawaan skrip deploy. |

Yang **tidak** dilakukan di G-7 (§3.6): field terhitung per baris (sebelum agregasi), rumus teks gaya Excel,
"% dari induk", peringkat (rank), indeks, grafik multi-seri dari satu widget, edit sel.

---

## 2. Latar dan fakta kode saat ini

| Area | Fakta | Rujukan |
|---|---|---|
| Spec widget | Zod per tipe; kolom dirujuk posisi `c<pos>`; `MISSING_COLUMN` dan `PERIOD_COLUMN` di luar rentang kolom. Pivot: `rows` 1–2 (`PIVOT_ROWS_MAX`), `column` 0–1, `values` 1–3 (`PIVOT_VALUES_MAX`), Saring ≤ 3 kolom × ≤ 500 nilai, `sort`, `totals`, `subtotals`, `crossFilter`. | `src/features/widgets/spec.ts` |
| Batas tampil pivot | `PIVOT_ROWS_SHOWN` 200 baris terdalam × `PIVOT_COLUMNS_SHOWN` 40 kolom; total/subtotal dari seluruh data. | `spec.ts`, `src/features/query/pivot.ts` |
| SQL pivot | Satu query UNION ALL (`kind` = row/col/cell/sub/total…), CTE `src` NOT MATERIALIZED, kelompok `g1`/`lf`/`rws`/`cols` — kode **terkunci pada 2 level** (`k0`, `k1`, `d0`, `d1`). Agregat dari `measureExpr`, kunci teks tidak peka huruf besar/kecil. | `src/features/query/pivot.ts`, `sql.ts` |
| Rencana query | `resolveSpec` memetakan nama → `c<pos>`, aturan tipe agregasi `AGG_TYPES`; widget menerjemahkan posisi → nama lalu `resolveSpec`. | `src/features/query/spec.ts`, `widget.ts` |
| Grafik | Top N per tipe (bar ≤ 50, line ≤ 1000, pie 5 + "Lainnya"), `Plan.totals` untuk "N teratas dari M". | `spec.ts` (`TOP_N_MAX`), `sql.ts` |
| Akses | D6: viewer `{widgetId, dashboardFilters, pivotFilters?, pivotValues?, page?, sort?}` (strict), editor `{dashboardId, spec}`, pemilik `{datasetId, spec}`. Kolom filter = kolom filter dashboard + dimensi cross-filter. | `widget.ts`, `runtime.ts`, `docs/ai/decisions.md` D6 |
| Cache | Cache hasil LRU 64 MiB, kunci memuat `versionId`; sumber filter per dashboard dikunci versi aktif + `Dashboard.updatedAt` + jumlah `schemaRevision`, TTL pendek. | `src/features/query/cache.ts`, `runtime.ts` |
| Remap versi | Aktivasi/rollback memetakan spec widget ke sheet/kolom versi aktif; kolom hilang → `MISSING_COLUMN` + `Widget.missingColumns`. | `src/features/widgets/remap.ts`, `src/features/versions/activation.ts` |
| Ekspor/PDF | Pivot → CSV/XLSX lewat `pivotGrid`; PDF `PrintPivot` + `fittingPivotRows`/`keepColumns`. | `src/features/exports/pivot.ts`, `src/components/render/print-pivot.tsx`, `src/features/widgets/pivot-table.ts` |
| UI pivot | Panel konfigurasi + Saring tersimpan + menu saring pembaca. | `src/components/dashboards/pivot-*`, `src/components/widgets/pivot-*` |
| Versi | `package.json` 1.0.0; compose produksi `image: dashboard-*:${IMAGE_TAG:-latest}`; `upgrade.sh`/`images.sh` meminta IMAGE_TAG manual; `/health` admin melihat detail per layanan (`publicView`). | `package.json`, `docker-compose.prod.yml`, `deploy/*.sh`, `src/app/health/page.tsx`, `src/lib/health` |
| Model DB | `Widget {dashboardId, type, title, spec Json, missingColumns}`; `Dashboard.datasetId`; tidak ada objek query bersama. | `prisma/schema.prisma` |

---

## 3. Cakupan

### 3.1 Bagian A: Tampilkan nilai sebagai (T-067)

**Masuk**
- Pilihan per nilai (`showAs`): `none` (bawaan), `pct_grand`, `pct_row`, `pct_col`, `running`, `diff_prev`,
  `pct_diff_prev`. Label UI: "Nilai biasa", "% dari total keseluruhan", "% dari total baris",
  "% dari total kolom", "Total berjalan", "Selisih dari sebelumnya", "% selisih dari sebelumnya".
- **Sumbu acuan** total berjalan/selisih: kolom pemisah bila ada; selain itu baris terdalam di dalam kelompok
  induknya (reset per kelompok), selalu dalam urutan **label naik** (kronologis untuk tanggal/periode).
  Item "sebelumnya" = item yang ada sebelumnya (bulan tanpa data dilewati, seperti "(sebelumnya)" Excel).
- Persentase dihitung terhadap total **seluruh data yang lolos filter**, termasuk baris/kolom di luar batas
  tampil; total baris/kolom dihitung internal walau sakelar Total dimatikan.
- Sel total/subtotal: persen dihitung; total berjalan/selisih dikosongkan ("–").
- Grafik bar/line satu dimensi: keempat cara relevan; pai hanya `pct_grand`; KPI tidak.
- Ekspor CSV/XLSX/PDF mengikuti nilai yang tampil; judul kolom menyebut cara tampil.

**Keluar**: % dari induk baris/kolom, peringkat, indeks, "% dari item tertentu" (Excel "% Of" dengan base item).

### 3.2 Bagian B: field terhitung (T-068 model + SQL, T-069 editor)

**Masuk**
- Nilai pivot/ukuran grafik/KPI boleh berupa `{kind: "calc", label, expr, format}` dengan
  `expr` = pohon: `{op: "add"|"sub"|"mul"|"div", args: [a, b]}`, `{op: "neg", args: [a]}`,
  `{agg, column?}` (aturan tipe sama dengan ukuran biasa), `{const: number}`.
- Contoh: margin = `div(sub(sum Pendapatan, sum Biaya), sum Pendapatan)`; rata-rata per kiriman =
  `div(sum Pendapatan, count_distinct No Kiriman)`.
- Batas bentuk: ≤ 32 node, kedalaman ≤ 6, ≤ 8 agregat unik per field, konstanta berhingga |x| ≤ 1e15.
- Dikompilasi di atas `measureExpr` → total, subtotal, "Lainnya", urut `value_*`, Top N, dan `showAs` otomatis
  benar (rumus atas agregat kelompok itu).
- Pembagian aman: `CASE WHEN d IS NULL OR d = 0 THEN NULL ELSE CAST(n AS DOUBLE)/CAST(d AS DOUBLE) END`.
- Tipe hasil: hanya +/− atas DECIMAL → DECIMAL(38,6) (uang tidak jadi float); ada ÷ atau × konstanta non-bulat
  → DOUBLE. Format per field (otomatis/angka/persen/Rupiah).
- Editor berbasis token (ukuran, operator, kurung, konstanta) dengan pratinjau teks dan nilai contoh;
  tidak ada kotak SQL/rumus bebas.
- Tabel: field terhitung tersedia di widget tabel **yang terikat pivot tersimpan** (tabel teragregasi);
  widget tabel baris mentah tetap tanpa field terhitung (agregat tidak bermakna per baris).

**Keluar**: kolom turunan per baris (mis. Σ(qty × harga)), fungsi (IF, ROUND, ABS), rumus teks gaya Excel —
bisa menjadi lapisan UI di atas pohon yang sama nanti (ADR-0009).

### 3.3 Bagian C: pivot tersimpan sebagai sumber (T-072 model, T-073 binding + keamanan, T-074 UI)

**Masuk**
- Tab "Pivot tersimpan" di halaman dataset (pemilik): daftar, buat, ubah, ganti nama, duplikat, hapus.
- Spec pivot tersimpan = spec pivot penuh (sheet, baris ≤ 4, kolom pemisah, nilai ≤ 8 termasuk field terhitung
  dan `showAs`, Saring, Top N) — skema zod yang sama dengan widget pivot.
- Widget pivot, bar, line, pie, KPI, dan tabel memilih "Sumber: Pivot tersimpan"; spec widget hanya
  **tampilan**: pivot (total/subtotal/urut tampil), grafik (dimensi = baris pertama atau kolom pemisah, satu
  nilai, Top N tampil), KPI (satu nilai = total keseluruhan), tabel (baris + nilai, rata, berhalaman 100).
- "Simpan sebagai pivot tersimpan" dari widget pivot yang ada; "Lepas dari sumber" menyalin spec efektif ke
  widget mandiri.
- Edit memperbarui semua widget pengguna; sebelum simpan tampil "Berlaku di N widget pada M dashboard".
- Hapus ditolak bila masih dipakai (`IN_USE` + daftar dashboard).
- Remap versi/rollback ikut memetakan pivot tersimpan (kolom hilang → pesan per widget).

**Keluar**: pivot tersimpan lintas dataset, berbagi pivot tersimpan terpisah dari dashboard, riwayat revisi
yang bisa dipulihkan (hanya `revision` untuk CAS + AuditLog), widget multi-seri.

### 3.4 Bagian D: batas longgar dan Top N (T-070, T-071)

**Masuk**
- `PIVOT_ROWS_MAX` 2 → **4**, `PIVOT_VALUES_MAX` 3 → **8**; subtotal per level (sakelar per level).
- Anggaran sel `PIVOT_CELLS_MAX` = 24.000 (baris tampil × kolom tampil × nilai); bila lewat, kolom tampil
  dipangkas otomatis dengan catatan. `PIVOT_ROWS_SHOWN` 200 tetap.
- Top N per level baris (1–50) menurut nilai pilihan; sisa → "(Lainnya)" yang **dihitung ulang dari baris
  mentah** (rata-rata, jumlah unik, min/max, field terhitung tetap benar). Subtotal tidak berubah oleh Top N.
- Top N dilarang pada dimensi yang menjadi sumbu total berjalan/selisih.
- "(Lainnya)" tidak bisa diklik untuk filter silang dan memakai penanda internal (tidak tertukar dengan data
  asli bernama "Lainnya").

**Keluar**: Top N pada kolom pemisah (kolom tetap ≤ 40 urut naik), batas > 4 level atau > 8 nilai.

### 3.5 Bagian E: versi aplikasi (T-066)

- Satu sumber: `version` di `package.json`, dibaca saat build (Next config/env build) dan diteruskan ke image
  sebagai build arg (plus commit pendek opsional).
- Tampil di menu akun ("Versi 1.0.0") dan `/health` + `/api/health` **hanya detail admin**; publik tetap
  status keseluruhan (tidak membocorkan versi ke penyerang).
- `deploy/images.sh` / `upgrade.sh`: IMAGE_TAG bawaan `v<versi>`; IMAGE_TAG eksplisit tetap menang; tag lama
  tetap untuk rollback. Worker/renderer mencatat `version` di log start.

### 3.6 Cakupan keluar G-7 (ringkas)

Field per baris, rumus teks, % induk/peringkat/indeks, pivot tersimpan lintas dataset, grafik multi-seri,
conditional formatting, drill-down ke baris mentah dari sel pivot untuk viewer.

---

## 4. Model data

### 4.1 Spec nilai (widget pivot dan pivot tersimpan)

```ts
type Value =
  | { kind?: "measure"; agg: Agg; column?: number; showAs?: ShowAs; format?: NumberFormat }
  | { kind: "calc"; label: string /* ≤ 60 */; expr: Expr; showAs?: ShowAs; format?: NumberFormat };
type Expr =
  | { op: "add" | "sub" | "mul" | "div"; args: [Expr, Expr] }
  | { op: "neg"; args: [Expr] }
  | { agg: Agg; column?: number }
  | { const: number };
type ShowAs = "none" | "pct_grand" | "pct_row" | "pct_col" | "running" | "diff_prev" | "pct_diff_prev";
// pivot: rows ≤ 4 (masing-masing topN?: { n: 1..50, by: valueIndex }), values ≤ 8, subtotals per level
```

- `kind` tidak ada = ukuran lama → spec 1.0.0 tetap valid tanpa migrasi data (uji regresi di T-067/T-068/T-070).
- `columnsOf` dan `remap.ts` menjelajahi pohon ekspresi (kolom di daun ikut dipetakan).
- `format` per nilai opsional; tanpa itu memakai `format` widget seperti sekarang.

### 4.2 `SavedPivot` (ADR-0009, T-072)

| Field | Tipe | Catatan |
|---|---|---|
| `id` | cuid | |
| `datasetId` | FK Dataset, cascade | pivot tersimpan milik dataset |
| `name`, `nameKey` | String | unik per dataset tanpa peka kapital |
| `spec` | Json | spec pivot penuh (§4.1) |
| `missingColumns` | String[] | seperti `Widget.missingColumns` |
| `revision` | Int | naik tiap simpan; CAS; masuk kunci cache |
| `createdById` | FK User?, SetNull | |
| `createdAt`, `updatedAt` | DateTime | UTC |

- `Widget.savedPivotId String?` FK `onDelete: NoAction` (diperiksa di akhir statement → hapus dataset yang
  meng-cascade widget dan pivot tersimpan sekaligus tidak gagal). Aturan "masih dipakai" ditegakkan aplikasi
  (`IN_USE`) sebelum hapus.
- Maks 50 pivot tersimpan per dataset (`LIMIT_REACHED`). Kode galat baru: `IN_USE`, `CONFLICT` (revisi basi;
  bila kode serupa sudah ada untuk CAS layout dashboard, pakai yang ada).
- AuditLog: `savedPivot.create`, `savedPivot.update`, `savedPivot.delete`.

### 4.3 Spec efektif widget terikat (T-073)

`effectiveSpec(widget, savedPivot)` (murni) = spec pivot tersimpan + tampilan widget → `WidgetConfig` biasa,
lalu masuk jalur `widgetPlan`/`resolveSpec`/`buildPivotSql` yang sama. Tidak ada cabang SQL kedua.

---

## 5. Keamanan (D6)

- **Viewer tidak berubah**: body tetap `{widgetId, dashboardFilters, …}` strict; `savedPivotId`/`spec` di body
  → 400 `INVALID`. Server: widget → dashboard (akses dicek seperti sekarang) → `savedPivotId` → pivot
  tersimpan **dengan `datasetId` = dataset dashboard** (lain → 404 `NOT_FOUND`).
- **Kolom yang boleh difilter viewer** diturunkan dari spec efektif (baris/kolom pemisah widget yang
  `crossFilter === true` + kolom filter dashboard). Pivot tersimpan tidak menambah kolom yang tidak tampil.
- **Definisi pivot tersimpan** (termasuk Saring dan ekspresi): baca/tulis pemilik dataset; editor dashboard
  pada dataset itu hanya baca + pilih sebagai sumber; viewer tidak pernah (semua → `NOT_FOUND`, bukan 403).
- **Ekspresi**: tidak ada teks SQL; operator enum tertutup; identifier hanya `c<pos>` dari skema; konstanta
  di-bind parameter `DOUBLE`; batas node/kedalaman/agregat mencegah query raksasa. Uji injeksi lewat nama kolom.
- **Cache**: kunci hasil dan sumber filter memuat `SavedPivot.revision` → edit/hapus tidak meninggalkan hasil
  basi yang bisa dibaca viewer dengan kolom lama.
- **Rollback/aktivasi**: remap pivot tersimpan dalam transaksi aktivasi yang sama; versi pratinjau
  (`AWAITING_CONFIRM`) tidak mengubahnya.
- Task T-068, T-072, T-073 berprofil **strict** (checklist ASVS V4/V5/V7, review keamanan, `aitk audit`).

---

## 6. Risiko dan mitigasi

| # | Risiko | Dampak | Mitigasi |
|---|---|---|---|
| R1 | Generalisasi SQL pivot dari 2 ke 4 level merusak hasil lama | Angka salah di dashboard yang sudah dipakai | Uji regresi spec 1.0.0 (hasil identik), uji properti terhadap GROUP BY acuan untuk 1–4 level, fixture kecil dengan nilai manual. |
| R2 | Ledakan ukuran hasil (4 level × 40 kolom × 8 nilai) | Batas 5 MB, PDF lambat, ponsel macet | Anggaran sel 24.000, pangkas kolom dengan catatan, PDF memotong per halaman, perf di T-070/T-075; turunkan default bila p95 > 2×. |
| R3 | Field terhitung dijumlahkan per baris (bukan rumus atas total) | Margin total salah | Kompilasi atas agregat (ADR-0009); AC T-068 memeriksa total/subtotal dengan nilai manual. |
| R4 | Pembagian 0/NULL atau overflow DECIMAL | Galat DuckDB, Infinity/NaN di JSON | `CASE … NULL`, cast DOUBLE untuk ÷, uji 0/NULL, konstanta ≤ 1e15. |
| R5 | Edit pivot tersimpan mengubah dashboard orang lain diam-diam | Kebingungan, keputusan bisnis salah | Konfirmasi "Berlaku di N widget pada M dashboard", AuditLog, hanya pemilik dataset yang mengubah. |
| R6 | Cache basi setelah edit/hapus | Viewer melihat definisi lama | `revision` di kunci cache hasil + sumber filter (AC T-073). |
| R7 | Kebocoran kolom lewat pivot tersimpan (IDOR, filter silang) | Pelanggaran D6 | `datasetId` = dataset dashboard, body strict, kolom filter dari spec efektif, review keamanan strict. |
| R8 | Hapus dataset gagal karena FK | Dataset tidak bisa dihapus | FK `NoAction` + uji hapus dataset dengan widget terikat (AC T-072). |
| R9 | "Lainnya" tertukar dengan data asli atau ikut filter silang | Filter salah | Penanda internal, label "(Lainnya)", tidak bisa diklik (AC T-071). |
| R10 | Total berjalan/selisih salah karena item terpotong atau Top N | Angka menyesatkan | Hitung sebelum pemotongan tampilan; Top N dilarang pada sumbu acuan (AC T-067/T-071). |
| R11 | Versi bocor di /health publik | Info sidik jari untuk penyerang | Versi hanya di detail admin + menu akun pengguna login (AC T-066). |

---

## 7. Rencana task bertahap

- **Urutan fase**: 0 versi → 1 Tampilkan nilai sebagai → 2 field terhitung → 3 batas + Top N →
  4 pivot tersimpan → 5 e2e/perf/dokumentasi. Setiap fase bisa dirilis sendiri.
- **Gerbang review** (catatan kerja): blokir hanya Critical/High atau bug fungsional; maks 3 putaran; e2e
  terarah per perbaikan, suite penuh sekali sebelum close.
- **UI** (T-069, T-070, T-071, T-074, sebagian T-066/T-067) lewat rantai frontend-expert, ikon Tabler.
- **Perkiraan total**: ±33–42 hari kerja (rincian di akhir §7).

### 7.1 Pemetaan kode P ke task aitk

| Kode | Task | Kode | Task | Kode | Task |
|---|---|---|---|---|---|
| P-1 | T-066 | P-5 | T-070 | P-9 | T-074 |
| P-2 | T-067 | P-6 | T-071 | P-10 | T-075 |
| P-3 | T-068 | P-7 | T-072 | P-11 | T-076 |
| P-4 | T-069 | P-8 | T-073 | | |

### 7.2 Rilis per tonggak (usulan, menunggu keputusan pemilik Q1)

| Versi | Isi | Setelah |
|---|---|---|
| v1.1.0 | Versi aplikasi, Tampilkan nilai sebagai, field terhitung | T-066–T-069 |
| v1.2.0 | Batas longgar + Top N | T-070–T-071 |
| v1.3.0 | Pivot tersimpan + dokumentasi/UAT | T-072–T-076 |

Rilis lewat `aitk release` di `main` (Conventional Commits: `feat` → minor), image bertag `v<versi>` (T-066),
deploy dijalankan pemilik dengan backup DB dulu.

### Fase 0: versi aplikasi

| Kode | Task | Judul | AC ringkas (lengkap di file task) | Profil | Dependensi | Perkiraan |
|---|---|---|---|---|---|---|
| P-1 | T-066 | Tampilkan versi aplikasi di UI dan /health, tag image Docker dengan versi | Menu akun "Versi 1.0.0" dari package.json; /health detail admin memuat versi (publik tidak); images/upgrade.sh IMAGE_TAG bawaan `v<versi>`; log start worker/renderer memuat version; runbook alur rilis | standard | – | 1 hari |

### Fase 1: Tampilkan nilai sebagai

| Kode | Task | Judul | AC ringkas | Profil | Dependensi | Perkiraan |
|---|---|---|---|---|---|---|
| P-2 | T-067 | Tambahkan Tampilkan nilai sebagai pada pivot dan grafik | % keseluruhan/baris/kolom dari seluruh data; running/selisih sepanjang kolom pemisah atau baris terdalam per kelompok, termasuk item terpotong; grafik bar/line (pai hanya %); ekspor = tampilan; spec lama identik | standard | T-066 | 3–4 hari |

### Fase 2: field terhitung

| Kode | Task | Judul | AC ringkas | Profil | Dependensi | Perkiraan |
|---|---|---|---|---|---|---|
| P-3 | T-068 | Bangun model field terhitung (pohon ekspresi) dan pembangun SQL aman | Margin total = rumus atas total; ÷0/NULL → "–" tanpa galat; validasi batas + uji injeksi; DECIMAL untuk ±, DOUBLE untuk ÷; remap kolom di ekspresi; ASVS V5 | **strict** | T-067 | 4–5 hari |
| P-4 | T-069 | Buat editor field terhitung di panel widget pivot, grafik, dan KPI | Penyusun token + pratinjau; galat inline; dipakai pivot/bar/line/pie/KPI; keyboard + 360 px; e2e viewer melihat nilai sama | standard | T-068 | 3–4 hari |

### Fase 3: batas longgar dan Top N

| Kode | Task | Judul | AC ringkas | Profil | Dependensi | Perkiraan |
|---|---|---|---|---|---|---|
| P-5 | T-070 | Longgarkan batas pivot: 4 field baris, 8 nilai, dengan anggaran sel | 1–4 level identik GROUP BY acuan; anggaran sel 24.000 + catatan; PDF/CSV/XLSX 4 level; 360 px; perf ≤ 2× | standard | T-068 | 4–5 hari |
| P-6 | T-071 | Tambahkan Top N per kelompok dengan kelompok Lainnya pada pivot dan grafik | Top N per induk + "(Lainnya)" dari baris mentah; subtotal tetap; dilarang pada sumbu running; tidak bisa filter silang; Top N grafik lama tidak berubah | standard | T-070 | 2–3 hari |

### Fase 4: pivot tersimpan

| Kode | Task | Judul | AC ringkas | Profil | Dependensi | Perkiraan |
|---|---|---|---|---|---|---|
| P-7 | T-072 | Siapkan model dan migrasi pivot tersimpan dengan perlindungan hapus dan remap versi | Migrasi `SavedPivot` + `Widget.savedPivotId`; CRUD pemilik + CAS + AuditLog + maks 50; `IN_USE`; hapus dataset aman; remap di transaksi aktivasi; ASVS V4/V5/V7 | **strict** | T-071 | 4–5 hari |
| P-8 | T-073 | Ikat widget ke pivot tersimpan dengan query aman D6 dan invalidasi cache | 6 jenis widget berubah serempak; viewer body strict (savedPivotId → INVALID, lintas dataset → NOT_FOUND); kolom filter dari spec efektif; kolom hilang per widget; ekspor/PDF spec efektif | **strict** | T-072 | 4–5 hari |
| P-9 | T-074 | Bangun UI kelola pivot tersimpan dan pilih sumber di panel widget | Tab daftar + "Dipakai di"; konfirmasi dampak edit + konflik revisi; simpan dari widget, pilih sumber, lepas dari sumber; editor dashboard baca-saja; 360 px + keyboard | standard | T-073, T-069 | 4–5 hari |

### Fase 5: ukur, e2e, dokumentasi

| Kode | Task | Judul | AC ringkas | Profil | Dependensi | Perkiraan |
|---|---|---|---|---|---|---|
| P-10 | T-075 | Uji e2e dan performa pivot lanjutan, ekspor PDF, dan ponsel | e2e jalur kritis pemilik → viewer; perf 10 jt baris p95 pivot ≤ 3 s di profil T-023 (`docs/ai/perf/T-075.md`); PDF ≤ timeout; 360/768 px + axe | standard | T-074 | 3 hari |
| P-11 | T-076 | Dokumentasikan pivot lanjutan untuk pengguna, siapkan UAT dan rilis minor | decisions D17 + D6 diperjelas, ADR-0009 accepted; dua artikel panduan; `docs/ai/uat/T-076.md`; rilis minor lewat `aitk release` | standard | T-075 | 1–2 hari |

Ringkasan perkiraan: fase 0 = 1 hari, fase 1 = 3–4, fase 2 = 7–9, fase 3 = 6–8, fase 4 = 12–15,
fase 5 = 4–5 → **±33–42 hari kerja** (termasuk review; tidak termasuk UAT pemilik).

---

## 8. Keputusan default yang diambil (bisa diubah pemilik)

Sesuai kesepakatan kerja (ambil keputusan standar yang aman lalu catat asumsinya). Bila pemilik memilih lain,
ubah task terkait sebelum dikerjakan.

| # | Pertanyaan | Keputusan default |
|---|---|---|
| Q1 | Rilis per tonggak: tiga minor (v1.1.0 / v1.2.0 / v1.3.0, §7.2) atau satu v1.1.0 setelah G-7 selesai? | Tiga minor per fase agar fitur cepat sampai ke pengguna; tiap rilis lewat upgrade.sh + backup. |
| Q2 | Siapa yang boleh **mengubah** pivot tersimpan: hanya pemilik dataset, atau juga editor dashboard pada dataset itu? | Hanya pemilik dataset (edit memengaruhi dashboard lain yang mungkin tidak bisa diakses editor). Editor: baca + pilih sebagai sumber. |
| Q3 | Field terhitung per baris (mis. Σ(qty × harga)) perlu di G-7? | Tidak; hanya antar agregat. Kebutuhan per baris dicatat untuk goal berikut (kolom turunan dataset). |
| Q4 | Batas 4 baris × 8 nilai cukup? | Ya sebagai default; diturunkan (mis. 6 nilai) bila perf T-070/T-075 tidak lolos. |
| Q5 | Total berjalan/selisih: sumbu acuan otomatis (kolom pemisah, selain itu baris terdalam) atau bisa dipilih pengguna seperti "Base field" Excel? | Otomatis di v1 (lebih sederhana, cukup untuk kasus per bulan); pilihan sumbu ditambah bila UAT memintanya. |
| Q6 | Grafik dari pivot tersimpan cukup satu nilai per grafik? | Ya; multi-seri di luar cakupan G-7. |
| Q7 | Versi aplikasi tampil untuk semua pengguna login (menu akun) atau hanya admin? | Semua pengguna login di menu akun (membantu laporan masalah); /health detail tetap hanya admin. |
