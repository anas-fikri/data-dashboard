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

### TLS internal (LAN, `CADDY_TLS=internal`)

Tanpa domain publik, Caddy memakai CA lokalnya sendiri (root berlaku 10 tahun). `deploy.sh` menyalin
sertifikat root ke `deploy/ca-root.crt`; pasang **sekali** di setiap komputer pengguna:

- **Windows**: klik dua kali `ca-root.crt` → *Install Certificate* → *Local Machine* → *Place all
  certificates in the following store* → **Trusted Root Certification Authorities** → selesai. Atau
  massal lewat GPO (Computer Configuration → Policies → Windows Settings → Security Settings → Public Key
  Policies → Trusted Root Certification Authorities). Chrome/Edge memakai store Windows.
- **macOS**: buka `ca-root.crt` di Keychain Access → keychain **System** → klik dua kali sertifikat →
  *Trust* → *Always Trust*.
- **Firefox**: Settings → Privacy & Security → Certificates → View Certificates → Authorities → Import.

Cocokkan sidik jari SHA-256 sebelum memasang: `openssl x509 -in ca-root.crt -noout -fingerprint -sha256`.

### Contoh: server olympus (LAN 10.3.3.221)

`APP_HOST=10.3.3.221`, `STORAGE_HOST=10.3.3.221:8444`, `CADDY_TLS=internal`, `COMPOSE_PROFILES=hostdb`
(PostgreSQL 14 host hanya di 127.0.0.1 → relay `pg-relay`), satu worker (`WORKER_REPLICAS=1`) dan batas
memori dikecilkan karena VM 2 vCPU / 7,8 GB. Port 80 dipakai Apache (tidak bentrok: Caddy hanya 443 dan
8444). Role/DB: `sudo bash deploy/host-db.sh`; SMTP: `bash deploy/set-smtp.sh noreply-dashboard@pcpexpress.co.id`
(jalankan dari terminal interaktif, bukan lewat skrip non-TTY).

## 3. Verifikasi pasca-deploy

```bash
C="docker compose --env-file .env.prod -f docker-compose.prod.yml"
$C ps                                                        # semua healthy / migrate+storage-init exited 0
curl -fsS https://<APP_HOST>/api/health                      # {"status":"ok"} termasuk storage + renderer
$C run --rm --no-deps worker node deploy/check-public-presign.mjs [--insecure]   # --insecure untuk CA internal
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
3. Salin arsip `dashboard-<UTC>.tar.age` (+ `.sha256`) dan kunci privat age ke VM sementara, lalu:
   ```bash
   $C run --rm -v /path/kunci-backup-dashboard.txt:/run/age-key:ro \
     -v /path/dashboard-<UTC>.tar.age:/run/backup.tar.age:ro \
     backup bash /usr/local/bin/restore.sh /run/backup.tar.age /run/age-key
   ```
4. `$C start worker app`; hapus kunci privat dari VM.
5. Cek: login, daftar dataset sama, dashboard terbuka dengan angka sama, video panduan bisa diputar.

### Log uji restore

| Tanggal | Arsip | Tujuan | Hasil | Oleh |
|---|---|---|---|---|
| (isi setiap uji restore) | | | | |

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
