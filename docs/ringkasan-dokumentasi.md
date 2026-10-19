# Ringkasan Dokumentasi — Data Dashboard PCP Express

Versi 19 Oktober 2026 · Ringkasan untuk manajemen, operator, dan programmer berikutnya.
Detail teknis: `docs/panduan-developer.md` (programmer), `docs/runbook-deploy.md` (operasional),
`docs/flow-kerja.md` (alur produk & aplikasi), `docs/adr/` (keputusan arsitektur).

---

## 1. Tentang aplikasi

**Data Dashboard** menggantikan dashboard Excel yang berat (file 100 MB+ sulit dibuka, rumus mudah rusak, sulit
dibagikan). Karyawan mengunggah file **Excel (xlsx) atau CSV sampai 1 GB**, lalu merakit dashboard sendiri tanpa
bantuan programmer. Pendaftaran hanya untuk **email domain perusahaan**.

Mengapa tidak seberat Excel: data diubah sekali menjadi format kolom (Parquet) dan dihitung di server dengan
mesin analitik (DuckDB); browser hanya menerima hasil ringkasannya.

## 2. Fitur per peran

| Peran | Bisa |
|---|---|
| **Pemilik dataset** | Membuat profil dataset, mengunggah file (versi baru = ganti data; bisa kembali ke versi lama), meninjau & mengoreksi tipe kolom dan baris judul, memetakan kolom bila nama kolom di file berubah, membuat dashboard, membagikan |
| **Editor** (dibagikan) | Mengubah widget, filter, dan tata letak dashboard yang dibagikan |
| **Viewer** (dibagikan / seluruh organisasi) | Melihat, memfilter, mengekspor |
| **Admin** | Kelola pengguna (tambah, hapus, nonaktifkan, jadikan/cabut admin, alihkan dataset), kelola panduan (artikel + video), **Integrasi**: Email (SMTP) dan Backup ke NAS Synology |

**Dashboard:** widget KPI, grafik batang, garis, pai, dan tabel; agregasi total, rata-rata, minimum, maksimum,
jumlah terisi, jumlah unik; filter dashboard (pilihan nilai, rentang tanggal, rentang angka) dan filter silang dari grafik;
tata letak grid 12 kolom (satu kolom di ponsel).
**Ekspor:** CSV dan XLSX per widget, PDF per dashboard.
**Panduan:** artikel + video per peran di menu Panduan, kartu "Mulai di sini" untuk pengguna baru, tombol
Bantuan sesuai halaman.

## 3. Arsitektur singkat

| Komponen | Peran |
|---|---|
| **app** (Next.js 16, React 19) | Halaman web + API, port internal 3100 |
| **worker** (BullMQ, 2 replika) | Memproses unggahan (Excel/CSV → Parquet), koreksi tipe kolom, ekspor CSV/XLSX, PDF, pemeliharaan terjadwal |
| **renderer** (Chromium) | Mencetak dashboard ke PDF |
| **PostgreSQL 14** (di host server) | Metadata: pengguna, dataset, versi, dashboard, hak akses, audit |
| **RustFS** (S3) | File asli, Parquet, hasil ekspor, video panduan |
| **Redis 7** | Antrean job, batas laju (rate limit), kunci |
| **Caddy** | Reverse proxy HTTPS (port 8443) |
| **backup** | Backup harian terenkripsi + salinan ke NAS Synology |

Semua berjalan sebagai Docker Compose (project `dashboard`) di server **olympus**.

## 4. Produksi & operasional

| Hal | Nilai |
|---|---|
| Alamat | `https://10.3.3.221:8443` (sertifikat internal — pasang sertifikat root CA di komputer pengguna agar tidak muncul "Not Secure", runbook §TLS) |
| Folder di server | `/data/docker-data/data-dashboard` (berkas `.env.prod` berisi rahasia, mode 600) |
| Database | PostgreSQL 14 host olympus, **UTF-8 (C.UTF-8) sejak 19 Okt 2026** |
| Email | Admin › Email (SMTP): `mail.pcpexpress.com:465` SSL, pengirim `noreply-dashboard@pcpexpress.co.id` |
| Backup | Harian 02.00 WIB: database + seluruh file → terenkripsi **age** (kunci privat **tidak** disimpan di server) → retensi 30 hari → salinan ke **NAS Synology** `nas1.pcpexpress.com:222` folder `/sharedvol1/Backup-Server/data-dashboard` (SFTP, kunci host dipin) |
| Bila NAS gagal | Arsip ditahan di server, dikirim ulang otomatis tiap 30 menit, admin diberi tahu lewat email + banner aplikasi |
| Pemantauan | `/api/health` (rincian untuk admin), banner backup untuk admin, email admin saat backup gagal/tertunda/pulih |
| Deploy | Pra-deploy manual (tag image lama `prev-<tanggal>`, arsip kode lama, backup sekali), lalu `deploy/deploy.sh` (build di server, migrasi otomatis, cek health) — runbook §6 |
| Rollback | Ekstrak arsip kode lama + kembalikan tag image `prev-<tanggal>` lalu nyalakan ulang (runbook §6 "Rollback cepat"), atau pulihkan dari backup (runbook §5) |
| Kapasitas server | 8 vCPU, 11 GB RAM; app 3 GB, 2 worker × 3 GB |

## 5. Keamanan

- Pendaftaran hanya domain perusahaan + verifikasi email; password di-hash **argon2id**.
- Sesi cookie httpOnly (JWT) 12 jam; semua sesi bisa diputus seketika (ganti password, nonaktif, cabut admin).
- Batas percobaan: login 10 gagal/IP/10 menit dan 5 gagal/akun/15 menit; batas juga untuk daftar, reset, query,
  ekspor, berbagi.
- Data yang tidak boleh diakses dijawab "tidak ditemukan"; hak akses dicek di server pada setiap permintaan.
- Header keamanan + CSP ber-nonce; unggahan langsung ke storage dengan URL bertanda tangan; ekspor CSV
  menetralkan formula Excel.
- **Audit log** untuk aksi penting (pengguna, berbagi, ekspor, pengaturan email/backup).
- Rahasia hanya di `.env.prod` dan berkas konfigurasi bermode 600 — tidak di database, log, atau repo.
- Backup terenkripsi; kunci pembukanya disimpan di luar server (brankas admin).

## 6. Kinerja terukur

| Uji | Hasil |
|---|---|
| CSV 1 GB: unggah → siap → dashboard | ±10,8 menit alur penuh (olympus 8 vCPU; `docs/ai/perf/T-024.md`) |
| XLSX 307 MB (UAT nyata, data produksi 19 Okt 2026) | siap dalam 5,8–7,6 menit |
| Deploy dari image siap | layanan sehat < 2 menit (latihan VM kosong 88 detik) |

## 7. Status proyek (19 Oktober 2026)

- **62 task selesai**, 1 dibatalkan. Aplikasi inti **lengkap dan berjalan di produksi**; UAT berjalan dari akun
  anas.fikri (2 dataset READY, 2 dashboard, 0 galat).
- **Menunggu NAS:** salinan backup ke NAS Synology (T-h77x) — konfigurasi sudah tersimpan dan tersambung,
  tetapi **penyimpanan NAS penuh/kuota habis** sehingga file ≥ 4 KB ditolak (lihat §8). Arsip aman di server dan
  dikirim ulang otomatis begitu ada ruang. T-023 (paket deploy) tinggal menunggu ini.
- **Roadmap G-6 (ditahan sampai UAT selesai, 29 task tersisa):**
  - **Lihat data** — halaman bergaya lembar kerja (baca-saja): gulir jutaan baris, urut, saring per kolom, cari,
    salin ke Excel, unduh tampilan.
  - **Data per periode** — unggah per bulan tanpa mengganti periode lain; ganti/hapus/pulihkan periode; pemilih
    periode di dashboard.
  - **Fondasi segmen** — perubahan penyimpanan agar kedua fitur di atas efisien.
  - Mengedit isi data langsung di browser **tidak** direncanakan: sumber data tetap file dari sistem asal.

## 8. Tindak lanjut yang dibutuhkan

| # | Tindakan | Pemilik |
|---|---|---|
| 1 | **Kosongkan ruang / naikkan kuota NAS** untuk akun `backupserver` atau shared folder `sharedvol1` (DSM › Storage Manager, › Panel Kontrol › Pengguna › Kuota, › Folder Bersama › Edit › Kuota). Setelah itu kirim ulang berjalan otomatis | Pengelola NAS |
| 2 | Uji pemulihan dari NAS: `ssh olympus bash …/deploy/verify-backup.sh --remote < kunci-backup-dashboard.txt` | Admin |
| 3 | Pilih retensi backup di NAS (perkiraan dari arsip harian ±1,1 GB: 30 hari ≈ 35 GB; 14 hari ≈ 16 GB) | Admin |
| 4 | Ganti password admin S3/silo yang pernah terkirim lewat chat | Pengelola silo |
| 5 | Pasang sertifikat root CA di komputer pengguna (menghilangkan "Not Secure") | IT |
| 6 | Backup aplikasi lain di server **pandora** gagal ke NAS sejak 22 Jan 2026 (SMB port 445 tertutup) — di luar aplikasi ini, bisa dipindah ke SFTP port 222 | ICT |
| 7 | Setelah backup harian terverifikasi, hapus cadangan konversi UTF-8 (`data_dashboard_sqlascii_20261019045827` + dump `/var/tmp`) | Admin server |

## 9. Untuk programmer berikutnya

- **Mulai dari** `README.md` (menjalankan lokal) → `docs/panduan-developer.md` (peta kode, alur data, resep
  modifikasi, konvensi, jebakan, tes, rilis) → `docs/flow-kerja.md` dan `docs/adr/`.
- **Stack:** Next.js 16 + React 19 + TypeScript, Prisma 6.12 (dipin), PostgreSQL, DuckDB + Parquet, BullMQ +
  Redis, RustFS (S3), ECharts, Tailwind, ikon Tabler, Vitest + Playwright.
- **Aturan emas:** UI Bahasa Indonesia; objek terlarang = 404; Server Action mengembalikan hasil, tidak melempar;
  audit setiap perubahan penting; `npm run check` wajib hijau; deploy lewat runbook dengan tag rollback.
- **Pengelolaan task:** `aitk` (`aitk brief`, `aitk task next --start`, `aitk check`, `aitk close`), riwayat
  keputusan dan serah terima di `docs/ai/`.

## 10. Daftar dokumen

| Dokumen | Untuk |
|---|---|
| `README.md` | Menjalankan lokal, verifikasi, pemulihan admin |
| `docs/panduan-developer.md` | Programmer: peta kode, resep modifikasi, tes, rilis |
| `docs/runbook-deploy.md` | Operator: deploy, backup/restore, TLS, troubleshooting |
| `docs/flow-kerja.md` | Alur produk & aplikasi, keputusan mengikat |
| `docs/adr/0001…0008` | Keputusan arsitektur |
| `content/panduan/` | Panduan pengguna (juga di menu Panduan aplikasi) |
| `docs/ai/` | Task, serah terima, pengetahuan proyek (aitk) |
