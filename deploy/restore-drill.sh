#!/usr/bin/env bash
# Latihan restore (T-023 AC3) tanpa menyentuh data produksi (hanya membuat satu backup baru): salinan
# TERPISAH (project compose "dashboard-restoretest", volume sendiri, PostgreSQL container sementara, port
# 9443/9444, semua secret baru) dipulihkan dari backup yang baru dibuat, dibandingkan dengan produksi
# (jumlah baris + md5 isi per tabel, daftar objek storage, health), lalu dibongkar. Kunci PRIVAT age dari stdin:
#   ssh <server> bash /data/docker-data/data-dashboard/deploy/restore-drill.sh < kunci-backup.txt
# Hasil dicatat di tabel "Log uji restore" runbook oleh operator.
set -euo pipefail
cd "$(dirname "$0")/.."
PROD=(docker compose --env-file .env.prod -f docker-compose.prod.yml)
DRILL_ENV=.env.restoretest
DRILL=(docker compose -p dashboard-restoretest --env-file "$DRILL_ENV" -f docker-compose.prod.yml)
key=$(cat) # kunci privat hanya di memori proses ini
[ -n "$key" ] || { echo "kunci age kosong (stdin)" >&2; exit 1; }
cleanup() {
  COMPOSE_PROFILES=db "${DRILL[@]}" down -v --remove-orphans >/dev/null 2>&1 || true
  rm -f "$DRILL_ENV"
}
trap cleanup EXIT

rand() { head -c 48 /dev/urandom | base64 | tr -dc 'A-Za-z0-9' | head -c "$1"; }
host=$(grep '^TLS_DEFAULT_SNI=' .env.prod | cut -d= -f2-)
host=${host:-$(grep '^APP_HOST=' .env.prod | cut -d= -f2- | cut -d: -f1)}
pgpw=$(rand 32)
umask 077
# Salinan nilai non-rahasia produksi (domain email, SMTP, kunci publik backup); semua secret baru.
grep -E '^(ALLOWED_EMAIL_DOMAINS|SMTP_URL|MAIL_FROM|BACKUP_AGE_RECIPIENT|S3_BUCKET|CADDY_TLS)=' .env.prod >"$DRILL_ENV"
cat >>"$DRILL_ENV" <<EOF
APP_HOST=$host:9443
APP_PORT=9443
STORAGE_HOST=$host:9444
STORAGE_PORT=9444
TLS_DEFAULT_SNI=$host
COMPOSE_PROFILES=db
EDGE_SUBNET=172.31.244.0/24
DATA_SUBNET=172.31.245.0/24
POSTGRES_PASSWORD=$pgpw
DATABASE_URL=postgresql://dashboard:$pgpw@postgres:5432/data_dashboard
AUTH_SECRET=$(rand 48)
REDIS_PASSWORD=$(rand 40)
RENDERER_SECRET=$(rand 48)
RUSTFS_ROOT_USER=root$(rand 12)
RUSTFS_ROOT_PASSWORD=$(rand 40)
S3_APP_ACCESS_KEY=app$(rand 17)
S3_APP_SECRET_KEY=$(rand 40)
APP_MEM=1g
WORKER_MEM=1536m
WORKER_REPLICAS=1
RENDERER_MEM=1g
REDIS_MAXMEMORY=128mb
EOF
export COMPOSE_PROFILES=db

# Backup baru dulu: pembanding = produksi saat ini, jadi arsip harus sesegar mungkin.
echo "backup baru produksi"
"${PROD[@]}" exec -T backup bash /usr/local/bin/backup.sh | grep -E 'arsip:|PERINGATAN' || true
archive=$("${PROD[@]}" exec -T backup sh -c 'ls -1 /backups/dashboard-*.tar.age | tail -1')
echo "arsip produksi: $(basename "$archive")"
tmp=$(mktemp -d)
name=$(basename "$archive") # nama asli: berkas .sha256 merujuknya
"${PROD[@]}" cp "backup:$archive" "$tmp/$name" >/dev/null
"${PROD[@]}" cp "backup:$archive.sha256" "$tmp/$name.sha256" >/dev/null

echo "salinan latihan: up (tanpa build, image produksi)"
"${DRILL[@]}" up -d --wait --wait-timeout 600 postgres redis rustfs
"${DRILL[@]}" up --no-build migrate storage-init >/dev/null
echo "restore arsip ke salinan latihan"
printf '%s\n' "$key" | "${DRILL[@]}" run --rm -T --no-deps -v "$tmp:/run/drill:ro" backup \
  bash /usr/local/bin/restore.sh "/run/drill/$name" -
rm -rf "$tmp"
if ! "${DRILL[@]}" up -d --no-build --wait --wait-timeout 600; then
  # Cleanup membuang container; cetak penyebab dulu (pesan health tanpa secret).
  echo "salinan latihan tidak sehat; /api/health app:" >&2
  "${DRILL[@]}" exec -T app node -e \
    "fetch('http://127.0.0.1:3100/api/health').then(r=>r.text()).then(t=>console.log(t))" >&2 || true
  "${DRILL[@]}" logs --no-color --tail 30 app >&2 || true
  exit 1
fi

prod_fp=$("${PROD[@]}" exec -T backup bash /usr/local/bin/fingerprint.sh)
drill_fp=$("${DRILL[@]}" exec -T backup bash /usr/local/bin/fingerprint.sh)
prod_rows=$(grep '^rows:' <<<"$prod_fp")
drill_rows=$(grep '^rows:' <<<"$drill_fp")
prod_objs=$(grep '^objects:' <<<"$prod_fp")
drill_objs=$(grep '^objects:' <<<"$drill_fp")
# Health penuh (termasuk renderer PDF): Chromium bisa lambat start di VM yang I/O-nya padat.
for _ in $(seq 60); do
  health=$(curl -sk -o /dev/null -w '%{http_code}' "https://$host:9443/api/health")
  [ "$health" = 200 ] && break
  sleep 5
done
[ "$health" = 200 ] || "${DRILL[@]}" logs --no-color --tail 20 renderer >&2 || true

echo "isi per tabel (jumlah + md5) cocok: $([ "$prod_rows" = "$drill_rows" ] && echo ya || echo TIDAK)"
# Hanya nama tabel yang beda (bukan isinya); beda kecil bisa karena produksi dipakai setelah backup.
[ "$prod_rows" = "$drill_rows" ] || comm -3 <(tr ' ' '\n' <<<"${prod_rows#rows: }" | sort) \
  <(tr ' ' '\n' <<<"${drill_rows#rows: }" | sort) | cut -d= -f1 | tr -d '\t' | sort -u | sed 's/^/  beda: /'
echo "daftar objek storage (ukuran+path) cocok: $([ "$prod_objs" = "$drill_objs" ] && echo ya || echo TIDAK)"
echo "health salinan latihan: $health"
[ "$prod_rows" = "$drill_rows" ] && [ "$prod_objs" = "$drill_objs" ] && [ "$health" = 200 ] \
  && echo "LATIHAN RESTORE LULUS" || { echo "LATIHAN RESTORE GAGAL" >&2; exit 1; }
