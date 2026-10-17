#!/usr/bin/env bash
# T-024 di VM (folder aplikasi): jalankan scripts/perf-e2e.mjs terhadap stack uji (deploy/perf-stack.sh
# up) dari image renderer (Chromium + playwright-core), sambil mencatat memori/CPU container stack uji
# tiap ± 2 dtk; lalu waktu presisi versi dari database stack uji.
#   bash scripts/perf-e2e.sh <folder-hasil> single <fixture> [akun] | concurrent <fixture> <n>
# <fixture> = nama file di $PERF_DIR/fixtures. Hasil: client.jsonl, stats.log, puncak.txt, versi.txt.
set -euo pipefail
cd "$(dirname "$0")/.."
out=$1 mode=$2 fixture=$3
shift 3
PERF_DIR=${PERF_DIR:-/data/docker-data/dashboard-perf}
PERF=(env COMPOSE_PROFILES=db docker compose -p dashboard-perftest --env-file .env.perftest -f docker-compose.prod.yml)
app=$(sed -n 's/^APP_HOST=//p' .env.perftest)
mkdir -p "$out"

(
  while :; do
    ids=$(docker ps -q --filter label=com.docker.compose.project=dashboard-perftest)
    [ -z "$ids" ] || docker stats --no-stream --format '{{.Name}} {{.MemUsage}} {{.CPUPerc}}' $ids |
      sed "s/^/$(date +%s) /"
    sleep 1
  done
) >"$out/stats.log" 2>/dev/null &
sampler=$!
trap 'kill $sampler 2>/dev/null || true' EXIT

docker run --rm --network host --user "$(id -u):$(id -g)" --shm-size 1g \
  -e HOME=/tmp -e PERF_BASE="https://$app" -e PERF_USERS=/perf/users.json \
  -v "$PERF_DIR/users.json:/perf/users.json:ro" -v "$PERF_DIR/fixtures:/fixtures:ro" \
  -v "$PWD/scripts/perf-e2e.mjs:/app/perf-e2e.mjs:ro" \
  --entrypoint node dashboard-renderer:latest /app/perf-e2e.mjs "$mode" "/fixtures/$fixture" "$@" |
  tee "$out/client.jsonl"

kill "$sampler" 2>/dev/null || true
# Puncak memori (MiB) dan CPU (%) per container selama run.
awk '{
  split($3, v, /[A-Za-z]+/); u = $3; sub(/^[0-9.]+/, "", u)
  mib = v[1] * (u == "GiB" ? 1024 : u == "KiB" ? 1 / 1024 : u == "B" ? 1 / 1048576 : 1)
  cpu = $NF; sub(/%/, "", cpu)
  if (mib > mem[$2]) mem[$2] = mib
  if (cpu + 0 > c[$2]) c[$2] = cpu + 0
} END { for (k in mem) printf "%s puncak_mem=%.0fMiB puncak_cpu=%.0f%%\n", k, mem[k], c[k] }' \
  "$out/stats.log" | sort >"$out/puncak.txt"
"${PERF[@]}" exec -T postgres psql -U dashboard -d data_dashboard -c "
  SELECT d.name AS dataset, v.status, round(v.\"sizeBytes\" / 1e6) AS mb,
         round(extract(epoch FROM v.\"completingAt\" - v.\"createdAt\")) AS unggah_s,
         round(extract(epoch FROM v.\"ingestStartedAt\" - v.\"completingAt\")) AS antre_s,
         round(extract(epoch FROM v.\"ingestFinishedAt\" - v.\"ingestStartedAt\")) AS ingest_s
    FROM \"DatasetVersion\" v JOIN \"Dataset\" d ON d.id = v.\"datasetId\"
   ORDER BY v.\"createdAt\"" >"$out/versi.txt"
cat "$out/puncak.txt" "$out/versi.txt"
