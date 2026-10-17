#!/usr/bin/env bash
# Restore dari backup T-023 ke deploy ini (VM baru atau sama). Jalankan di service backup dengan kunci
# PRIVAT age yang dibawa operator (tidak disimpan di VM):
#   docker compose -f docker-compose.prod.yml run --rm \
#     -v /path/kunci-backup.txt:/run/age-key:ro -v /path/dashboard-<UTC>.tar.age:/run/backup.tar.age:ro \
#     backup bash /usr/local/bin/restore.sh /run/backup.tar.age /run/age-key
# Menimpa isi database dan bucket. App dan worker sebaiknya dihentikan dulu (runbook §Restore).
set -euo pipefail
archive=${1:?pakai: restore.sh <arsip.tar.age> <kunci-age>}
key=${2:?pakai: restore.sh <arsip.tar.age> <kunci-age>}
: "${DATABASE_URL:?}" "${S3_ENDPOINT:?}" "${S3_BUCKET:?}"
work=$(mktemp -d /backups/.restore-XXXXXX)
trap 'rm -rf "$work"' EXIT

if [ -f "$archive.sha256" ]; then (cd "$(dirname "$archive")" && sha256sum -c "$(basename "$archive").sha256"); fi
age -d -i "$key" "$archive" | tar -C "$work" -xf -
pg_restore --clean --if-exists --no-owner --no-privileges --dbname "$DATABASE_URL" "$work/db.dump"

export RCLONE_S3_PROVIDER=Other RCLONE_S3_ENDPOINT="$S3_ENDPOINT" RCLONE_S3_FORCE_PATH_STYLE=true \
  RCLONE_S3_ACCESS_KEY_ID="$S3_ACCESS_KEY" RCLONE_S3_SECRET_ACCESS_KEY="$S3_SECRET_KEY" \
  RCLONE_S3_REGION=us-east-1
rclone sync "$work/s3" ":s3:$S3_BUCKET" --transfers 4 --stats-one-line --stats 0
echo "restore selesai: database + bucket $S3_BUCKET dari $(basename "$archive")"
