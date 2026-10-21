#!/usr/bin/env bash
# Deploy produksi on-prem (T-023). Prasyarat: Docker Engine + Compose v2 di VM; DNS APP_HOST dan
# STORAGE_HOST mengarah ke VM. Langkah lengkap: docs/runbook-deploy.md.
#   1. deploy/deploy.sh          → bila .env.prod belum ada: dibuat dengan semua secret acak, lalu berhenti
#                                   agar operator mengisi nilai yang ditandai ISI_*.
#   2. deploy/deploy.sh          → build image, migrasi, init storage + service account, up, tunggu sehat.
#      deploy/deploy.sh --no-build → sama, tanpa build: image IMAGE_TAG sudah dimuat (deploy/images.sh).
# Secret tidak pernah dicetak. .env.prod mode 600, jangan di-commit (sudah di .gitignore/.dockerignore).
set -euo pipefail
cd "$(dirname "$0")/.."
ENV_FILE=${DEPLOY_ENV_FILE:-.env.prod}
# Salinan terpisah di VM yang sama (latihan VM kosong T-tqse, deploy/empty-vm-drill.sh): file compose bernama
# "dashboard", jadi project lain WAJIB disebut — tanpa itu container produksi ikut ditimpa.
project=()
if [ "$(realpath -m "$ENV_FILE")" != "$(realpath -m .env.prod)" ]; then
  case "${DEPLOY_PROJECT:-}" in
    "" | dashboard) echo "DEPLOY_ENV_FILE butuh DEPLOY_PROJECT selain 'dashboard' (produksi)" >&2; exit 1 ;;
  esac
  project=(-p "$DEPLOY_PROJECT")
fi
COMPOSE=(docker compose ${project[@]+"${project[@]}"} --env-file "$ENV_FILE" -f docker-compose.prod.yml)
NO_BUILD=
[ "${1:-}" != --no-build ] || NO_BUILD=1

rand() { head -c 48 /dev/urandom | base64 | tr -dc 'A-Za-z0-9' | head -c "$1"; }

if [ ! -f "$ENV_FILE" ]; then
  umask 077
  cat >"$ENV_FILE" <<EOF
# Dibuat deploy/deploy.sh $(date -u +%Y-%m-%dT%H:%M:%SZ). Isi semua ISI_* lalu jalankan deploy lagi.
APP_HOST=ISI_dashboard.perusahaan.co.id
STORAGE_HOST=ISI_storage.dashboard.perusahaan.co.id
# VM bersama tanpa domain: APP_HOST=<ip>:8443, APP_PORT=8443, STORAGE_HOST=<ip>:8444, TLS_DEFAULT_SNI=<ip>
# Domain publik lewat reverse proxy di depan (mis. Nginx Proxy Manager → https://<ip>:8443/8444):
# APP_PUBLIC_HOST=dashboard.perusahaan.co.id, STORAGE_PUBLIC_HOST=storage.perusahaan.co.id (APP_URL dan
# URL unggah memakai domain; akses lewat APP_HOST tetap jalan), TRUSTED_PROXIES=<ip reverse proxy>.
APP_PORT=443
STORAGE_PORT=8444
# internal (CA lokal Caddy) | email untuk ACME publik | "/certs/fullchain.pem /certs/privkey.pem"
CADDY_TLS=internal
ALLOWED_EMAIL_DOMAINS=ISI_perusahaan.co.id
# PostgreSQL: host yang mendengar di alamat bridge Docker → host.docker.internal:5432; host yang hanya
# 127.0.0.1 → COMPOSE_PROFILES=hostdb + host.docker.internal:15432 (relay); tanpa PostgreSQL → COMPOSE_PROFILES=db
# + postgresql://dashboard:<POSTGRES_PASSWORD>@postgres:5432/data_dashboard. Role/DB host: sudo bash deploy/host-db.sh
COMPOSE_PROFILES=
DATABASE_URL=ISI_postgresql://
POSTGRES_PASSWORD=$(rand 32)
SMTP_URL=ISI_smtp://user:pass@smtp.perusahaan.co.id:587
MAIL_FROM=ISI_Data Dashboard <no-reply@perusahaan.co.id>
AUTH_SECRET=$(rand 48)
REDIS_PASSWORD=$(rand 40)
RENDERER_SECRET=$(rand 48)
RUSTFS_ROOT_USER=root$(rand 12)
RUSTFS_ROOT_PASSWORD=$(rand 40)
S3_BUCKET=dashboard
S3_APP_ACCESS_KEY=app$(rand 17)
S3_APP_SECRET_KEY=$(rand 40)
# Kunci PUBLIK age (age1…) penerima backup; kunci privatnya disimpan di luar VM (runbook §Backup).
BACKUP_AGE_RECIPIENT=ISI_age1
# Tujuan salinan off-VM (remote rclone di deploy/rclone.conf), mis. offsite:dashboard-backup
BACKUP_REMOTE=
# Batas memori (spek minimum VM 4 vCPU / 16 GB).
APP_MEM=4g
WORKER_MEM=3g
WORKER_REPLICAS=2
RENDERER_MEM=2g
# Opsional (bawaan di docker-compose.prod.yml; runbook §6 Upgrade rilis G-6): kuota + data per periode.
# USER_STORAGE_QUOTA_BYTES=21474836480
# QUOTA_GRACE_DAYS=14
# GRID_MAX_CONCURRENCY=2
# GRID_ORDER_CACHE_BYTES=1073741824
# PERIOD_KEEP_DEFAULT=24
# PERIOD_KEEP_MAX=60
# PERIOD_SHEET_MAX_ROWS=10000000
# DATASET_MAX_DATA_BYTES=17179869184
# PERIOD_SHEET_MAX_SEGMENTS=120
# PERIOD_WARN_PCT=80
# PERIOD_SHRINK_CONFIRM_PCT=50
# PERIOD_STRAY_PCT=10
# PERIOD_MAX_FILES=10
# PERIOD_CONFIRM_TTL_HOURS=168
EOF
  echo ".env.prod dibuat dengan secret acak. Isi nilai ISI_* (lihat runbook), lalu jalankan deploy lagi."
  exit 1
fi

if grep -q '=ISI_' "$ENV_FILE"; then
  echo "Masih ada nilai ISI_* di .env.prod:" >&2
  grep -o '^[A-Z_]*=ISI_' "$ENV_FILE" | cut -d= -f1 >&2
  exit 1
fi
[ -f deploy/rclone.conf ] || { umask 077; : >deploy/rclone.conf; }
# Sumber bind mount harus ada (kunci off-VM diisi deploy/offsite-key.sh bila dipakai).
[ -d deploy/offsite ] || { umask 077; mkdir -p deploy/offsite; }

# Profil (db = PostgreSQL container, hostdb = relay ke PostgreSQL host 127.0.0.1) dari .env.prod.
COMPOSE_PROFILES=$(grep '^COMPOSE_PROFILES=' "$ENV_FILE" | cut -d= -f2- || true)
export COMPOSE_PROFILES
start=$(date +%s)
if [ -n "$NO_BUILD" ]; then
  tag=$(sed -n 's/^IMAGE_TAG=//p' "$ENV_FILE" | tail -1)
  for i in app worker renderer backup; do
    docker image inspect "dashboard-$i:${tag:-latest}" >/dev/null 2>&1 ||
      { echo "image dashboard-$i:${tag:-latest} belum dimuat (deploy/images.sh load)" >&2; exit 1; }
  done
else
  # Commit pendek untuk /health admin + log start (T-066); tag image tetap IMAGE_TAG .env.prod / latest.
  APP_COMMIT=${APP_COMMIT:-$(git rev-parse --short HEAD 2>/dev/null || true)}
  export APP_COMMIT
  "${COMPOSE[@]}" build
fi
"${COMPOSE[@]}" up -d --no-build --wait --wait-timeout 600
# Caddyfile dan skrip backup di-mount per file: setelah file diganti (sinkron kode), container lama tetap
# melihat isi lama dan compose tidak menganggapnya berubah. Buat ulang agar selalu memakai versi terbaru.
"${COMPOSE[@]}" up -d --no-deps --force-recreate --wait --wait-timeout 300 proxy backup
app_host=$(grep '^APP_HOST=' "$ENV_FILE" | cut -d= -f2-)
# APP_HOST boleh berisi port (mis. 10.3.3.221:8443).
host=${app_host%:*}
port=443
[ "$host" != "$app_host" ] && port=${app_host##*:}
# Health lewat proxy (TLS); --resolve agar tidak bergantung DNS di VM sendiri. -k hanya untuk CA internal.
insecure=()
grep -q '^CADDY_TLS=internal' "$ENV_FILE" && insecure=(-k)
# Root LAN berpembatasan (deploy/lan-cert.sh): verifikasi rantai sertifikat dengan root publiknya.
[ -f deploy/certs/root.crt ] && insecure=(--cacert deploy/certs/root.crt)
for i in $(seq 1 30); do
  if curl -fsS "${insecure[@]}" --resolve "$host:$port:127.0.0.1" "https://$app_host/api/health" >/dev/null; then
    echo "Sehat: https://$app_host/api/health ($(($(date +%s) - start)) dtk)"
    if [ ${#project[@]} -eq 0 ] && grep -q '^CADDY_TLS=internal' "$ENV_FILE"; then
      # CA internal Caddy: sertifikat root untuk dipasang di komputer pengguna (runbook §TLS internal).
      "${COMPOSE[@]}" cp proxy:/data/caddy/pki/authorities/local/root.crt deploy/ca-root.crt >/dev/null
      echo "Sertifikat root CA internal: deploy/ca-root.crt (pasang di komputer pengguna)"
    fi
    exit 0
  fi
  sleep 5
done
echo "Health belum hijau setelah 150 dtk — periksa: ${COMPOSE[*]} ps / logs" >&2
exit 1
