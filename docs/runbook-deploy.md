# Runbook deploy produksi on-prem (T-023)

Paket: `docker-compose.prod.yml`, `Dockerfile` (target `app`, `worker`), `renderer/Dockerfile`, `deploy/upgrade.sh` (§7),
`deploy/` (Caddyfile, deploy.sh, backup.sh, restore.sh, storage-iam.mjs, check-public-presign.mjs).

## 1. Spesifikasi dan prasyarat

| Item | Minimum |
|---|---|
| VM | 4 vCPU, 16 GB RAM, SSD ≥ 100 GB (data + 2 × 9 GB temp worker + backup lokal) |
| OS | Linux x86-64/arm64 dengan Docker Engine ≥ 24 dan Compose v2 ≥ 2.20 |
| Jaringan | Port 80 dan 443 terbuka ke pengguna; DNS `APP_HOST` dan `STORAGE_HOST` → IP VM |
| Database | PostgreSQL 14–16 di host/server lain (bawaan) **atau** profil `db` (container PostgreSQL 16) |
| TLS | Sertifikat ACME publik, CA internal Caddy, atau sertifikat sendiri (`deploy/certs/`) |

Hanya service `proxy` yang mempublikasikan port. Redis (password + protected-mode), RustFS (console
mati), renderer (hanya jaringan internal `render`), dan worker tidak bisa dijangkau dari luar.

### PostgreSQL di host (bawaan)

```bash
sudo -u postgres createuser --pwprompt dashboard
sudo -u postgres createdb --owner dashboard data_dashboard
```

Container menjangkau host lewat `host.docker.internal`. PostgreSQL host harus mendengar di alamat
bridge Docker dan `pg_hba.conf` hanya mengizinkan subnet Docker untuk role ini, mis.:

```
# postgresql.conf
listen_addresses = 'localhost,172.17.0.1'
# pg_hba.conf
host  data_dashboard  dashboard  172.16.0.0/12  scram-sha-256
```

`DATABASE_URL=postgresql://dashboard:<password>@host.docker.internal:5432/data_dashboard`

## 2. Deploy pertama

```bash
git clone <repo> /data/docker-data/data-dashboard && cd /data/docker-data/data-dashboard
deploy/deploy.sh          # membuat .env.prod (semua secret acak, mode 600), lalu berhenti
$EDITOR .env.prod         # isi semua nilai ISI_* (host, domain email, DATABASE_URL, SMTP, kunci age)
deploy/deploy.sh          # build image, migrasi, init storage + service account, up, tunggu sehat
```

`deploy.sh` selesai dengan `Sehat: https://<APP_HOST>/api/health (N dtk)`. Urutan start dijaga Compose:
`migrate` dan `storage-init` (bucket, CORS, lifecycle, service account berpolicy prefix) harus selesai
sukses sebelum `app`/`worker`; `proxy` menunggu `app` dan `rustfs` sehat.

### Deploy tanpa build di VM (image siap pakai, disarankan)

Build Next di VM kecil/HDD lambat (olympus: 16 menit). Image tidak memuat nilai lingkungan, jadi build
sekali di mesin build (CPU/disk cepat, Docker buildx), lalu muat di VM:

```bash
# mesin build (folder repo, commit yang akan dirilis)
bash deploy/images.sh build              # 4 image linux/amd64 bertag v<versi package.json> (mis. v1.0.0)
bash deploy/images.sh save dashboard-images.tar.gz
scp dashboard-images.tar.gz <server>:/tmp/
# VM (folder aplikasi, kode commit yang sama)
bash deploy/images.sh load /tmp/dashboard-images.tar.gz   # mencetak IMAGE_TAG yang dimuat
echo IMAGE_TAG=v1.0.0 >> .env.prod       # atau ubah baris IMAGE_TAG yang ada
bash deploy/deploy.sh --no-build         # migrasi + up + tunggu sehat, tanpa build
```

Tag image bawaan = `v` + `version` di `package.json` (T-066); tag eksplisit (`images.sh build <tag>` atau env
`IMAGE_TAG`) selalu menang. `images.sh build` menolak tag yang dipakai container berjalan dan tidak menimpa
tag rilis bawaan yang sudah ada di image store (naikkan versi, atau beri tag eksplisit mis. `v1.0.0-<commit>`).
Commit pendek ikut sebagai build arg `APP_COMMIT` dan tampil di `/health` admin serta log start.

Disk mesin build sempit: alirkan langsung ke server tanpa berkas lokal —
`bash deploy/images.sh save - <tag> | ssh <server> 'cat > /tmp/dashboard-images.tar.gz'`.

**Latihan VM kosong** (tanpa menyentuh produksi): `bash deploy/empty-vm-drill.sh /tmp/dashboard-images.tar.gz`
di folder aplikasi — memuat image, membuat salinan terpisah (project `dashboard-vmkosong`, port 9643/9644,
volume dan secret baru, PostgreSQL container), menjalankan `deploy.sh --no-build` sampai `/api/health` hijau,
mencetak total waktu, lalu membongkar salinan itu. Penjaga: arsip bertag sama dengan produksi (mis. `latest`)
→ tag produksi dikembalikan + latihan batal; keempat image wajib ada di arsip dengan satu tag. Image hasil
muat tetap tersimpan (boleh dipakai untuk deploy produksi berikutnya, atau `docker rmi dashboard-*:<tag>`).
VM yang benar-benar kosong juga menarik image caddy/redis/rustfs/postgres dari Docker Hub (waktu di bawah
belum termasuk itu). Disk build sempit: build per image lalu `docker save dashboard-<image>:<tag> | gzip -1 |
ssh <server> 'cat > /tmp/dashboard-<image>-<tag>.tar.gz'`, hapus image lokal, ulangi; latihan menerima
beberapa arsip. Hasil di olympus 2026-10-19: muat arsip 1,5 GB (4,0 GB tar) 61 dtk + deploy
sampai `/api/health` hijau 58 dtk = **120 dtk** (lapisan image sudah ada di VM itu; di VM kosong tambahkan
waktu tulis ± 4 GB lapisan, dekompresinya sendiri 36 dtk). Build 4 image linux/amd64 di Mac (buildx, emulasi)
± 23 menit dan butuh ruang disk lega (± 10 GB sementara). Putaran utuh 2026-10-19: build di Mac satu
per satu + dialirkan ke VM (`save -` / per image) 14,5 menit (disk Mac tetap ≥ 10 GB), lalu di olympus muat 4
arsip (1,5 GB) 54 dtk + deploy sampai hijau 34 dtk = **88 dtk**. `deploy.sh` menolak `DEPLOY_ENV_FILE` tanpa
`DEPLOY_PROJECT` selain `dashboard` (file compose bernama `dashboard`: tanpa project lain, produksi tertimpa).

### Admin pertama

1. Daftar lewat `https://<APP_HOST>/register` dengan email perusahaan, lalu aktifkan dari email.
2. `docker compose --env-file .env.prod -f docker-compose.prod.yml exec app node scripts/admin-restore.mjs <email> --confirm`

### Isi panduan

```bash
docker compose --env-file .env.prod -f docker-compose.prod.yml run --rm worker \
  node_modules/.bin/tsx --conditions=react-server scripts/seed-guides.ts
# video rekaman (dari mesin yang menyimpan demo/guide-videos):
docker compose --env-file .env.prod -f docker-compose.prod.yml run --rm -v "$PWD/demo/guide-videos:/app/demo/guide-videos:ro" \
  worker node_modules/.bin/tsx --conditions=react-server scripts/seed-guides.ts --videos demo/guide-videos
```

Video satu artikel tanpa mengganti video lain (T-1tzp, mis. `satu-pivot-banyak-widget`): paling mudah lewat UI —
masuk sebagai admin → **Admin → Panduan** → **Ubah** artikelnya → **Video panduan**: isi judul, pilih `.webm`, **Unggah
video** (durasi + poster otomatis), lalu **Tambah takarir** dengan `.vtt`-nya, dan terbitkan. Lewat seed: salin folder
berisi `videos.json` (hanya entri artikel itu) + `.webm`/`.vtt`/`.poster.png` ke VM, lalu jalankan perintah video di atas
dengan `-v "<folder>:/app/demo/guide-videos:ro"` dan tambahan `--only <slug>`.

Setelah rilis G-6 (T-064): artikel baru (`lihat-data-seperti-excel`, `data-per-periode`) terbit dengan perintah di
atas; tiga artikel lama yang ikut diperbarui hanya ditimpa bila diminta, tanpa menyentuh artikel lain:
`... scripts/seed-guides.ts --update --only lihat-data-seperti-excel,data-per-periode,editor-ubah-dashboard,viewer-lihat-filter-ekspor,ganti-data-pemetaan`
(menimpa suntingan admin di kelima artikel itu).

Setelah rilis G-7 (T-076, v1.3.0): dua artikel baru (`perhitungan-seperti-pivottable`, `satu-pivot-banyak-widget`)
terbit dengan perintah seed biasa di atas; empat artikel lama yang ikut diperbarui hanya ditimpa bila diminta:
`... scripts/seed-guides.ts --update --only widget-pivot,editor-ubah-dashboard,viewer-lihat-filter-ekspor,mengenal-data-dashboard`
(menimpa suntingan admin di keempat artikel itu; jalankan perintah T-064 di atas lebih dulu bila rilis G-6 belum
pernah di-seed).

Setelah T-7rw4 (padanan editor artikel pivot + konteks Bantuan **Pivot tersimpan**; butuh migrasi
`t7rw4_guide_context_saved_pivot`, yang dijalankan upgrade biasa): dua artikel editor baru
(`editor-perhitungan-pivot`, `editor-pakai-pivot-tersimpan`) terbit dengan perintah seed biasa di atas; tiga
artikel lama yang berubah (isi, tautan, atau konteks) hanya ditimpa bila diminta:
`... scripts/seed-guides.ts --update --only perhitungan-seperti-pivottable,satu-pivot-banyak-widget,editor-ubah-dashboard`
(menimpa suntingan admin di ketiga artikel itu; jalankan sesudah perintah G-7 di atas bila keduanya belum pernah
dijalankan). Tanpa langkah ini artikel 17 tetap tanpa konteks dan artikel 08 tetap merujuk tanpa tautan.

### TLS untuk akses LAN lewat IP (root CA berpembatasan, `deploy/lan-cert.sh`)

Tanpa domain publik, sertifikat dibuat dari **root CA milik perusahaan dengan name constraints**: root
hanya sah untuk IP server ini, dan kunci root disimpan **offline** di mesin admin (bersama kunci backup).
Server hanya memegang kunci leaf, sehingga server yang dibobol tetap tidak bisa dipakai memalsukan situs
lain bagi komputer pengguna. Jangan sebar CA internal Caddy (`CADDY_TLS=internal`) ke komputer pengguna:
root itu tanpa pembatasan dan kuncinya ada di VM (review T-023 F5); hanya untuk uji singkat.

1. Mesin admin (sekali, 10 tahun): `deploy/lan-cert.sh root <folder-kunci> <ip>`.
2. Server: `bash deploy/lan-cert.sh csr <ip> > /tmp/leaf.csr` (kunci leaf → `deploy/certs/privkey.pem`).
3. Mesin admin: `deploy/lan-cert.sh sign <folder-kunci> leaf.csr <ip> > fullchain.pem` (825 hari) → salin
   ke server `deploy/certs/fullchain.pem`; `.env.prod`: `CADDY_TLS=/certs/fullchain.pem /certs/privkey.pem`.
4. Perpanjang sebelum kedaluwarsa: ulangi 2–3 lalu `$C up -d --force-recreate --no-deps proxy`.

Pasang root (`dashboard-lan-root.crt`) **sekali** di setiap komputer pengguna:

- **Windows**: massal lewat GPO (Computer Configuration → Policies → Windows Settings → Security Settings →
  Public Key Policies → Trusted Root Certification Authorities), atau klik dua kali → *Install
  Certificate* → *Local Machine* → **Trusted Root Certification Authorities**. Chrome/Edge memakai store Windows.
- **macOS**: `security add-trusted-cert -r trustRoot -k ~/Library/Keychains/login.keychain-db dashboard-lan-root.crt`
  (atau Keychain Access → System → *Always Trust*).
- **Firefox**: Settings → Privacy & Security → Certificates → View Certificates → Authorities → Import.

Bagikan lewat jalur tepercaya (GPO/shared drive kantor, bukan unduhan http) dan cocokkan sidik jari:
`openssl x509 -in dashboard-lan-root.crt -noout -fingerprint -sha256`.

### Domain publik lewat reverse proxy (Nginx Proxy Manager)

Domain (mis. `data-slicer.pcpexpress.com`) diterbitkan reverse proxy di depan yang memegang sertifikat
publik dan meneruskan ke Caddy di VM (`https://<ip-vm>:8443` untuk app, `:8444` untuk storage; sertifikat
LAN Caddy tidak perlu diverifikasi proxy). Di `.env.prod`:

- `APP_PUBLIC_HOST=data-slicer.pcpexpress.com` — Caddy ikut melayani host ini di port `APP_PORT`
  (tanpa ini Caddy menjawab **200 kosong** untuk host yang tidak dikenal → layar putih), dan `APP_URL`
  (link email, cookie) memakai domain. Akses lewat `APP_HOST` (IP) tetap jalan.
- `TRUSTED_PROXIES=<ip proxy>/32` (olympus: Nginx Proxy Manager 10.3.3.56) — `X-Forwarded-For` dari proxy
  dipercaya sehingga rate limit dan AuditLog melihat IP pengguna, bukan IP proxy.
- `STORAGE_PUBLIC_HOST=<domain storage>` — perlu proxy host kedua ke `:8444` (Host diteruskan apa adanya,
  body ≥ 32 MB) agar unggah/unduh dari luar LAN dan tanpa CA LAN berjalan; tanpa ini URL unggah tetap
  `STORAGE_HOST` (IP).

Setelah mengubahnya: `$C run --rm --no-deps storage-init` (CORS mengizinkan domain + IP) lalu
`$C up -d --no-deps --force-recreate proxy app worker`. Pengguna di kantor yang membuka domain lewat IP
publik kantor (hairpin NAT) terlihat sebagai satu IP publik — batas per IP (login gagal 10 per 10 menit,
daftar 20 per jam) jadi dibagi seluruh kantor. Sebaiknya DNS internal mengarahkan domain ke proxy di LAN
(olympus: `data-slicer.pcpexpress.com → 10.3.3.56`) agar IP pengguna asli terbaca. Dicek 2026-10-19: NPM
menimpa `X-Real-IP` dan menambah `X-Forwarded-For`; header palsu dari klien diabaikan (`client_ip` di log
Caddy = IP asli), jadi IP untuk rate limit/AuditLog tidak bisa dipalsukan.

### Contoh: server olympus (LAN 10.3.3.221)

`APP_HOST=10.3.3.221:8443`, `APP_PORT=8443`, `STORAGE_HOST=10.3.3.221:8444`, `TLS_DEFAULT_SNI=10.3.3.221`,
`CADDY_TLS=/certs/fullchain.pem /certs/privkey.pem` (root LAN berpembatasan IP), `COMPOSE_PROFILES=hostdb`
(PostgreSQL 14 host hanya di 127.0.0.1 → relay `pg-relay`), dua worker (`WORKER_REPLICAS=2`, `WORKER_MEM=3g`)
dan `APP_MEM=3g` — VM 8 vCPU / 11 GB (Okt 2026; awalnya 2 vCPU / 7,8 GB dengan satu worker). Port 80 dipakai Apache; Caddy hanya mendengar di 8443
(app) dan 8444 (storage), port 443 dibiarkan untuk aplikasi lain. Role/DB: `sudo bash deploy/host-db.sh`; SMTP: `bash deploy/set-smtp.sh noreply-dashboard@pcpexpress.co.id`
(jalankan dari terminal interaktif, bukan lewat skrip non-TTY).

## 3. Verifikasi pasca-deploy

```bash
C="docker compose --env-file .env.prod -f docker-compose.prod.yml"
$C ps                                                        # semua healthy / migrate+storage-init exited 0
curl -fsS https://<APP_HOST>/api/health                      # {"status":"ok"} termasuk storage + renderer
$C run --rm --no-deps worker node deploy/check-public-presign.mjs [--insecure]   # --insecure untuk CA internal Caddy
# dengan root LAN (deploy/lan-cert.sh): percayakan root ke Node, tanpa --insecure
$C run --rm --no-deps -v "$PWD/deploy/certs/root.crt:/run/root.crt:ro" -e NODE_EXTRA_CA_CERTS=/run/root.crt \
  worker node deploy/check-public-presign.mjs
node scripts/smoke-prod-headers.mjs https://<APP_HOST>       # dari mesin dengan Node + Playwright
$C exec app node scripts/admin-restore.mjs tidak-ada@<domain> --confirm   # wajib exit 1, tanpa perubahan
```

`check-public-presign.mjs` menandatangani UploadPart 16 MiB dengan endpoint publik dan mengirimnya lewat
proxy (harus 200, bukan 403 SignatureDoesNotMatch / 413), lalu memastikan proxy menolak metode/path di
luar allowlist dan respons storage membawa `X-Content-Type-Options: nosniff` + `Content-Security-Policy:
sandbox`.

## 4. Backup

Backup harian 02:00 WIB (service `backup`, `deploy/backup.sh`): `pg_dump` + salinan seluruh bucket →
tar → **age** dengan kunci publik → `/backups` (volume) + salinan off-VM lewat rclone, retensi 30 hari.

1. Di laptop admin (BUKAN di VM): `age-keygen -o kunci-backup-dashboard.txt` → simpan di brankas.
   Kunci publiknya (`age1…`) diisi ke `BACKUP_AGE_RECIPIENT`.
2. **Off-VM ke NAS Synology dari aplikasi (SFTP, disarankan):** siapkan di DSM sekali:
   - **Panel Kontrol › Layanan File › FTP › SFTP**: aktifkan (port bawaan 22).
   - Buat user khusus, mis. `dashboard-backup`, **tanpa hak admin**, dengan shared folder sendiri
     (mis. `backup-data-dashboard`) yang hanya bisa dibaca/ditulis user itu; izin aplikasi SFTP diberikan.
     Jangan memakai akun admin/pribadi: password tersimpan di VM bersama.
   - Disarankan: snapshot Btrfs (Snapshot Replication) pada shared folder itu agar salinan tidak bisa
     dihapus permanen dari VM yang dibobol.

   Lalu admin membuka **Admin › Backup**, mengisi alamat NAS (harus bisa dijangkau VM), port, username,
   password, dan folder (`/backup-data-dashboard`), menekan **Tes koneksi** (tulis/baca/hapus file uji;
   kunci host NAS dicatat dan sidik jarinya tampil), lalu **Simpan**. Konfigurasi masuk ke volume
   `backup-config` (`app/offsite.json`, 600; password tidak di DB/log) dan dipakai backup berikutnya tanpa
   restart/SSH. `backup.sh` memvalidasi ulang isinya, menyalin lewat rclone sftp dengan password di-obscure
   lewat stdin dan known_hosts berisi **hanya kunci host yang dipin** (tanpa set_modtime + `--ignore-existing`: DSM menolak mengatur izin/waktu file lewat SFTP di folder ber-ACL, jadi arsip yang sudah ada dilewati per nama) (NAS lain/diinstal ulang → ditolak
   sampai admin menekan **Lupakan kunci host**, mengisi password lagi (password tersimpan hanya dipakai ulang untuk kunci host yang sama), lalu tes ulang). Bila NAS tidak terjangkau (down, jaringan,
   password salah): arsip **ditahan di VM** (retensi lokal tidak membuangnya sebelum tersalin; dibuang
   setelah `BACKUP_RETENTION_DAYS`), dikirim ulang `backup.sh --sync` tiap 30 menit, dan admin aktif diberi
   email sekali per perubahan status (tertunda, gagal, pulih) + banner di aplikasi. Status: `status.json` di
   volume yang sama (tampil di Admin › Backup). Konfigurasi dari aplikasi aktif → mengalahkan
   `BACKUP_REMOTE`. Format lama (S3, sebelum T-y8qq) dianggap tidak valid: status gagal sampai disimpan ulang.
   **Alternatif tanpa aplikasi** (server SFTP lain, autentikasi kunci SSH, `authorized_keys` terbatas):
   ```bash
   bash deploy/offsite-key.sh <host> <port> <user> <folder> [ip-sumber-VM]
   ```
   Skrip membuat kunci SSH khusus backup (`deploy/offsite/`, 600, di-gitignore), menyimpan host key
   target (**cocokkan sidik jari yang dicetak** dengan yang diketahui dari mesin lain), dan menulis remote
   `offsite` ke `deploy/rclone.conf`. Baris `authorized_keys` yang dicetak dipasang di akun target: hanya
   SFTP (`internal-sftp`), tanpa shell/forwarding, dan hanya dari IP sumber VM — IP yang dilihat target
   (olympus → files.pcpexpress.com: IP publik kantor 115.178.128.130 karena lewat NAT). Lalu di `.env.prod`:
   `BACKUP_REMOTE=offsite:<folder>` dan `BACKUP_LOCAL_RETENTION_DAYS=7` (salinan 30 hari di off-VM,
   7 hari di VM agar disk VM hemat), lalu `$C up -d --no-deps --force-recreate backup`.
   Paling tahan ransomware: NAS yang **menarik** dari VM (Hyper Backup/rsync terjadwal dari NAS, akun VM
   tidak bisa menghapus salinan di NAS) atau snapshot Btrfs tak-terhapus di shared folder tujuan.
   Tanpa remote, backup hanya di VM (peringatan di log).
3. Uji sekarang: `$C run --rm --no-deps backup backup.sh` → log `arsip: dashboard-<UTC>.tar.age` dan
   `tersalin ke …` (atau `PERINGATAN: salinan ke … gagal … arsip ditahan di VM`). Kirim ulang manual arsip
   tertunda: `$C run --rm --no-deps backup backup.sh --sync`.
4. Verifikasi arsip tanpa memulihkan (dari laptop admin, kunci lewat stdin):
   ```bash
   ssh <server> bash /data/docker-data/data-dashboard/deploy/verify-backup.sh < kunci-backup-dashboard.txt
   ssh <server> bash /data/docker-data/data-dashboard/deploy/verify-backup.sh --remote < kunci-backup-dashboard.txt
   ```
   Hasil wajib `checksum: cocok` dan `arsip bisa dipulihkan` (`--remote` = salinan off-VM).

## 5. Restore (VM lain atau sama)

1. Deploy kosong di VM tujuan (§2), dengan `.env.prod` baru.
2. Hentikan penulis: `$C stop app worker`.
3. Salin arsip `dashboard-<UTC>.tar.age` + `.sha256` (nama asli, satu folder) dan kunci privat age ke
   VM sementara, lalu:
   ```bash
   $C run --rm -v /path/kunci-backup-dashboard.txt:/run/age-key:ro -v /path/folder-arsip:/run/arsip:ro \
     backup bash /usr/local/bin/restore.sh /run/arsip/dashboard-<UTC>.tar.age /run/age-key
   ```
   Log harus memuat `dashboard-<UTC>.tar.age: OK` (checksum); `PERINGATAN … .sha256 tidak ada` berarti
   berkas `.sha256` tertinggal atau arsip diganti namanya.
4. `$C start worker app`; hapus kunci privat dari VM.
5. Cek: login, daftar dataset sama, dashboard terbuka dengan angka sama, video panduan bisa diputar.

### Latihan restore (tanpa menyentuh produksi)

Minimal tiap 3 bulan dan setelah upgrade besar. Dari laptop admin (kunci privat lewat stdin, tidak
ditulis ke VM):

```bash
ssh <server> bash /data/docker-data/data-dashboard/deploy/restore-drill.sh < kunci-backup-dashboard.txt
```

Skrip membuat backup baru (sidik produksi diambil tepat sebelum dan sesudahnya; berbeda = produksi
sedang dipakai, diulang maks 3 kali), lalu salinan terpisah (project `dashboard-restoretest`, PostgreSQL
container sementara, port 9443/9444, semua secret baru, tanpa worker). Arsip dipulihkan, sidik salinan
diambil sebelum app jalan, lalu dibandingkan dengan produksi: jumlah baris + md5 isi per tabel dan
daftar objek storage (ukuran+path). Health penuh salinan dicek, lalu salinan dibongkar (`down -v`).
Hasil wajib `LATIHAN RESTORE LULUS`; catat di tabel berikut.

### Log uji restore

| Tanggal | Arsip | Tujuan | Hasil | Oleh |
|---|---|---|---|---|
| 2026-10-17 | dashboard-20261017T033626Z.tar.age (20 MB) | olympus, salinan terpisah `dashboard-restoretest` (`restore-drill.sh`) | LULUS: checksum OK, baris per tabel identik, daftar objek storage identik, `/api/health` 200 | claude-code (T-023) |
| 2026-10-17 | dashboard-20261017T051529Z.tar.age (20 MB) | olympus, salinan terpisah (PG16 container, UTF8) dari produksi PG14 host (SQL_ASCII) | LULUS: checksum OK, isi per tabel identik (jumlah + md5 tiap baris; produksi tidak berubah selama backup), daftar objek storage identik, `/api/health` 200, ±2 menit | claude-code (T-023) |

## 6. Operasi

- **Log**: `$C logs -f app worker` (json-file dirotasi 5 × 20 MB per service). Log akses proxy tanpa
  query string, tanpa cookie/Authorization; path `/render`, `/verify`, `/reset-password` diredaksi.
- **Sinkron kode tanpa deploy penuh**: Caddyfile dan skrip backup di-mount per file; container lama tetap
  melihat isi lama setelah file diganti. `deploy.sh` selalu membuat ulang `proxy` + `backup`; bila hanya
  menyalin file, jalankan `$C up -d --no-deps --force-recreate proxy backup`.
- **Encoding database**: `host-db.sh` membuat database UTF8 (C.UTF-8). Database olympus (dulu SQL_ASCII,
  warisan cluster locale C) sudah dikonversi 2026-10-19 dengan `deploy/convert-db-utf8.sh` (T-y3y1; sudo,
  downtime ±20 dtk, sidik isi identik). Cadangan konversi: database `data_dashboard_sqlascii_20261019045827`
  + dump `/var/tmp/data_dashboard-20261019T045827Z.dump` — hapus setelah backup harian berikutnya
  terverifikasi (`sudo -u postgres dropdb data_dashboard_sqlascii_20261019045827`). Skrip aman dijalankan
  ulang: database yang sudah UTF8 dilewati.
- **Worker mati saat ingest**: `$C restart worker` — job diulang (idempoten T-006), versi berakhir READY.
- **Worker mati saat koreksi skema (T-040)**: job recast dilanjutkan otomatis setelah lock job BullMQ
  kedaluwarsa (≤ 5 menit, maks. 2 kali); segmen yang sudah selesai tidak diulang. Migrasi T-040 hanya
  menambah kolom `SegmentTyped.profile` (nullable): file lama dibaca profilnya sekali pada recast pertama.
- **Kuota penyimpanan (T-039)**: `USER_STORAGE_QUOTA_BYTES` (bawaan 20 GiB) kini dihitung dari byte yang
  benar-benar tersimpan — segmen data yang dirujuk versi hidup + file sumber yang belum dihapus retensi
  7 hari + ukuran unggahan yang sedang berjalan; init unggah memproyeksikan file + ±1,2× parquet.
  - Sebelum deploy T-039 (hitungan lama, langsung di PostgreSQL host):
    `sudo -u postgres psql -d data_dashboard -c 'SELECT u.email, round(sum(v."sizeBytes")/1024.0^3, 2) AS gb FROM "DatasetVersion" v JOIN "Dataset" d ON d.id = v."datasetId" JOIN "User" u ON u.id = d."ownerId" WHERE v.status <> '"'"'FAILED'"'"' GROUP BY u.email ORDER BY gb DESC'`.
  - Tepat setelah deploy (migrasi T-039 diterapkan) dan lagi setelah pemeriksaan malam pertama, cetak laporan
    per pengguna (hitungan lama vs baru, persen, file lama yang belum terukur):
    `$C run --rm --no-deps worker node scripts/quota-report.mjs` (image app tidak membawa skrip ini).
  - Ukuran file segmen lama diisi pemeriksaan malam `segment-audit` (03.00 WIB); untuk segera:
    tunggu satu malam atau jalankan ulang worker lalu cetak laporan lagi.
  - Masa transisi `QUOTA_GRACE_DAYS` (bawaan 14 hari sejak migrasi T-039 diterapkan): pengguna yang masih
    muat menurut hitungan lama hanya diberi peringatan (banner), tidak ditolak.
  - Pengguna ≥ 80% kuota melihat banner di setiap halaman. Menaikkan kuota: set `USER_STORAGE_QUOTA_BYTES`
    di `.env.prod` lalu `$C up -d app worker`. Syarat disk: volume RustFS ≥ Σ kuota pengguna aktif + 20%.
- **Update** (migrasi maju otomatis). Untuk rilis G-6 (migrasi T-036…T-060) pakai prosedur §7 —
  `deploy/upgrade.sh` mengerjakan langkah di bawah ini plus gerbang pemeriksaan dan rollback database.
  Pra-deploy dulu — langkah manual, `deploy.sh` tidak mengerjakannya:
  ```bash
  stamp=$(date +%Y%m%d%H%M); tag=$(sed -n 's/^IMAGE_TAG=//p' .env.prod | tail -1); tag=${tag:-latest}
  for i in app worker renderer backup; do docker tag "dashboard-$i:$tag" "dashboard-$i:prev-$stamp"; done
  # Kode lama (compose, Caddyfile, skrip) TANPA rahasia: semua .env.prod* (termasuk cadangan .env.prod.bak-*)
  # dikecualikan, arsip hanya bisa dibaca pemilik.
  (umask 077; tar -czf "../data-dashboard-prev-$stamp.tar.gz" --exclude='./.env.prod*' \
    --exclude=./deploy/offsite --exclude=./deploy/certs --exclude=./deploy/rclone.conf .)
  $C run --rm --no-deps backup backup.sh                               # backup sebelum migrasi
  ```
  Jalankan pra-deploy **sebelum** `.env.prod` diberi `IMAGE_TAG` baru (alur `deploy/images.sh` /
  `--no-build`), supaya `prev-<stamp>` menunjuk image lama. Lalu sinkron kode (`git pull`, atau `git archive`
  dari mesin dev → ekstrak di folder ini) dan `bash deploy/deploy.sh`.
- **Rollback cepat** ke kondisi sebelum deploy (kode + image; `<stamp>` dari pra-deploy):
  ```bash
  tar -xzf "../data-dashboard-prev-<stamp>.tar.gz"                     # kode lama
  tag=$(sed -n 's/^IMAGE_TAG=//p' .env.prod | tail -1); tag=${tag:-latest}
  for i in app worker renderer backup; do docker tag "dashboard-$i:prev-<stamp>" "dashboard-$i:$tag"; done
  $C up -d --no-build --wait && $C up -d --no-deps --force-recreate proxy backup
  ```
  Bila `IMAGE_TAG` diubah oleh deploy (alur `deploy/images.sh`), kembalikan juga nilainya di `.env.prod`.
  Alternatif: `git checkout <tag sebelumnya> && deploy/deploy.sh`. Migrasi DB tidak dibalik otomatis —
  pulihkan dari backup (§5) bila skema baru tidak kompatibel dengan kode lama.
- **Rotasi AUTH_SECRET**: tambahkan secret baru di DEPAN (`AUTH_SECRET=baru,lama`), deploy; setelah
  masa sesi lewat (12 jam), hapus yang lama dan deploy lagi.
- **Kredensial storage**: app/worker memakai `S3_APP_*` (service account berpolicy prefix raw/,
  parquet/, exports/, guides/); akun root RustFS hanya untuk `storage-init` dan `backup`.

## 7. Upgrade rilis G-6 (produksi tertinggal: migrasi T-036…T-060)

Produksi olympus terakhir di-deploy sebelum T-036: migrasi terakhirnya `20261017104143_t_j9j6_guide_video_caption`
(dicek ulang otomatis oleh preflight). Rilis ini menambah 15 migrasi (`20261019140000_t036_segments` …
`20261021110000_t060_period_group`): model segmen + manifest (T-036/T-037), GC (garbage collection,
pembersihan) segmen 24 jam (T-038), kuota byte nyata (T-039), recast per segmen (T-040), baris judul per file
typed (T-gcn8), ekspor Lihat data (T-046), model data per periode (T-049…T-060). Semua aditif dengan backfill,
kecuali T-049 yang menulis ulang enum `VersionMode` (lock singkat tabel `DatasetVersion`).

Seluruh prosedur memakai satu skrip, `deploy/upgrade.sh`, dengan **gerbang**: setiap langkah berhenti bila
pemeriksaan gagal dan mencetak langkah berikutnya. Status disimpan di `../data-dashboard-upgrade/<stamp>/`
(mode 700, di luar folder aplikasi): `state.env` (tanpa rahasia), dump database, arsip kode lama, log.
Jeda layanan ± 2–5 menit (langkah 4–5); umumkan ke pengguna dan pilih jam sepi.

**Kenapa rollback = image lama + database lama.** Kode lama (sebelum T-036) tidak bisa menulis ke skema baru
(`Sheet.lineageId` NOT NULL; enum `VersionMode` tanpa APPEND dan dengan nilai periode), dan setelah rilis baru
membuat data periode (T-049/T-052/T-060) atau memilih ulang baris judul per file (T-gcn8), bentuk data tidak
lagi bisa dibaca kode lama. Jadi rollback selalu memulihkan database dari dump pra-upgrade. Data yang dibuat
setelah upgrade hilang dari database (disimpan dulu di dump pengaman).

### Variabel lingkungan baru (opsional, bawaan aman di `docker-compose.prod.yml`)

| Variabel | Bawaan | Arti |
|---|---|---|
| `QUOTA_GRACE_DAYS` | 14 | Masa transisi kuota byte nyata (T-039): pelanggaran hanya peringatan, dihitung dari waktu migrasi T-039 diterapkan |
| `GRID_MAX_CONCURRENCY` | 2 | Slot query global maks untuk Lihat data (T-042); dipotong ke `MAX_QUERY_CONCURRENCY − 1` |
| `GRID_ORDER_CACHE_BYTES` | 1073741824 (1 GiB) | Cache urutan Lihat data (T-062): permutasi + potongan terurut di disk lokal app (`<QUERY_CACHE_DIR>/order/<pid>-…`; sisa proses yang sudah mati dibersihkan saat app mulai), LRU (batas lunak: bisa sesaat lewat sebesar satu berkas yang sedang ditulis), TTL 30 menit; 0 = mati. Sediakan ruang disk app sebesar nilai ini |
| `PERIOD_KEEP_DEFAULT` | 24 | Periode disimpan per dataset bila pemilik tidak mengatur |
| `PERIOD_KEEP_MAX` | 60 | Batas atas pengaturan "Simpan N periode" |
| `PERIOD_SHEET_MAX_ROWS` | 10000000 | Baris per sheet, dijumlah atas semua periode |
| `DATASET_MAX_DATA_BYTES` | 17179869184 (16 GiB) | Byte parquet per dataset |
| `PERIOD_SHEET_MAX_SEGMENTS` | 120 | Segmen per sheet |
| `PERIOD_WARN_PCT` | 80 | Ambang peringatan meter (persen) |
| `PERIOD_SHRINK_CONFIRM_PCT` | 50 | Penggantian periode yang menyusut lebih dari ini wajib dicentang |
| `PERIOD_STRAY_PCT` | 10 | Periode dengan baris < persen ini dari terbesar = "kemungkinan nyasar" |
| `PERIOD_MAX_FILES` | 10 | File per kelompok "satu periode dari beberapa file" (2–36) |
| `PERIOD_CONFIRM_TTL_HOURS` | 168 | Unggahan periode menunggu konfirmasi dibuang setelah sekian jam |

Tidak perlu mengisi apa pun di `.env.prod`; isi hanya untuk mengubah bawaan. **HTTPS:** fitur salin ke papan
klip (T-045, Lihat data) butuh *secure context* — `APP_URL` di compose selalu `https://…` dan app menolak start
produksi bila bukan https. Pengguna membuka lewat `https://10.3.3.221:8443` (root LAN terpasang) atau domain
publik; lewat `http://` atau peringatan sertifikat yang di-bypass tombol salin bisa gagal.

### Langkah (pemilik, di olympus, folder `/data/docker-data/data-dashboard`)

0. **Mesin build** (commit rilis): `bash deploy/images.sh build` → `bash deploy/images.sh save - | ssh olympus
   'cat > /tmp/dashboard-images.tar.gz'` (§2). Salin juga skrip upgrade sendiri ke server:
   `scp deploy/upgrade.sh olympus:/tmp/upgrade.sh`.
1. **Preflight dengan kode LAMA** (belum sinkron kode; tidak mengubah produksi):
   ```bash
   cd /data/docker-data/data-dashboard
   bash /tmp/upgrade.sh preflight
   ```
   Isi: service berjalan; tidak ada migrasi gagal di `_prisma_migrations`; `SELECT count(*) FROM
   "DatasetVersion" WHERE mode::text='APPEND'` = 0 (syarat T-049); tidak ada ingest (UPLOADED/INGESTING) atau
   ekspor (QUEUED/RUNNING) yang sedang jalan (`FORCE=1` bila yakin; job diulang worker baru); hitungan kuota
   lama → `kuota-sebelum.txt`; ruang disk Docker ≥ `MIN_FREE_GB` (15) dan folder status ≥ 2 × ukuran database;
   ID image app/worker/renderer/backup yang sedang jalan dicatat dan diberi tag `dashboard-*:prev-<stamp>`;
   arsip kode lama tanpa `.env.prod*`/kunci/sertifikat; backup terenkripsi lengkap (`backup.sh`, nama arsip
   dicatat); dump `pg_dump -Fc` ke `db-<stamp>.dump` lalu diverifikasi (tidak kosong, `pg_restore --list`
   memuat semua tabel). Harus berakhir `PREFLIGHT LULUS`.
2. **Sinkron kode rilis** (`git pull`, atau `git archive` dari mesin dev → ekstrak di folder ini).
3. **Muat image** (tag dari arsip, `IMAGE_TAG` di `.env.prod` diganti otomatis; cadangan `.env.prod.bak-upgrade`):
   ```bash
   bash deploy/upgrade.sh load /tmp/dashboard-images.tar.gz     # beberapa arsip per image juga boleh
   ```
   Tag arsip dibaca dari `manifest.json` sebelum `docker load`: arsip bertag sama dengan produksi lama atau
   `prev-*` ditolak. Tanpa mesin build: `bash deploy/upgrade.sh build` (build di VM, ± 16–21 menit di olympus).
4. **Migrasi + gerbang** (jeda layanan mulai: app + worker dihentikan):
   ```bash
   bash deploy/upgrade.sh migrate
   ```
   Sebelum dan sesudah app + worker dihentikan job aktif dicek lagi (ada job → berhenti tanpa perubahan;
   bila job mulai di antaranya, app/worker dinyalakan lagi). Lalu **dump database baru** (`db-migrate-*.dump`,
   diverifikasi seperti di preflight) menggantikan dump preflight sebagai dump rollback, sehingga unggahan
   atau perubahan selama langkah 2–3 tidak hilang bila rollback. Bila `migrate` diulang setelah gerbang gagal
   (database sudah berskema baru), dump rollback tetap yang lama. Lalu `prisma migrate deploy` dengan image
   baru dan pemeriksaan pasca-migrasi (wajib lulus semua; kueri yang error = gagal, bukan "0 baris"):
   - `scripts/check-segments.mjs` (T-036): setiap sheet punya satu segmen legacy, manifest = typedKey,
     lineage satu dataset, posisi kolom typed = skema (T-037) — semua 0 selisih. Hanya bermakna untuk data
     sebelum rilis ini (dataset per periode kelak sah punya manifest > 1 segmen).
   - T-gcn8 (wajib 0 baris): file typed yang judulnya (`SegmentTyped.headerRow`) beda dari sheet satu-segmen
     yang merujuknya, atau dirujuk beberapa sheet dengan judul berbeda.
   - T-049/T-060 (wajib 0): belum ada versi/segmen periode, kelompok, atau peta kolom.
   - `scripts/quota-report.mjs` (T-039): bandingkan dengan `kuota-sebelum.txt`; `belumTerukur` diisi
     pemeriksaan malam `segment-audit` (03.00 WIB).
   Gagal → app/worker tetap berhenti; kirim `*.log` di folder status ke pengembang lalu rollback (langkah R).
5. **Nyalakan + verifikasi**:
   ```bash
   bash deploy/upgrade.sh start
   ```
   `deploy.sh --no-build` (up, storage-init, recreate proxy/backup, `/api/health` hijau lewat TLS), lalu:
   `/api/health` ok, `/login` 200 dengan HSTS, `APP_URL` https, `check-public-presign.mjs` (unggah 16 MiB lewat
   proxy + allowlist storage; root LAN dipakai bila `deploy/certs/root.crt` ada), `admin-restore.mjs` email tak
   dikenal exit 1, `check-segments.mjs` sekali lagi, `ps`.
6. **Uji manual** (akun uji non-admin + admin): login; dashboard lama terbuka dengan angka sama; Lihat data
   sebuah sheet (gulir, urut, saring, salin ke Excel); ekspor CSV + PDF; unggah file kecil sampai READY; ubah
   tipe satu kolom (recast); Admin › Backup tampil. Dari mesin dengan Playwright (opsional):
   `node scripts/smoke-prod-headers.mjs https://10.3.3.221:8443`.
7. **Besok**: `$C run --rm --no-deps worker node scripts/quota-report.mjs` (ukuran file lama sudah terisi);
   backup harian 02.00 berhasil dan `verify-backup.sh` cocok → hapus dump plaintext
   semua `../data-dashboard-upgrade/<stamp>/db-*.dump` (preflight, migrate, pengaman rollback). Catat hasil di
   Notes T-023.

### R. Rollback

```bash
bash deploy/upgrade.sh rollback          # minta ketik ROLLBACK; ROLLBACK_YES=1 untuk tanpa tanya
```

Pemeriksaan dulu (belum ada yang dihentikan/dibuang): nama database sama dengan yang dicatat preflight, dan
setiap tabel `public` saat ini ada di dump rollback atau termasuk tabel baru rilis ini (`SheetLineage`,
`Segment`, `SegmentTyped`, `SheetSegment`, `UploadQueue`, `UploadQueueItem`, `SavedPivot`); selain itu rollback
dibatalkan.
Urutan: app + worker berhenti → dump pengaman database saat ini (`db-sebelum-rollback-*.dump`) → database
dipulihkan dari dump rollback (`DB_DUMP` di `state.env`: `db-migrate-*.dump`, atau `db-<stamp>.dump` bila
migrate belum jalan) dalam **satu transaksi** (semua tabel + enum skema `public` dibuang lalu dump dimuat;
gagal = database tetap seperti sebelum langkah ini; `pg_restore --clean` saja tidak cukup karena tabel baru
menahan DROP tabel lama lewat FK) → kode lama dari arsip → `IMAGE_TAG=prev-<stamp>` → `up --wait` +
recreate proxy/backup. Migrasi lama di container `migrate` = no-op.

Batas: rollback cepat hanya **≤ 20 jam setelah `start` pertama** (dicatat sekali; `start` ulang tidak
menggesernya). Sesudahnya GC segmen (24 jam) bisa sudah menghapus
objek storage yang dirujuk database lama; skrip menolak (kecuali `ROLLBACK_LATE=1`) dan pemulihan memakai
restore lengkap §5 dari arsip backup preflight (`BACKUP_ARCHIVE` di `state.env`, butuh kunci privat age dari
laptop admin). Objek yang ditulis rilis baru (`parquet/<dataset>/seg/…`) tertinggal tanpa rujukan setelah
rollback — aman, bisa dibersihkan manual nanti. Worker lama mencatat peringatan "job maintenance tidak dikenal"
untuk jadwal baru (segment-gc, segment-audit, …) di Redis — tidak berbahaya.

**Rollback ke versi sebelum pivot 4 tingkat × 8 nilai (T-070, rilis setelah 1.1.0).** Rilis ini tanpa
migrasi DB, jadi rollback bisa berupa ganti image saja (`IMAGE_TAG` lama, DB tetap) — maka data yang dibuat di
rilis baru tetap ada dan versi lama memperlakukannya sebagai berikut:

- Widget pivot dengan **> 2 tingkat baris, > 3 nilai, atau `subtotalLevels`**: spec ditolak zod versi lama →
  kartu menampilkan "Pengaturan widget tidak valid (rows/values: …)" (query `INVALID`), juga untuk viewer;
  ekspor/PDF widget itu gagal. Data dan spec di DB tidak dihapus; widget kembali normal setelah upgrade lagi.
- Tautan/status filter `?f=` yang memuat saringan pivot `row2`/`row3`: klien lama menganggap seluruh status
  tidak valid → **semua** filter dashboard di URL itu diabaikan diam-diam (dashboard tampil tanpa filter);
  ekspor PDF dengan status itu ditolak (filter tidak valid), bukan dicetak tanpa filter.

Langkah sebelum rollback image (pemilik): cari widget terdampak
`SELECT id, "dashboardId" FROM "Widget" WHERE type = 'pivot' AND (jsonb_array_length(spec->'rows') > 2 OR jsonb_array_length(spec->'values') > 3 OR spec ? 'subtotalLevels');`
lalu **kurangi baris/nilai widget itu di panel sebelum rollback** (atau terima kartu "tidak valid" sampai
upgrade berikutnya), dan bagikan ulang tautan tanpa saringan tingkat 3–4. Rollback lewat `upgrade.sh
rollback` (DB dipulihkan dari dump preflight) membuang perubahan widget sesudah upgrade sekaligus, jadi
tidak terdampak.

**Rollback ke versi sebelum Top N pivot (T-071).** Sama seperti T-070 (tanpa migrasi DB): widget pivot yang
memakai **Top N per baris** (`topN` di field baris) ditolak zod versi lama → kartu "Pengaturan widget tidak
valid (rows.…: …)", ekspor/PDF widget itu gagal; spec di DB tetap dan kembali normal setelah upgrade lagi.
Sebelum rollback image, cari widget terdampak
`SELECT id, "dashboardId" FROM "Widget" WHERE type = 'pivot' AND EXISTS (SELECT 1 FROM jsonb_array_elements(spec->'rows') r WHERE r ? 'topN');`
lalu set "Tampilkan" ke "Semua" di panel widget itu (atau terima kartu "tidak valid" sampai upgrade
berikutnya). Rollback lewat `upgrade.sh rollback` (DB dari dump preflight) tidak terdampak.

**Rollback ke versi sebelum pivot tersimpan (T-072, migrasi `20261021170000_t072_saved_pivot`).** Migrasi
aditif: tabel baru `SavedPivot` + kolom `Widget.savedPivotId` (nullable, FK NO ACTION) + indeksnya; widget
lama tidak diubah (diuji di PostgreSQL 14: isi kolom lama `Widget` identik sebelum/sesudah migrasi). Kode lama
tidak membaca keduanya, jadi:

- **Disarankan:** `bash deploy/upgrade.sh rollback` (image `prev-*` + database dari dump pra-upgrade, satu
  transaksi; `SavedPivot` termasuk `NEW_TABLES` sehingga pemeriksaan tabel lolos). Pivot tersimpan dan
  perubahan lain sesudah upgrade hilang — ekspor dulu daftar pivot tersimpan bila perlu:
  `SELECT "datasetId", name, spec FROM "SavedPivot";`.
- **Ganti image saja (DB tetap):** aman selama belum ada widget yang diikat ke pivot tersimpan (T-073):
  `SELECT count(*) FROM "Widget" WHERE "savedPivotId" IS NOT NULL;` harus 0. Kode lama mengabaikan tabel dan
  kolom baru; hapus dataset tetap berjalan (cascade dataset → `SavedPivot`). Prisma lama tidak memakai
  migrasi yang belum dikenalnya (`migrate` container lama = no-op karena baris `_prisma_migrations` sudah ada).
  Selama berjalan dengan image lama, aktivasi/rollback versi **tidak** memetakan ulang `SavedPivot` (kode
  lama tidak mengenalnya), jadi setelah upgrade lagi pivot tersimpan bisa menunjuk sheet yang sudah dihapus
  retensi dan perlu disimpan ulang oleh pemilik dataset (pilih kolom lagi di editornya).
- **Membuang skema baru secara manual** (hanya bila memang ingin kembali ke skema lama tanpa dump; pivot
  tersimpan hilang): dalam satu transaksi `ALTER TABLE "Widget" DROP CONSTRAINT "Widget_savedPivotId_fkey";
  DROP INDEX "Widget_savedPivotId_idx"; ALTER TABLE "Widget" DROP COLUMN "savedPivotId"; DROP TABLE
  "SavedPivot"; DELETE FROM _prisma_migrations WHERE migration_name = '20261021170000_t072_saved_pivot';`
  — backup DB dulu.

### Bukti uji (container cloud, 2026-10-20)

- Build 4 image produksi dari commit rilis (`docker buildx`, target app/worker + renderer + backup): lulus;
  image app start dengan env produksi (`/api/health/core` ok, `/login` 200).
- Rantai migrasi penuh ke PostgreSQL 14 kosong (UTF8, C.UTF-8) dan ke database berbentuk produksi
  (semua migrasi s.d. `t_j9j6` + data contoh: versi xlsx/csv, READY/FAILED/AWAITING_MAPPING/UPLOADING, alias
  sheet, nama sheet kembar beda kapital, ekspor, dashboard): lulus; `prisma migrate diff` ke schema = kosong;
  check-segments 0 selisih; dump → migrasi → rollback → isi per tabel identik → migrasi ulang lulus.
- Simulasi utuh dengan `upgrade.sh` di stack compose produksi lokal (profil `hostdb` + PostgreSQL 14 di
  127.0.0.1 dengan role non-superuser, seperti olympus; image lama = commit sebelum T-036): preflight (gerbang
  ekspor aktif dan ruang disk teruji menolak) → load → migrate (gerbang T-gcn8 teruji menolak data rusak) →
  start (health, presign 16 MiB, allowlist, admin-restore, env baru terbaca) → rollback: image `prev-*` jalan,
  `/api/health` ok, isi database identik dengan dump rollback (sidik `fingerprint.sh`). Gerbang juga diuji
  dengan `docker` tiruan (`tests/scripts/upgrade-gates.test.ts`): kueri T-gcn8 error, check-segments gagal,
  dump baru hanya selama skema lama, STARTED_AT sekali, tag arsip = produksi lama, database/tabel rollback
  tidak cocok. Belum diuji: server
  olympus sungguhan (pemilik), volume data nyata.

## 8. Disk: pertumbuhan data per periode, cache, dan backup (T-063)

`docker run -v <nama>:…` membuat volume kosong baru bila namanya salah — selalu `docker volume inspect`
dulu (perintah di bawah sudah melakukannya; nama project bawaan `dashboard`).
VM olympus dipakai bersama aplikasi lain: **jangan** `docker system prune`, `docker volume prune`, atau
`docker image prune` (ikut menghapus milik aplikasi lain), dan jangan menghapus objek RustFS langsung
(manifest versi merujuk kunci objek; `segment-audit` malam akan melaporkan kunci hilang). Semua pembersihan
data lewat aplikasi atau job worker di bawah. Angka ukur: `docs/ai/perf/T-063.md`.

### Apa yang tumbuh dan rumusnya

| Tempat (volume) | Isi | Rumus / batas |
|---|---|---|
| RustFS `dashboard_s3data` | parquet segmen (`parquet/<ds>/seg/<id>/raw.parquet` + `typed-<rev>.parquet`), file asli unggahan (`raw/<ds>/<versi>/`), ekspor, media panduan | lihat rumus RustFS di bawah |
| Cache app `dashboard_app_cache` (`QUERY_CACHE_DIR`, per replika app) | salinan parquet lokal (LRU), cache urutan Lihat data (`order/`), temp DuckDB (`tmp/`) | ≤ `MAX_LOCAL_PARQUET_BYTES` (10 GiB) + `GRID_ORDER_CACHE_BYTES` (1 GiB, TTL 30 menit) + 4 GB temp |
| Tmp worker `dashboard_worker_cache` (`WORKER_TMP_DIR`) | per job: file sumber + spill sharedStrings/DuckDB; temp ekspor | per job ≤ ukuran unggahan (maks. 1 GiB) + 8 GiB spill; × `WORKER_REPLICAS` (2) → ≤ ± 18 GiB puncak; folder kerja sisa job mati dibersihkan saat worker mulai |
| Backup `dashboard_backups` | arsip harian `dashboard-<UTC>.tar.age` (+ `.sha256`), folder kerja `.work-*` selama backup | (hari simpan lokal × arsip) + 2 × arsip saat backup berjalan (salinan bucket + dump di `.work-*`, lalu arsip ditulis) |
| PostgreSQL host | metadata (versi, segmen, manifest, AuditLog) | kecil: ± puluhan KB per unggahan |

**RustFS** ≈ Σ per dataset (P_aktif + P_tersimpan + S_7hari + G_24jam) + ekspor (≤ 1 jam) + media panduan:

- **P_aktif** = parquet semua periode aktif = Σ (raw.parquet + typed parquet) per periode. Unggahan periode
  hanya menulis segmen periode yang diunggah; periode lain dirujuk ulang (tidak disalin). Contoh terukur:
  400 rb baris × 12 kolom ≈ 4,1 MB parquet per bulan (CSV-nya 28 MB); 1 jt baris ≈ 10 MB.
- **P_tersimpan** = parquet periode yang sudah diganti/dilepas/dihapus tetapi masih dirujuk versi tersimpan
  (3 versi siap terakhir disimpan, termasuk yang aktif) — jadi paling banyak ± 2 unggahan terakhir yang
  mengganti/melepas periode. Ubah tipe kolom menambah revisi `typed-<rev>` per segmen (± ukuran typed)
  sampai versi lama yang memakainya terbuang retensi.
- **S_7hari** = file asli (CSV/XLSX) yang diunggah 7 hari terakhir, utuh (job `raw-retention` tiap jam
  menghapus yang > 7 hari). CSV bisa ± 7× parquet-nya: inilah bagian terbesar sesaat setelah unggahan.
- **G_24jam** = segmen yang baru tidak dirujuk versi mana pun: ditandai `segment-gc` (tiap jam), disapu
  setelah tenggang `SEGMENT_GC_GRACE_HOURS` = 24 jam tidak dirujuk terus-menerus, lalu objeknya dihapus
  `storage-cleanup` (tiap 15 menit). Ruang dari periode yang dihapus/dilepas baru kembali ± 1–2 hari setelah
  versi tersimpan yang memuatnya ikut terbuang retensi.
- Batas atas per dataset: data yang dirujuk versi ≤ `DATASET_MAX_DATA_BYTES` (16 GiB); per pengguna
  `USER_STORAGE_QUOTA_BYTES` (20 GiB, termasuk file asli 7 hari). Syarat volume tetap: RustFS ≥ Σ kuota
  pengguna aktif + 20%.

**Backup harian** = `pg_dump` + salinan seluruh bucket (tar → age, tanpa kompresi tambahan; parquet sudah
terkompresi), jadi arsip ≈ dump + RustFS. Pertambahan arsip karena satu unggahan periode:
- malam setelah unggahan (file asli belum 7 hari): ≈ file asli + parquet periode itu (+ periode yang
  diganti/dilepas tetap ada sampai retensi versi + GC);
- setelah 7 hari: ≈ parquet periode itu saja (± 4 MB per 400 rb baris pada data uji).
Ruang `dashboard_backups` ≈ `BACKUP_LOCAL_RETENTION_DAYS` × arsip + 2 × arsip; set
`BACKUP_LOCAL_RETENTION_DAYS=7` bila salinan off-VM aktif.

**Total disk aplikasi** ≈ RustFS + cache app (≤ 15 GiB) + tmp worker (≤ 18 GiB puncak) + backup lokal +
image (± 4 GB per rilis, plus `prev-*` satu rilis sebelumnya) + log container (≤ 5 × 20 MB per service).

### Cara cek pemakaian (baca-saja, aman di VM bersama)

```bash
cd /data/docker-data/data-dashboard
C="docker compose --env-file .env.prod -f docker-compose.prod.yml"
tag=$(sed -n 's/^IMAGE_TAG=//p' .env.prod | tail -1); tag=${tag:-latest}
df -h /data /var/lib/docker                                 # sisa ruang disk host
docker system df                                            # ringkasan Docker (semua aplikasi; jangan prune)
# Ukuran per volume aplikasi ini (mount read-only, image milik aplikasi ini):
for v in s3data app_cache worker_cache backups; do
  docker volume inspect "dashboard_$v" >/dev/null 2>&1 || { echo "$v: volume tidak ada (nama project?)"; continue; }
  printf '%s ' "$v"; docker run --rm --entrypoint du -v "dashboard_$v:/v:ro" "dashboard-backup:$tag" -sh /v
done
docker volume inspect dashboard_backups >/dev/null && \
docker run --rm --entrypoint sh -v dashboard_backups:/v:ro "dashboard-backup:$tag" \
  -c 'ls -lh /v/dashboard-*.tar.age | tail -7'               # ukuran arsip 7 hari terakhir
$C run --rm --no-deps worker node scripts/quota-report.mjs  # pemakaian per pengguna (byte tersimpan)
```

Per dataset (PostgreSQL host, hanya membaca; parquet yang masih tercatat + file asli yang belum dihapus):

```bash
sudo -u postgres psql -d data_dashboard -c '
SELECT d.name,
  pg_size_pretty((SELECT coalesce(sum(g."rawBytes"),0) FROM "Segment" g WHERE g."datasetId" = d.id)
    + (SELECT coalesce(sum(t."typedBytes"),0) FROM "SegmentTyped" t JOIN "Segment" g ON g.id = t."segmentId"
       WHERE g."datasetId" = d.id)) AS parquet,
  pg_size_pretty((SELECT coalesce(sum(v."sizeBytes"),0) FROM "DatasetVersion" v WHERE v."datasetId" = d.id
    AND v."sourceDeletedAt" IS NULL AND v.status <> '"'"'FAILED'"'"')) AS file_asli
FROM "Dataset" d ORDER BY 2 DESC LIMIT 20'
```

Pemeriksaan malam `segment-audit` (03.00 WIB): `$C logs --since 24h worker | grep 'pemeriksaan storage malam'`
→ `"missing":0` (kunci terujuk yang hilang) dan `"orphans"` (objek yatim yang diserahkan ke pembersihan).

### Membebaskan ruang dengan aman

1. **Data pengguna**: hapus periode (kartu Periode › Hapus) atau dataset lewat aplikasi. Ruang kembali
   setelah versi tersimpan yang memuatnya terbuang retensi (2 unggahan/perubahan berikutnya) + GC 24 jam.
   Jangan menghapus objek di RustFS atau baris tabel secara manual.
2. **File asli**: dihapus otomatis 7 hari setelah diproses. Disk mendesak: tunggu job `raw-retention`
   (tiap jam); tidak ada cara aman yang lebih cepat selain menghapus versi/dataset lewat aplikasi.
3. **Cache app**: kecilkan `MAX_LOCAL_PARQUET_BYTES` dan/atau `GRID_ORDER_CACHE_BYTES` (0 = cache urutan
   mati) di `.env.prod` lalu `$C up -d app`. Isi volume cache boleh dikosongkan hanya saat app berhenti:
   `$C stop app && docker run --rm -v dashboard_app_cache:/v --entrypoint sh "dashboard-backup:$tag" -c 'rm -rf /v/*' && $C up -d app`
   (data dibaca ulang dari RustFS, kueri pertama lebih lambat).
4. **Tmp worker**: folder kerja job yang mati dibersihkan saat worker mulai (`$C restart worker` saat tidak
   ada unggahan yang diproses; job yang sedang berjalan diulang).
5. **Backup lokal**: `BACKUP_LOCAL_RETENTION_DAYS=7` (salinan 30 hari tetap di off-VM) lalu
   `$C up -d --no-deps --force-recreate backup`; arsip lama terbuang pada backup berikutnya. Arsip tertunda
   (belum tersalin off-VM) sengaja ditahan — perbaiki target off-VM dulu.
6. **Image lama**: setelah rilis baru stabil, hapus tag `prev-*` milik aplikasi ini saja:
   `docker image ls 'dashboard-*'` lalu `docker image rm dashboard-<image>:prev-<stamp>`.

### Uji ulang di VM (pemilik)

`bash deploy/perf-stack.sh up 1` → `bash scripts/perf-period-cycle-vm.sh <folder-hasil>` →
`bash deploy/perf-stack.sh down`. Stack uji terpisah (project `dashboard-perftest`, database + storage +
backup sendiri); skrip mengunggah 24 × 400 rb + 10 × 1 jt baris, menjalankan backup harian sungguhan di
beberapa titik, lalu retensi + GC + `segment-audit`. Butuh ± 6 GB ruang sementara di volume stack uji.
Salin hasilnya ke `docs/ai/perf/T-063-olympus/`.

## 9. Versi aplikasi dan rilis per tonggak (T-066)

**Satu sumber versi**: `version` di `package.json`, dinaikkan hanya lewat `aitk release` (`aitk.toml
[release]`, `CHANGELOG.md`). Versi itu tampil di menu akun pengguna yang masuk ("Versi 1.0.0"), di detail
admin `/health` + `GET /api/health` (`version`, `commit`; tanpa sesi admin hanya `status` + `checkedAt`), dan
di baris log pertama worker (`"worker mulai"`) serta renderer (`"renderer mulai"`). Cek versi yang berjalan:
`$C logs worker | grep -m1 'worker mulai'` atau buka `/health` sebagai admin.

**Alur rilis per tonggak** (G-7: satu versi minor per tonggak, mis. v1.1.0 → v1.2.0 → v1.3.0; rencana
`docs/ai/plans/2026-10-21-pivot-lanjutan.md` §7.2):

1. Di `main` setelah task tonggak selesai: `aitk release --bump minor --tag` → `package.json` +
   `CHANGELOG.md` naik ke versi baru, di-commit, tag git `v<versi>` (tidak di-push otomatis). Pre-rilis
   (`--pre rc` → `1.1.0-rc.1`) juga sah sebagai tag image; versi dengan `+build` tidak (beri `IMAGE_TAG`).
2. Mesin build (commit rilis): `bash deploy/images.sh build` → image `dashboard-*:v<versi>`;
   `bash deploy/images.sh save - | ssh olympus 'cat > /tmp/dashboard-images.tar.gz'`.
3. Server: `deploy/upgrade.sh` (§7: preflight dengan kode lama → sinkron kode → `load` → `migrate` →
   `start`). `upgrade.sh build` (build di VM) juga memakai tag bawaan `v<versi>`; `IMAGE_TAG=<tag>` eksplisit
   menang. Tag rilis = tag produksi lama ditolak (versi belum dinaikkan): naikkan versi atau beri tag lain.
4. **Rollback**: tag rilis lama (`dashboard-*:v<versi lama>`) tidak dihapus dan preflight menambah
   `dashboard-*:prev-<stamp>`; `upgrade.sh rollback` memakai `prev-<stamp>` (§7 R). Hapus image rilis lama
   hanya setelah rilis baru stabil dan backup harian terverifikasi (`docker image rm dashboard-<s>:v<lama>`).

`docker-compose.prod.yml` tetap `image: dashboard-*:${IMAGE_TAG:-latest}`: tanpa `IMAGE_TAG` di `.env.prod`
compose memakai `latest` seperti sebelumnya.

## 10. Rilis v1.4.0 (T-c6z4 + batch dashboard/filter: T-12zs, T-1k96, T-k2ec, T-vb7q, T-zm9k)

Dijalankan **pemilik** di olympus (folder `/data/docker-data/data-dashboard`); sesi cloud tidak men-deploy.
Isi rilis: pratinjau pivot penuh di editor pivot tersimpan, isian bawaan pintar + judul otomatis widget,
widget baru mengisi baris kosong, editor boleh mengatur kolom filter dari bilah filter, filter bawaan per
kolom filter, dan "Mulai dengan dashboard contoh". **Tanpa migrasi database baru** sejak v1.3.1 (`prisma
migrate deploy` di langkah `migrate` tidak menerapkan apa pun) dan tanpa variabel lingkungan baru.

1. **Tag** (mesin pemilik; push tag dari sesi cloud ditolak 403):
   ```bash
   git fetch origin && git checkout main && git pull   # setelah PR rilis digabung
   git tag -a v1.4.0 -m "v1.4.0" <commit "chore(release): v1.4.0"> && git push origin v1.4.0
   ```
2. **Image** (mesin build, commit rilis): `bash deploy/images.sh build` →
   `bash deploy/images.sh save - | ssh olympus 'cat > /tmp/dashboard-images.tar.gz'`;
   `scp deploy/upgrade.sh olympus:/tmp/upgrade.sh`.
3. **Backup dulu** — preflight dengan kode LAMA membuat backup terenkripsi lengkap + dump `pg_dump -Fc`
   terverifikasi dan harus berakhir `PREFLIGHT LULUS`; jangan lanjut bila gagal:
   ```bash
   bash /tmp/upgrade.sh preflight
   ```
4. **Sinkron kode** (`git pull` ke commit rilis), lalu `bash deploy/upgrade.sh load /tmp/dashboard-images.tar.gz`
   → `bash deploy/upgrade.sh migrate` → `bash deploy/upgrade.sh start` (§7, §9). Cek versi: `/health` sebagai
   admin = 1.4.0, `$C logs worker | grep -m1 'worker mulai'`.
5. **Panduan yang berubah** (menimpa suntingan admin di artikel ini saja):
   ```bash
   docker compose --env-file .env.prod -f docker-compose.prod.yml run --rm worker \
     node_modules/.bin/tsx --conditions=react-server scripts/seed-guides.ts \
     --update --only susun-dashboard,widget-pivot,editor-ubah-dashboard,viewer-lihat-filter-ekspor
   ```
6. **Uji singkat pemilik**: buat dashboard dengan **Mulai dengan dashboard contoh** (≥ 4 widget + kolom
   filter); di mode edit **Atur kolom filter** dan **Jadikan filter aktif sebagai bawaan**; buka sebagai viewer
   tanpa `?f=` (chip _bawaan_), **Hapus semua filter**, **Kembalikan filter bawaan**, lalu Ekspor PDF.

**Rollback** (rilis ini tanpa migrasi):
- **Disarankan — ganti image saja, data tetap:** di `.env.prod` ganti `IMAGE_TAG=prev-<stamp>` (stamp dari
  preflight), lalu `docker compose --env-file .env.prod -f docker-compose.prod.yml up -d --no-build --wait --wait-timeout 600`. Kode v1.3.1
  menolak entri kolom filter yang membawa filter bawaan (`default`, T-vb7q) — kolom filter berbawaan **tidak
  tampil** sampai upgrade lagi (data di DB tetap). Bila rollback akan lama, hapus bawaan dulu (mode edit →
  hapus semua filter → **Hapus filter bawaan**).
- `bash deploy/upgrade.sh rollback` memulihkan image lama **dan database dari dump rollback** (`db-migrate-*`,
  diambil saat `migrate` setelah app/worker berhenti): semua data sesudah langkah `migrate` (unggahan, dashboard,
  pengguna) hilang dari DB. Skrip meminta ketik `ROLLBACK` dan menyimpan
  `db-sebelum-rollback-*.dump` dulu. Pakai hanya bila database memang perlu dikembalikan.

## 11. Rilis v1.4.1 (hotfix keamanan Next.js, T-cfd7)

Next.js 16.4.0 → **16.4.2**: menutup GHSA-2464-fhr4-w9xw (RCE lewat Image Optimization + SVG),
GHSA-p3m5-59mp-jv5r (DoS Server Actions), GHSA-673q-mjm6-r5xr (RCE `use cache`). Tanpa perubahan kode
aplikasi, migrasi, env, atau panduan. **Segera** deploy; v1.4.0 dan sebelumnya rentan.

Langkah (urut; perintah Mac dan server bergantian):

1. **Mac** (folder repo, setelah PR hotfix digabung): `git pull --ff-only origin main` → `git tag -a v1.4.1
   -m v1.4.1 <commit "chore(release): v1.4.1"> && git push origin v1.4.1` → `npm ci` → `bash deploy/images.sh
   build` → `bash deploy/images.sh save ~/dashboard-v1.4.1.tar.gz` → `scp ~/dashboard-v1.4.1.tar.gz
   olympus:/tmp/dashboard-images.tar.gz` → `scp deploy/upgrade.sh olympus:/tmp/upgrade.sh`.
2. **Server** (`/data/docker-data/data-dashboard`): `bash /tmp/upgrade.sh preflight` — backup DB dulu, dengan
   kode LAMA; harus berakhir `PREFLIGHT LULUS`. Jangan lanjut bila gagal.
3. **Mac**, baru sesudah langkah 2 lulus: `git archive v1.4.1 | ssh olympus 'tar -x -C /data/docker-data/data-dashboard'`.
4. **Server**: `bash deploy/upgrade.sh load /tmp/dashboard-images.tar.gz` → `bash deploy/upgrade.sh migrate` →
   `bash deploy/upgrade.sh start`. Cek `/health` (admin) = 1.4.1. Tanpa seed panduan.

**Rollback** (hanya sementara — versi lama kembali rentan): ganti image saja, data tetap — di `.env.prod`
ganti `IMAGE_TAG=prev-<stamp>` lalu `docker compose --env-file .env.prod -f docker-compose.prod.yml up -d --no-build --wait --wait-timeout 600`.
Jangan pakai `upgrade.sh rollback` untuk hotfix ini: skrip itu juga memulihkan database dari dump rollback
(`db-migrate-*`; data sesudah langkah `migrate` hilang).

Catatan T-cfd7: `upgrade.sh migrate`/`start` kini melewati `check-segments.mjs` dan pemeriksaan "data lama tetap
non-periode" bila produksi sudah di G-6 (`OLD_MIGRATION` ≥ `20261019140000_t036_segments`) — sebelumnya gerbang
itu gagal begitu ada satu dataset per periode. Salin `deploy/upgrade.sh` rilis ini ke server (`scp` di langkah 1)
sebelum preflight.

## 12. Redis tidak sehat (AOF rusak, mis. setelah disk penuh)

Gejala: `upgrade.sh preflight` berhenti "redis tidak sehat", atau `start` gagal "container dashboard-redis-1
is unhealthy"; `docker logs dashboard-redis-1` berisi "Bad file format reading the append only file". Antrean
BullMQ (ingest/ekspor) tidak jalan selama Redis mati. Data dashboard/dataset (PostgreSQL + storage) tidak
terpengaruh. Di server (folder aplikasi):

```bash
C="docker compose --env-file .env.prod -f docker-compose.prod.yml"
$C stop redis
B=/data/docker-data/data-dashboard-upgrade/redis-aof-$(date -u +%Y%m%dT%H%M%SZ).tar.gz
docker run --rm -v dashboard_redisdata:/data:ro -v /data/docker-data/data-dashboard-upgrade:/out alpine \
  tar -czf "/out/$(basename "$B")" -C /data appendonlydir dump.rdb          # salinan dulu
IMG=$(docker inspect --format '{{.Config.Image}}' dashboard-redis-1)
docker run --rm --user 999:1000 -v dashboard_redisdata:/data -w /data/appendonlydir "$IMG" \
  sh -c 'echo y | redis-check-aof --fix appendonly.aof.manifest'
$C up -d redis        # atau: bash deploy/upgrade.sh start (di tengah upgrade)
```

Job antrean yang tercatat setelah titik rusak hilang: dataset yang tertahan "Memproses" diunggah ulang.
Kejadian 2026-10-23: preflight pertama kehabisan disk saat backup lengkap → AOF terpotong → `start` v1.4.1
gagal; diperbaiki dengan langkah di atas. Preflight kini memeriksa Redis sehat dan ruang untuk backup lengkap.

## 13. Rilis satu perintah dari Mac (`deploy/release.sh`)

Cara rilis biasa mulai v1.4.2 — menggantikan langkah manual §10/§11. Syarat: PR rilis (berisi commit
`chore(release): v<versi>` dari `aitk release`) sudah digabung ke `main`; Mac di jaringan kantor/VPN.

```bash
cd ~/Documents/Projects/pcpexpress/data-dashboard
git checkout main && git pull --ff-only origin main
bash deploy/release.sh --quick --seed <slug,…>    # --quick: rilis TANPA migrasi; --seed: panduan yang berubah
```

Skrip berhenti di langkah pertama yang gagal (urutan lengkap di kepala `deploy/release.sh`):

1. cek lokal: `main` bersih dan sama dengan `origin/main`; tag `v<versi>` dibuat di commit
   `chore(release): v<versi>` lalu di-push (bila belum ada);
2. image dari **tag** (bukan dari folder kerja): bila image belum ada atau dibangun dari commit lain, skrip
   membangun ulang di worktree sementara dari tag — PR lain yang digabung sesudah rilis tidak ikut;
3. kirim arsip image + `upgrade.sh` versi tag ke folder sementara baru di server (`/tmp/dashboard-rilis.*`);
4. **preflight di server dengan kode lama (backup DB dulu)** — gagal di sini = produksi tidak diubah;
5. `load` image (produksi masih image lama);
6. sinkron kode tag ke folder aplikasi (`git archive`), versi `package.json` di server dicek;
7. `migrate` → `start` (jeda layanan ± 2–5 menit);
8. seed panduan (`--seed`).

Password/kunci SSH diminta sekali (koneksi dipakai ulang, aman untuk fail2ban). Folder sementara di server
dan arsip lokal dihapus setelah selesai.

- **`--quick`** memakai backup harian terverifikasi (checksum cocok) yang umurnya ≤ 26 jam alih-alih backup
  lengkap baru (±25 menit, memakan disk ± 2 × ukuran arsip); dump database tetap dibuat baru. Skrip
  **menolak** `--quick` bila ada file baru di `prisma/migrations` sejak tag sebelumnya — jalankan tanpa
  `--quick`. Tanpa backup harian yang cukup baru, preflight otomatis membuat backup lengkap; bila belum ada
  arsip backup sama sekali, preflight meminta perkiraan ukuran lewat `BACKUP_EST_GB=<GB>`.
- Gagal di langkah 1–4: produksi tidak diubah — perbaiki sesuai pesan, jalankan ulang skrip.
- Gagal di langkah 5–7: **jangan** ulangi skrip; skrip mencetak perintah lanjutan yang tepat (ulang `load`,
  ulang `git archive`, atau `migrate && start`). Rollback rilis tanpa migrasi = ganti `IMAGE_TAG` ke
  `prev-<stamp>` (§11); Redis rusak = §12.
