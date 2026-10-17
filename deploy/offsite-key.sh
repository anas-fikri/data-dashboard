#!/usr/bin/env bash
# Salinan backup off-VM lewat SFTP (T-h77x), sekali per server dari folder aplikasi:
#   bash deploy/offsite-key.sh <host> <port> <user> <folder-tujuan> [ip-sumber]
# - kunci SSH khusus backup di deploy/offsite/ (600, di-gitignore, di-mount read-only ke service backup);
# - host key target disimpan ke deploy/offsite/known_hosts — COCOKKAN sidik jari yang dicetak dengan
#   sidik jari yang diketahui dari mesin lain sebelum lanjut;
# - remote rclone "offsite" ditulis ke deploy/rclone.conf (tanpa password; kunci dari file);
# - mencetak baris authorized_keys untuk target: hanya SFTP (internal-sftp), tanpa shell/forwarding,
#   dan bila ip-sumber diisi hanya dari IP itu. Lalu set BACKUP_REMOTE=offsite:<folder-tujuan>.
set -euo pipefail
cd "$(dirname "$0")/.."
host=${1:?pakai: offsite-key.sh <host> <port> <user> <folder> [ip-sumber]}
port=${2:?} user=${3:?} folder=${4:?} from=${5:-}
dir=deploy/offsite
umask 077
mkdir -p "$dir"
[ -f "$dir/id_ed25519" ] || ssh-keygen -q -t ed25519 -N '' -C "dashboard-backup@$(hostname)" -f "$dir/id_ed25519"
ssh-keyscan -p "$port" -t ed25519 "$host" 2>/dev/null >"$dir/known_hosts"
[ -s "$dir/known_hosts" ] || { echo "host key $host:$port tidak terbaca" >&2; exit 1; }
echo "sidik jari host key target (cocokkan!): $(ssh-keygen -lf "$dir/known_hosts" | cut -d' ' -f2)"
if ! grep -q '^\[offsite\]' deploy/rclone.conf 2>/dev/null; then
  cat >>deploy/rclone.conf <<EOF
[offsite]
type = sftp
host = $host
port = $port
user = $user
key_file = /config/offsite/id_ed25519
known_hosts_file = /config/offsite/known_hosts
shell_type = none
md5sum_command = none
sha1sum_command = none
EOF
fi
opts="restrict,command=\"internal-sftp\""
[ -z "$from" ] || opts="from=\"$from\",$opts"
echo "pasang di ~$user/.ssh/authorized_keys pada $host:"
echo "$opts $(cat "$dir/id_ed25519.pub")"
echo "lalu di .env.prod: BACKUP_REMOTE=offsite:$folder"
