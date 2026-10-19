# Runbook deploy produksi on-prem (T-023)

Paket: `docker-compose.prod.yml`, `Dockerfile` (target `app`, `worker`), `renderer/Dockerfile`,
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
bash deploy/images.sh build              # 4 image linux/amd64 bertag commit (mis. ab88b55)
bash deploy/images.sh save dashboard-images.tar.gz
scp dashboard-images.tar.gz <server>:/tmp/
# VM (folder aplikasi, kode commit yang sama)
bash deploy/images.sh load /tmp/dashboard-images.tar.gz
echo IMAGE_TAG=ab88b55 >> .env.prod      # atau ubah baris IMAGE_TAG yang ada
bash deploy/deploy.sh --no-build         # migrasi + up + tunggu sehat, tanpa build
```

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
2. `docker compose -f docker-compose.prod.yml exec app node scripts/admin-restore.mjs <email> --confirm`

### Isi panduan

```bash
docker compose -f docker-compose.prod.yml run --rm worker \
  node_modules/.bin/tsx --conditions=react-server scripts/seed-guides.ts
# video rekaman (dari mesin yang menyimpan demo/guide-videos):
docker compose -f docker-compose.prod.yml run --rm -v "$PWD/demo/guide-videos:/app/demo/guide-videos:ro" \
  worker node_modules/.bin/tsx --conditions=react-server scripts/seed-guides.ts --videos demo/guide-videos
```

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

### Contoh: server olympus (LAN 10.3.3.221)

`APP_HOST=10.3.3.221:8443`, `APP_PORT=8443`, `STORAGE_HOST=10.3.3.221:8444`, `TLS_DEFAULT_SNI=10.3.3.221`,
`CADDY_TLS=/certs/fullchain.pem /certs/privkey.pem` (root LAN berpembatasan IP), `COMPOSE_PROFILES=hostdb`
(PostgreSQL 14 host hanya di 127.0.0.1 → relay `pg-relay`), satu worker (`WORKER_REPLICAS=1`) dan batas
memori dikecilkan karena VM 2 vCPU / 7,8 GB. Port 80 dipakai Apache; Caddy hanya mendengar di 8443
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
2. **Off-VM dari aplikasi (S3, disarankan):** admin membuka **Admin › Backup**, mengisi endpoint S3 yang
   bisa dijangkau VM (mis. `http://<ip-nas>:9000`), bucket khusus backup, folder, access key + secret
   **khusus backup** (hanya berhak di bucket itu), lalu **Tes koneksi** → **Simpan**. Konfigurasi masuk ke
   volume `backup-config` (`app/offsite.json`, 600; secret tidak di DB/log) dan dipakai backup berikutnya tanpa
   restart/SSH. Bila target tidak terjangkau (down, jaringan, kunci salah): arsip **ditahan di VM** (retensi
   lokal tidak membuangnya sebelum tersalin; dibuang setelah `BACKUP_RETENTION_DAYS`), dikirim ulang
   `backup.sh --sync` tiap 30 menit, dan admin aktif diberi email sekali per perubahan status (tertunda,
   gagal, pulih) + banner di aplikasi. Status: `status.json` di volume yang sama (tampil di Admin › Backup).
   Konfigurasi dari aplikasi aktif → mengalahkan `BACKUP_REMOTE`.
   Kunci backup perlu hak daftar/tulis/baca/hapus (salin + retensi 30 hari); aktifkan **versioning atau
   object-lock** di bucket target agar salinan tidak bisa dihapus permanen oleh VM yang dibobol.
   Off-VM lewat SFTP (server file/NAS kantor, tanpa aplikasi). Pakai **akun khusus non-admin** yang hanya punya satu
   folder backup (mis. di Synology DSM: buat user `dashboard-backup`, shared folder
   `backup-data-dashboard` baca/tulis hanya untuk user itu, aplikasi SFTP diizinkan). Jangan memakai akun
   admin/pribadi: kunci ada di VM bersama, dan `internal-sftp` tanpa chroot memberi akses ke semua share
   akun itu.
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
   **Alternatif S3** (server S3 di NAS, mis. Synology dengan paket object storage, MinIO, RustFS):
   buat bucket + access key khusus backup yang hanya berhak di bucket itu, lalu
   ```bash
   bash deploy/offsite-s3.sh <endpoint> <bucket>[/folder]
   ```
   Access key + secret diketik di prompt (tidak tampil); skrip menulis remote `offsite` (S3) ke
   `deploy/rclone.conf` lalu menguji tulis/baca/hapus satu berkas. `BACKUP_REMOTE=offsite:<bucket>[/folder]`.
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
- **Encoding database**: `host-db.sh` membuat database UTF8 (C.UTF-8). Database olympus yang dibuat
  sebelumnya ber-encoding SQL_ASCII (warisan cluster locale C): data aman dan restore setia, tetapi
  pencarian tanpa beda huruf besar/kecil hanya untuk huruf ASCII. Konversi = task lanjutan (butuh sudo +
  jeda singkat).
- **Worker mati saat ingest**: `$C restart worker` — job diulang (idempoten T-006), versi berakhir READY.
- **Update**: `git pull && deploy/deploy.sh` (migrasi maju otomatis). **Rollback**: `git checkout <tag
  sebelumnya> && deploy/deploy.sh` — migrasi tidak dibalik otomatis; pulihkan dari backup bila skema
  baru tidak kompatibel.
- **Rotasi AUTH_SECRET**: tambahkan secret baru di DEPAN (`AUTH_SECRET=baru,lama`), deploy; setelah
  masa sesi lewat (12 jam), hapus yang lama dan deploy lagi.
- **Kredensial storage**: app/worker memakai `S3_APP_*` (service account berpolicy prefix raw/,
  parquet/, exports/, guides/); akun root RustFS hanya untuk `storage-init` dan `backup`.
