# shellcheck shell=bash
# Disumber (source) skrip backup/restore (T-023): koneksi PostgreSQL dan storage lokal lewat ENVIRONMENT,
# bukan argumen proses — argumen terlihat oleh semua user host lewat ps//proc (review T-023 F1).
#   PG*      : libpq membaca PGHOST/PGPORT/PGUSER/PGPASSWORD/PGDATABASE dari env.
#   locals3  : remote rclone bernama khusus untuk RustFS lokal (RCLONE_CONFIG_LOCALS3_*), sehingga remote
#              off-VM di rclone.conf (termasuk tipe s3) tidak ikut dibelokkan (review T-023 F2).

pct_decode() { printf '%b' "${1//%/\\x}"; }

pg_env_from_url() {
  local url=${1#*://} creds rest hostport db
  creds=${url%%@*}
  rest=${url#*@}
  hostport=${rest%%/*}
  db=${rest#*/}
  export PGUSER PGPASSWORD PGHOST PGPORT PGDATABASE
  PGUSER=$(pct_decode "${creds%%:*}")
  PGPASSWORD=$(pct_decode "${creds#*:}")
  PGHOST=${hostport%:*}
  PGPORT=${hostport##*:}
  [ "$PGPORT" = "$hostport" ] && PGPORT=5432
  PGDATABASE=${db%%\?*}
}

local_s3_env() {
  export RCLONE_CONFIG_LOCALS3_TYPE=s3 RCLONE_CONFIG_LOCALS3_PROVIDER=Other \
    RCLONE_CONFIG_LOCALS3_ENDPOINT="$S3_ENDPOINT" RCLONE_CONFIG_LOCALS3_FORCE_PATH_STYLE=true \
    RCLONE_CONFIG_LOCALS3_ACCESS_KEY_ID="$S3_ACCESS_KEY" \
    RCLONE_CONFIG_LOCALS3_SECRET_ACCESS_KEY="$S3_SECRET_KEY" RCLONE_CONFIG_LOCALS3_REGION=us-east-1
}
