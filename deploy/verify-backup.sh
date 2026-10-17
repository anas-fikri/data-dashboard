#!/usr/bin/env bash
# Uji arsip backup TANPA memulihkan (T-023, T-h77x): dekripsi dengan kunci PRIVAT age dari stdin (tidak
# pernah ditulis ke disk VM), periksa checksum, dump PostgreSQL bisa dibaca pg_restore, dan hitung objek
# storage, lalu hapus hasil sementara. Dari mesin yang menyimpan kunci:
#   ssh <server> bash /data/docker-data/data-dashboard/deploy/verify-backup.sh [arsip] < kunci-backup.txt
#   ssh <server> bash .../verify-backup.sh --remote [nama-arsip] < kunci-backup.txt   (salinan off-VM)
# Container baru (run, bukan exec): selalu memakai mount dan konfigurasi rclone terbaru.
set -euo pipefail
cd "$(dirname "$0")/.."
remote=
if [ "${1:-}" = --remote ]; then
  remote=1
  shift
fi
archive=${1:-}
docker compose --env-file .env.prod -f docker-compose.prod.yml run --rm -T --no-deps \
  -e ARCHIVE="$archive" -e REMOTE="$remote" backup bash -c '
  set -euo pipefail
  work=$(mktemp -d /backups/.verify-XXXXXX)
  trap "rm -rf $work" EXIT
  if [ -n "$REMOTE" ]; then
    : "${BACKUP_REMOTE:?BACKUP_REMOTE kosong di .env.prod}"
    name=${ARCHIVE:-$(rclone lsf "$BACKUP_REMOTE" --include "dashboard-*.tar.age" | sort | tail -1)}
    [ -n "$name" ] || { echo "tidak ada arsip di $BACKUP_REMOTE" >&2; exit 1; }
    mkdir "$work/arsip"
    rclone copy "$BACKUP_REMOTE/$name" "$work/arsip"
    rclone copy "$BACKUP_REMOTE/$name.sha256" "$work/arsip"
    f=$work/arsip/$name
    echo "sumber: $BACKUP_REMOTE (off-VM)"
  else
    f=${ARCHIVE:-$(ls -1 /backups/dashboard-*.tar.age | tail -1)}
  fi
  (cd "$(dirname "$f")" && sha256sum -c "$(basename "$f").sha256" >/dev/null) && echo "checksum: cocok"
  mkdir "$work/isi"
  age -d -i - "$f" | tar -xf - -C "$work/isi"
  echo "arsip: $(basename "$f")"
  echo "dump database: $(du -h "$work/isi/db.dump" | cut -f1), tabel berisi data: $(pg_restore --list "$work/isi/db.dump" | grep -c "TABLE DATA")"
  echo "objek storage: $(find "$work/isi/s3" -type f | wc -l)"
  echo "arsip bisa dipulihkan"
'
