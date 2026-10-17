# Sumber bersama (T-023 latihan restore, T-024 stack uji performa): env compose untuk salinan TERPISAH
# dari produksi di VM yang sama — project lain, port lain, subnet lain, PostgreSQL container, semua
# secret baru. Nilai non-rahasia produksi (domain email, SMTP, kunci publik backup, bucket) disalin dari
# .env.prod. Setelan memori/worker ditambahkan pemanggil (tidak ada kunci ganda di file).
#   . deploy/isolated-env.sh
#   isolated_env <file> <app_port> <storage_port> <edge_subnet> <data_subnet>   (cwd = folder aplikasi)
# Mengisi variabel global ISO_HOST (host tanpa port untuk curl --resolve).

env_val() { sed -n "s/^$1=//p" .env.prod | tail -1; }
rand() { head -c 48 /dev/urandom | base64 | tr -dc 'A-Za-z0-9' | head -c "$1"; }

isolated_env() {
  local file=$1 app_port=$2 storage_port=$3 edge=$4 data=$5 host app_host tls pgpw db_url
  host=$(env_val TLS_DEFAULT_SNI)
  app_host=$(env_val APP_HOST)
  host=${host:-${app_host%:*}}
  [ -n "$host" ] || { echo "APP_HOST kosong di .env.prod" >&2; return 1; }
  # Sertifikat sendiri (path) dipakai ulang; ACME untuk domain produksi tidak bisa di port lain → internal.
  tls=$(env_val CADDY_TLS)
  tls=${tls//\"/} # lan-cert.sh menulis nilai berkutip
  case "$tls" in /*) ;; *) tls=internal ;; esac
  pgpw=$(rand 32)
  # Dirakit per bagian: literal user:pass@ di URL dibaca pemindai secret sebagai kredensial.
  db_url=postgresql://dashboard
  db_url+=":$pgpw@postgres:5432/data_dashboard"
  (
    umask 077
    grep -E '^(ALLOWED_EMAIL_DOMAINS|SMTP_URL|MAIL_FROM|BACKUP_AGE_RECIPIENT|S3_BUCKET)=' .env.prod >"$file"
    cat >>"$file" <<EOF
CADDY_TLS=$tls
APP_HOST=$host:$app_port
APP_PORT=$app_port
STORAGE_HOST=$host:$storage_port
STORAGE_PORT=$storage_port
TLS_DEFAULT_SNI=$host
COMPOSE_PROFILES=db
EDGE_SUBNET=$edge
DATA_SUBNET=$data
POSTGRES_PASSWORD=$pgpw
DATABASE_URL=$db_url
AUTH_SECRET=$(rand 48)
REDIS_PASSWORD=$(rand 40)
RENDERER_SECRET=$(rand 48)
RUSTFS_ROOT_USER=root$(rand 12)
RUSTFS_ROOT_PASSWORD=$(rand 40)
S3_APP_ACCESS_KEY=app$(rand 17)
S3_APP_SECRET_KEY=$(rand 40)
EOF
  )
  ISO_HOST=$host
}
