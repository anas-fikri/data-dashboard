#!/usr/bin/env bash
# Backup harian (T-023, T-7psf), dijalankan cron di service "backup":
#   pg_dump (format custom) + salinan seluruh bucket → tar → age (kunci PUBLIK BACKUP_AGE_RECIPIENT) →
#   /backups/dashboard-<UTC>.tar.age (+ .sha256), lalu disalin ke target off-VM:
#   - konfigurasi dari aplikasi (Admin › Backup → /backup-config/offsite.json, S3) bila aktif, selain itu
#   - BACKUP_REMOTE (remote rclone di deploy/rclone.conf, mis. SFTP dari deploy/offsite-key.sh).
#   Target tidak terjangkau (down, jaringan, kunci salah) → arsip DITAHAN di VM: retensi lokal
#   (BACKUP_LOCAL_RETENTION_DAYS, bawaan = BACKUP_RETENTION_DAYS) hanya membuang arsip yang sudah tersalin;
#   arsip tertunda dikirim ulang `backup.sh --sync` (cron tiap 30 menit) dan baru dibuang setelah
#   BACKUP_RETENTION_DAYS hari (retensi yang sama dengan di target).
#   Status → /backup-config/status.json (Admin › Backup + banner admin). Perubahan status (gagal, tertunda,
#   pulih) dikirim sekali ke email admin aktif lewat SMTP_URL.
#   Manual: docker compose run --rm --no-deps backup backup.sh [--sync]
# Kunci privat age tidak pernah ada di VM: backup tidak bisa dibuka dari VM yang dibobol. Rahasia (DB,
# storage, target, SMTP) lewat environment/stdin, bukan argumen proses (terlihat lewat ps).
set -euo pipefail
mode=${1:-backup}
: "${DATABASE_URL:?}" "${S3_ENDPOINT:?}" "${S3_BUCKET:?}" "${BACKUP_AGE_RECIPIENT:?}"
# shellcheck source=deploy/pgenv.sh
. "${PGENV_SH:-/usr/local/bin/pgenv.sh}"
pg_env_from_url "$DATABASE_URL"
local_s3_env
days=${BACKUP_RETENTION_DAYS:-30}
local_days=${BACKUP_LOCAL_RETENTION_DAYS:-$days}
dir=${BACKUP_DIR:-/backups}
cfg=${BACKUP_CONFIG_DIR:-/backup-config}
status_file="$cfg/status.json"
# Baris 1: target, baris 2: arsip terbaru yang sudah pasti ada di target itu.
mark="$dir/.offsite-ok"
stamp=$(date -u +%Y%m%dT%H%M%SZ)
now=$(date -u +%Y-%m-%dT%H:%M:%SZ)
# Target yang tidak terjangkau harus ketahuan dalam ± 1–2 menit, bukan menggantung berjam-jam.
rflags=(--contimeout 15s --timeout 60s --retries 2 --low-level-retries 3)
errf=$(mktemp)
trap 'rm -f "$errf"' EXIT

# Satu run sekaligus: backup harian menunggu, kirim ulang yang bentrok cukup dilewati.
exec 9>"$dir/.lock"
if ! flock -n 9; then
  [ "$mode" = --sync ] && exit 0
  flock 9
fi

remote="" target=""
offsite_target() {
  local f="$cfg/offsite.json" path endpoint
  remote="" target=""
  if [ -s "$f" ] && [ "$(jq -r '.enabled == true' "$f")" = true ]; then
    endpoint=$(jq -r .endpoint "$f")
    path=$(jq -r '[.bucket, (.prefix // "")] | map(select(. != "")) | join("/")' "$f")
    export RCLONE_CONFIG_APPOFFSITE_TYPE=s3 RCLONE_CONFIG_APPOFFSITE_PROVIDER=Other \
      RCLONE_CONFIG_APPOFFSITE_FORCE_PATH_STYLE=true RCLONE_CONFIG_APPOFFSITE_NO_CHECK_BUCKET=true \
      RCLONE_CONFIG_APPOFFSITE_ENDPOINT="$endpoint"
    RCLONE_CONFIG_APPOFFSITE_REGION=$(jq -r '.region // "us-east-1"' "$f")
    RCLONE_CONFIG_APPOFFSITE_ACCESS_KEY_ID=$(jq -r .accessKeyId "$f")
    RCLONE_CONFIG_APPOFFSITE_SECRET_ACCESS_KEY=$(jq -r .secretAccessKey "$f")
    export RCLONE_CONFIG_APPOFFSITE_REGION RCLONE_CONFIG_APPOFFSITE_ACCESS_KEY_ID \
      RCLONE_CONFIG_APPOFFSITE_SECRET_ACCESS_KEY
    remote="appoffsite:$path"
    target="${endpoint#*://}/$path"
  elif [ -n "${BACKUP_REMOTE:-}" ]; then
    remote=$BACKUP_REMOTE
    target=$BACKUP_REMOTE
  fi
}

archives() { find "$dir" -maxdepth 1 -name 'dashboard-*.tar.age' -exec basename {} \; | sort; }
# Arsip terbaru yang sudah tersalin ke target SAAT INI (target berganti → semua arsip lokal tertunda).
confirmed() {
  local t="" n=""
  { read -r t && read -r n; } 2>/dev/null <"$mark" || true
  if [ "$t" = "$target" ]; then printf '%s' "$n"; fi
}
pending_count() {
  [ -n "$remote" ] || { echo 0; return; }
  archives | awk -v m="$(confirmed)" '$0 > m' | wc -l | tr -d ' '
}
last_err() { grep -v '^[[:space:]]*$' "$errf" | tail -n 1 | cut -c1-300; }

# Salin semua arsip lokal yang belum ada di target (rclone copy melewati yang sudah ada).
sync_offsite() {
  local newest
  newest=$(archives | tail -n 1)
  [ -n "$newest" ] || return 0
  rclone copy "$dir" "$remote" --max-depth 1 --include '/dashboard-*' "${rflags[@]}" 2>"$errf" || return 1
  printf '%s\n%s\n' "$target" "$newest" >"$mark"
  # Retensi di target: gagal tidak membuat salinan dianggap gagal (diulang run berikutnya).
  rclone delete "$remote" --min-age "${days}d" --include '/dashboard-*' "${rflags[@]}" 2>/dev/null ||
    echo "[$stamp] peringatan: retensi di target gagal" >&2
}

local_retention() {
  local m f b
  m=$(confirmed)
  find "$dir" -maxdepth 1 -name 'dashboard-*' -mtime +"$days" -delete
  find "$dir" -maxdepth 1 -name 'dashboard-*' -mtime +"$local_days" | while read -r f; do
    b=$(basename "$f")
    b=${b%.sha256}
    # Tanpa target off-VM: retensi lokal biasa. Dengan target: hanya arsip yang sudah tersalin.
    if [ -z "$remote" ] || { [ -n "$m" ] && ! [[ "$b" > "$m" ]]; }; then rm -f "$f"; fi
  done
}

prev() { jq -r "$1 | if . == null then empty else . end" "$status_file" 2>/dev/null || true; }
is_problem() { [ "$1" = failed ] || [ "$1" = pending ]; }

# Email admin aktif (cadangan daftar terakhir bila DB tidak terjangkau, mis. saat backup gagal karena DB).
admin_emails() {
  local list
  if list=$(psql -X -qtA -c 'SELECT email FROM "User" WHERE "isAdmin" AND "isActive"
      AND "emailVerifiedAt" IS NOT NULL ORDER BY email' 2>/dev/null) && [ -n "$list" ]; then
    printf '%s\n' "$list" >"$cfg/.admins"
    printf '%s\n' "$list"
  else
    cat "$cfg/.admins" 2>/dev/null || true
  fi
}

notify() { # state pending since
  local state=$1 pending=$2 since=$3 to subject body from addr mail a link
  [ -n "${SMTP_URL:-}" ] || { echo "[$stamp] peringatan: SMTP_URL kosong, admin tidak diberi tahu" >&2; return 1; }
  to=$(admin_emails)
  [ -n "$to" ] || { echo "[$stamp] peringatan: tidak ada email admin aktif" >&2; return 1; }
  link="${APP_URL:-}/admin/backup"
  case $state in
    failed)
      subject="Backup Data Dashboard GAGAL"
      body="Backup harian Data Dashboard gagal pada $now (UTC): ${err:-lihat log service backup}.
Arsip terakhir yang berhasil: ${last_archive:-belum ada}.
Periksa log: docker compose logs backup. Status: $link" ;;
    pending)
      subject="Backup Data Dashboard: salinan off-VM tertunda"
      body="Salinan backup ke $target belum berhasil sejak $since (UTC): ${err:-target tidak terjangkau}.
$pending arsip disimpan sementara di VM dan dikirim ulang otomatis tiap 30 menit.
Periksa jaringan/target atau ubah pengaturan di $link" ;;
    *)
      subject="Backup Data Dashboard kembali normal"
      body="Backup Data Dashboard berjalan normal lagi ($now UTC). Target off-VM: ${target:-tidak aktif (backup hanya di VM)}.
Status: $link" ;;
  esac
  from=${MAIL_FROM:-}
  addr=$(printf '%s' "$from" | sed -n 's/.*<\(.*\)>.*/\1/p')
  addr=${addr:-$from}
  mail=$(mktemp)
  {
    printf 'From: %s\r\nTo: %s\r\nSubject: %s\r\nDate: %s\r\n' "$from" "$(printf '%s' "$to" | paste -sd, -)" \
      "$subject" "$(date -u '+%a, %d %b %Y %H:%M:%S +0000')"
    printf 'MIME-Version: 1.0\r\nContent-Type: text/plain; charset=UTF-8\r\n\r\n%s\r\n' "$body"
  } >"$mail"
  local rcpt=()
  for a in $to; do rcpt+=(--mail-rcpt "$a"); done
  # URL (dengan password) lewat stdin -K, bukan argumen proses.
  if printf 'url = "%s"\n' "$SMTP_URL" |
    curl -sS --ssl --max-time 30 -K - --mail-from "$addr" "${rcpt[@]}" -T "$mail"; then
    rm -f "$mail"
    echo "[$stamp] admin diberi tahu: $subject"
  else
    rm -f "$mail"
    echo "[$stamp] peringatan: email ke admin gagal (dicoba lagi run berikutnya)" >&2
    return 1
  fi
}

# Simpan status + beri tahu admin bila berubah. Variabel: last_at/last_ok/last_archive/last_size/off_ok/err.
save_status() {
  local pending since state notified
  pending=$(pending_count)
  since=$(prev .pendingSince)
  if [ "$pending" -eq 0 ]; then since=""; elif [ -z "$since" ]; then since=$now; fi
  if [ "$last_ok" = false ]; then
    state=failed
  elif [ -z "$remote" ]; then
    state=off
  elif [ "$pending" -gt 0 ]; then
    state=pending
  else
    state=ok
  fi
  notified=$(prev .notified)
  if { is_problem "$state" && [ "$state" != "$notified" ]; } || { ! is_problem "$state" && is_problem "$notified"; }; then
    notify "$state" "$pending" "$since" && notified=$state
  else
    notified=$state
  fi
  mkdir -p "$cfg"
  jq -n --arg state "$state" --arg target "$target" --argjson pending "$pending" --arg since "$since" \
    --arg lastAt "$last_at" --arg lastOk "$last_ok" --arg lastArchive "$last_archive" \
    --arg lastSize "$last_size" --arg offOk "$off_ok" --arg err "$err" --arg notified "$notified" \
    --arg now "$now" 'def n: if . == "" then null else . end;
    { state: $state, target: ($target | n), pending: $pending, pendingSince: ($since | n),
      lastBackupAt: ($lastAt | n), lastBackupOk: ($lastOk | if . == "" then null else . == "true" end),
      lastArchive: ($lastArchive | n), lastSizeBytes: ($lastSize | if . == "" then null else tonumber end),
      lastOffsiteOkAt: ($offOk | n), error: ($err | n), notified: $notified, updatedAt: $now }' \
    >"$status_file.tmp"
  mv "$status_file.tmp" "$status_file"
}

load_prev() {
  last_at=$(prev .lastBackupAt)
  last_ok=$(prev .lastBackupOk)
  last_archive=$(prev .lastArchive)
  last_size=$(prev .lastSizeBytes)
  off_ok=$(prev .lastOffsiteOkAt)
  err=$(prev .error)
}

if [ "$mode" = --sync ]; then
  load_prev
  offsite_target
  n=$(pending_count)
  if [ "$n" -gt 0 ]; then
    if sync_offsite; then
      off_ok=$now
      [ "$last_ok" = false ] || err=""
      echo "[$stamp] $n arsip tertunda tersalin ke $target"
    else
      err=$(last_err)
      echo "[$stamp] kirim ulang ke $target gagal ($n arsip tertunda): $err" >&2
    fi
    local_retention
  elif [ "$last_ok" != false ]; then
    err=""
  fi
  # Belum pernah ada backup: tidak ada status untuk dilaporkan.
  [ -z "$last_at" ] && [ "$n" -eq 0 ] && exit 0
  save_status
  exit 0
fi

load_prev
work=$(mktemp -d "$dir/.work-XXXXXX")
step="persiapan"
saved=""
finish() {
  local rc=$?
  set +e
  rm -rf "$work" "$errf"
  if [ "$rc" -ne 0 ] && [ -z "$saved" ]; then
    last_at=$now last_ok=false err="backup gagal di langkah: $step"
    offsite_target
    save_status
  fi
}
trap finish EXIT

echo "[$stamp] backup mulai"
step="pg_dump"
pg_dump --format=custom --no-owner --no-privileges --file "$work/db.dump"
step="salin storage lokal"
rclone copy "locals3:$S3_BUCKET" "$work/s3" --transfers 4 --checkers 8 --stats-one-line --stats 0

step="enkripsi arsip"
out="$dir/dashboard-$stamp.tar.age"
tar -C "$work" -cf - db.dump s3 | age -r "$BACKUP_AGE_RECIPIENT" -o "$out.part"
mv "$out.part" "$out"
(cd "$dir" && sha256sum "$(basename "$out")" >"$(basename "$out").sha256")
last_at=$now last_ok=true last_archive=$(basename "$out")
last_size=$(wc -c <"$out" | tr -d ' ')
echo "[$stamp] arsip: $last_archive ($(du -h "$out" | cut -f1))"

step="salinan off-VM"
offsite_target
err=""
if [ -z "$remote" ]; then
  echo "[$stamp] PERINGATAN: target off-VM belum diatur — backup hanya di VM ini" >&2
elif sync_offsite; then
  off_ok=$now
  echo "[$stamp] tersalin ke $target"
else
  err=$(last_err)
  echo "[$stamp] PERINGATAN: salinan ke $target gagal ($err) — arsip ditahan di VM, dikirim ulang tiap 30 menit" >&2
fi
local_retention
save_status
saved=1
echo "[$stamp] backup selesai"
