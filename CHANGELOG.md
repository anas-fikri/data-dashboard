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

