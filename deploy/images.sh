#!/usr/bin/env bash
# Image siap pakai tanpa build di VM produksi (T-tqse). Image tidak memuat nilai lingkungan (APP_HOST,
# secret dibaca saat runtime), jadi boleh di-build di mesin mana pun dengan Docker buildx:
#   bash deploy/images.sh build [tag]            → 4 image linux/amd64 bertag <tag> (bawaan: commit git)
#   bash deploy/images.sh save <berkas.tar.gz> [tag]
#   bash deploy/images.sh save - [tag] | ssh <server> 'cat > /tmp/dashboard-images.tar.gz'   (disk build sempit)
#   scp <berkas.tar.gz> <server>:/tmp/           (± ukuran image terkompresi)
#   bash deploy/images.sh load <berkas.tar.gz>   (di VM, folder aplikasi) → set IMAGE_TAG di .env.prod
#   bash deploy/deploy.sh --no-build             → migrasi + up + tunggu sehat, tanpa build
set -euo pipefail
cd "$(dirname "$0")/.."
IMAGES=(app worker renderer backup)
cmd=${1:-}
tag_of() { echo "${1:-$(git rev-parse --short HEAD 2>/dev/null || echo latest)}"; }

case "$cmd" in
  build)
    tag=$(tag_of "${2:-}")
    cpus=${NEXT_BUILD_CPUS:-4}
    b=(docker buildx build --platform linux/amd64 --load)
    "${b[@]}" --target app --build-arg NEXT_BUILD_CPUS="$cpus" -t "dashboard-app:$tag" .
    "${b[@]}" --target worker --build-arg NEXT_BUILD_CPUS="$cpus" -t "dashboard-worker:$tag" .
    "${b[@]}" -f renderer/Dockerfile -t "dashboard-renderer:$tag" .
    "${b[@]}" -t "dashboard-backup:$tag" deploy/backup
    echo "image bertag $tag siap: ${IMAGES[*]/#/dashboard-}"
    ;;
  save)
    out=${2:?pakai: images.sh save <berkas.tar.gz> [tag]}
    tag=$(tag_of "${3:-}")
    if [ "$out" = - ]; then
      docker save $(printf "dashboard-%s:$tag " "${IMAGES[@]}") | gzip -1
      echo "arsip tag $tag dialirkan ke stdout" >&2
    else
      docker save $(printf "dashboard-%s:$tag " "${IMAGES[@]}") | gzip -1 >"$out"
      echo "$out ($(du -h "$out" | cut -f1)), tag $tag"
    fi
    ;;
  load)
    in=${2:?pakai: images.sh load <berkas.tar.gz>}
    gunzip -c "$in" | docker load
    echo "isi IMAGE_TAG=<tag> di .env.prod lalu: bash deploy/deploy.sh --no-build"
    ;;
  *)
    echo "pakai: images.sh build [tag] | save <berkas> [tag] | load <berkas>" >&2
    exit 1
    ;;
esac
