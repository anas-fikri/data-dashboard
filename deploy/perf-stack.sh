#!/usr/bin/env bash
# Stack uji performa T-024 di VM produksi, TERPISAH dari data produksi: project "dashboard-perftest",
# port 9543/9544, PostgreSQL container, secret baru, image produksi (tanpa build), setelan memori dan
# jumlah worker = produksi (yang diukur: kemampuan VM dengan setelan produksi). Akun uji langsung
# terverifikasi; password hanya di $PERF_DIR/users.json (mode 600, dihapus saat down).
#   bash deploy/perf-stack.sh up [jumlah-akun]   (bawaan 5 akun: perf1..perfN@<domain pertama>)
#   bash deploy/perf-stack.sh down               (bongkar + hapus volume, env, users.json)
set -euo pipefail
cd "$(dirname "$0")/.."
PERF_ENV=.env.perftest
PERF_DIR=${PERF_DIR:-/data/docker-data/dashboard-perf}
PERF=(env COMPOSE_PROFILES=db docker compose -p dashboard-perftest --env-file "$PERF_ENV" -f docker-compose.prod.yml)

case "${1:-}" in
  up)
    n=${2:-5}
    # shellcheck source=deploy/isolated-env.sh
    . deploy/isolated-env.sh
    isolated_env "$PERF_ENV" 9543 9544 172.31.246.0/24 172.31.247.0/24
    grep -E '^(APP_MEM|WORKER_MEM|WORKER_REPLICAS|RENDERER_MEM|REDIS_MAXMEMORY|MAX_UPLOAD_BYTES|USER_STORAGE_QUOTA_BYTES)=' \
      .env.prod >>"$PERF_ENV" || true
    "${PERF[@]}" up -d --no-build --wait --wait-timeout 600
    domain=$(env_val ALLOWED_EMAIL_DOMAINS | cut -d, -f1 | tr -d ' ')
    mkdir -p "$PERF_DIR"
    users=()
    for i in $(seq "$n"); do
      # NODE_ENV=test: dev-create-user menolak production; database ini milik stack uji saja.
      users+=("$("${PERF[@]}" run --rm -T --no-deps -e NODE_ENV=test worker \
        node_modules/.bin/tsx --conditions=react-server scripts/dev-create-user.ts "perf$i@$domain")")
    done
    (umask 077 && printf '[%s]\n' "$(IFS=,; echo "${users[*]}")" >"$PERF_DIR/users.json")
    echo "stack uji sehat: https://$ISO_HOST:9543 (storage :9544); $n akun di $PERF_DIR/users.json"
    ;;
  down)
    [ -f "$PERF_ENV" ] || { echo "$PERF_ENV tidak ada (stack uji belum/sudah dibongkar)" >&2; exit 0; }
    "${PERF[@]}" down -v --remove-orphans
    rm -f "$PERF_ENV" "$PERF_DIR/users.json"
    echo "stack uji dibongkar"
    ;;
  *)
    echo "pakai: perf-stack.sh up [jumlah-akun] | down" >&2
    exit 1
    ;;
esac
