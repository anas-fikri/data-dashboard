#!/usr/bin/env bash
# Latihan "VM kosong" (T-tqse, T-023) di VM produksi tanpa menyentuh produksi: project compose terpisah
# (dashboard-vmkosong), port 9543/9544, subnet sendiri, volume kosong, PostgreSQL container, semua secret
# baru, dan image yang di-build di luar VM (deploy/images.sh build + save):
#   bash deploy/empty-vm-drill.sh <images.tar.gz>...     (cwd = folder aplikasi; KEEP=1 = jangan dibongkar)
#   (satu arsip berisi 4 image dari images.sh save, atau satu arsip per image)
# Mengukur muat image + deploy.sh --no-build sampai /api/health hijau (target < 10 menit), lalu membongkar
# stack latihan beserta volumenya. SMTP latihan = mail.pcpexpress.com:587 tanpa kredensial (health hanya
# memverifikasi koneksi) agar kredensial produksi tidak ikut dipakai.
set -euo pipefail
cd "$(dirname "$0")/.."
[ $# -gt 0 ] || { echo "pakai: empty-vm-drill.sh <images.tar.gz>..." >&2; exit 1; }
PROJECT=dashboard-vmkosong
envf=$(mktemp /tmp/vmkosong-XXXXXX)
D=(docker compose -p "$PROJECT" --env-file "$envf" -f docker-compose.prod.yml)
cleanup() {
  [ "${KEEP:-}" = 1 ] && { echo "KEEP=1: stack $PROJECT dibiarkan (env $envf)"; return; }
  COMPOSE_PROFILES=db "${D[@]}" down -v --remove-orphans >/dev/null 2>&1 || true
  rm -f "$envf"
  echo "stack latihan $PROJECT + volumenya dibongkar"
}
trap cleanup EXIT

t0=$(date +%s)
echo "1/2 muat image dari $*"
tag=""
for a in "$@"; do
  t=$(bash deploy/images.sh load "$a" | sed -n 's/^Loaded image: dashboard-app://p' | tail -1)
  tag=${t:-$tag}
done
[ -n "$tag" ] || { echo "arsip tidak memuat dashboard-app" >&2; exit 1; }
echo "   tag $tag ($(($(date +%s) - t0)) dtk)"

# shellcheck source=deploy/isolated-env.sh
. deploy/isolated-env.sh
isolated_env "$envf" 9543 9544 172.31.246.0/24 172.31.247.0/24
sed -i 's#^SMTP_URL=.*#SMTP_URL=smtp://mail.pcpexpress.com:587#' "$envf"
echo "IMAGE_TAG=$tag" >>"$envf"

echo "2/2 deploy.sh --no-build (project $PROJECT, https://$ISO_HOST:9543)"
DEPLOY_ENV_FILE=$envf DEPLOY_PROJECT=$PROJECT bash deploy/deploy.sh --no-build
echo "total muat image + deploy sampai /api/health hijau: $(($(date +%s) - t0)) dtk"
