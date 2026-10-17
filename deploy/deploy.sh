#!/usr/bin/env bash
# Deploy produksi on-prem (T-023). Prasyarat: Docker Engine + Compose v2 di VM; DNS APP_HOST dan
# STORAGE_HOST mengarah ke VM. Langkah lengkap: docs/runbook-deploy.md.
#   1. deploy/deploy.sh          → bila .env.prod belum ada: dibuat dengan semua secret acak, lalu berhenti
#                                   agar operator mengisi nilai yang ditandai ISI_*.
#   2. deploy/deploy.sh          → build image, migrasi, init storage + service account, up, tunggu sehat.
# Secret tidak pernah dicetak. .env.prod mode 600, jangan di-commit (sudah di .gitignore/.dockerignore).
set -euo pipefail
cd "$(dirname "$0")/.."
ENV_FILE=.env.prod
COMPOSE=(docker compose --env-file "$ENV_FILE" -f docker-compose.prod.yml)

rand() { head -c 48 /dev/urandom | base64 | tr -dc 'A-Za-z0-9' | head -c "$1"; }

if [ ! -f "$ENV_FILE" ]; then
  umask 077
  cat >"$ENV_FILE" <<EOF
# Dibuat deploy/deploy.sh $(date -u +%Y-%m-%dT%H:%M:%SZ). Isi semua ISI_* lalu jalankan deploy lagi.
APP_HOST=ISI_dashboard.perusahaan.co.id
STORAGE_HOST=ISI_storage.dashboard.perusahaan.co.id
# VM bersama tanpa domain: APP_HOST=<ip>:8443, APP_PORT=8443, STORAGE_HOST=<ip>:8444, TLS_DEFAULT_SNI=<ip>
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

# Profil (db = PostgreSQL container, hostdb = relay ke PostgreSQL host 127.0.0.1) dari .env.prod.
COMPOSE_PROFILES=$(grep '^COMPOSE_PROFILES=' "$ENV_FILE" | cut -d= -f2- || true)
export COMPOSE_PROFILES
start=$(date +%s)
"${COMPOSE[@]}" build
"${COMPOSE[@]}" up -d --wait --wait-timeout 600
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
    if grep -q '^CADDY_TLS=internal' "$ENV_FILE"; then
      # CA internal Caddy: sertifikat root untuk dipasang di komputer pengguna (runbook §TLS internal).
      "${COMPOSE[@]}" cp proxy:/data/caddy/pki/authorities/local/root.crt deploy/ca-root.crt >/dev/null
      echo "Sertifikat root CA internal: deploy/ca-root.crt (pasang di komputer pengguna)"
    fi
    exit 0
  fi
  sleep 5
done
echo "Health belum hijau setelah 150 dtk — periksa: docker compose -f docker-compose.prod.yml ps / logs" >&2
exit 1
