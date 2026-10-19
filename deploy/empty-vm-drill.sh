#!/usr/bin/env bash
# Latihan "VM kosong" (T-tqse, T-023) di VM produksi tanpa menyentuh produksi: project compose terpisah
# (dashboard-vmkosong), port 9643/9644, subnet sendiri, volume kosong, PostgreSQL container, semua secret
# baru, dan image yang di-build di luar VM (deploy/images.sh build + save):
#   bash deploy/empty-vm-drill.sh <images.tar.gz>...     (cwd = folder aplikasi; KEEP=1 = jangan dibongkar)
#   (satu arsip berisi 4 image dari images.sh save, atau satu arsip per image)
# Mengukur muat image + deploy.sh --no-build sampai /api/health hijau (target < 10 menit), lalu membongkar
# stack latihan beserta volumenya. SMTP latihan = mail.pcpexpress.com:587 tanpa kredensial (health hanya
# memverifikasi koneksi) agar kredensial produksi tidak ikut dipakai. Image dimuat ke penyimpanan image yang
# sama dengan produksi: tag produksi dijaga (arsip bertag sama → dikembalikan + gagal) dan keempat image wajib
# datang dari arsip dengan satu tag.
set -euo pipefail
cd "$(dirname "$0")/.."
[ $# -gt 0 ] || { echo "pakai: empty-vm-drill.sh <images.tar.gz>..." >&2; exit 1; }
PROJECT=dashboard-vmkosong
IMAGES=(app worker renderer backup)
envf=$(mktemp /tmp/vmkosong-XXXXXX)
D=(docker compose -p "$PROJECT" --env-file "$envf" -f docker-compose.prod.yml)
cleanup() {
  [ "${KEEP:-}" = 1 ] && { echo "KEEP=1: stack $PROJECT dibiarkan (env $envf)"; return; }
  COMPOSE_PROFILES=db "${D[@]}" down -v --remove-orphans >/dev/null 2>&1 || true
  rm -f "$envf"
  echo "stack latihan $PROJECT + volumenya dibongkar"
}
trap cleanup EXIT

# Tag image yang dipakai produksi + ID-nya sebelum load (dibandingkan sesudahnya).
ptag=$(sed -n 's/^IMAGE_TAG=//p' .env.prod 2>/dev/null | tail -1)
ptag=${ptag:-latest}
declare -A before
for i in "${IMAGES[@]}"; do
  before[$i]=$(docker image inspect -f '{{.Id}}' "dashboard-$i:$ptag" 2>/dev/null || true)
done

t0=$(date +%s)
echo "1/2 muat image dari $*"
loaded=$(for a in "$@"; do bash deploy/images.sh load "$a"; done | tee /dev/stderr)
restore_prod() {
  local i changed=0
  for i in "${IMAGES[@]}"; do
    [ -n "${before[$i]}" ] || continue
    if [ "$(docker image inspect -f '{{.Id}}' "dashboard-$i:$ptag" 2>/dev/null)" != "${before[$i]}" ]; then
      docker tag "${before[$i]}" "dashboard-$i:$ptag"
      changed=1
    fi
  done
  return $changed
}
if ! restore_prod; then
  echo "arsip memuat tag produksi ($ptag) — tag produksi dikembalikan, latihan dibatalkan" >&2
  exit 1
fi
tags=$(sed -n 's/^Loaded image: dashboard-app://p' <<<"$loaded" | sort -u)
[ "$(wc -l <<<"$tags" | tr -d ' ')" = 1 ] && [ -n "$tags" ] ||
  { echo "arsip harus memuat tepat satu dashboard-app (ditemukan: ${tags:-tidak ada})" >&2; exit 1; }
tag=$tags
[ "$tag" != "$ptag" ] || { echo "tag $tag sama dengan produksi — pakai tag commit" >&2; exit 1; }
for i in "${IMAGES[@]}"; do
  grep -qx "Loaded image: dashboard-$i:$tag" <<<"$loaded" ||
    { echo "arsip tidak memuat dashboard-$i:$tag (latihan tidak membuktikan image dari luar VM)" >&2; exit 1; }
done
echo "   tag $tag ($(($(date +%s) - t0)) dtk)"

# shellcheck source=deploy/isolated-env.sh
. deploy/isolated-env.sh
isolated_env "$envf" 9643 9644 172.31.248.0/24 172.31.249.0/24
sed -i 's#^SMTP_URL=.*#SMTP_URL=smtp://mail.pcpexpress.com:587#' "$envf"
printf '%s\n' "IMAGE_TAG=$tag" APP_MEM=1g WORKER_MEM=1536m WORKER_REPLICAS=1 RENDERER_MEM=1g \
  REDIS_MAXMEMORY=128mb >>"$envf"
# Sisa latihan sebelumnya (KEEP=1, proses yang dimatikan paksa): "volume kosong" harus benar-benar kosong.
COMPOSE_PROFILES=db "${D[@]}" down -v --remove-orphans >/dev/null 2>&1 || true

echo "2/2 deploy.sh --no-build (project $PROJECT, https://$ISO_HOST:9643)"
DEPLOY_ENV_FILE=$envf DEPLOY_PROJECT=$PROJECT bash deploy/deploy.sh --no-build
echo "total muat image + deploy sampai /api/health hijau: $(($(date +%s) - t0)) dtk"
