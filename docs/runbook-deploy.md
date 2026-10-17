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
2. Off-VM: isi `deploy/rclone.conf` (mis. remote sftp/S3 bernama `offsite`) dan
   `BACKUP_REMOTE=offsite:dashboard-backup`. Tanpa remote, backup hanya di VM (peringatan di log).
3. Uji sekarang: `$C exec backup backup.sh` → log `backup selesai`, berkas `dashboard-<UTC>.tar.age`.

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

## 6. Operasi

- **Log**: `$C logs -f app worker` (json-file dirotasi 5 × 20 MB per service). Log akses proxy tanpa
  query string, tanpa cookie/Authorization; path `/render`, `/verify`, `/reset-password` diredaksi.
- **Worker mati saat ingest**: `$C restart worker` — job diulang (idempoten T-006), versi berakhir READY.
- **Update**: `git pull && deploy/deploy.sh` (migrasi maju otomatis). **Rollback**: `git checkout <tag
  sebelumnya> && deploy/deploy.sh` — migrasi tidak dibalik otomatis; pulihkan dari backup bila skema
  baru tidak kompatibel.
- **Rotasi AUTH_SECRET**: tambahkan secret baru di DEPAN (`AUTH_SECRET=baru,lama`), deploy; setelah
  masa sesi lewat (12 jam), hapus yang lama dan deploy lagi.
- **Kredensial storage**: app/worker memakai `S3_APP_*` (service account berpolicy prefix raw/,
  parquet/, exports/, guides/); akun root RustFS hanya untuk `storage-init` dan `backup`.
