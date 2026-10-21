#!/usr/bin/env bash
# T-063 di VM (folder aplikasi, dijalankan PEMILIK): siklus periode bulanan (24 × 400 rb + 10 × 1 jt baris)
# dengan image produksi di stack uji TERPISAH (deploy/perf-stack.sh), sama dengan pengukuran container
# cloud di docs/ai/perf/T-063.md, ditambah backup harian SUNGGUHAN (service backup stack uji) di titik
# 0, 1, 2, 3, 24, 34 dan setelah pemeliharaan → pertambahan arsip per unggahan (AC4).
# Prasyarat: bash deploy/perf-stack.sh up 1   (akun perf1; users.json di $PERF_DIR)
#   bash scripts/perf-period-cycle-vm.sh <folder-hasil> [argumen tambahan perf-period-cycle.ts]
# Sesudahnya: bash deploy/perf-stack.sh down. Disk sementara: ± 2,5 GB storage stack uji (file asli
# 7 hari ikut tersimpan sampai pemeliharaan) + arsip backup stack uji (± ukuran bucket per titik) + CSV
# 1 bulan di $PERF_DIR/cycle. Semua di volume/folder stack uji; dihapus saat `perf-stack.sh down`.
# Tidak menyentuh data, backup, atau container produksi (project dashboard-perftest).
# Hasil: cycle.json/log, backup.tsv, stats.log, puncak.txt, mesin.txt — salin ke docs/ai/perf/T-063-olympus/.
set -euo pipefail
cd "$(dirname "$0")/.."
out=$1
shift
PERF_DIR=${PERF_DIR:-/data/docker-data/dashboard-perf}
PERF=(env COMPOSE_PROFILES=db docker compose -p dashboard-perftest --env-file .env.perftest -f docker-compose.prod.yml)
[ -f .env.perftest ] && [ -f "$PERF_DIR/users.json" ] || {
  echo "stack uji belum ada: bash deploy/perf-stack.sh up 1" >&2
  exit 1
}
scratch=$PERF_DIR/cycle
mkdir -p "$out"
rm -rf "$scratch"
mkdir -p -m 700 "$scratch"
uid="$(id -u):$(id -g)"
out=$(realpath "$out")
owner=$(grep -o '"email":"[^"]*"' "$PERF_DIR/users.json" | head -1 | cut -d'"' -f4)
points=${CHECKPOINTS:-0,1,2,3,24,34,end}

(
  while :; do
    ids=$(docker ps -q --filter label=com.docker.compose.project=dashboard-perftest)
    [ -z "$ids" ] || docker stats --no-stream --format '{{.Name}} {{.MemUsage}} {{.CPUPerc}}' $ids |
      sed "s/^/$(date +%s) /"
    sleep 2
  done
) >"$out/stats.log" 2>/dev/null &
sampler=$!
runner=""
# Nama container siklus tetap: bila skrip ini dihentikan/gagal, container worker uji ikut dibuang (klien
# `compose run` yang dibunuh tidak menghentikan container-nya).
cname=dashboard-perftest-cycle-$$
trap 'kill $sampler $runner 2>/dev/null || true; docker rm -f "$cname" >/dev/null 2>&1 || true; rm -rf "$scratch"' EXIT

{
  echo "tanggal $(date -Is)"
  echo "commit $(git rev-parse --short HEAD 2>/dev/null || echo '?')"
  nproc
  grep -m1 'model name' /proc/cpuinfo || true
  free -g
  lsblk -d -o NAME,ROTA,SIZE 2>/dev/null || true
  df -h "$PERF_DIR" /var/lib/docker 2>/dev/null || true
  uptime
} >"$out/mesin.txt"

# Siklus di container worker stack uji (NODE_ENV=test: skrip menolak produksi); worker stack uji yang
# memproses antrean. Skrip dipasang dari folder ini, sehingga image yang sudah ada cukup (≥ T-060).
"${PERF[@]}" run --rm -T --no-deps --name "$cname" --user "$uid" -e HOME=/tmp -e NODE_ENV=test -e LOG_LEVEL=warn \
  -v "$scratch:/scratch" -v "$PWD/scripts/perf-period-cycle.ts:/app/scripts/perf-period-cycle.ts:ro" \
  worker node_modules/.bin/tsx --conditions=react-server scripts/perf-period-cycle.ts \
  --owner "$owner" --dir /scratch --out /scratch/cycle.json --checkpoints "$points" "$@" \
  >"$out/cycle.log" 2>&1 &
runner=$!

# Backup sungguhan di setiap titik: arsip terbaru stack uji (byte) ditulis ke tanda selesai.
printf 'titik\tdataset_mb\tsumber_mb\tarsip_byte\n' >"$out/backup.tsv"
done_points=""
while kill -0 "$runner" 2>/dev/null; do
  for f in "$scratch"/checkpoint-*.json; do
    [ -e "$f" ] || continue
    label=$(basename "$f" .json)
    label=${label#checkpoint-}
    case " $done_points " in *" $label "*) continue ;; esac
    "${PERF[@]}" run --rm --no-deps backup backup.sh >>"$out/backup.log" 2>&1
    size=$("${PERF[@]}" run --rm --no-deps --entrypoint sh backup -c \
      'ls -t /backups/dashboard-*.tar.age | head -1 | xargs stat -c %s')
    printf '%s\t%s\t%s\t%s\n' "$label" "$(grep -o '"datasetMB":[0-9.]*' "$f" | cut -d: -f2)" \
      "$(grep -o '"sourceMB":[0-9.]*' "$f" | cut -d: -f2)" "$size" >>"$out/backup.tsv"
    echo "$size" >"$scratch/checkpoint-$label.done"
    done_points="$done_points $label"
  done
  sleep 2
done
wait "$runner"
cp "$scratch/cycle.json" "$out/" 2>/dev/null || true

kill "$sampler" 2>/dev/null || true
awk '{
  split($3, v, /[A-Za-z]+/); u = $3; sub(/^[0-9.]+/, "", u)
  mib = v[1] * (u == "GiB" ? 1024 : u == "KiB" ? 1 / 1024 : u == "B" ? 1 / 1048576 : 1)
  cpu = $NF; sub(/%/, "", cpu)
  if (mib > mem[$2]) mem[$2] = mib
  if (cpu + 0 > c[$2]) c[$2] = cpu + 0
} END { for (k in mem) printf "%s puncak_mem=%.0fMiB puncak_cpu=%.0f%%\n", k, mem[k], c[k] }' \
  "$out/stats.log" | sort >"$out/puncak.txt"
column -t "$out/backup.tsv" || cat "$out/backup.tsv"
echo "selesai: $out (lanjut: bash deploy/perf-stack.sh down)"
