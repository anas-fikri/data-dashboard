#!/usr/bin/env bash
# Backup harian (T-023), dijalankan cron di service "backup":
#   pg_dump (format custom) + salinan seluruh bucket → tar → age (kunci PUBLIK BACKUP_AGE_RECIPIENT) →
#   /backups/dashboard-<UTC>.tar.age (+ .sha256), disalin ke BACKUP_REMOTE (rclone) bila diisi,
#   retensi BACKUP_RETENTION_DAYS hari di lokal dan remote. Manual: docker compose exec backup backup.sh
# Kunci privat age tidak pernah ada di VM: backup tidak bisa dibuka dari VM yang dibobol.
set -euo pipefail
: "${DATABASE_URL:?}" "${S3_ENDPOINT:?}" "${S3_BUCKET:?}" "${BACKUP_AGE_RECIPIENT:?}"
# shellcheck source=deploy/pgenv.sh
. /usr/local/bin/pgenv.sh
pg_env_from_url "$DATABASE_URL"
local_s3_env
days=${BACKUP_RETENTION_DAYS:-30}
stamp=$(date -u +%Y%m%dT%H%M%SZ)
out="/backups/dashboard-$stamp.tar.age"
work=$(mktemp -d /backups/.work-XXXXXX)
trap 'rm -rf "$work"' EXIT

echo "[$stamp] backup mulai"
pg_dump --format=custom --no-owner --no-privileges --file "$work/db.dump"
rclone copy "locals3:$S3_BUCKET" "$work/s3" --transfers 4 --checkers 8 --stats-one-line --stats 0

tar -C "$work" -cf - db.dump s3 | age -r "$BACKUP_AGE_RECIPIENT" -o "$out.part"
mv "$out.part" "$out"
(cd /backups && sha256sum "$(basename "$out")" >"$(basename "$out").sha256")
echo "[$stamp] arsip: $(basename "$out") ($(du -h "$out" | cut -f1))"

if [ -n "${BACKUP_REMOTE:-}" ]; then
  rclone copy "$out" "$BACKUP_REMOTE" && rclone copy "$out.sha256" "$BACKUP_REMOTE"
  rclone delete "$BACKUP_REMOTE" --min-age "${days}d" --include 'dashboard-*'
  echo "[$stamp] tersalin ke $BACKUP_REMOTE"
else
  echo "[$stamp] PERINGATAN: BACKUP_REMOTE kosong — backup hanya di VM ini" >&2
fi
find /backups -maxdepth 1 -name 'dashboard-*' -mtime +"$days" -delete
echo "[$stamp] backup selesai"
