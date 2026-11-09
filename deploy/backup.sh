#!/usr/bin/env bash
# Backup harian (T-023, T-7psf), dijalankan cron di service "backup":
#   pg_dump (format custom) + salinan seluruh bucket → tar → age (kunci PUBLIK BACKUP_AGE_RECIPIENT) →
#   /backups/dashboard-<UTC>.tar.age (+ .sha256), lalu disalin ke target off-VM:
#   - konfigurasi dari aplikasi (Admin › Backup → /backup-config/app/offsite.json, NAS Synology lewat SFTP
#     dengan kunci host yang dipin) bila aktif, selain itu
#   - BACKUP_REMOTE (remote rclone di deploy/rclone.conf, mis. SFTP dari deploy/offsite-key.sh).
#   Target tidak terjangkau (down, jaringan, kunci salah) → arsip DITAHAN di VM: retensi lokal
#   (BACKUP_LOCAL_RETENTION_DAYS, bawaan = BACKUP_RETENTION_DAYS) hanya membuang arsip yang sudah tersalin;
#   arsip tertunda dikirim ulang `backup.sh --sync` (cron tiap 30 menit) dan baru dibuang setelah
#   max(BACKUP_RETENTION_DAYS, BACKUP_LOCAL_RETENTION_DAYS) hari.
#   Status → /backup-config/status.json (Admin › Backup + banner admin). Perubahan status (gagal, tertunda,
#   pulih) dikirim sekali ke email admin aktif lewat SMTP_URL.
#   /backup-config milik root (755): user app hanya bisa menulis di app/, jadi tidak bisa menaruh symlink
#   di tempat root menulis (review T-7psf #1). Cadangan daftar email admin di /backups (khusus root).
#   Admin › Backup (T-tsvf): lama simpan di server/NAS dari app/retention.json (menggantikan .env.prod, NAS
#   minimal 7 hari), "Kirim ulang sekarang" = file app/sync-request yang dijalankan `backup.sh --tick` (cron
#   tiap menit), dan kirim ulang yang ditolak NAS (penuh/kuota) dijeda bertahap 30 menit → 4 jam agar tidak
#   mengunggah GB sia-sia. status.json juga memuat daftar arsip, ruang disk server, ringkasan arsip + sisa ruang
#   NAS (rclone about), dan running.json menandai run yang sedang berjalan.
#   Manual: docker compose run --rm --no-deps backup backup.sh [--sync]
# Kunci privat age tidak pernah ada di VM: backup tidak bisa dibuka dari VM yang dibobol. Rahasia (DB,
# storage, target, SMTP) lewat environment/stdin, bukan argumen proses (terlihat lewat ps).
set -euo pipefail
mode=${1:-backup}
dir=${BACKUP_DIR:-/backups}
cfg=${BACKUP_CONFIG_DIR:-/backup-config}
# "Kirim ulang sekarang" dari Admin › Backup: file yang ditulis user app. Root hanya memeriksa keberadaannya
# lalu menghapusnya (isinya tidak pernah dibaca).
req="$cfg/app/sync-request"
# --tick (cron tiap menit) tanpa permintaan: selesai seketika tanpa menyentuh apa pun.
if [ "$mode" = --tick ] && ! [ -e "$req" ] && ! [ -L "$req" ]; then exit 0; fi
: "${DATABASE_URL:?}" "${S3_ENDPOINT:?}" "${S3_BUCKET:?}" "${BACKUP_AGE_RECIPIENT:?}"
# shellcheck source=deploy/pgenv.sh
. "${PGENV_SH:-/usr/local/bin/pgenv.sh}"
pg_env_from_url "$DATABASE_URL"
local_s3_env
# Retensi NAS (days) dan server (local_days): .env.prod, digantikan Admin › Backup bila diatur (retention_from_app).
days=${BACKUP_RETENTION_DAYS:-30}
local_days=${BACKUP_LOCAL_RETENTION_DAYS:-$days}
retention_src=env
status_file="$cfg/status.json"
# Run yang sedang berjalan (jenis + mulai) untuk Admin › Backup; dihapus saat run selesai.
running="$cfg/running.json"
ran=""
admins_cache="$dir/.admins"
# Baris 1: target, baris 2: arsip terbaru yang sudah pasti ada di target itu.
mark="$dir/.offsite-ok"
# Target yang tidak terjangkau harus ketahuan dalam ± 1–2 menit, bukan menggantung berjam-jam.
rflags=(--contimeout 15s --timeout 60s --retries 2 --low-level-retries 3)
errf=$(mktemp)
# known_hosts target NAS dari Admin › Backup (di /tmp container, khusus root; dihapus saat selesai).
khf=$(mktemp)
cleanup() {
  rm -f "$errf" "$khf"
  [ -z "$ran" ] || rm -f "$running"
}
trap cleanup EXIT

# Satu run sekaligus: backup harian menunggu, kirim ulang (terjadwal/diminta) yang bentrok cukup dilewati —
# permintaan dari Admin › Backup tetap ada dan dijalankan menit berikutnya.
exec 9>"$dir/.lock"
if ! flock -n 9; then
  case $mode in --sync | --tick) exit 0 ;; esac
  flock 9
fi
# Pemegang kunci tahu tidak ada run lain: running.json yang tersisa (container dimatikan paksa) dibuang.
rm -f "$running"
stamp=$(date -u +%Y%m%dT%H%M%SZ)
now=$(date -u +%Y-%m-%dT%H:%M:%SZ)
now_s=$(date -u +%s)
if [ "$(id -u)" = 0 ]; then
  [ -d "$cfg/app" ] || { mkdir -p "$cfg/app" && chown -h 10001:10001 "$cfg/app"; }
  chown 0:0 "$cfg" && chmod 755 "$cfg"
fi

# JSON objek dari file yang ditulis user app (app/<nama>): hanya file biasa, dibaca SEKALI dengan batas waktu
# dan ukuran (symlink/FIFO/tukar file di tengah jalan tidak bisa membuat root membaca tempat lain atau
# menggantung sambil memegang kunci). Tidak ada → kosong; tidak terbaca → kode 1.
app_json() {
  local f="$cfg/app/$1" j
  [ -L "$f" ] && return 1
  [ -e "$f" ] || return 0
  [ -f "$f" ] && j=$(timeout 5 head -c 65536 -- "$f") && jq -e 'type == "object"' <<<"$j" >/dev/null 2>&1 ||
    return 1
  printf '%s' "$j"
}

# Lama simpan dari Admin › Backup (app/retention.json): bilangan bulat, NAS 7–365 hari (batas bawah agar app
# yang dibobol tidak bisa menghapus riwayat di NAS), server 3–365 hari. Tidak ada → .env.prod; tidak terbaca
# atau di luar batas → .env.prod + peringatan (backup tetap jalan).
retention_from_app() {
  local j
  if ! j=$(app_json retention.json); then
    echo "[$stamp] peringatan: retention.json tidak terbaca, memakai .env.prod" >&2
    return 0
  fi
  [ -n "$j" ] || return 0
  local r l
  # jq menyimpan angka persis seperti ditulis (7.0, 3E1): ambil bentuk bilangan bulatnya (floor), lalu cek
  # ulang di bash sebelum dipakai di aritmetika/find (nilai aneh tidak boleh menggagalkan backup harian).
  if jq -e '(.remoteDays | type == "number" and . == floor and . >= 7 and . <= 365)
      and (.localDays | type == "number" and . == floor and . >= 3 and . <= 365)' <<<"$j" >/dev/null 2>&1 &&
    r=$(jq -r '.remoteDays | floor' <<<"$j") && l=$(jq -r '.localDays | floor' <<<"$j") &&
    [[ $r =~ ^[0-9]{1,3}$ && $l =~ ^[0-9]{1,3}$ ]]; then
    days=$r local_days=$l retention_src=app
  else
    echo "[$stamp] peringatan: retention.json tidak valid, memakai .env.prod" >&2
  fi
}
retention_from_app
full_days=$((days > local_days ? days : local_days))

remote="" target="" cfg_broken=""
offsite_target() {
  local host port user folder key hp algos pass json=""
  remote="" target="" cfg_broken=""
  if ! json=$(app_json offsite.json); then
    # Tidak terbaca: tanpa salinan (juga tanpa BACKUP_REMOTE, agar run harian dan --sync sama), arsip lokal
    # tidak dibuang retensi lokal, status "failed" sampai admin menyimpan ulang konfigurasinya.
    cfg_broken=1
    echo "[$stamp] PERINGATAN: konfigurasi off-VM dari aplikasi tidak terbaca" >&2
    return 0
  fi
  if [ -n "$json" ] && [ "$(jq -r '.enabled == true' <<<"$json")" = true ]; then
    # NAS Synology lewat SFTP (T-y8qq). Aturan sama dengan form Admin › Backup: file yang tidak lolos (app
    # dibobol, format lama S3) → tanpa salinan dan status failed, bukan nilai mentah ke rclone.
    if ! jq -e '(.host | type == "string" and test("^[a-z0-9][a-z0-9.-]{0,252}$"))
        and (.port | type == "number" and . == floor and . >= 1 and . <= 65535)
        and (.username | type == "string" and test("^[!-~]{1,128}$"))
        and (.password | type == "string" and test("^[ -~]{1,256}$"))
        and (.folder | type == "string" and length <= 201
          and test("^(/[A-Za-z0-9._-]+( [A-Za-z0-9._-]+)*)+$")
          and (split("/") | all(. != "." and . != "..")))
        and (.hostKey | type == "string"
          and test("^(ssh-ed25519|ecdsa-sha2-nistp(256|384|521)|ssh-rsa) [A-Za-z0-9+/]{16,2048}={0,2}$"))' \
      <<<"$json" >/dev/null 2>&1; then
      cfg_broken=1
      echo "[$stamp] PERINGATAN: konfigurasi NAS dari aplikasi tidak valid" >&2
      return 0
    fi
    host=$(jq -r .host <<<"$json")
    port=$(jq -r .port <<<"$json")
    user=$(jq -r .username <<<"$json")
    folder=$(jq -r .folder <<<"$json")
    key=$(jq -r .hostKey <<<"$json")
    # Hanya kunci host yang dipin dari "Tes koneksi" yang diterima (known_hosts + algoritme tipe kunci itu).
    if [ "$port" = 22 ]; then hp=$host; else hp="[$host]:$port"; fi
    printf '%s %s\n' "$hp" "$key" >"$khf"
    case ${key%% *} in
      ssh-rsa) algos="rsa-sha2-512 rsa-sha2-256 ssh-rsa" ;;
      *) algos=${key%% *} ;;
    esac
    # Password ke rclone obscure lewat stdin, bukan argumen proses.
    if ! pass=$(jq -r .password <<<"$json" | rclone obscure -); then
      cfg_broken=1
      echo "[$stamp] PERINGATAN: password NAS tidak bisa disiapkan" >&2
      return 0
    fi
    export RCLONE_CONFIG_APPOFFSITE_TYPE=sftp RCLONE_CONFIG_APPOFFSITE_HOST="$host" \
      RCLONE_CONFIG_APPOFFSITE_PORT="$port" RCLONE_CONFIG_APPOFFSITE_USER="$user" \
      RCLONE_CONFIG_APPOFFSITE_PASS="$pass" RCLONE_CONFIG_APPOFFSITE_KNOWN_HOSTS_FILE="$khf" \
      RCLONE_CONFIG_APPOFFSITE_HOST_KEY_ALGORITHMS="$algos" RCLONE_CONFIG_APPOFFSITE_SHELL_TYPE=none \
      RCLONE_CONFIG_APPOFFSITE_MD5SUM_COMMAND=none RCLONE_CONFIG_APPOFFSITE_SHA1SUM_COMMAND=none \
      RCLONE_CONFIG_APPOFFSITE_SET_MODTIME=false
    remote="appoffsite:$folder"
    target="$user@$host:$port$folder"
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
last_err() { { grep -v '^[[:space:]]*$' "$errf" || true; } | tail -n 1 | cut -c1-300; }

# Salin semua arsip lokal yang belum ada di target (rclone copy melewati yang sudah ada).
# Retensi di target (umur = waktu unggah, set_modtime=false). Gagal tidak membuat salinan dianggap gagal
# (diulang run berikutnya).
remote_retention() {
  rclone delete "$remote" --min-age "${days}d" --include '/dashboard-*' "${rflags[@]}" 2>/dev/null ||
    echo "[$stamp] peringatan: retensi di target gagal" >&2
}

sync_offsite() {
  local newest
  newest=$(archives | tail -n 1)
  [ -n "$newest" ] || return 0
  # Retensi DULU: saat NAS penuh, memperpendek lama simpan NAS di Admin › Backup langsung memberi ruang untuk
  # salinan ini (bukan menunggu salinan berhasil — yang tidak akan terjadi selama NAS penuh).
  remote_retention
  # Arsip tidak pernah berubah setelah dibuat: yang sudah ada di target dilewati berdasarkan nama (tanpa
  # perbandingan waktu — DSM menolak mengatur waktu/izin file lewat SFTP di folder ber-ACL, set_modtime=false).
  rclone copy "$dir" "$remote" --max-depth 1 --include '/dashboard-*' --ignore-existing "${rflags[@]}" \
    2>"$errf" || return 1
  printf '%s\n%s\n' "$target" "$newest" >"$mark"
}

# NAS menolak menyimpan (SFTP FAILURE dari DSM = ruang/kuota habis, atau pesan ruang/kuota lain): mengulang
# tiap 30 menit hanya mengunggah GB yang pasti ditolak lagi.
full_error() { grep -qiE 'SSH_FX_FAILURE|"Failure"|no space|quota|disk full' <<<"$1"; }

# Ringkasan arsip di target (setelah salinan + retensi di sana berhasil); gagal → ringkasan lama dipertahankan.
remote_summary() {
  local j
  j=$(rclone lsjson "$remote" --max-depth 1 --files-only --include '/dashboard-*.tar.age' "${rflags[@]}" \
    2>/dev/null) || return 1
  jq -c --arg t "$target" --arg now "$now" '{target: $t, count: length, bytes: (map(.Size) | add // 0),
    oldest: (map(.Name) | min), newest: (map(.Name) | max), checkedAt: $now}' <<<"$j"
}

# Sisa ruang volume NAS (rclone about = statvfs@openssh.com untuk SFTP tanpa shell). Kuota folder/akun DSM
# tidak selalu terlihat di sini. Tidak didukung/gagal → nilai lama dipertahankan.
nas_about() {
  local j
  j=$(rclone about "$remote" --json "${rflags[@]}" 2>/dev/null) || return 1
  j=$(jq -c --arg t "$target" --arg now "$now" 'select((.total | type) == "number" and (.free | type) == "number")
    | {target: $t, totalBytes: .total, freeBytes: .free, checkedAt: $now}' <<<"$j" 2>/dev/null) || return 1
  [ -n "$j" ] && nas_space=$j
}

# Salin + catat: jeda bertahap bila NAS menolak menyimpan (gagal ke-1..4+ → 30, 60, 120, 240 menit sejak run
# ini mulai; cron */30 lalu melewati run sampai waktunya), ringkasan arsip dan sisa ruang NAS.
copy_offsite() {
  local rc=0 shift_by summary
  sync_offsite || rc=1
  if [ "$rc" -eq 0 ]; then
    fails=0 next_epoch=""
    if summary=$(remote_summary); then remote_info=$summary; fi
  elif full_error "$(last_err)"; then
    fails=$((${fails:-0} + 1))
    shift_by=$((fails > 4 ? 3 : fails - 1))
    # Satu menit lebih awal: run cron berikutnya yang tepat waktunya tidak terlewat karena selisih detik.
    next_epoch=$((now_s + (30 << shift_by) * 60 - 60))
  else
    # Jaringan/NAS mati: gagal cepat (± 15 detik) tanpa unggahan, jadi tetap dicoba tiap 30 menit.
    fails=0 next_epoch=""
  fi
  nas_about || true
  return "$rc"
}

# Arsip di server, terbaru dulu (maks. 400), dengan tanda sudah tersalin ke target saat ini.
archives_json() {
  local m f
  m=$(confirmed)
  for f in "$dir"/dashboard-*.tar.age; do
    [ -f "$f" ] || continue
    printf '%s\t%s\n' "$(basename "$f")" "$(stat -c %s "$f")"
  done | jq -R -s -c --arg m "$m" --arg r "$remote" '[split("\n")[] | select(length > 0) | split("\t")
    | {name: .[0], sizeBytes: (.[1] | tonumber), offsite: ($r != "" and $m != "" and .[0] <= $m)}]
    | sort_by(.name) | reverse | .[:400]'
}

# Ruang disk volume backup di server (byte); gagal → null.
disk_json() {
  local d
  d=$(df -P -k "$dir" 2>/dev/null | awk 'NR == 2 { printf "{\"totalBytes\":%.0f,\"freeBytes\":%.0f}", $2 * 1024, $4 * 1024 }')
  printf '%s' "${d:-null}"
}

# Tandai run yang sedang berjalan (backup | sync) untuk Admin › Backup; dihapus cleanup saat selesai.
mark_running() {
  local tmp
  mkdir -p "$cfg"
  tmp=$(mktemp "$cfg/.running.XXXXXX")
  jq -n --arg kind "$1" --arg since "$now" '{kind: $kind, since: $since}' >"$tmp"
  chmod 644 "$tmp"
  mv -f "$tmp" "$running"
  ran=1
}

local_retention() {
  local m f b
  m=$(confirmed)
  find "$dir" -maxdepth 1 -name 'dashboard-*' -mtime +"$full_days" -delete
  # Sisa run yang dimatikan paksa (SIGKILL/OOM): arsip setengah jadi dan folder kerja > 1 hari.
  find "$dir" -maxdepth 1 \( -name '.dashboard-*.part' -o -name '.work-*' \) -mmin +1440 -exec rm -rf {} +
  # Konfigurasi tidak terbaca: target mungkin masih aktif, arsip tertunda jangan dibuang.
  [ -z "$cfg_broken" ] || return 0
  find "$dir" -maxdepth 1 -name 'dashboard-*' -mtime +"$local_days" | while read -r f; do
    b=$(basename "$f")
    b=${b%.sha256}
    # Tanpa target off-VM: retensi lokal biasa. Dengan target: hanya arsip yang sudah tersalin.
    if [ -z "$remote" ] || { [ -n "$m" ] && ! [[ "$b" > "$m" ]]; }; then rm -f "$f"; fi
  done
}

prev() { jq -r "$1 | if . == null then empty else . end" "$status_file" 2>/dev/null || true; }
prev_json() { jq -c "$1 | if type == \"object\" then . else empty end" "$status_file" 2>/dev/null || true; }
# Bilangan bulat ≥ 0 dari status lama (rusak → kosong, bukan galat aritmetika bash).
num() { if [[ $1 =~ ^[0-9]{1,12}$ ]]; then printf '%s' "$1"; fi; }
is_problem() { [ "$1" = failed ] || [ "$1" = pending ]; }

# Email admin aktif (cadangan daftar terakhir bila DB tidak terjangkau, mis. saat backup gagal karena DB).
admin_emails() {
  local list
  if list=$(psql -X -qtA -c 'SELECT email FROM "User" WHERE "isAdmin" AND "isActive"
      AND "emailVerifiedAt" IS NOT NULL ORDER BY email' 2>/dev/null) && [ -n "$list" ]; then
    printf '%s\n' "$list" >"$admins_cache"
    printf '%s\n' "$list"
  else
    cat "$admins_cache" 2>/dev/null || true
  fi
}

# Nilai untuk file konfigurasi curl (-K): kutip ganda dengan \ dan " di-escape; karakter kontrol (baris baru
# → baris konfigurasi tambahan) ditolak.
curl_q() {
  local v=$1
  [[ $v != *[[:cntrl:]]* ]] || return 1
  v=${v//\\/\\\\}
  v=${v//\"/\\\"}
  printf '"%s"' "$v"
}

# smtp.json dari user app yang lolos validasi ketat (aturan sama dengan form Admin › Email); selain itu kosong.
smtp_app_json() {
  local j
  j=$(app_json smtp.json) || { echo "[$stamp] peringatan: smtp.json tidak terbaca, memakai SMTP_URL" >&2; return 0; }
  [ -n "$j" ] || return 0
  if ! jq -e '(.host | type == "string" and test("^[A-Za-z0-9.-]{1,253}$"))
      and (.port | type == "number" and . == floor and . >= 1 and . <= 65535)
      and (.security | IN("ssl", "starttls", "none"))
      and ((.username // "") | type == "string" and test("^[!-~]{0,254}$"))
      and ((.password // "") | type == "string" and test("^[ -~]{0,256}$"))
      and (.fromAddress | type == "string" and test("^[a-z0-9._%+-]+@[a-z0-9-]+(\\.[a-z0-9-]+)+$"))
      and ((.fromName // "") | type == "string" and (explode | all(. >= 32 and . != 127)))' \
    <<<"$j" >/dev/null 2>&1; then
    echo "[$stamp] peringatan: smtp.json tidak valid, memakai SMTP_URL" >&2
    return 0
  fi
  printf '%s' "$j"
}

# Konfigurasi curl SMTP: Admin › Email (app/smtp.json) bila ada, selain itu SMTP_URL (.env). Gagal → kode 1.
smtp_config() {
  local j host port sec user pass q
  j=$(smtp_app_json)
  if [ -n "$j" ]; then
    host=$(jq -r .host <<<"$j")
    port=$(jq -r .port <<<"$j")
    sec=$(jq -r .security <<<"$j")
    user=$(jq -r '.username // ""' <<<"$j")
    pass=$(jq -r '.password // ""' <<<"$j")
    case $sec in
      ssl) q=$(curl_q "smtps://$host:$port") && printf 'url = %s\n' "$q" ;;
      starttls) q=$(curl_q "smtp://$host:$port") && printf 'url = %s\nssl-reqd\n' "$q" ;;
      *) q=$(curl_q "smtp://$host:$port") && printf 'url = %s\n' "$q" ;;
    esac || return 1
    if [ -n "$user" ]; then
      q=$(curl_q "$user:$pass") || return 1
      printf 'user = %s\n' "$q"
    fi
    return 0
  fi
  [ -n "${SMTP_URL:-}" ] || return 1
  # Perilaku lama: STARTTLS bila ditawarkan server.
  q=$(curl_q "$SMTP_URL") || return 1
  printf 'url = %s\nssl\n' "$q"
}

# Pengirim (variabel from = header, addr = amplop): Admin › Email bila ada, selain itu MAIL_FROM.
smtp_from() {
  local j name
  j=$(smtp_app_json)
  if [ -n "$j" ]; then
    addr=$(jq -r .fromAddress <<<"$j")
    name=$(jq -r '.fromName // ""' <<<"$j")
    # Nama aman → di-quote; selain itu (koma, kutip, non-ASCII) encoded-word RFC 2047.
    if [ -z "$name" ]; then
      from=$addr
    elif [[ $name =~ ^[A-Za-z0-9\ ._-]+$ ]]; then
      from="\"$name\" <$addr>"
    else
      from="=?UTF-8?B?$(printf '%s' "$name" | base64 | tr -d '\n')?= <$addr>"
    fi
    return 0
  fi
  from=${MAIL_FROM:-}
  addr=$(printf '%s' "$from" | sed -n 's/.*<\(.*\)>.*/\1/p')
  addr=${addr:-$from}
}

notify() { # state pending since
  local state=$1 pending=$2 since=$3 to subject body from addr mail a link
  smtp_config >/dev/null || { echo "[$stamp] peringatan: SMTP belum diatur, admin tidak diberi tahu" >&2; return 1; }
  to=$(admin_emails)
  [ -n "$to" ] || { echo "[$stamp] peringatan: tidak ada email admin aktif" >&2; return 1; }
  link="${APP_URL:-}/admin/backup"
  case $state in
    failed)
      subject="Backup Data Dashboard GAGAL"
      body="Backup Data Dashboard bermasalah pada $now (UTC): ${err:-lihat log service backup}.
Arsip terakhir yang berhasil: ${last_archive:-belum ada}.
Periksa log: docker compose logs backup. Status: $link" ;;
    pending)
      subject="Backup Data Dashboard: salinan off-VM tertunda"
      body="Salinan backup ke $target belum berhasil sejak $since (UTC): ${err:-target tidak terjangkau}.
$pending arsip disimpan sementara di VM dan dikirim ulang otomatis (tiap 30 menit; dijeda sampai 4 jam bila NAS
menolak menyimpan karena penuh/kuota habis; admin bisa memakai tombol Kirim ulang sekarang).
Periksa jaringan/target atau ubah pengaturan di $link" ;;
    *)
      subject="Backup Data Dashboard kembali normal"
      body="Backup Data Dashboard berjalan normal lagi ($now UTC). Target off-VM: ${target:-tidak aktif (backup hanya di VM)}.
Status: $link" ;;
  esac
  smtp_from
  from=${from//[$'\r\n']/}
  mail=$(mktemp)
  {
    printf 'From: %s\r\nTo: %s\r\nSubject: %s\r\nDate: %s\r\nMessage-ID: <%s.%s.%s@%s>\r\n' "$from" \
      "$(printf '%s' "$to" | paste -sd, -)" "$subject" "$(date -u '+%a, %d %b %Y %H:%M:%S +0000')" \
      "$stamp" "$$" "$RANDOM" "${addr#*@}"
    # Badan berakhir-baris CRLF (server SMTP ketat menolak LF saja).
    printf 'MIME-Version: 1.0\r\nContent-Type: text/plain; charset=UTF-8\r\n\r\n%s\r\n' "${body//$'\n'/$'\r\n'}"
  } >"$mail"
  local rcpt=()
  for a in $to; do rcpt+=(--mail-rcpt "$a"); done
  # URL + kredensial lewat stdin -K, bukan argumen proses.
  if smtp_config |
    curl -sS --max-time 30 -K - --mail-from "$addr" --mail-rcpt-allowfails "${rcpt[@]}" -T "$mail"; then
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
  if [ "$last_ok" = false ] || [ -n "$cfg_broken" ]; then
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
  local tmp next_at=""
  [ -z "$next_epoch" ] || next_at=$(date -u -d "@$next_epoch" +%Y-%m-%dT%H:%M:%SZ)
  mkdir -p "$cfg"
  tmp=$(mktemp "$cfg/.status.XXXXXX")
  jq -n --arg state "$state" --arg target "$target" --argjson pending "$pending" --arg since "$since" \
    --arg lastAt "$last_at" --arg lastOk "$last_ok" --arg lastArchive "$last_archive" \
    --arg lastSize "$last_size" --arg offOk "$off_ok" --arg err "$err" --arg notified "$notified" \
    --arg now "$now" --argjson fails "${fails:-0}" --arg nextAt "$next_at" --arg nextEpoch "$next_epoch" \
    --arg reqAt "$last_req" --arg reqEpoch "$last_req_epoch" --argjson localDays "$local_days" \
    --argjson remoteDays "$days" --arg src "$retention_src" --argjson archives "$(archives_json)" \
    --argjson disk "$(disk_json)" --argjson remote "${remote_info:-null}" --argjson nas "${nas_space:-null}" \
    'def n: if . == "" then null else . end;
    { state: $state, target: ($target | n), pending: $pending, pendingSince: ($since | n),
      lastBackupAt: ($lastAt | n), lastBackupOk: ($lastOk | if . == "" then null else . == "true" end),
      lastArchive: ($lastArchive | n), lastSizeBytes: ($lastSize | if . == "" then null else tonumber end),
      lastOffsiteOkAt: ($offOk | n), error: ($err | n), notified: $notified, updatedAt: $now,
      syncFailures: $fails, nextSyncAt: ($nextAt | n), nextSyncEpoch: ($nextEpoch | n | if . then tonumber else . end),
      lastRequestAt: ($reqAt | n), lastRequestEpoch: ($reqEpoch | n | if . then tonumber else . end),
      retention: { localDays: $localDays, remoteDays: $remoteDays, source: $src },
      archives: $archives, localBytes: ($archives | map(.sizeBytes) | add // 0), disk: $disk,
      remote: $remote, nasSpace: $nas }' \
    >"$tmp"
  chmod 644 "$tmp"
  # Salinan untuk job pantauan worker (T-8g53): volume terpisah tanpa offsite.json/smtp.json (rahasia).
  if [ -n "${STATUS_COPY_DIR:-}" ] && [ -d "$STATUS_COPY_DIR" ]; then
    cp "$tmp" "$STATUS_COPY_DIR/.status.json.tmp" && mv -f "$STATUS_COPY_DIR/.status.json.tmp" "$STATUS_COPY_DIR/status.json" ||
      echo "[$(date -u +%FT%TZ)] PERINGATAN: salinan status untuk pantauan gagal ditulis ($STATUS_COPY_DIR)" >&2
  fi
  mv -f "$tmp" "$status_file"
}

load_prev() {
  last_at=$(prev .lastBackupAt)
  last_ok=$(prev .lastBackupOk)
  last_archive=$(prev .lastArchive)
  last_size=$(prev .lastSizeBytes)
  off_ok=$(prev .lastOffsiteOkAt)
  err=$(prev .error)
  fails=$(num "$(prev .syncFailures)")
  next_epoch=$(num "$(prev .nextSyncEpoch)")
  last_req=$(prev .lastRequestAt)
  last_req_epoch=$(num "$(prev .lastRequestEpoch)")
  remote_info=$(prev_json .remote)
  nas_space=$(prev_json .nasSpace)
}

# Ambil arsip terbaru (atau $3) + .sha256 dari target off-VM yang berlaku ke folder $2; nama arsip ke stdout.
# Dipakai verify-backup.sh --remote (target dari Admin › Backup atau BACKUP_REMOTE).
if [ "$mode" = --fetch ]; then
  offsite_target
  [ -n "$remote" ] || { echo "target off-VM belum diatur atau konfigurasinya tidak valid" >&2; exit 1; }
  name=${3:-$(rclone lsf "$remote" --max-depth 1 --include 'dashboard-*.tar.age' "${rflags[@]}" | sort | tail -n 1)}
  [ -n "$name" ] || { echo "tidak ada arsip di $target" >&2; exit 1; }
  rclone copy "$remote/$name" "$2" "${rflags[@]}"
  rclone copy "$remote/$name.sha256" "$2" "${rflags[@]}"
  echo "sumber: $target (off-VM)" >&2
  printf '%s\n' "$name"
  exit 0
fi

# "Kirim ulang sekarang" (Admin › Backup): paling sering sekali per 5 menit — permintaan beruntun (atau app yang
# dibobol) tidak membuat unggahan beruntun; permintaan tetap ada dan dijalankan begitu batasnya lewat. Jeda
# bertahap tidak berlaku untuk permintaan ini.
forced=""
if [ "$mode" = --tick ]; then
  last_req_epoch=$(num "$(prev .lastRequestEpoch)")
  # Selama NAS menolak menyimpan: paling sering sekali per 30 menit (app yang dibobol tidak bisa memaksa
  # unggahan sia-sia tiap 5 menit melewati jeda bertahap).
  gap=300
  f=$(num "$(prev .syncFailures)")
  [ "${f:-0}" -eq 0 ] || gap=1800
  if [ -n "$last_req_epoch" ] && [ $((now_s - last_req_epoch)) -lt "$gap" ]; then exit 0; fi
  # Tanda "sedang berjalan" DULU, baru permintaan dihapus: halaman yang memantau tidak pernah melihat jeda
  # kosong lalu menganggap kirim ulang sudah selesai.
  mark_running sync
  # -r: app bisa membuat folder bernama sync-request; rm tidak mengikuti symlink di dalamnya.
  rm -rf -- "$req"
  forced=1 mode=--sync
  echo "[$stamp] kirim ulang diminta dari Admin › Backup"
fi

if [ "$mode" = --sync ]; then
  load_prev
  [ -z "$forced" ] || { last_req=$now last_req_epoch=$now_s; }
  offsite_target
  [ -z "$cfg_broken" ] || err="konfigurasi NAS dari aplikasi tidak terbaca atau tidak valid — simpan ulang di Admin › Backup"
  n=$(pending_count)
  # Dijeda karena NAS menolak menyimpan: lewati sampai waktunya (status tetap dari run terakhir).
  if [ "$n" -gt 0 ] && [ -z "$forced" ] && [ -n "$next_epoch" ] && [ "$now_s" -lt "$next_epoch" ]; then
    exit 0
  fi
  if [ "$n" -gt 0 ]; then
    mark_running sync
    if copy_offsite; then
      off_ok=$now
      [ "$last_ok" = false ] || err=""
      echo "[$stamp] $n arsip tertunda tersalin ke $target"
    else
      err=$(last_err)
      echo "[$stamp] kirim ulang ke $target gagal ($n arsip tertunda): $err" >&2
      [ -z "$next_epoch" ] || echo "[$stamp] NAS menolak menyimpan — kirim ulang berikutnya $(date -u -d "@$next_epoch" +%FT%TZ)" >&2
    fi
  else
    if [ "$last_ok" != false ] && [ -z "$cfg_broken" ]; then err=""; fi
    # Diminta admin (mis. setelah mengubah lama simpan): retensi + ringkasan + sisa ruang NAS tanpa menunggu
    # backup harian.
    if [ -n "$forced" ] && [ -n "$remote" ]; then
      remote_retention
      if summary=$(remote_summary); then remote_info=$summary; fi
      nas_about || true
    fi
  fi
  # Retensi juga saat tidak ada yang tertunda: lama simpan baru dari Admin › Backup berlaku tanpa menunggu.
  local_retention
  # Belum pernah ada backup: tidak ada status untuk dilaporkan (kecuali diminta admin).
  [ -z "$last_at" ] && [ "$n" -eq 0 ] && [ -z "$forced" ] && exit 0
  save_status
  exit 0
fi

load_prev
mark_running backup
work=$(mktemp -d "$dir/.work-XXXXXX")
step="persiapan"
saved=""
finish() {
  local rc=$?
  set +e
  rm -rf "$work" "${part:-}"
  if [ "$rc" -ne 0 ] && [ -z "$saved" ]; then
    last_at=$now last_ok=false err="backup gagal di langkah: $step"
    offsite_target
    save_status
  fi
  # Terakhir: offsite_target di atas menulis ulang known_hosts.
  cleanup
}
trap finish EXIT

echo "[$stamp] backup mulai"
step="pg_dump"
pg_dump --format=custom --no-owner --no-privileges --file "$work/db.dump"
step="salin storage lokal"
# Folder dibuat dulu: bucket kosong (deploy baru) tidak membuat folder dan tar lalu gagal.
mkdir -p "$work/s3"
rclone copy "locals3:$S3_BUCKET" "$work/s3" --transfers 4 --checkers 8 --stats-one-line --stats 0

step="enkripsi arsip"
out="$dir/dashboard-$stamp.tar.age"
# Nama tersembunyi: arsip setengah jadi tidak ikut disalin ke target (filter /dashboard-*).
part="$dir/.dashboard-$stamp.tar.age.part"
tar -C "$work" -cf - db.dump s3 | age -r "$BACKUP_AGE_RECIPIENT" -o "$part"
mv "$part" "$out"
(cd "$dir" && sha256sum "$(basename "$out")" >"$(basename "$out").sha256")
last_at=$now last_ok=true last_archive=$(basename "$out")
last_size=$(wc -c <"$out" | tr -d ' ')
echo "[$stamp] arsip: $last_archive ($(du -h "$out" | cut -f1))"

step="salinan off-VM"
offsite_target
err=""
if [ -n "$cfg_broken" ]; then
  err="konfigurasi NAS dari aplikasi tidak terbaca atau tidak valid — simpan ulang di Admin › Backup"
elif [ -z "$remote" ]; then
  echo "[$stamp] PERINGATAN: target off-VM belum diatur — backup hanya di VM ini" >&2
elif copy_offsite; then
  off_ok=$now
  echo "[$stamp] tersalin ke $target"
else
  err=$(last_err)
  echo "[$stamp] PERINGATAN: salinan ke $target gagal ($err) — arsip ditahan di VM, dikirim ulang otomatis" >&2
fi
local_retention
save_status
saved=1
echo "[$stamp] backup selesai"
