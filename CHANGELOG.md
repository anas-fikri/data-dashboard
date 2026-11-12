# Changelog

All notable changes to this project are documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Notes

- **pivot (T-070):** rollback ke versi sebelum rilis ini membuat widget pivot dengan > 2 tingkat baris,
  > 3 nilai, atau subtotal per level tampil "Pengaturan widget tidak valid", dan status filter URL dengan
  saringan pivot tingkat 3–4 (`row2`/`row3`) diabaikan seluruhnya (PDF ditolak). Kurangi baris/nilai
  widget sebelum rollback image, atau terima sampai upgrade berikutnya (runbook-deploy §7 R).
- **pivot (T-071):** rollback ke versi sebelum Top N pivot membuat widget pivot ber-Top N tampil
  "Pengaturan widget tidak valid"; set "Tampilkan" ke "Semua" sebelum rollback image (runbook-deploy §7).
- **filter bawaan (T-vb7q):** rollback ke v1.3.1 membuat kolom filter yang membawa filter bawaan tidak tampil
  (skema lama menolak field `default`; data di DB tetap). Hapus bawaan dulu bila rollback akan lama
  (runbook-deploy §10).
- **warna status v1.9.0 (T-z1vv):** migrasi `Dashboard.colors` (kolom nullable, aman untuk rollback image).
  Rollback ke v1.8.x membuat widget Tabel berwarna status dan tabel terikat bertemplate sendiri tampil
  "Pengaturan widget tidak valid" sampai roll-forward; widget terikat pivot tersimpan kini mengikuti template
  dashboard, bukan template pivot tersimpan (runbook-deploy §18). Grafik garis/pai yang dulu diganti dari
  batang berwarna (arah tersimpan diam-diam di v1.8) kini langsung berwarna; matikan lewat "Penilaian warna:
  Tanpa warna" bila tidak diinginkan.

- **v1.10.0 (T-ykyd):** tanpa migrasi. Rollback ke v1.9.0 membuat widget Batang/Garis yang memakai
  **Arah batang** atau **Garis tren** tampil "Pengaturan widget tidak valid" sampai roll-forward, dan
  dashboard bertema grafik kehilangan template/tema warnanya sementara (data tetap di DB; runbook-deploy
  §19). Batang yang dikelompokkan menurut tanggal kini otomatis tegak dan urut waktu.

- **v1.11.0:** tanpa migrasi. Rollback ke v1.10.0 membuat nilai widget bertanda "Tanpa warna" (`tone:
  "none"`) tampil "Pengaturan widget tidak valid", dan dashboard yang memakai penilaian bawaan atau tema baru
  kembali ke warna bawaan sementara (data tetap; runbook-deploy §21). Setelah upgrade, `start` menghapus image
  `dashboard-*` lama otomatis (runbook-deploy §20).

- **v1.12.0 (T-5edy):** tanpa migrasi dan tanpa perubahan data — hanya tata letak filter. Rollback ke
  v1.11.0 aman (filter kembali ke bilah di atas dashboard).
- **v1.13.0 (T-tsvf):** tanpa migrasi database. Image **backup** berubah (cron `--tick` tiap menit untuk
  "Kirim ulang sekarang") — `release.sh` membangun dan memuatnya seperti biasa. Lama simpan dari Admin › Backup
  (`app/retention.json`) menggantikan `BACKUP_RETENTION_DAYS`/`BACKUP_LOCAL_RETENTION_DAYS` di `.env.prod`.
  Rollback ke v1.12.0 aman: `retention.json` dan field baru `status.json` diabaikan (lama simpan kembali ke
  `.env.prod`), tombol kirim ulang hilang, dan kirim ulang kembali tiap 30 menit tanpa jeda (runbook-deploy §22).

- **v1.14.0 (T-tf88):** **bermigrasi** — tabel baru `DashboardView` (tampilan tersimpan), tanpa mengubah
  tabel lama. Rilis TANPA `--quick` (preflight membuat backup lengkap). Rollback image ke v1.13.0 aman: tabel
  baru diabaikan (tampilan tersimpan tidak tampil sampai roll-forward); mode TV, muat ulang otomatis, cari
  cepat, dan duplikat hanya kode (runbook-deploy §23).

- **v1.15.0 (T-43hv, T-d5ev):** tanpa migrasi — field JSON baru di spec widget (`compare` di Angka, `drill` di
  grafik). Rilis boleh `--quick`. Rollback image ke v1.14.0 membuat widget Angka berpembanding dan grafik
  berklik-tembus tampil "Pengaturan widget tidak valid" sampai roll-forward (skema strict menolak field
  baru; data tetap). Matikan Pembanding/Klik-tembus di widget itu dulu bila rollback akan lama
  (runbook-deploy §24). Kolom klik-tembus terbaca semua yang bisa melihat dashboard (D6: kolom widget).

- **v1.15.1 (T-xp28, T-j25e):** tanpa migrasi (`--quick` boleh bila produksi sudah v1.15.0). Klik grafik kembali
  menjadi filter silang; klik-tembus lewat tombol **Lihat baris data** untuk kategori terpilih. `upgrade.sh
  rollback` mengenali `DashboardView` + tabel dari migrasi rilis; masa tunggu sehat app 120 dtk; lapisan
  `npm ci` di Dockerfile ter-cache walau versi naik (runbook-deploy §25).

- **v1.16.0 (T-0gmm):** **bermigrasi** — kolom baru `DatasetVersion.mergeSheets` (BOOLEAN NOT NULL DEFAULT
  false, tanpa mengubah data lama). Rilis TANPA `--quick` (preflight membuat backup lengkap). Sheet gabungan =
  satu sheet logis dengan beberapa segmen di manifest (ordinal 0..n-1) — bentuk yang sudah dibaca query,
  Lihat data, ekspor, recast, dan atur periode sejak T-037/T-qqyx. Rollback image ke v1.15.x aman: kolom baru
  diabaikan; sheet gabungan tetap terbaca (semua segmen), hanya pilihan "Gabungkan sheet" yang hilang.
  Batasan: unggahan mode periode tidak menggabung sheet; versi gabungan yang tidak cocok dengan data aktif
  gagal dengan saran (tidak masuk pemetaan); baris judul sheet gabungan tidak bisa diganti. Dataset lama dengan
  sheet terpisah bisa beralih ke gabungan (widget sheet anggota dipindah lewat `sheetMap`; runbook-deploy §26).

- **v1.17.0 (T-bwza):** tanpa migrasi — agregasi baru `count_blank` ("Jumlah kosong", COUNT(*) − COUNT(kolom)) di
  spec widget/pivot/field terhitung. Rilis boleh `--quick` bila produksi sudah v1.16.0 (dari v1.15.x masih membawa
  migrasi v1.16 → tanpa `--quick`). Rollback image ke v1.16.0 membuat widget/pivot yang memakai Jumlah kosong
  tampil "Pengaturan widget tidak valid" sampai roll-forward (skema strict menolak agregasi baru; data tetap).
  Ganti ukurannya dulu bila rollback akan lama (runbook-deploy §27).

- **v1.17.1 (T-yw88):** tanpa migrasi, hanya app. Panel progres dataset memperingatkan "Pemroses unggahan
  sedang tidak aktif" bila tidak ada worker BullMQ yang terhubung ke antrean ingest (`Queue.getWorkers`, CLIENT
  LIST, hanya entri ber-`rawname`; cache 10 dtk bila ada worker, 3 dtk bila 0; gagal dibaca → tanpa peringatan;
  API progres hanya `workerDown: boolean`). `/health` admin mendapat baris "Pemroses unggahan"; `/api/health`
  (deploy.sh, monitor) sengaja tidak berubah. Tanpa `--full` bila produksi sudah v1.17.0; seed panduan
  `unggah-data` (runbook-deploy §28).

- **v1.18.0 (T-ee46, ADR-0010):** tanpa migrasi. Monitor sumber daya opt-in: profil compose `monitor`
  (`node-exporter` v1.8.2 dipin digest, host network + pid host, rootfs ro, `127.0.0.1:19109`; `metrics-relay` socat
  `172.17.0.1:19100` hanya `APP_SUBNETS`) + `METRICS_NODE_URL`. Sampler di proses app (instrumentation, kunci Redis
  `metrics:sampler:lock`) tiap 10 dtk → Redis `metrics:*` (10 dtk × 1 jam, 1 menit × 24 jam, ± 0,5 MB). `/api/metrics`
  (semua user login) hanya angka gabungan host + `workerDown`; `/api/metrics/admin` (404 non-admin) + disk per mount,
  per layanan (cgroup v2/v1 container app/worker sendiri). Tanpa profil/URL: tidak ada container baru, kartu tidak
  tampil. Rollback image ke v1.17.x aman (runbook-deploy §29).
  Per akun (T-qed9, admin): detik eksekusi DuckDB per user selama slot global dipegang (AsyncLocalStorage dari
  `QueryEngine.withUser`/`GridGate.withUser`), dilaporkan app/worker tiap 10 dtk ke Redis `metrics:acct:*` (ember per
  menit, TTL 20 mnt); job aktif BullMQ dipetakan ke pemilik; storage = `userUsage` (cache 60 dtk), ≤ 20 akun.

- **v1.19 (lewati periode):** tanpa migrasi. Rencana periode `skip` (periode file yang dilewati pemilik di tinjauan → EXCLUDED, data
  lama tetap; menang atas `include`), dikirim lewat review/confirm (`skip` opsional, bawaan []). Rollback image ke
  v1.18.x: tinjauan tertunda yang memakai `skip` dihitung ulang tanpa field itu (periode kembali "Diganti") — tidak ada
  data yang berubah sebelum "Terapkan". Ringkasan riwayat versi yang sudah diterapkan dengan `skip` terbaca
  "dikecualikan (kemungkinan nyasar)" di versi lama. `skip` hanya untuk periode file yang punya data lama dan bukan
  nyasar; periode dilewati yang terkena pelepasan batas → ditolak (bukan dilepas diam-diam).
- **v1.19 (T-jsmj):** tanpa migrasi. Unggahan periode memasangkan sheet file berkolom sama ke satu sheet data
  (`period-merge.ts`: sidik judul sama dengan sheet yang sudah berpasangan, atau cocok persis dengan skema aktif bila
  belum berpasangan; ragu → diabaikan). Tiap sheet = satu bagian kelompok (`Segment.groupPart` kini nomor bagian per
  sheet logis — file × sheet — bukan nomor file); rencana `mergedSheets` + alasan `MERGED_SHEETS` (selalu ditinjau).
  Rollback image ke v1.18.x: versi AWAITING_CONFIRM yang dibuat v1.19 dengan sheet tergabung tidak terbaca rencananya
  (enum baru), dan versi yang masih diproses/menunggu pemetaan akan dipetakan ulang tanpa kelompok (gagal integritas) —
  terapkan atau batalkan semua unggahan periode yang tertunda sebelum rollback; data aktif bersegmen kelompok tetap
  sah di versi lama. Sheet tambahan tidak digabung bila ada sheet yang butuh pemetaan kolom (diabaikan seperti v1.18);
  nilai kolom yang tidak lolos vonis di sheet gabungan → unggahan gagal dengan alasannya.

## [1.19.0] - 2026-11-12

### Added

- **ingest:** mode periode — sheet berkolom sama dalam satu file digabung ke satu sheet data (T-jsmj) (76492e3)
- **period:** 'Lewati periode ini' di tinjauan unggahan periode (T-aavf) (4850467)

### Fixed

- **ingest:** bagian satu sheet data harus membawa perubahan kolom yang sama (verifikasi T-jsmj) (b43e7d6)
- **ingest:** bagian tanpa kolom tambahan boleh berdampingan; perbandingan perubahan kolom kanonik (konfirmasi review T-jsmj) (79246cf)
- **period:** temuan review T-aavf — lewatan selalu bisa dibatalkan, tidak dilepas diam-diam, hanya periode berdata lama (56ac448)

## [1.18.0] - 2026-11-11

### Added

- **deploy:** profil compose monitor (node-exporter + metrics-relay), runbook §29, panduan + Yang baru 1.18 (T-ee46) (957a6dd)
- **metrics:** inti monitor sumber daya — parser node_exporter, titik host, Redis 1 jam/24 jam, sampler app, cgroup app/worker (T-ee46) (9803850)
- **metrics:** kartu Server di sidebar, halaman Admin › Sumber daya, API ringkasan/admin (T-ee46) (7e67256)
- **metrics:** perkiraan pemakaian per akun di Admin › Sumber daya (T-qed9) (914b030)

### Fixed

- **metrics:** laporan layanan/per akun hanya saat monitor aktif + TTL hash layanan (review L2); dokumen per akun (53b72de)
- **metrics:** status kartu Server pakai aria-live, bukan role=status global (6237d6d)
- **metrics:** temuan Low review putaran 2 (T-ee46/T-qed9) (e4b98f0)
- **metrics:** temuan review T-ee46 — status pemroses lepas dari exporter, ambang CPU 5 menit, a11y, log (a04e7fb)
- **metrics:** temuan verifikasi T-qed9 — storage per akun gagal tidak menjatuhkan tabel, uji accountRows (5a2674d)

## [1.17.1] - 2026-11-11

### Added

- **uploads:** peringatan pemroses unggahan tidak aktif (T-yw88) (ef7600f)

### Fixed

- **uploads:** temuan review T-yw88 — live region, kontras, hitung worker ber-rawname, runbook --no-deps (0e6065c)

## [1.17.0] - 2026-11-11

### Added

- **widgets:** ukuran Jumlah kosong (COUNTBLANK) — hitung baris yang kolomnya tidak terisi (T-bwza) (4084a12)

### Fixed

- **widgets:** review T-bwza r2 — pesan khusus kolom pembanding yang dihitung kosongnya; catatan pivot di panduan (6b5c285)
- **widgets:** temuan review T-bwza — kolom absent, pembanding kolom yang sama, teks UI (e9978ed)

## [1.16.0] - 2026-11-11

### Added

- **ingest:** gabungkan sheet berkolom sama menjadi satu sheet saat unggah xlsx (T-0gmm) (b37b39c)

### Fixed

- **ingest:** review T-0gmm r2 — kolom sheet aktif yang diserap gabungan ikut dicek (d56a607)
- **ingest:** temuan review T-0gmm — sheet aktif terpisah boleh beralih ke gabungan (803bb7b)

## [1.15.1] - 2026-11-11

### Fixed

- **deploy:** rollback mengenali tabel rilis, masa tunggu sehat app 120 dtk, npm ci ter-cache walau versi naik (T-xp28) (51fa41a)
- **widgets,deploy:** temuan review v1.15.1 — pkill runbook hanya container backup proyek dashboard, bilah klik-tembus di luar ruang grafik yang diukur + tinggi tetap, fokus ke bilah setelah Lepas saringan, diumumkan pembaca layar, petunjuk disembunyikan di mode TV, regex tabel rilis menerima "public"."X" (e82f68a)
- **widgets:** klik grafik kembali menjadi filter silang; klik-tembus lewat tombol Lihat baris data (T-j25e) (63a7f03)
- **widgets:** temuan Low review v1.15.1 r2 — bilah klik-tembus role group + kabar sr-only (tanpa bacaan ganda), fokus cadangan dilewati bila bilah tersembunyi (mode TV) (1892c10)

## [1.15.0] - 2026-11-10

### Added

- **kpi:** pembanding periode terakhir vs sebelumnya / tahun lalu (T-43hv) (39f6a65)
- **widgets:** klik-tembus grafik ke baris detail (T-d5ev) (cd206e3)

### Fixed

- **kpi,widgets:** perbaikan review v1.15 — ekspor KPI berpembanding = periode terakhir, minggu vs tahun lalu 52 minggu, tolak pembanding tanggal terkecil/terbesar, kolom klik-tembus bawaan unik, kategori yang menyaring tetap diumumkan (1d723f8)
- **kpi,widgets:** temuan Low review v1.15 r2 — panel menyembunyikan pembanding untuk tanggal terkecil/terbesar; kategori yang menyaring diumumkan sekali (data-current + teks sr-only) (b81d108)

## [1.14.0] - 2026-11-10

### Added

- **dashboards:** duplikat dashboard, mode TV + muat ulang otomatis, cari cepat Ctrl+K (T-fcar, T-nn87, T-k6k0) (353960b)
- **dashboards:** tampilan tersimpan — simpan kombinasi filter dengan nama, pribadi/bersama (T-tf88) (b7ddea3)

### Fixed

- **dashboards,shell:** temuan Low review v1.14 r2 — penanda gagal muat ulang per pemakai hook dan tidak reset tiap tick, hanya bila data lama tampil; Ctrl+K kenali dialog Radix terbuka; tombol Cari disembunyikan di ponsel (ikon Panduan kembali) (355944b)
- **dashboards:** menu Lainnya hanya bila ada widget atau pemilik; uji halaman dashboard untuk Lainnya + mode TV (CI unit) (0f62982)
- **dashboards:** perbaikan review v1.14 — batas tampilan bersama saat dijadikan bersama, data basi di mode TV ditandai, mantan editor, syarat tulis di WHERE, cari cepat organisasi aktif, Ctrl+K di Mac (c09567f)
- **shell:** kontras label Ctrl K di tombol Cari cepat (axe color-contrast) (d7bc81b)
- **shell:** nama tombol Cari cepat dari isinya (axe label-content-name-mismatch) (99eea5c)
- **shell:** tombol Cari cepat tidak membuat kepala ponsel meluap; nama tombol unik (e2e shell, guide-roles) (a725c7b)

## [1.13.0] - 2026-11-09

### Added

- **backup:** Admin › Backup — lama simpan, kirim ulang sekarang, jeda NAS penuh, daftar arsip + ruang (T-tsvf) (027d640)

### Fixed

- **backup:** perbaikan review T-tsvf — angka lama simpan 7.0/3E1, retensi NAS sebelum salinan + saat diminta, running.json sisa, urutan tanda berjalan, batas 30 menit saat NAS penuh, permintaan berupa folder, SyncNow tanpa remount, teks petunjuk (2b8d5ed)
- **backup:** permintaan kirim ulang dihapus tanpa rekursi (review T-tsvf r2) (0fca086)

## [1.12.0] - 2026-11-08

### Added

- **dashboards:** sidebar filter tetap di samping kanvas (≥ 1280 px), bisa diciutkan (T-5edy) (18843ed)

### Fixed

- **dashboards:** jarak vertikal tombol filter bawaan dua baris di sidebar (review T-5edy r2) (b7efc59)
- **dashboards:** sidebar filter — tombol bawaan tidak meluber, rel tanpa scrollbar, jarak kontrol, filter silang saja tetap di atas (review T-5edy); Yang baru 1.12 (dce1add)

## [1.11.0] - 2026-11-08

### Added

- **deploy:** bersihkan image dashboard-* lama otomatis setelah upgrade lulus (T-aw7d) (6da3590)
- **widgets:** penilaian warna bawaan dashboard + 8 tema grafik baru (v1.11.0) (491b443)

### Fixed

- **deploy:** prune-images berhenti bila daftar container gagal dibaca; :latest tidak dihapus (review T-aw7d) (428de0e)
- **widgets:** "Tanpa warna" di editor pivot tersimpan tersimpan sebagai none; KPI tanpa batas tanpa template (review v1.11.0) (022c31b)

## [1.10.0] - 2026-11-07

### Added

- **widgets:** tema warna grafik dashboard, arah batang, garis tren, halaman Yang baru (T-ykyd) (9094f41)

### Fixed

- **widgets:** klik batang tegak, potongan periode terbaru, titik tren legenda = garis (review T-ykyd) (472cdb7)
- **widgets:** tabel data + daftar ringkas batang tegak tetap memuat semua baris (review T-ykyd r2) (9ebacef)

## [1.9.0] - 2026-11-06

### Added

- **widgets:** template warna di level dashboard + warna status Garis, Pai, Tabel (T-z1vv) (3455182)

### Fixed

- **deploy:** images.sh menolak tag rilis yang tidak sesuai versi package.json (T-jd1g) (1dc1a3a)
- **widgets:** remap warna kolom tabel, simpan template dashboard berjeda, fokus panel tabel (review T-z1vv) (db12a13)
- **widgets:** widget baru atas pivot tersimpan tidak menyalin template pivot (review T-z1vv L4) (9062618)

## [1.8.1] - 2026-11-06

### Fixed

- **widgets:** template Lembut di widget terikat bertahan di atas template pivot tersimpan (2c75eb4)
- **widgets:** warna status di widget terikat pivot tersimpan, petunjuk Tabel, ikatan tidak tertimpa (0305653)

## [1.8.0] - 2026-11-06

### Added

- **ops:** pantauan 15 menit + email peringatan admin (T-8g53) (850026f)
- **widgets:** batas angka (SLA), warna KPI, daftar ringkas, petunjuk garis/pai (T-f3tf) (d271413)

### Fixed

- **deploy:** `server-release.sh` menerima `ARCHIVE=<arsip>` untuk server tanpa akses github.com (fd03bed)
- **deps:** minimatch 11.0.1 untuk typescript-estree (GHSA-g3hv-75wg-m249, dev) (T-fnvm) (b1e545a)
- **deps:** zod 4.6.7 (GHSA-mrhx-c7xc-m3w5, high) (T-fnvm) (2b33214)
- **widgets:** panel warna tidak dipasang ulang — fokus keyboard tetap (review v1.8.0 #2b) (95b7bc9)
- temuan review v1.8.0 (batas hilang, state panel basi, bound, PDF, pantauan, rahasia worker) (9ab9fd1)

### Notes

- **rollback v1.8.0 → v1.7.x:** widget dengan batas angka atau widget Angka berwarna tampil "Pengaturan widget
  tidak valid" sampai roll-forward (data tetap); hapus batas/warna Angka dulu bila rollback lama (runbook §16).

## [1.7.0] - 2026-11-06

### Added

- **widgets:** warna status di pivot dan grafik batang — "Penilaian warna" per nilai (makin tinggi makin baik / makin tinggi makin buruk), tiga tingkat bertangga menurut posisi nilai di widget (tanpa angka ambang), template Lembut/Tegas/Ramah buta warna/Warna sendiri, legenda, ikut ke PDF (3d6b854)

### Notes

- **warna status:** tanpa migrasi database. Rollback ke v1.6.2 aman (skema warna sudah diterima, warna tidak
  tampil). Rollback ke v1.6.1 atau lebih lama membuat widget berwarna tampil "Pengaturan widget tidak valid" —
  set "Penilaian warna" ke "Tanpa warna" dulu.

## [1.6.2] - 2026-11-06

### Added

- **deploy:** `deploy/server-release.sh <versi>` — rilis satu perintah langsung di server (unduh kode dari GitHub, preflight, build, migrate, start; runbook §14)
- **widgets:** skema menerima pengaturan warna status (`tone` per nilai, `colors` per widget) tanpa memakainya — rollback dari v1.7.x aman

### Fixed

- **uploads:** unggah tidak lagi gagal "Koneksi terputus" pada gangguan jaringan sesaat: part, minta URL part, dan complete diulang ±1,5 menit dan menunggu browser online (5448b90)
- **deploy:** pesan gagal verifikasi pasca-deploy menyebut rilis sudah berjalan; `STORAGE_RESOLVE_IP` untuk uji presign di VM ber-hairpin NAT (4fcedbe)

## [1.6.1] - 2026-11-05

### Fixed

- **docker:** isi `public/` disalin ke output standalone (bukan ke `public/public`): favicon, ikon aplikasi, dan logo tema terang tidak lagi 404 (88ad754)

## [1.6.0] - 2026-11-05

### Added

- **ui:** ikon aplikasi & favicon baru (grafik batang biru brand), terlihat di tab terang/gelap dan halaman login (ddfd307)

## [1.5.1] - 2026-10-24

### Fixed

- **T-7czr:** gerbang T-gcn8 membandingkan baris judul efektif (NULL = segmen); ingest pertama mencatat headerRow typed (b980c2c)
- **deps:** nodemailer 10.2.1 (GHSA-8c8m-p3m8-cjg8, GHSA-m943-m63m-w62w, GHSA-85x2-q946-cp5h) (a1818c4)

## [1.5.0] - 2026-10-23

### Added

- **T-pxnn:** kotak cari pintar di semua daftar pilihan (e675445)
- **T-tzxt:** versi aplikasi di footer setiap halaman (083808b)
- **deploy:** rilis satu perintah dari Mac + preflight cek Redis, ruang backup, pakai ulang backup harian (d0d1fdf)

### Fixed

- **T-85tb:** batas 50 dihitung atas semua sheet buku kerja (termasuk grafik), pesan worker bisa ditindaklanjuti (e1414ab)
- **T-85tb:** batas 50 sheet berlaku pada pilihan (buku kerja s.d. 200), picker menolak > 50, pembacaan sheet basi tidak membuka picker (3ba900a)
- **T-85tb:** nama sheet ganda dikirim sekali (dd070f5)
- **T-pxnn:** Enter tanpa kata kunci tidak mengganti nilai; ketik dari item kembali ke kotak cari; ARIA dialog+listbox; tanpa fokus otomatis di layar sentuh; kotak cari Kolom yang ditampilkan (a085d62)
- **T-pxnn:** ↓ dari kotak cari kosong ke pilihan saat ini (d97c497)
- **T-qqrd:** image dari tree kotor ditandai -dirty; angka preflight berawalan nol ditolak (f3beaef)
- **T-qqrd:** image/arsip pasti dari tag, --quick dicek ke migrasi produksi, variabel preflight diteruskan (c2d9cee)
- **T-tzxt:** versi di footer hanya untuk pengguna yang sudah masuk (T-066); uji landmark + scroll per halaman (e785231)

## [1.4.1] - 2026-10-23

### Fixed

- **deploy:** gerbang G-6 di upgrade.sh hanya saat upgrade melewati T-036 (T-cfd7) (a19d688)

### Security

- **security:** naikkan Next.js 16.4.0 → 16.4.2 (T-cfd7) (1b4b6f3)

## [1.4.0] - 2026-10-22

### Added

- **T-1k96:** widget baru mengisi baris kosong; urungkan hapus tepat di posisi semula (f09d71f)
- **T-k2ec:** editor dashboard mengatur kolom filter dari bilah filter (5133eac)
- **T-vb7q:** filter bawaan per kolom filter dashboard (8e808c9)
- **T-zm9k:** dashboard contoh otomatis dari skema dataset (de9b9f2)
- **pivot:** pratinjau tabel pivot penuh di editor pivot tersimpan (T-c6z4) (3a16a5e)

### Fixed

- **T-12zs:** awalan nomor hanya ID bila menempel kata besaran; No of bukan ID (f5805f9)
- **T-12zs:** kolom bagian tanggal tidak dijumlah, nama besaran di tengah kata (95344b2)
- **T-12zs:** nomor/kode menyatu tetap ID, bagian tanggal di nama kalah (ad5caec)
- **T-12zs:** perbaikan review isian bawaan dan judul otomatis (e69d344)
- **T-1k96:** padatkan widget baru di tata letak lokal yang belum tersimpan; uji pemulihan dipaku (4af631d)
- **T-k2ec:** daftar kolom filter memakai refresh terbaru saat simpan gagal; komentar diperbarui (ca19b21)
- **T-vb7q:** bawaan basi tidak dikirim/menghalangi simpan; tombol kembalikan abaikan pivot; pembersihan e2e (7deab10)
- **T-zm9k:** cek versi aktif di transaksi, tata letak setelah validasi, filter per kolom, label checkbox (0de3280)
- **T-zm9k:** versi aktif dibaca sebelum skema; transaksi menunggu aktivasi lewat FOR SHARE (1782e3e)

## [1.3.1] - 2026-10-22

Maintenance release.

## [1.3.0] - 2026-10-21

### Added

- **pivot:** UI kelola pivot tersimpan dan pilih sumber di panel widget (T-074) (594ca78)
- **pivot:** ikat widget ke pivot tersimpan dengan query aman D6 dan invalidasi cache (T-073) (61111df)
- **pivot:** model SavedPivot, CRUD pemilik dengan CAS, IN_USE, dan remap versi (T-072) (f1bd517)

### Fixed

- **dashboards:** cegah urungkan bawaan peramban mengosongkan judul widget (T-ev34) (ee2a976)
- **pivot:** perbaikan review T-074 (urungkan hapus widget terikat, sumber hilang, flush sebelum lepas, konfirmasi muat ulang) (c7bb4f1)
- **pivot:** perbaikan review keamanan T-073 (kunci ekspor, body PATCH tertutup, pesan viewer, tanpa remap riwayat) (5f3cb82)
- **pivot:** rate limit aksi pivot tersimpan, sheet hilang → NOT_FOUND, catatan rollback image (T-072) (eb70260)
- **render:** petunjuk perbesar kartu saat pivot bertingkat cetak tanpa baris data (T-7ykh) (62dfa2b)
- **widgets:** leading-tight angka KPI tidak lagi dibuang tailwind-merge (T-w764) (21e6bd7)
- **widgets:** tabel terikat tetap tampil saat total berjalan bertemu Top N baris terdalam (T-hbcp) (3f0008e)

## [1.2.0] - 2026-10-21

### Added

- **pivot:** 4 tingkat baris, 8 nilai, subtotal per level, dan anggaran sel 24.000 (T-070) (4115c8d)
- **pivot:** Top N per kelompok dengan (Lainnya) dihitung ulang dari baris mentah (T-071) (7ccff4c)
- **query:** field terhitung sebagai pohon ekspresi tervalidasi dan SQL aman (T-068) (6f54377)
- **widgets:** editor field terhitung berbasis token di panel pivot, grafik, dan KPI (T-069) (a80b5ae)

### Fixed

- **dashboard:** grid mengukur kanvas yang muncul setelah widget pertama; tes KPI Rupiah sesuai kontrak (T-1zdf) (c4a56e5)
- **exports:** format persen field terhitung di XLSX grafik/KPI; tolak durasi di rumus; batang↔garis pertahankan rumus (T-068) (17cb5cc)
- **pivot:** nama aksesibel Top N unik per field baris; task lanjutan T-tpw2 (T-071) (764bbce)
- **pivot:** subtotal per field saat hapus baris, level efektif server = panel, catatan rollback (T-070) (d13f79e)
- **widgets:** angka 0.125 tidak lagi dibaca ribuan, pesan rantai kali/bagi, semua field terhitung pivot ikut, fokus kartu nilai (T-069) (a821c13)

## [1.1.0] - 2026-10-21

### Added

- **ops:** tampilkan versi aplikasi dan tag image dengan versi (T-066) (60920fa)
- **pivot:** tampilkan nilai sebagai pada pivot dan grafik (T-067) (f9bd2d5)

### Fixed

- **pivot:** petunjuk dan pilihan Tampilkan sebagai sesuai agregasi dan pemisah (T-067) (20985af)

## [1.0.0] - 2026-10-21

### Added

- **T-023:** prosedur upgrade produksi rilis G-6 dengan gerbang dan rollback (9f78595)
- **T-036:** model segmen + manifest versi (ADR-0008) lewat migrasi metadata, tanpa mengubah perilaku (62ec216)
- **T-037:** lapisan query dan cache membaca daftar segmen manifest (ADR-0008) (7ae2840)
- **T-038:** GC segmen mark-and-sweep + gerbang integritas versi (59ec9a3)
- **T-039:** kuota dari byte yang benar-benar tersimpan (27924c4)
- **T-040:** recast per segmen — profil tersimpan, titik lanjut, swap manifest atomik (b30aea5)
- **T-041:** endpoint jendela baris dan isi sel untuk Lihat data (f3ea697)
- **T-042:** pisahkan rate, slot, dan cache grid dari query widget (7f238c4)
- **T-043:** halaman Lihat data bergaya lembar kerja (AG Grid, baca-saja) (ce5d6a7)
- **T-044:** urut multi-kolom, saring per kolom, dan cari di Lihat data (29fe0f3)
- **T-045:** panel Isi sel, salin ke Excel, dan ringkasan kolom di Lihat data (dff9b8c)
- **T-046:** Unduh tampilan Lihat data lewat job ekspor (70136f5)
- **T-047:** Perbesar widget tabel layar penuh lewat jalur widget (b933279)
- **T-048:** Lihat data untuk ponsel, keyboard, dan pembaca layar (a687d4c)
- **T-049:** model data periode — mode versi, AWAITING_CONFIRM, _period, aturan beku (9159d7c)
- **T-050:** computePeriodPlan — rencana periode dan batas per periode utuh (bafb4ad)
- **T-051:** Atur periode — aktifkan mode periode pada data yang sudah ada (a8f9162)
- **T-052:** proses unggahan periode — cast hanya baris baru, pecah per periode, rencana, aktif aman (dfc2ebb)
- **T-053:** panel unggah 'Tambah atau perbarui periode' dan pemilih periode (cf730c5)
- **T-054:** layar tinjauan perubahan periode sebelum data diganti atau dilepas (4e9a95e)
- **T-055:** batas periode utuh ditegakkan di init, worker, dan commit dengan meter dan proyeksi (8f6ef33)
- **T-056:** kelola daftar periode — unggah ulang, hapus, pulihkan, riwayat berlabel (a5360dd)
- **T-057:** pemetaan kolom pada unggahan periode — hanya segmen baru, alias, kolom tersembunyi baru (b20b40b)
- **T-058:** kolom sistem Periode, pemangkasan segmen, dan pemilih periode (277b913)
- **T-059:** antrean unggah banyak file periode (2d82efa)
- **T-060:** satu periode dari beberapa file sebagai satu kelompok (65e370c)
- **T-686n,T-tcjp,T-jwhc:** widget Pivot (query, panel, tampilan, cetak PDF) + kotak cari pintar di dropdown panjang (f55d8d2)
- **T-9bc2:** ekspor CSV/XLSX widget pivot + panduan "Tabel pivot seperti di Excel" + video bernarasi (7824e56)
- **T-9gs1:** filter dashboard per periode — bulan/kuartal/tahun tertentu dari data + preset periode sebelumnya (75cf456)
- **T-f4a7:** saringan pivot dinamis — menu saring di kepala tabel, bagian Saring, klik label menyaring widget lain (36afc9f)
- **T-gcn8:** baris judul per file typed dan peta kolom per segmen (18b74cc)
- **T-qqyx:** atur ulang periode pada dataset yang sudah per periode (acf0247)
- **T-rrn1:** angka di luar ±2^53 bisa disaring, ringkasan pivot menyebut bagian Saring (94bea50)
- **T-tqse:** deploy.sh menerima DEPLOY_ENV_FILE + DEPLOY_PROJECT (wajib ≠ dashboard) untuk salinan terpisah; empty-vm-drill.sh mengukur deploy dari image luar VM sampai /health hijau (b8e59ee)
- **T-tqse:** empty-vm-drill.sh menerima beberapa arsip (satu per image) (7af4484)
- **T-tqse:** images.sh save - mengalirkan arsip ke stdout (disk build sempit); runbook latihan VM kosong (af1994a)
- **T-y8qq:** target backup NAS Synology lewat SFTP di Admin › Backup menggantikan S3 (acb27a6)

### Changed

- **T-061:** ukur Lihat data 10 jt/13 jt — skenario grid npm run perf, seed + HTTP/UI, skrip VM (7153066)
- **T-062:** cache urutan Lihat data — permutasi _row + potongan terurut (62b718d)

### Fixed

- **T-023:** review putaran 1 — gerbang upgrade fail-closed, dump saat migrate, cek tag dan tujuan rollback (03a0095)
- **T-038:** review putaran 1 — status FAILED dulu baru hapus, gerbang penuh pemetaan, audit tahan galat (b32d50d)
- **T-039:** review putaran 1 — unggahan ditolak tidak dihitung, laporan sebelum deploy lewat SQL (8570e80)
- **T-040:** review putaran 1 — beri jalan tanpa menahan slot, koreksi tidak stale, TTL indeks (f54828c)
- **T-041:** review putaran 1 — satu segmen per sel, tolak _row bertumpuk (c76c343)
- **T-042:** review putaran 1 — batalkan antrean slot grid, gerbang malas (1220871)
- **T-043:** review putaran 1 — potongan kolom berurutan, QUERY_BUSY dicoba ulang (c15362c)
- **T-044:** review putaran 1 — jumlah basi setelah timeout, kolom cari ikut visibilitas (5603fc7)
- **T-045:** review putaran 1 — salin satu sel berkutip TSV, nilai asli gagal cast (56a8447)
- **T-048:** review — tutup lembar Lainnya saat layar melebar (08ca5b4)
- **T-050:** review putaran 1 — batas penolakan yang mengikat, invarian tambahan (7d64743)
- **T-051:** review putaran 1 — sheet kosong, tinjauan yang diterapkan, verifikasi periode (686497c)
- **T-052:** review putaran 1 — Terapkan tidak menggagalkan versi saat manifest aktif berubah, status dibaca ulang, objek seg/ dibersihkan (337259e)
- **T-053:** review putaran 1 — pilihan periode tidak pernah diturunkan ke ganti semua, konfirmasi lanjut ganti-semua, tebakan nama file lebih ketat (9bd7e54)
- **T-054:** review putaran 1 — banner pratinjau jujur, semantik tabel ponsel, fokus radio, alasan Terapkan diumumkan (6a7cef1)
- **T-055:** review putaran 1 — meter data aktif apa adanya, init hanya batas periode, perkiraan seluruh file, live region (d602f56)
- **T-056:** review putaran 1 — perubahan per sheet di dialog Pulihkan, recast berjalan = sibuk (bcbddee)
- **T-057:** review putaran 1 — absent yang tetap tidak ada tidak dinormalkan, kolom periode tanpa "Kosongkan" (4679db1)
- **T-058:** review putaran 1 — urut per Periode diterima, batas atas tahun 9999 tidak memangkas (9ced9f4)
- **T-059:** review putaran 1 — kedaluwarsa dari aktivitas antrean, kuota proyeksi, batal vs gagal (8c08ba4)
- **T-060:** review putaran 1 — file kelompok kembar ditolak, file kerja dibersihkan, identik per periode (1781974)
- **T-061:** review putaran 1 — AC2 dibatalkan menunggu VM, skrip VM tanpa chmod 777, bersihkan scratch saat gagal, tag image renderer (fae1c8b)
- **T-062:** review putaran 1 — potongan bersama dicoba ulang, invalidasi versi terarah, jeda gagal bangun, subdirektori per proses (8199692)
- **T-063:** review putaran 1 — pemeliharaan skrip perf dibatasi dataset perf, container siklus VM dibuang di trap, cek volume di runbook (4ad60dc)
- **T-9t9b:** domain publik di belakang reverse proxy — Caddy melayani APP_PUBLIC_HOST/STORAGE_PUBLIC_HOST, proxy tepercaya (X-Real-IP = IP pengguna), CORS domain + IP (d32a8ea)
- **T-9t9b:** review — cek same-origin API/login menerima domain publik + akses LAN (APP_LAN_URL), bukan hanya APP_URL (d557c9e)
- **T-f4a7:** review putaran 1 — tanggal tidak sah dilewati, saringan terikat kolom+grain, pivot lama bukan sumber filter silang (6b3ee3f)
- **T-h77x:** DSM menolak atribut izin/waktu lewat SFTP di folder ber-ACL — tes koneksi buka tanpa atribut (.partial → rename), backup.sh set_modtime=false + --ignore-existing (5101f51)
- **T-h77x:** alasan penolakan subsistem SFTP dari NAS dicatat ke log operator (94d85a4)
- **T-h77x:** pesan SFTP ditolak setelah login menyebut port SFTP + hak aplikasi SFTP akun DSM (4bd9881)
- **T-h77x:** tes koneksi NAS menulis 64 KB (file kecil masuk inline Btrfs walau NAS penuh) + petunjuk ruang/kuota saat FAILURE menulis (3602b55)
- **T-h77x:** tes koneksi NAS menyebut langkah SFTP yang gagal + pesan NAS (mis. kode 4 FAILURE), dicatat ke log (fc87996)
- **T-qqyx:** review putaran 1 — uji sumber beragam/kelompok, pesan batas atur ulang (58fdf0c)
- **T-tqse:** review — latihan menjaga tag image produksi (dikembalikan + batal), wajib 4 image satu tag, bersihkan sisa stack, port/subnet sendiri + memori kecil; deploy.sh: realpath untuk .env.prod, array aman bash lama, --no-build tanpa IMAGE_TAG tidak keluar diam-diam (c2fd95c)
- **T-y8qq:** review — password NAS tersimpan hanya dipakai ulang untuk kunci host yang dipin; ssh2 error selalu didengar (27986dc)

