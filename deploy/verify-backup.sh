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
    # Target yang sama dengan backup harian (NAS dari Admin › Backup, atau BACKUP_REMOTE).
    mkdir "$work/arsip"
    name=$(backup.sh --fetch "$work/arsip" "$ARCHIVE")
    f=$work/arsip/$name
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
