#!/usr/bin/env bash
# Image siap pakai tanpa build di VM produksi (T-tqse). Image tidak memuat nilai lingkungan (APP_HOST,
# secret dibaca saat runtime), jadi boleh di-build di mesin mana pun dengan Docker buildx:
#   bash deploy/images.sh build [tag]            → 4 image linux/amd64 bertag <tag>
#                                                  (bawaan: v<version package.json>, mis. v1.0.0; T-066)
#   bash deploy/images.sh save <berkas.tar.gz> [tag]
#   bash deploy/images.sh save - [tag] | ssh <server> 'cat > /tmp/dashboard-images.tar.gz'   (disk build sempit)
#   scp <berkas.tar.gz> <server>:/tmp/           (± ukuran image terkompresi)
#   bash deploy/images.sh load <berkas.tar.gz>   (di VM, folder aplikasi) → set IMAGE_TAG di .env.prod
#   bash deploy/deploy.sh --no-build             → migrasi + up + tunggu sehat, tanpa build
# Upgrade produksi yang sudah berjalan: deploy/upgrade.sh (runbook §7). Tag eksplisit (argumen atau env
# IMAGE_TAG) selalu menang atas tag bawaan.
set -euo pipefail
cd "$(dirname "$0")/.."
IMAGES=(app worker renderer backup)
cmd=${1:-}

# v<version> dari package.json (satu sumber versi, T-066); kosong bila tidak terbaca atau bukan semver
# yang sah sebagai tag Docker (tanpa "+build").
release_tag() {
  local v
  v=$(sed -n 's/^  "version": *"\([^"]*\)".*/\1/p' package.json 2>/dev/null | head -1)
  if [[ "$v" =~ ^[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.-]+)?$ ]]; then echo "v$v"; fi
}
tag_of() {
  local t=${1:-${IMAGE_TAG:-$(release_tag)}}
  [ -n "$t" ] || { echo "versi package.json tidak terbaca — beri tag eksplisit" >&2; exit 1; }
  echo "$t"
}

case "$cmd" in
  build)
    explicit=${2:-${IMAGE_TAG:-}}
    tag=$(tag_of "${2:-}")
    case "$tag" in prev-*) echo "tag $tag dicadangkan untuk rollback (upgrade.sh)" >&2; exit 1 ;; esac
    # Image store bisa dipakai bersama produksi (build di VM): tag yang dipakai container berjalan tidak
    # boleh dipindahkan, dan tag rilis bawaan yang sudah ada tidak ditimpa diam-diam.
    # Dibaca sekali (bukan pipa ke grep -q: SIGPIPE + pipefail membuat cek ini diam-diam lolos).
    running=$(docker ps --format '{{.Image}}')
    for i in "${IMAGES[@]}"; do
      if grep -qx "dashboard-$i:$tag" <<<"$running"; then
        echo "dashboard-$i:$tag dipakai container yang berjalan — pakai tag lain" >&2
        exit 1
      fi
      if [ -z "$explicit" ] && docker image inspect "dashboard-$i:$tag" >/dev/null 2>&1; then
        echo "dashboard-$i:$tag sudah ada: naikkan versi (aitk release) atau beri tag eksplisit," \
          "mis. bash deploy/images.sh build $tag-$(git rev-parse --short HEAD 2>/dev/null || echo build)" >&2
        exit 1
      fi
    done
    cpus=${NEXT_BUILD_CPUS:-4}
    # Commit pendek untuk /health admin + log start (kosong di luar git).
    commit=$(git rev-parse --short HEAD 2>/dev/null || true)
    # Perubahan belum di-commit ikut ke image → ditandai, agar release.sh tidak memakainya sebagai image tag.
    if [ -n "$commit" ] && [ -n "$(git status --porcelain 2>/dev/null)" ]; then commit="$commit-dirty"; fi
    b=(docker buildx build --platform linux/amd64 --load --build-arg APP_COMMIT="$commit")
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
    loaded=$(gunzip -c "$in" | docker load | tee /dev/stderr | sed -n 's/^Loaded image: dashboard-[a-z]*://p' | sort -u)
    echo "isi IMAGE_TAG=${loaded:-<tag>} di .env.prod lalu: bash deploy/deploy.sh --no-build"
    ;;
  *)
    echo "pakai: images.sh build [tag] | save <berkas> [tag] | load <berkas>" >&2
    exit 1
    ;;
esac
