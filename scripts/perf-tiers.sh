#!/usr/bin/env bash
# T-1w0b di VM (folder aplikasi produksi): jenjang ukuran unggah (scripts/perf-e2e.mjs tiers) terhadap
# deployment produksi dari image renderer, sambil memantau beban host tiap ± 5 dtk. Ambang dilampaui →
# <hasil>/STOP ditulis: jenjang berikutnya tidak dimulai (job yang sedang berjalan dibiarkan selesai).
# Uji 1 GB di VM bersama pernah membuatnya macet (docs/ai/perf/T-024.md catatan 7) — jangan matikan
# pemantau ini dan mulai dari jenjang kecil.
#   bash scripts/perf-tiers.sh <folder-hasil> <fixture>...    (nama file di $PERF_DIR/fixtures)
#   PERF_MODE=single PERF_DELETE=1 bash scripts/perf-tiers.sh <folder-hasil> <fixture>
#     alur penuh satu file (unggah → ingest → dashboard 10 widget → filter → p95), dataset dihapus di akhir;
#     tahap dashboard dilewati bila STOP sudah tertulis saat ingest
# Env: PERF_DIR (berisi users.json akun uji + fixtures/), IO_MAX (tekanan I/O avg60 %, bawaan 50),
#      MEM_MIN_MB (RAM tersedia, 1536), SWAP_MIN_MB (swap tersisa, 256), PERF_PAUSE_S (jeda, 30).
# Hasil: client.jsonl, host.log, stats.log, puncak.txt, STOP (bila berhenti).
set -euo pipefail
cd "$(dirname "$0")/.."
out=$1
shift
PERF_DIR=${PERF_DIR:-/data/docker-data/dashboard-perf}
IO_MAX=${IO_MAX:-50} MEM_MIN_MB=${MEM_MIN_MB:-1536} SWAP_MIN_MB=${SWAP_MIN_MB:-256}
app=$(sed -n 's/^APP_HOST=//p' .env.prod)
# Proyek compose produksi (name: di docker-compose.prod.yml).
project=dashboard
mkdir -p "$out"
rm -f "$out/STOP"

# Pemantau host: hanya /proc, tanpa docker (dockerd bisa macet justru saat beban tinggi); set +e agar satu
# perintah gagal tidak mematikan pemantau. Klien menganggap host.log basi (> 30 dtk) sebagai STOP.
(
  set +e
  while :; do
    io=$(awk '/^some/ { split($3, a, "="); print a[2] }' /proc/pressure/io)
    mem=$(awk '/^MemAvailable/ { print int($2 / 1024) }' /proc/meminfo)
    swap=$(awk '/^SwapFree/ { print int($2 / 1024) }' /proc/meminfo)
    load=$(cut -d' ' -f1 /proc/loadavg)
    echo "$(date +%s) load=$load io60=$io mem_mb=$mem swap_mb=$swap" >>"$out/host.log"
    reason=
    awk -v v="$io" -v m="$IO_MAX" 'BEGIN { exit !(v > m) }' && reason="tekanan I/O avg60 $io% > $IO_MAX%"
    [ "$mem" -ge "$MEM_MIN_MB" ] || reason="RAM tersedia $mem MB < $MEM_MIN_MB MB"
    [ "$swap" -ge "$SWAP_MIN_MB" ] || reason="swap tersisa $swap MB < $SWAP_MIN_MB MB"
    [ -z "$reason" ] || [ -f "$out/STOP" ] || echo "$(date -u +%FT%TZ) $reason" >"$out/STOP"
    sleep 5
  done
) 2>/dev/null &
monitor=$!
# Memori/CPU container: loop terpisah, tiap panggilan docker dibatasi waktu.
(
  set +e
  while :; do
    now=$(date +%s)
    ids=$(timeout 10 docker ps -q --filter "label=com.docker.compose.project=$project")
    [ -z "$ids" ] || timeout 10 docker stats --no-stream \
      --format '{{.Name}} {{.MemUsage}} {{.CPUPerc}}' $ids | sed "s/^/$now /" >>"$out/stats.log"
    sleep 5
  done
) 2>/dev/null &
sampler=$!
trap 'kill $monitor $sampler 2>/dev/null || true' EXIT

files=()
for f in "$@"; do files+=("/fixtures/$f"); done
docker run --rm --network host --user "$(id -u):$(id -g)" --shm-size 1g \
  -e HOME=/tmp -e PERF_BASE="https://$app" -e PERF_USERS=/perf/users.json -e PERF_OUT=/out \
  -e PERF_PAUSE_S="${PERF_PAUSE_S:-30}" -e PERF_DELETE="${PERF_DELETE:-}" \
  -v "$(realpath "$out"):/out" \
  -v "$PERF_DIR/users.json:/perf/users.json:ro" -v "$PERF_DIR/fixtures:/fixtures:ro" \
  -v "$PWD/scripts/perf-e2e.mjs:/app/perf-e2e.mjs:ro" \
  --entrypoint node dashboard-renderer:latest /app/perf-e2e.mjs "${PERF_MODE:-tiers}" "${files[@]}" |
  tee "$out/client.jsonl"

kill "$monitor" "$sampler" 2>/dev/null || true
# Puncak memori (MiB) dan CPU (%) per container selama run (format sama dengan perf-e2e.sh).
awk '{
  split($3, v, /[A-Za-z]+/); u = $3; sub(/^[0-9.]+/, "", u)
  mib = v[1] * (u == "GiB" ? 1024 : u == "KiB" ? 1 / 1024 : u == "B" ? 1 / 1048576 : 1)
  cpu = $NF; sub(/%/, "", cpu)
  if (mib > mem[$2]) mem[$2] = mib
  if (cpu + 0 > c[$2]) c[$2] = cpu + 0
} END { for (k in mem) printf "%s puncak_mem=%.0fMiB puncak_cpu=%.0f%%\n", k, mem[k], c[k] }' \
  "$out/stats.log" | sort >"$out/puncak.txt"
cat "$out/puncak.txt"
[ ! -f "$out/STOP" ] || echo "BERHENTI: $(cat "$out/STOP")"
