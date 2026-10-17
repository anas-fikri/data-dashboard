#!/usr/bin/env bash
# Latihan restore (T-023 AC3) tanpa menyentuh produksi: salinan TERPISAH (project compose
# "dashboard-restoretest", volume sendiri, PostgreSQL container sementara, port 9443/9444, semua secret
# baru) dipulihkan dari arsip backup produksi terbaru, dibandingkan dengan produksi (jumlah baris per
# tabel + daftar objek storage + health), lalu dibongkar. Kunci PRIVAT age dibaca dari stdin:
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

archive=$("${PROD[@]}" exec -T backup sh -c 'ls -1 /backups/dashboard-*.tar.age | tail -1')
echo "arsip produksi: $(basename "$archive")"
tmp=$(mktemp -d)
"${PROD[@]}" cp "backup:$archive" "$tmp/backup.tar.age" >/dev/null
"${PROD[@]}" cp "backup:$archive.sha256" "$tmp/backup.tar.age.sha256" >/dev/null || true

echo "salinan latihan: up (tanpa build, image produksi)"
"${DRILL[@]}" up -d --wait --wait-timeout 600 postgres redis rustfs
"${DRILL[@]}" up --no-build migrate storage-init >/dev/null
echo "restore arsip ke salinan latihan"
printf '%s\n' "$key" | "${DRILL[@]}" run --rm -T --no-deps -v "$tmp:/run/drill:ro" backup \
  bash /usr/local/bin/restore.sh /run/drill/backup.tar.age -
rm -rf "$tmp"
"${DRILL[@]}" up -d --no-build --wait --wait-timeout 600

sql='SELECT string_agg(format($$%s=%s$$, table_name, (xpath($$/row/c/text()$$, query_to_xml(format($$select count(*) as c from %I$$, table_name), false, true, $$$$)))[1]::text), $$ $$ ORDER BY table_name) FROM information_schema.tables WHERE table_schema = $$public$$ AND table_name NOT LIKE $$\_prisma%$$'
prod_rows=$("${PROD[@]}" exec -T backup sh -c "psql \"\$DATABASE_URL\" -tAc '$sql'")
drill_rows=$("${DRILL[@]}" exec -T backup sh -c "psql \"\$DATABASE_URL\" -tAc '$sql'")
objs='export RCLONE_S3_PROVIDER=Other RCLONE_S3_ENDPOINT="$S3_ENDPOINT" RCLONE_S3_FORCE_PATH_STYLE=true RCLONE_S3_ACCESS_KEY_ID="$S3_ACCESS_KEY" RCLONE_S3_SECRET_ACCESS_KEY="$S3_SECRET_KEY" RCLONE_S3_REGION=us-east-1; rclone lsf -R --files-only --format sp ":s3:$S3_BUCKET" | sort | sha256sum | cut -c1-16'
prod_objs=$("${PROD[@]}" exec -T backup sh -c "$objs")
drill_objs=$("${DRILL[@]}" exec -T backup sh -c "$objs")
health=$(curl -sk -o /dev/null -w '%{http_code}' "https://$host:9443/api/health")

echo "baris per tabel cocok: $([ "$prod_rows" = "$drill_rows" ] && echo ya || echo TIDAK)"
echo "daftar objek storage (ukuran+path) cocok: $([ "$prod_objs" = "$drill_objs" ] && echo ya || echo TIDAK)"
echo "health salinan latihan: $health"
[ "$prod_rows" = "$drill_rows" ] && [ "$prod_objs" = "$drill_objs" ] && [ "$health" = 200 ] \
  && echo "LATIHAN RESTORE LULUS" || { echo "LATIHAN RESTORE GAGAL" >&2; exit 1; }
