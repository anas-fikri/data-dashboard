#!/usr/bin/env bash
# T-061 di VM (folder aplikasi, dijalankan PEMILIK): ukur "Lihat data" 10 jt dan 13 jt baris × 30 kolom
# dengan image produksi di stack uji terpisah (deploy/perf-stack.sh), sama persis dengan pengukuran
# container cloud di docs/ai/perf/T-061.md:
#   1. jalur server (npm run perf -- grid) di container worker: 10 jt/24 segmen + beban (grid 2 dan 1
#      slot), 10 jt satu file, 13 jt/13 segmen + beban
#   2. ujung-ke-ujung (scripts/perf-grid-http.mjs, Chromium di image renderer) atas dataset 10 jt dan 13 jt
#      yang dipasang scripts/dev-grid-perf-seed.ts ke database + storage STACK UJI (bukan produksi)
# Prasyarat: bash deploy/perf-stack.sh up 6   (6 akun perf1..perf6; users.json di $PERF_DIR)
#   bash scripts/perf-grid-vm.sh <folder-hasil> [reps]
# Sesudahnya: bash deploy/perf-stack.sh down. Disk sementara ± 8 GB di $PERF_DIR/grid (dihapus di akhir).
# Hasil: svc-*.json/log, http-*.jsonl, stats.log, puncak.txt — salin ke docs/ai/perf/T-061-olympus/.
set -euo pipefail
cd "$(dirname "$0")/.."
out=$1
reps=${2:-30}
PERF_DIR=${PERF_DIR:-/data/docker-data/dashboard-perf}
PERF=(env COMPOSE_PROFILES=db docker compose -p dashboard-perftest --env-file .env.perftest -f docker-compose.prod.yml)
[ -f .env.perftest ] && [ -f "$PERF_DIR/users.json" ] || {
  echo "stack uji belum ada: bash deploy/perf-stack.sh up 6" >&2
  exit 1
}
app=$(sed -n 's/^APP_HOST=//p' .env.perftest)
scratch=$PERF_DIR/grid
mkdir -p "$out"
# Scratch milik pengguna host (700); container worker/renderer dijalankan dengan uid:gid yang sama.
mkdir -p -m 700 "$scratch"
uid="$(id -u):$(id -g)"
tag=${IMAGE_TAG:-$(sed -n 's/^IMAGE_TAG=//p' .env.perftest)}
tag=${tag:-latest}
out=$(realpath "$out")

(
  while :; do
    ids=$(docker ps -q --filter label=com.docker.compose.project=dashboard-perftest)
    [ -z "$ids" ] || docker stats --no-stream --format '{{.Name}} {{.MemUsage}} {{.CPUPerc}}' $ids |
      sed "s/^/$(date +%s) /"
    sleep 1
  done
) >"$out/stats.log" 2>/dev/null &
sampler=$!
# Gagal di tengah jalan: hentikan pencatat dan hapus data sementara (± 8 GB).
trap 'kill $sampler 2>/dev/null || true; rm -rf "$scratch"' EXIT

{
  echo "tanggal $(date -Is)"
  echo "commit $(git rev-parse --short HEAD 2>/dev/null || echo '?')"
  nproc
  grep -m1 'model name' /proc/cpuinfo || true
  free -g
  lsblk -d -o NAME,ROTA,SIZE 2>/dev/null || true
  uptime
} >"$out/mesin.txt"

worker() { "${PERF[@]}" run --rm -T --no-deps --user "$uid" -e HOME=/tmp -v "$scratch:/scratch" "$@"; }

# 1. Jalur server: mesin query produksi di container worker (memori/CPU container = produksi).
svc() {
  local name=$1
  shift
  worker worker node_modules/.bin/tsx scripts/perf-grid.ts --dir "/scratch/svc" --keep \
    --reps "$reps" --json "/scratch/svc-$name.json" "$@" | tee "$out/svc-$name.log"
  cp "$scratch/svc-$name.json" "$out/"
}
svc 10m-period --rows 10000000 --segs 24 --load
# Pembanding beban: grid 1 slot global (GRID_MAX_CONCURRENCY=1), skenario tunggal dilewati.
svc 10m-load-slot1 --rows 10000000 --segs 24 --load --grid-slots 1 --only tidak-ada
svc 10m-single --rows 10000000 --layout single
svc 13m-period --rows 13000000 --segs 13 --load
rm -rf "$scratch/svc"

# 2. Ujung-ke-ujung: dataset dipasang ke stack uji, diukur lewat proxy TLS + Chromium.
emails=$(grep -o '"email":"[^"]*"' "$PERF_DIR/users.json" | cut -d'"' -f4)
owner=$(echo "$emails" | sed -n 1p)
editors=$(echo "$emails" | sed -n 2,6p | paste -sd, -)
http() {
  local name=$1
  shift
  worker -e NODE_ENV=test worker node_modules/.bin/tsx --conditions=react-server \
    scripts/dev-grid-perf-seed.ts --dir /scratch/seed --owner "$owner" --editors "$editors" "$@" |
    tail -1 >"$scratch/seed-$name.json"
  cp "$scratch/seed-$name.json" "$out/"
  docker run --rm --network host --user "$uid" --shm-size 1g -e HOME=/tmp \
    -e PERF_BASE="https://$app" -e PERF_USERS=/perf/users.json \
    -v "$PERF_DIR/users.json:/perf/users.json:ro" -v "$scratch:/scratch:ro" \
    -v "$PWD/scripts/perf-grid-http.mjs:/app/perf-grid-http.mjs:ro" \
    --entrypoint node "dashboard-renderer:$tag" /app/perf-grid-http.mjs "/scratch/seed-$name.json" "$reps" |
    tee "$out/http-$name.jsonl"
}
http 10m --rows 10000000 --segs 24 --name "Perf grid 10 jt"
http 13m --rows 13000000 --segs 13 --name "Perf grid 13 jt"
rm -rf "$scratch"

kill "$sampler" 2>/dev/null || true
awk '{
  split($3, v, /[A-Za-z]+/); u = $3; sub(/^[0-9.]+/, "", u)
  mib = v[1] * (u == "GiB" ? 1024 : u == "KiB" ? 1 / 1024 : u == "B" ? 1 / 1048576 : 1)
  cpu = $NF; sub(/%/, "", cpu)
  if (mib > mem[$2]) mem[$2] = mib
  if (cpu + 0 > c[$2]) c[$2] = cpu + 0
} END { for (k in mem) printf "%s puncak_mem=%.0fMiB puncak_cpu=%.0f%%\n", k, mem[k], c[k] }' \
  "$out/stats.log" | sort >"$out/puncak.txt"
cat "$out/puncak.txt"
echo "selesai: $out (lanjut: bash deploy/perf-stack.sh down)"
