#!/usr/bin/env bash
# Latihan restore (T-023 AC3) tanpa menyentuh data produksi (hanya membuat backup baru): salinan TERPISAH
# (project compose "dashboard-restoretest", volume sendiri, PostgreSQL container sementara, port
# 9443/9444, semua secret baru, tanpa worker) dipulihkan dari backup yang baru dibuat, dibandingkan
# dengan produksi (jumlah baris + md5 isi per tabel, daftar objek storage), health dicek, lalu dibongkar.
# Kunci PRIVAT age dari stdin:
#   ssh <server> bash /data/docker-data/data-dashboard/deploy/restore-drill.sh < kunci-backup.txt
# Hasil dicatat di tabel "Log uji restore" runbook oleh operator.
set -euo pipefail
cd "$(dirname "$0")/.."
PROD=(docker compose --env-file .env.prod -f docker-compose.prod.yml)
DRILL_ENV=.env.restoretest
# Profil "db" (PostgreSQL container) hanya untuk salinan latihan, tidak ikut ke perintah produksi.
DRILL=(env COMPOSE_PROFILES=db docker compose -p dashboard-restoretest --env-file "$DRILL_ENV" -f docker-compose.prod.yml)
key=$(cat) # kunci privat hanya di memori proses ini
[ -n "$key" ] || { echo "kunci age kosong (stdin)" >&2; exit 1; }
tmp=
cleanup() {
  "${DRILL[@]}" down -v --remove-orphans >/dev/null 2>&1 || true
  rm -f "$DRILL_ENV"
  [ -z "$tmp" ] || rm -rf "$tmp"
}
trap cleanup EXIT

# shellcheck source=deploy/isolated-env.sh
. deploy/isolated-env.sh
isolated_env "$DRILL_ENV" 9443 9444 172.31.244.0/24 172.31.245.0/24
host=$ISO_HOST
# Latihan tanpa worker (tidak ada yang menulis ke salinan) dan memori kecil.
printf '%s\n' APP_MEM=1g WORKER_MEM=1536m WORKER_REPLICAS=0 RENDERER_MEM=1g REDIS_MAXMEMORY=128mb >>"$DRILL_ENV"
# Sisa latihan yang terputus (ssh putus/SIGKILL): volume lama memegang password lama.
"${DRILL[@]}" down -v --remove-orphans >/dev/null 2>&1 || true

# Pembanding = sidik produksi tepat sebelum DAN sesudah backup; sama → arsip memuat persis isi itu.
# Berbeda → produksi sedang dipakai saat backup; ulangi (maks 3 kali). "run" (container baru), bukan
# exec: container backup yang sudah lama jalan memegang versi skrip saat ia dibuat (bind mount satu file).
P_RUN=("${PROD[@]}" run --rm -T --no-deps backup bash)
for attempt in 1 2 3; do
  echo "backup baru produksi (percobaan $attempt)"
  before=$("${P_RUN[@]}" /usr/local/bin/fingerprint.sh)
  out=$("${P_RUN[@]}" /usr/local/bin/backup.sh)
  prod_fp=$("${P_RUN[@]}" /usr/local/bin/fingerprint.sh)
  [ "$before" = "$prod_fp" ] && break
  echo "produksi berubah selama backup" >&2
  if [ "$attempt" = 3 ]; then
    echo "LATIHAN RESTORE GAGAL: produksi terus berubah; ulangi saat sepi" >&2
    exit 1
  fi
done
# Nama dari output backup.sh (bukan arsip terbaru di folder: cron 02:00 bisa selesai di tengah latihan).
name=$(sed -n 's/.*arsip: \(dashboard-[^ ]*\.tar\.age\).*/\1/p' <<<"$out") # nama asli: .sha256 merujuknya
[ -n "$name" ] || { echo "nama arsip tidak ada di output backup.sh" >&2; exit 1; }
archive=/backups/$name
echo "arsip produksi: $name"
tmp=$(mktemp -d)
"${PROD[@]}" cp "backup:$archive" "$tmp/$name" >/dev/null
"${PROD[@]}" cp "backup:$archive.sha256" "$tmp/$name.sha256" >/dev/null

echo "salinan latihan: up (tanpa build, image produksi)"
"${DRILL[@]}" up -d --wait --wait-timeout 600 postgres redis rustfs
"${DRILL[@]}" up --no-build migrate storage-init >/dev/null
echo "restore arsip ke salinan latihan"
printf '%s\n' "$key" | "${DRILL[@]}" run --rm -T --no-deps -v "$tmp:/run/drill:ro" backup \
  bash /usr/local/bin/restore.sh "/run/drill/$name" -
# Sidik salinan SEBELUM app jalan: belum ada yang sempat menulis ke salinan.
drill_fp=$("${DRILL[@]}" run --rm -T --no-deps backup bash /usr/local/bin/fingerprint.sh)

if ! "${DRILL[@]}" up -d --no-build --wait --wait-timeout 600; then
  # Cleanup membuang container; cetak penyebab dulu (pesan health tanpa secret).
  echo "salinan latihan tidak sehat; /api/health/core app:" >&2
  "${DRILL[@]}" exec -T app node -e \
    "fetch('http://127.0.0.1:3100/api/health/core').then(r=>r.text()).then(t=>console.log(t))" >&2 || true
  "${DRILL[@]}" logs --no-color --tail 30 app >&2 || true
  exit 1
fi
# Health penuh lewat proxy latihan (termasuk renderer PDF; Chromium bisa lambat start di VM yang I/O-nya
# padat). --resolve: VM belum tentu bisa me-resolve domainnya sendiri.
health=000
for _ in $(seq 60); do
  health=$(curl -sk --max-time 10 --resolve "$host:9443:127.0.0.1" -o /dev/null -w '%{http_code}' \
    "https://$host:9443/api/health" || true)
  [ "$health" = 200 ] && break
  sleep 5
done
[ "$health" = 200 ] || "${DRILL[@]}" logs --no-color --tail 20 renderer >&2 || true

prod_rows=$(grep '^rows:' <<<"$prod_fp")
drill_rows=$(grep '^rows:' <<<"$drill_fp")
prod_objs=$(grep '^objects:' <<<"$prod_fp")
drill_objs=$(grep '^objects:' <<<"$drill_fp")
echo "isi per tabel (jumlah + md5) cocok: $([ "$prod_rows" = "$drill_rows" ] && echo ya || echo TIDAK)"
# Hanya nama tabel yang beda (bukan isinya).
[ "$prod_rows" = "$drill_rows" ] || comm -3 <(tr ' ' '\n' <<<"${prod_rows#rows: }" | sort) \
  <(tr ' ' '\n' <<<"${drill_rows#rows: }" | sort) | cut -d= -f1 | tr -d '\t' | sort -u | sed 's/^/  beda: /'
echo "daftar objek storage (ukuran+path) cocok: $([ "$prod_objs" = "$drill_objs" ] && echo ya || echo TIDAK)"
echo "health salinan latihan: $health"
[ "$prod_rows" = "$drill_rows" ] && [ "$prod_objs" = "$drill_objs" ] && [ "$health" = 200 ] \
  && echo "LATIHAN RESTORE LULUS" || { echo "LATIHAN RESTORE GAGAL" >&2; exit 1; }
