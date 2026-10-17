#!/usr/bin/env bash
# Uji arsip backup TANPA memulihkan (T-023): dekripsi dengan kunci PRIVAT age dari stdin (tidak pernah
# ditulis ke disk VM), periksa dump PostgreSQL bisa dibaca pg_restore dan hitung objek storage, lalu
# hapus hasil sementara. Dari mesin yang menyimpan kunci:
#   ssh <server> bash /data/docker-data/data-dashboard/deploy/verify-backup.sh [arsip] < kunci-backup.txt
set -euo pipefail
cd "$(dirname "$0")/.."
archive=${1:-}
docker compose --env-file .env.prod -f docker-compose.prod.yml exec -T -e ARCHIVE="$archive" backup bash -c '
  set -euo pipefail
  f=${ARCHIVE:-$(ls -1 /backups/dashboard-*.tar.age | tail -1)}
  work=$(mktemp -d /tmp/verify-XXXXXX)
  trap "rm -rf $work" EXIT
  (cd /backups && sha256sum -c "$(basename "$f").sha256" >/dev/null) && echo "checksum: cocok"
  age -d -i - "$f" | tar -xf - -C "$work"
  echo "arsip: $(basename "$f")"
  echo "dump database: $(du -h "$work/db.dump" | cut -f1), tabel berisi data: $(pg_restore --list "$work/db.dump" | grep -c "TABLE DATA")"
  echo "objek storage: $(find "$work/s3" -type f | wc -l)"
  echo "arsip bisa dipulihkan"
'
