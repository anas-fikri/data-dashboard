#!/usr/bin/env bash
# Salinan backup off-VM ke object storage S3-kompatibel (T-h77x: mis. server S3 di Synology NAS, MinIO,
# RustFS), sekali per server dari folder aplikasi:
#   bash deploy/offsite-s3.sh <endpoint> <bucket>[/folder]
# - access key + secret diketik di prompt (tidak tampil, tidak masuk riwayat shell). Pakai kunci KHUSUS
#   backup yang hanya boleh baca/tulis/hapus di bucket itu — jangan kunci admin NAS (VM dipakai bersama);
# - remote rclone "offsite" ditulis ke deploy/rclone.conf (600, di-gitignore, di-mount read-only ke service
#   backup); arsip sudah terenkripsi age sebelum dikirim, kunci privat tidak pernah ada di VM;
# - koneksi diuji: tulis + baca + hapus satu berkas uji lewat image backup. Lalu set di .env.prod:
#   BACKUP_REMOTE=offsite:<bucket>[/folder] dan jalankan backup sekali + verify-backup.sh --remote.
# Endpoint http:// diterima untuk NAS di LAN (SigV4 tidak mengirim secret), dengan peringatan.
set -euo pipefail
cd "$(dirname "$0")/.."
usage="pakai: offsite-s3.sh <endpoint> <bucket>[/folder]"
endpoint=${1:?$usage}
target=${2:?$usage}
case "$endpoint" in
  https://*) ;;
  http://*) echo "PERINGATAN: endpoint tanpa TLS — pakai hanya di jaringan internal tepercaya" >&2 ;;
  *) echo "endpoint harus diawali https:// atau http://" >&2; exit 1 ;;
esac
if grep -q '^\[offsite\]' deploy/rclone.conf 2>/dev/null; then
  echo "remote [offsite] sudah ada di deploy/rclone.conf — hapus bagiannya dulu bila ingin mengganti" >&2
  exit 1
fi
read -r -p "Access key: " key
read -r -s -p "Secret key (tidak tampil): " secret
echo
[ -n "$key" ] && [ -n "$secret" ] || { echo "access key/secret kosong" >&2; exit 1; }

umask 077
touch deploy/rclone.conf
chmod 600 deploy/rclone.conf
cp -p deploy/rclone.conf deploy/rclone.conf.sebelum
cat >>deploy/rclone.conf <<EOF
[offsite]
type = s3
provider = Other
endpoint = $endpoint
access_key_id = $key
secret_access_key = $secret
acl = private
no_check_bucket = true
EOF
unset secret

C=(docker compose --env-file .env.prod -f docker-compose.prod.yml)
probe="offsite:$target/.uji-tulis-$(date -u +%Y%m%dT%H%M%SZ)"
echo "uji tulis/baca/hapus ke offsite:$target"
if ! "${C[@]}" run --rm -T --no-deps -e PROBE="$probe" backup sh -c '
  echo ok | rclone rcat "$PROBE" && [ "$(rclone cat "$PROBE")" = ok ] && rclone deletefile "$PROBE"'; then
  # Remote yang gagal tidak ditinggal: rclone.conf kembali seperti semula, skrip bisa diulang.
  mv deploy/rclone.conf.sebelum deploy/rclone.conf
  echo "GAGAL: periksa endpoint, nama bucket, dan hak kunci (baca/tulis/hapus). rclone.conf tidak diubah." >&2
  exit 1
fi
rm -f deploy/rclone.conf.sebelum
echo "berhasil. Lanjutkan: BACKUP_REMOTE=offsite:$target di .env.prod, lalu"
echo "  ${C[*]} up -d --no-deps --force-recreate backup && ${C[*]} run --rm --no-deps backup backup.sh"
