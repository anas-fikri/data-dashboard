# T-1w0b — Waktu unggah + proses berjenjang di produksi (olympus)

- **Tanggal / versi:** 2026-10-18 (Minggu, 10.35–11.07 WIB), image produksi commit `bcfa828` (sudah memuat
  parse sheet xlsx paralel T-de1b dan pemanasan cache parquet T-pvq8); klien `scripts/perf-e2e.mjs tiers`
  + `scripts/perf-tiers.sh` (commit `9f08dbc`).
- **Mesin:** olympus — VM Proxmox bersama (± 29 container aplikasi lain), 8 vCPU, RAM 11 GiB, disk HDD,
  setelan produksi: 2 worker × 3 GB (concurrency 1, `INGEST_DUCKDB_THREADS` bawaan 2), app 2 GB.
- **Lingkungan:** **produksi sungguhan** (bukan stack uji): akun uji khusus non-admin
  `uji.performa@pcpexpress.com` ("Akun uji performa (T-1w0b)"), dibuat create-only setelah dipastikan email
  belum ada; setiap dataset uji dihapus lewat UI sesudah siap; akun dinonaktifkan sesudah uji.
- **Klien:** Chromium headless di olympus (image renderer, `--network host`) memakai UI sungguhan: buat
  dataset → panel unggah (multipart presigned lewat proxy TLS) → tunggu status siap lewat API progres →
  hapus dataset lewat dialog. Karena klien di VM yang sama, kolom **Unggah** = plafon sisi server (proxy +
  storage di HDD), bukan kecepatan jaringan pengguna (lihat "Waktu transfer").
- **Fixture** (`scripts/make-fixture.ts`, profil sama dengan T-024): csv 10 kolom, titik koma, angka id-ID
  (± 120 byte/baris); xlsx 30 kolom teks-berat (60 % teks, 70 % unik), baris judul 3, tanggal campuran,
  header duplikat (± 309 byte/baris). xlsx 500 MB = 2 sheet × 810 rb baris (satu sheet Excel maks.
  1.048.576 baris).
- **Pengaman:** pemantau host tiap ± 5 dtk menulis STOP (jenjang berikutnya batal) bila tekanan I/O avg60 >
  50 %, RAM tersedia < 1,5 GB, atau swap < 256 MB — pelajaran T-024 catatan 7 (VM macet ± 4 jam). Tidak
  ada tahap buka dashboard (pemicu macet T-024).

## Hasil (diukur)

| File | Ukuran | Baris | Unggah (plafon server) | Proses | **Sampai siap** | Rincian proses* | Puncak host (load / I/O avg60 / RAM tersedia min) | Puncak worker |
|---|---|---|---|---|---|---|---|---|
| csv | 10 MB | 83.101 | 1,4 s (58 Mbps) | 9,1 s | **11,6 s** | unduh 5, tipe 4 | 3,0 / 2 % / 9,6 GB | 147 MiB, 162 % CPU |
| xlsx | 10 MB | 32.402 | 0,9 s (87 Mbps) | 10,1 s | **11,3 s** | unduh 5, tipe 5 | 2,5 / 1 % / 9,5 GB | 262 MiB, 100 % |
| csv | 50 MB | 415.601 | 2,3 s (173 Mbps) | 29,3 s | **32 s** | unduh 5, tipe 24 | 3,0 / 2 % / 9,4 GB | 203 MiB, 201 % |
| xlsx | 50 MB | 162.002 | 1,3 s (308 Mbps) | 46,5 s | **48 s** | unduh 5, baca 26, tipe 15 | 3,1 / 2 % / 9,2 GB | 516 MiB, 200 % |
| csv | 100 MB | 831.201 | 5,8 s (137 Mbps) | 57,7 s | **1 mnt 4 s** | unduh 5, baca 5, tipe 48 | 2,9 / 6 % / 9,4 GB | 324 MiB, 201 % |
| xlsx | 101 MB | 324.002 | 4,3 s (187 Mbps) | 148,7 s | **2 mnt 33 s** | unduh 5, baca 115, tipe 25, simpan 3 | 3,6 / 4 % / 8,9 GB | 758 MiB, 200 % |
| csv | 250 MB | 2.078.001 | 8,3 s (240 Mbps) | 139,7 s | **2 mnt 28 s** | unduh 5, baca 10, tipe 125 | 3,9 / 7 % / 9,4 GB | 475 MiB, 202 % |
| xlsx | 252 MB | 810.002 | 8,3 s (242 Mbps) | 377,2 s | **6 mnt 26 s** | unduh 5, baca 297, tipe 71, simpan 4 | 3,7 / 6 % / 8,8 GB | 971 MiB, 202 % |
| csv | 500 MB | 4.156.001 | 21,9 s (183 Mbps) | 272,0 s | **4 mnt 54 s** | unduh 5, baca 30, tipe 235, simpan 2 | 4,4 / 14 % / 8,9 GB | 811 MiB, 201 % |
| xlsx (2 sheet) | 505 MB | 1.620.004 | 19,4 s (208 Mbps) | 463,2 s | **8 mnt 3 s** | unduh 6, baca 303, tipe 145, simpan 9 | 5,8 / 11 % / 8,6 GB | 1.298 MiB, 311 % |

\* Detik per tahap ingest dari API progres (resolusi ± 5 dtk karena progres ditulis berkala; tahap < 5 dtk
bisa tidak tampil). Antre tidak teramati di semua jenjang (status UPLOADED → INGESTING lebih cepat dari
polling 1 dtk; satu unggahan sekaligus, worker kosong). Puncak worker = maksimum dari 2 replika (termasuk
yang sedang menganggur, mis. csv 50 MB: worker yang memproses 177 MiB).

- **Selama seluruh run (31 menit):** load maks 5,8 (dari 8 vCPU), tekanan I/O avg60 maks **14 %**, RAM
  tersedia min 8,6 GB, swap tersisa min 835 MB — **pengaman tidak pernah terpicu**; produksi sehat.
- Puncak container lain: app 199 MiB, RustFS 624 MiB, proxy 39 % CPU (`T-1w0b/puncak.txt`).
- Bukti mentah: `docs/ai/perf/T-1w0b/` (client.jsonl per peristiwa, host.log, stats.log, puncak.txt).

## Analisis

1. **CSV linear dan mudah ditebak:** proses ≈ **4 dtk + 0,54 dtk per MB** (± 1,85 MB/dtk, ± 15 rb baris/dtk
   untuk 10 kolom). Tahap terberat = deteksi + konversi tipe (DuckDB, jenuh di 2 thread = 200 % CPU).
2. **XLSX ditentukan baris per sheet, bukan MB:** satu sheet besar dibaca ± 2.700 baris/dtk (30 kolom),
   ± 1,5 dtk per MB untuk sheet ≥ 100 MB. Sheet dibaca paralel `min(INGEST_DUCKDB_THREADS, jumlah sheet)`
   jalur: xlsx 505 MB 2 sheet (8 mnt) hampir secepat 252 MB 1 sheet (6,4 mnt). XLSX lebih lambat daripada CSV
   ukuran sama (XML terkompresi + shared strings): terukur 1,6× (50 MB; 500 MB 2 sheet) sampai 2,6× (100–250 MB
   satu sheet), sampai siap.
3. **Ada biaya tetap ± 10 dtk** (unduh dari storage, finalisasi, polling) — file kecil selalu ± 11 dtk.
4. **Unggah bukan hambatan di sisi server:** plafon proxy + storage 140–310 Mbps (T-024 dulu 39–89 Mbps saat
   VM sesak). Bagi pengguna, waktu transfer ditentukan jaringan mereka sendiri (tabel di bawah).
5. **Jauh lebih cepat daripada T-024** (VM saat itu sesak + stack uji kedua, sebelum T-de1b/T-pvq8):
   perkiraan csv 974 MB kini ± 9,5 mnt sampai siap (T-024: 16,5 mnt), xlsx 935 MB 3 sheet ± 17–18 mnt
   (T-024: 38,8 mnt).

## Waktu transfer (dari perangkat pengguna)

Diukur: unggah lewat VPN dari laptop pengembang ke olympus **27 Mbps** (scp file sintetis 50 MB, 14,7 s;
`T-1w0b/vpn-scp.txt`).
Waktu transfer = ukuran ÷ kecepatan unggah (dibatasi plafon server ± 200 Mbps):

| Ukuran | LAN kantor 100 Mbps | VPN ± 27 Mbps (terukur) | LAN 1 Gbps (plafon server ± 200 Mbps) |
|---|---|---|---|
| 10 MB | 1 dtk | 3 dtk | < 1 dtk |
| 50 MB | 4 dtk | 15 dtk | 2 dtk |
| 100 MB | 8 dtk | 30 dtk | 4 dtk |
| 250 MB | 20 dtk | 1 mnt 14 dtk | 10 dtk |
| 500 MB | 40 dtk | 2 mnt 28 dtk | 20 dtk |
| 1 GB | 1 mnt 26 dtk | 5 mnt 18 dtk | 43 dtk |

## Ringkasan untuk pengguna: perkiraan sampai data siap dipakai

Waktu = transfer (LAN kantor 100 Mbps) + proses terukur; VPN menambah kolom terakhir.

| Ukuran file | CSV | Excel (xlsx) | Tambahan bila lewat VPN |
|---|---|---|---|
| 10 MB | ± 12 dtk | ± 12 dtk | + 2 dtk |
| 50 MB | ± 35 dtk | ± 50 dtk | + 11 dtk |
| 100 MB | ± 1 mnt | ± 2,5 mnt | + 22 dtk |
| 250 MB | ± 2,5–3 mnt | ± 6,5 mnt (1 sheet) | + 55 dtk |
| 500 MB | ± 5 mnt | ± 8,5 mnt (2 sheet) | + 1 mnt 50 dtk |
| 1 GB (perkiraan, tidak diukur) | ± 11 mnt | ± 18–19 mnt (3 sheet) | + 4 mnt |

Catatan: angka berlaku bila worker kosong. Ada 2 worker: unggahan besar ke-3 yang datang bersamaan menunggu
giliran (T-024 AC 2, UI menampilkan "Menunggu giliran"). Excel dengan banyak kolom/sheet tunggal yang sangat
panjang lebih lama dari tabel; untuk data ≥ 100 MB, CSV 1,6× (Excel multi-sheet) sampai 2,6× (Excel satu sheet)
lebih cepat.

## Jenjang 1 GB — tidak diukur

Pembuatan fixture 1 GB ditolak pengaman sesi otomatis (risiko mengganggu beban kerja VM bersama; T-024 pernah
membuat VM macet). Baris 1 GB di atas adalah **perkiraan** dari tren terukur (1 GB = 1 GiB, batas unggah
aplikasi): csv = 4 dtk + 0,54 dtk/MB ≈ 9,7 mnt proses + transfer;
xlsx 3 sheet × 1 jt baris = baca 2 jalur (2 sheet paralel ± 6 mnt, lalu sheet ke-3 ± 6 mnt) + tipe ± 4,5 mnt
(sebanding baris total) + unduh/simpan ± 0,5 mnt. Bila perlu diukur: `bash scripts/perf-tiers.sh <hasil>
csv-1gb.csv xlsx-1gb.xlsx` dengan izin eksplisit, hari libur, pengaman tetap aktif.

## Rekomendasi

1. **Opsional: `INGEST_DUCKDB_THREADS=3`** — CPU host lega (load maks 5,8/8), worker 1,3 GB dari 3 GB: xlsx ≥ 3
   sheet dibaca 3 jalur (perkiraan 1 GB xlsx 18 → ± 12 mnt) dan tahap tipe csv lebih cepat. Biaya: saat 2
   worker sibuk bersamaan memakai 6 dari 8 vCPU VM bersama → uji di jam sepi dulu sebelum dipakai.
2. Sarankan pengguna mengekspor ke **CSV** untuk data ≥ 100 MB (1,6–2,6× lebih cepat dari xlsx).
3. Pengaman `perf-tiers.sh` dipakai ulang untuk setiap uji di VM bersama; jangan menambah tahap buka dashboard
   untuk dataset ≥ 8 jt baris tanpa `APP_MEM` 3 GB (T-024 catatan 7).

## Verifikasi video panduan produksi (AC 1)

- Akun uji (peran pemilik data) memutar 5 video yang boleh dilihatnya (unggah-data, periksa-skema,
  susun-dashboard, bagikan-dashboard, mengenal-data-dashboard): video berjalan, **audio ter-decode**
  (`webkitAudioDecodedByteCount` 38–57 KB dalam 4 dtk), poster ada, `<track kind=captions srclang=id>`,
  `/takarir` 200 `text/vtt` berisi kalimat narasi pertama yang benar.
- 4 artikel peran Editor/Viewer/Admin → 404 untuk akun itu (aturan akses: objek yang tidak boleh dilihat = 404).
- **Integritas 9/9:** sha256 objek video di storage produksi sama persis dengan rekaman yang terverifikasi
  bersuara; poster + takarir ada untuk semuanya; 0 jadwal pembersihan guides tersisa.

## Pembersihan (AC 3)

- 10 dataset uji: 0 baris DB, 0 objek `raw/`+`parquet/`, 0 multipart menggantung, 0 jadwal StorageCleanup.
- Dataset produksi sebelum = sesudah = 0; pengguna produksi 1 + akun uji.
- Akun uji: `isActive=false`, sesi dicabut (sessionVersion naik), password diganti hash acak; login dengan
  password lama → 401 `INVALID_CREDENTIALS`. Aktifkan lagi untuk uji ulang dengan cara yang sama seperti
  `deploy/perf-stack.sh` (dev-create-user, `NODE_ENV=test`).
- Folder uji di olympus (`/data/docker-data/dashboard-perf`: users.json, fixture 1,8 GB, skrip sekali pakai)
  dihapus; disk kembali 32 GB kosong.
