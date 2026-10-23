#!/usr/bin/env bash
# Upgrade produksi dengan gerbang pemeriksaan + rollback (T-023, rilis G-6: migrasi T-036…T-060).
# Dijalankan PEMILIK di folder aplikasi (mis. /data/docker-data/data-dashboard). Langkah lengkap dan
# urutannya: docs/runbook-deploy.md §7. Ringkas:
#
#   bash /tmp/upgrade.sh preflight        1. dengan KODE LAMA: cek + backup + catat image (tanpa mengubah apa pun)
#   (sinkron kode rilis baru)             2. git pull / ekstrak arsip rilis
#   bash deploy/upgrade.sh load <arsip…>  3. muat image rilis (deploy/images.sh) + set IMAGE_TAG di .env.prod
#   bash deploy/upgrade.sh migrate        4. stop app+worker, migrasi, pemeriksaan pasca-migrasi (gerbang)
#   bash deploy/upgrade.sh start          5. up + health + verifikasi pasca-deploy
#   bash deploy/upgrade.sh rollback       (bila gagal) image lama + database dari dump pra-upgrade
#
# Status per upgrade di ../<folder>-upgrade/<stamp>/ (mode 700, di luar folder aplikasi): state.env (tanpa
# rahasia), dump database PLAINTEXT (hapus setelah backup harian berikutnya terverifikasi), arsip kode lama,
# log pemeriksaan. Secret tidak pernah dicetak; kredensial DB hanya lewat env di container backup (pgenv.sh).
# Variabel: UPGRADE_DIR (folder status), MIN_FREE_GB (bawaan 15), FORCE=1 (abaikan job aktif di preflight),
# REUSE_BACKUP_HOURS=N (preflight memakai backup terverifikasi yang umurnya ≤ N jam alih-alih backup lengkap
# baru — rilis tanpa migrasi; dump database tetap dibuat baru; hanya berlaku bila EXPECT_MIGRATION = migrasi
# terakhir produksi, selain itu backup lengkap), EXPECT_MIGRATION (migrasi terakhir rilis baru, diisi
# release.sh), BACKUP_EST_GB (perkiraan ukuran backup bila belum ada arsip),
# ROLLBACK_YES=1 (tanpa konfirmasi), ROLLBACK_LATE=1 (rollback cepat > 20 jam setelah start), IMAGE_TAG
# (hanya untuk build: tag eksplisit; bawaan v<version package.json>, T-066).
set -euo pipefail

DIE_HINT=""
die() { echo "GAGAL: $*" >&2; [ -z "$DIE_HINT" ] || echo "$DIE_HINT" >&2; exit 1; }
info() { echo "== $*"; }
warn() { echo "PERINGATAN: $*" >&2; }

ENV_FILE=.env.prod
STATE_ROOT=${UPGRADE_DIR:-../$(basename "$PWD")-upgrade}
C=(docker compose --env-file "$ENV_FILE" -f docker-compose.prod.yml)
SERVICES=(app worker renderer backup)
# Tabel yang ditambahkan migrasi rilis ini (T-036…T-060, T-072): boleh ada di database tapi tidak di dump lama.
NEW_TABLES="SheetLineage Segment SegmentTyped SheetSegment UploadQueue UploadQueueItem SavedPivot"

envval() { sed -n "s/^$1=//p" "$ENV_FILE" | tail -1; }

setenv() { # setenv KEY VALUE — ganti baris terakhir KEY=… atau tambahkan; cadangan .env.prod.bak-upgrade
  local k=$1 v=$2
  cp -p "$ENV_FILE" "$ENV_FILE.bak-upgrade"
  if grep -q "^$k=" "$ENV_FILE"; then
    sed -i "s|^$k=.*|$k=$v|" "$ENV_FILE"
  else
    printf '%s=%s\n' "$k" "$v" >>"$ENV_FILE"
  fi
}

# SQL lewat stdin ke psql di container backup (klien PostgreSQL 16, kredensial dari DATABASE_URL via env).
psql_q() {
  "${C[@]}" run --rm --no-deps -T backup bash -c \
    '. /usr/local/bin/pgenv.sh && pg_env_from_url "$DATABASE_URL" && exec psql -X -qtA -v ON_ERROR_STOP=1' \
    2> >(grep -v '^ Container .* Creat' >&2)
}

latest_state() { ls -1d "$STATE_ROOT"/2* 2>/dev/null | tail -1; }

load_state() {
  local dir=${1:-$(latest_state)}
  [ -n "$dir" ] && [ -f "$dir/state.env" ] || die "status upgrade tidak ditemukan di $STATE_ROOT (jalankan preflight dulu)"
  STATE=$(cd "$dir" && pwd)
  # shellcheck disable=SC1091
  . "$STATE/state.env"
  [ -n "${PREFLIGHT_AT:-}" ] || die "preflight $STATE belum lulus — ulangi preflight (kode lama)"
}

record() { printf '%s=%q\n' "$1" "$2" >>"$STATE/state.env"; }

require_app_dir() {
  [ -f docker-compose.prod.yml ] && [ -f "$ENV_FILE" ] || die "jalankan dari folder aplikasi (docker-compose.prod.yml + .env.prod)"
  ! grep -q '=ISI_' "$ENV_FILE" || die ".env.prod masih berisi nilai ISI_*"
  COMPOSE_PROFILES=$(envval COMPOSE_PROFILES)
  export COMPOSE_PROFILES
}

free_gb() { df -Pk "$1" | awk 'NR==2 {printf "%d", $4/1024/1024}'; }

# Satu angka dari SQL; kueri gagal atau hasil bukan angka = gagal (gerbang tertutup, bukan "0").
sql_count() {
  local v
  v=$(echo "$1" | psql_q) || return 1
  [[ "$v" =~ ^[0-9]+$ ]] || return 1
  echo "$v"
}

# "<ingest> <ekspor>" yang sedang berjalan (UPLOADED/INGESTING, QUEUED/RUNNING).
active_jobs() {
  local b e
  b=$(sql_count "SELECT count(*) FROM \"DatasetVersion\" WHERE status::text IN ('UPLOADED', 'INGESTING');") || return 1
  e=$(sql_count "SELECT count(*) FROM \"Export\" WHERE status::text IN ('QUEUED', 'RUNNING');") || return 1
  echo "$b $e"
}

last_migration() {
  echo "SELECT max(migration_name) FROM _prisma_migrations WHERE finished_at IS NOT NULL;" | psql_q
}

# dump_verified <nama>: pg_dump custom ke $STATE/<nama>, lalu pg_restore --list wajib memuat semua tabel
# public. Gagal = die. Mencatat DB_DUMP (dump yang dipakai rollback).
dump_verified() {
  local name=$1 tables entries sz
  tables=$(sql_count "SELECT count(*) FROM pg_tables WHERE schemaname = 'public';") || die "jumlah tabel tidak terbaca"
  sz=$(sql_count "SELECT pg_database_size(current_database());") || die "ukuran database tidak terbaca"
  [ "$(($(free_gb "$STATE") * 1024 * 1024 * 1024))" -ge "$((sz * 2 + 1073741824))" ] ||
    die "ruang folder status kurang untuk dump database"
  entries=$("${C[@]}" run --rm --no-deps -T -v "$STATE:/out" backup bash -c \
    '. /usr/local/bin/pgenv.sh && pg_env_from_url "$DATABASE_URL" && umask 077 &&
     pg_dump --format=custom --no-owner --no-privileges --file "/out/$0" &&
     pg_restore --list "/out/$0" | grep -c " TABLE DATA public "' "$name") || die "pg_dump gagal"
  [ -s "$STATE/$name" ] || die "dump kosong"
  [ "$entries" = "$tables" ] || die "dump memuat $entries tabel, database $tables"
  record DB_DUMP "$name"
  echo "   $STATE/$name ($(du -h "$STATE/$name" | cut -f1), $entries tabel)"
}

# Upgrade yang sudah di-rollback tidak boleh dilanjutkan dengan status yang sama.
not_rolled_back() {
  [ -z "${ROLLED_BACK_AT:-}" ] || die "upgrade $STAMP sudah di-rollback — mulai lagi dari preflight (kode lama)"
}

# ---------------------------------------------------------------------------------------------------
preflight() {
  local v
  for v in MIN_FREE_GB REUSE_BACKUP_HOURS BACKUP_EST_GB; do
    case ${!v:-} in *[!0-9]*) die "$v harus angka bulat (sekarang: ${!v})" ;; esac
  done
  case ${EXPECT_MIGRATION:-} in *[!0-9a-z_]*) die "EXPECT_MIGRATION tidak sah" ;; esac
  local stamp tag root sz fdock fstate n busy exp failed last db tables out archive
  stamp=$(date -u +%Y%m%dT%H%M%SZ)
  tag=$(envval IMAGE_TAG); tag=${tag:-latest}
  umask 077
  mkdir -p "$STATE_ROOT/$stamp"
  chmod 700 "$STATE_ROOT" "$STATE_ROOT/$stamp"
  STATE=$(cd "$STATE_ROOT/$stamp" && pwd)
  : >"$STATE/state.env"
  record STAMP "$stamp"
  record OLD_TAG "$tag"
  record APP_DIR "$PWD"
  info "status upgrade: $STATE"

  info "1/7 service produksi berjalan"
  for s in app worker backup; do
    [ -n "$("${C[@]}" ps -q "$s" 2>/dev/null | head -1)" ] || die "service $s tidak berjalan — preflight dibuat untuk produksi yang hidup"
  done
  # Redis yang rusak (mis. AOF terpotong saat disk penuh) baru ketahuan di `start` setelah app/worker berhenti.
  local rcid rh
  rcid=$("${C[@]}" ps -q redis 2>/dev/null | head -1)
  rh=$([ -z "$rcid" ] || docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{end}}' "$rcid")
  echo "   redis: ${rh:-tidak berjalan}"
  [ "$rh" = healthy ] || {
    DIE_HINT="Perbaiki Redis dulu (docs/runbook-deploy.md §12: salin appendonlydir, redis-check-aof --fix)."
    die "redis tidak sehat"
  }

  info "2/7 pemeriksaan SQL pra-deploy"
  failed=$(sql_count "SELECT count(*) FROM _prisma_migrations WHERE finished_at IS NULL AND rolled_back_at IS NULL;") ||
    die "_prisma_migrations tidak terbaca"
  [ "$failed" = 0 ] || die "$failed migrasi gagal/setengah jalan di _prisma_migrations — selesaikan dulu (prisma migrate resolve)"
  last=$(last_migration) && [ -n "$last" ] || die "migrasi terakhir tidak terbaca"
  record OLD_MIGRATION "$last"
  db=$(echo "SELECT current_database();" | psql_q) && [ -n "$db" ] || die "nama database tidak terbaca"
  record OLD_DB "$db"
  echo "   migrasi terakhir produksi: $last"
  n=$(sql_count "SELECT count(*) FROM \"DatasetVersion\" WHERE mode::text = 'APPEND';") || die "cek APPEND gagal"
  echo "   versi mode APPEND (T-049, wajib 0): $n"
  [ "$n" = 0 ] || die "ada $n versi APPEND — migrasi T-049 akan berhenti; putuskan versi itu dulu (Notes T-049)"
  read -r busy exp < <(active_jobs || echo x x)
  [ "$busy" != x ] || die "cek job aktif gagal"
  n=$(sql_count "SELECT count(*) FROM \"DatasetVersion\" WHERE status::text = 'UPLOADING';") || die "cek unggahan gagal"
  echo "   ingest berjalan: $busy · ekspor berjalan: $exp · unggahan belum selesai (info): $n"
  if [ "$busy" != 0 ] || [ "$exp" != 0 ]; then
    [ "${FORCE:-}" = 1 ] || die "masih ada job aktif — tunggu selesai (ulang preflight) atau FORCE=1 (job diulang worker baru)"
    warn "FORCE=1: job aktif diabaikan"
  fi
  sz=$(sql_count "SELECT pg_database_size(current_database());") || die "ukuran database tidak terbaca"
  tables=$(sql_count "SELECT count(*) FROM pg_tables WHERE schemaname = 'public';") || die "jumlah tabel tidak terbaca"
  echo "   ukuran database: $((sz / 1024 / 1024)) MB, tabel: $tables"
  # Hitungan kuota lama (sebelum T-039) untuk dibandingkan dengan quota-report setelah migrasi.
  psql_q >"$STATE/kuota-sebelum.txt" <<'SQL'
SELECT u.email || ' ' || round(sum(coalesce(v."sizeBytes", 0)) / 1024.0 ^ 3, 2) || ' GB'
FROM "DatasetVersion" v JOIN "Dataset" d ON d.id = v."datasetId" JOIN "User" u ON u.id = d."ownerId"
WHERE v.status::text <> 'FAILED' GROUP BY u.email ORDER BY 1;
SQL
  echo "   kuota hitungan lama: $STATE/kuota-sebelum.txt"

  info "3/7 ruang disk"
  root=$(docker info --format '{{.DockerRootDir}}')
  fdock=$(free_gb "$root"); fstate=$(free_gb "$STATE")
  echo "   bebas: Docker ($root) ${fdock} GB · folder status ${fstate} GB · minimum ${MIN_FREE_GB:-15} GB"
  [ "$fdock" -ge "${MIN_FREE_GB:-15}" ] || die "ruang Docker kurang (image baru ± 4 GB + arsip backup + temp)"
  [ "$((fstate * 1024 * 1024 * 1024))" -ge "$((sz * 2 + 1073741824))" ] || die "ruang folder status kurang untuk dump database"

  info "4/7 catat image produksi (untuk rollback)"
  for s in "${SERVICES[@]}"; do
    local cid img
    cid=$("${C[@]}" ps -q "$s" 2>/dev/null | head -1)
    if [ -n "$cid" ]; then img=$(docker inspect -f '{{.Image}}' "$cid"); else img=$(docker image inspect -f '{{.Id}}' "dashboard-$s:$tag"); fi
    docker tag "$img" "dashboard-$s:prev-$stamp"
    record "OLD_IMAGE_${s^^}" "$img"
    echo "   dashboard-$s:prev-$stamp = $img"
  done

  info "5/7 arsip kode lama (tanpa .env.prod*, kunci, sertifikat)"
  tar -czf "$STATE/kode-lama.tar.gz" --exclude='./.env.prod*' --exclude=./deploy/offsite \
    --exclude=./deploy/certs --exclude=./deploy/rclone.conf --exclude=./.git .
  if git rev-parse --short HEAD >/dev/null 2>&1; then record OLD_COMMIT "$(git rev-parse HEAD)"; fi
  echo "   $STATE/kode-lama.tar.gz ($(du -h "$STATE/kode-lama.tar.gz" | cut -f1))"

  info "6/7 backup terenkripsi (database + storage)"
  # Arsip terbaru: nama, umur (detik), ukuran (GB, dibulatkan ke atas), checksum cocok (1/0). Ukuran dibaca
  # terlepas dari checksum: arsip rusak tetap memberi perkiraan ruang (dan diberi peringatan).
  local latest age gb ok need
  latest=$("${C[@]}" run --rm --no-deps -T backup sh -c 'cd /backups &&
    f=$(ls -1t dashboard-*.tar.age 2>/dev/null | head -n1) && [ -n "$f" ] &&
    if sha256sum -c "$f.sha256" >/dev/null 2>&1; then ok=1; else ok=0; fi &&
    echo "$f $(( $(date +%s) - $(stat -c %Y "$f") )) $(( ($(stat -c %s "$f") + 1073741823) / 1073741824 )) $ok"' \
    2>/dev/null) || latest=""
  read -r archive age gb ok <<<"${latest:-}"
  [ -z "$archive" ] || [ "${ok:-0}" = 1 ] || warn "checksum arsip backup terbaru $archive TIDAK cocok — periksa backup harian"
  # Backup harian hanya cukup untuk rilis TANPA migrasi: dicek terhadap database produksi sungguhan
  # (bukan tag git sebelumnya — rilis yang tidak pernah di-deploy/di-rollback tidak mengelabuinya).
  if [ -n "${REUSE_BACKUP_HOURS:-}" ] && [ "${EXPECT_MIGRATION:-}" != "$last" ]; then
    warn "rilis baru bermigrasi (${EXPECT_MIGRATION:-tidak diketahui} ≠ produksi $last) — backup harian TIDAK dipakai, backup lengkap dibuat"
    REUSE_BACKUP_HOURS=""
  fi
  if [ -n "${REUSE_BACKUP_HOURS:-}" ] && [ -n "$archive" ] && [ "${ok:-0}" = 1 ] &&
    [ "${age:-x}" -le $((REUSE_BACKUP_HOURS * 3600)) ] 2>/dev/null; then
    echo "   memakai backup terverifikasi $archive (umur $((age / 3600)) jam ≤ $REUSE_BACKUP_HOURS jam, checksum cocok)"
  else
    # Backup lengkap: salinan storage di folder kerja volume backup + arsip .part (tar | age streaming):
    # puncak ± 2 × ukuran arsip terakhir, ditambah margin 5 GB dan minimum biasa.
    [ -n "$archive" ] || [ -n "${BACKUP_EST_GB:-}" ] ||
      die "ukuran backup tidak terbaca (belum ada arsip di volume backup) — isi BACKUP_EST_GB=<perkiraan GB> lalu ulangi"
    gb=${gb:-${BACKUP_EST_GB:-0}}
    need=$((gb * 2 + 5 + ${MIN_FREE_GB:-15}))
    [ "$fdock" -ge "$need" ] || {
      DIE_HINT="Kosongkan ruang (image lama: docker rmi dashboard-<s>:<tag lama>; JANGAN prune) atau, untuk rilis tanpa migrasi, release.sh --quick. MIN_FREE_GB menurunkan minimum."
      die "ruang disk ${fdock} GB kurang untuk backup lengkap (perlu ± ${need} GB: 2 × ${gb} GB arsip + 5 + minimum ${MIN_FREE_GB:-15})"
    }
    out=$("${C[@]}" run --rm --no-deps -T backup backup.sh 2>&1) || { echo "$out" >&2; die "backup.sh gagal"; }
    echo "$out" | sed 's/^/   /'
    archive=$(echo "$out" | sed -n 's/.*arsip: \(dashboard-[0-9TZ]*\.tar\.age\).*/\1/p' | tail -1)
    [ -n "$archive" ] || die "nama arsip backup tidak terbaca dari log backup.sh"
  fi
  record BACKUP_ARCHIVE "$archive"

  info "7/7 dump database pra-upgrade (pg_dump custom) + verifikasi"
  dump_verified "db-$stamp.dump"

  record PREFLIGHT_AT "$(date -u +%s)"
  cat <<EOF

PREFLIGHT LULUS ($stamp). Produksi belum diubah. Berikutnya:
  1. sinkron kode rilis baru ke folder ini (git pull / ekstrak arsip rilis)
  2. bash deploy/upgrade.sh load <arsip-image.tar.gz>…   (atau: bash deploy/upgrade.sh build → tag v<versi>)
  3. bash deploy/upgrade.sh migrate
EOF
}

# ---------------------------------------------------------------------------------------------------
load_images() {
  load_state
  [ $# -ge 1 ] || die "pakai: upgrade.sh load <arsip.tar.gz>…"
  local f tags tag
  # Tag dibaca dari manifest.json arsip SEBELUM docker load: arsip bertag sama dengan produksi akan
  # memindahkan tag yang sedang dipakai container (rollback tetap lewat prev-<stamp>, tapi deploy salah).
  : >"$STATE/load-tags.txt"
  for f in "$@"; do
    gunzip -c "$f" | tar -xOf - manifest.json | grep -o '"dashboard-[a-z]*:[^"]*"' | tr -d '"' >>"$STATE/load-tags.txt" ||
      die "$f: manifest.json tanpa image dashboard-* (bukan arsip deploy/images.sh?)"
  done
  tags=$(sed 's/^dashboard-[a-z]*://' "$STATE/load-tags.txt" | sort -u)
  [ -n "$tags" ] && [ "$(echo "$tags" | wc -l)" = 1 ] || die "arsip harus berisi satu tag image (ditemukan: $(echo $tags))"
  tag=$tags
  case "$tag" in prev-*) die "arsip bertag $tag (cadangan rollback)" ;; esac
  [ "$tag" != "$OLD_TAG" ] || die "arsip bertag $tag = tag produksi lama — build ulang dengan tag lain (commit rilis)"
  : >"$STATE/load.log"
  for f in "$@"; do
    info "muat $f"
    gunzip -c "$f" | docker load | tee -a "$STATE/load.log"
  done
  set_tag "$tag"
}

# v<version> dari package.json kode rilis (T-066, sama dengan deploy/images.sh); kosong bila tidak sah.
release_tag() {
  local v
  v=$(sed -n 's/^  "version": *"\([^"]*\)".*/\1/p' package.json 2>/dev/null | head -1)
  if [[ "$v" =~ ^[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.-]+)?$ ]]; then echo "v$v"; fi
}

build_images() {
  load_state
  local tag commit
  # IMAGE_TAG eksplisit di env menang; bawaan v<versi package.json> (rilis per tonggak: aitk release).
  tag=${IMAGE_TAG:-$(release_tag)}
  [ -n "$tag" ] || die "versi package.json tidak terbaca — IMAGE_TAG=<tag> bash deploy/upgrade.sh build"
  case "$tag" in prev-*) die "tag $tag adalah cadangan rollback" ;; esac
  # Image store dipakai bersama produksi: build bertag produksi memindahkan tag yang sedang dipakai.
  [ "$tag" != "$OLD_TAG" ] ||
    die "tag build ($tag) sama dengan produksi — naikkan versi (aitk release) atau IMAGE_TAG=$tag-<commit>"
  commit=$(git rev-parse --short HEAD 2>/dev/null || true)
  setenv IMAGE_TAG "$tag"
  info "build image bertag $tag (commit ${commit:-?}) di VM (lambat; disarankan deploy/images.sh di mesin build)"
  IMAGE_TAG=$tag APP_COMMIT=$commit "${C[@]}" build
  set_tag "$tag"
}

set_tag() {
  local tag=$1 s
  case "$tag" in prev-*) die "tag $tag adalah cadangan rollback" ;; esac
  [ "$tag" != "$OLD_TAG" ] || die "tag $tag sama dengan produksi lama — image rilis baru belum dimuat"
  for s in "${SERVICES[@]}"; do
    docker image inspect "dashboard-$s:$tag" >/dev/null 2>&1 || die "image dashboard-$s:$tag tidak ada"
  done
  setenv IMAGE_TAG "$tag"
  record NEW_TAG "$tag"
  echo "IMAGE_TAG=$tag di .env.prod (cadangan: .env.prod.bak-upgrade). Berikutnya: bash deploy/upgrade.sh migrate"
}

# ---------------------------------------------------------------------------------------------------
migrate() {
  load_state
  local tag s busy exp last
  tag=$(envval IMAGE_TAG)
  [ -n "$tag" ] && [ "$tag" != "$OLD_TAG" ] || die "IMAGE_TAG belum diganti ke rilis baru (upgrade.sh load/build)"
  for s in "${SERVICES[@]}"; do
    docker image inspect "dashboard-$s:$tag" >/dev/null 2>&1 || die "image dashboard-$s:$tag tidak ada"
  done
  [ "$(docker image inspect -f '{{.Id}}' "dashboard-worker:$tag")" != "$OLD_IMAGE_WORKER" ] ||
    die "image worker $tag = image lama — rilis baru belum dimuat"
  [ -f deploy/upgrade.sh ] && grep -q GRID_MAX_CONCURRENCY docker-compose.prod.yml ||
    die "kode di folder ini belum rilis baru (sinkron kode dulu)"
  not_rolled_back
  read -r busy exp < <(active_jobs || echo x x)
  [ "$busy" != x ] || die "cek job aktif gagal"
  if [ "$busy $exp" != "0 0" ] && [ "${FORCE:-}" != 1 ]; then
    die "job aktif (ingest $busy, ekspor $exp) — tunggu selesai lalu ulang migrate (produksi belum diubah)"
  fi

  record MIGRATED_AT ""
  info "hentikan app + worker (jeda layanan dimulai)"
  record DOWNTIME_AT "$(date -u +%s)"
  "${C[@]}" stop app worker
  last=$(last_migration) && [ -n "$last" ] || gate_fail "migrasi terakhir tidak terbaca"
  if [ "$last" = "$OLD_MIGRATION" ]; then
    # Skema masih lama: produksi lama aman dinyalakan lagi bila ada yang menghalangi.
    DIE_HINT="Database BELUM dimigrasi. Nyalakan lagi produksi lama: ${C[*]} start app worker"
    read -r busy exp < <(active_jobs || echo x x)
    [ "$busy" != x ] || { "${C[@]}" start app worker; die "cek job aktif gagal (app/worker dinyalakan lagi)"; }
    if [ "$busy $exp" != "0 0" ] && [ "${FORCE:-}" != 1 ]; then
      "${C[@]}" start app worker
      die "job mulai saat app/worker dihentikan (ingest $busy, ekspor $exp) — app/worker dinyalakan lagi, ulang migrate"
    fi
    # Dump baru setelah penulis berhenti: unggahan/perubahan selama sinkron kode + load tidak hilang bila
    # rollback.
    info "dump database terbaru (app/worker berhenti) untuk rollback"
    dump_verified "db-migrate-$(date -u +%Y%m%dT%H%M%SZ).dump"
  else
    # migrate diulang setelah gerbang gagal: database sudah (sebagian) berskema baru — dump rollback tetap
    # yang terakhir berskema lama.
    warn "database sudah di $last (bukan $OLD_MIGRATION): dump rollback tetap $DB_DUMP"
  fi

  DIE_HINT="App/worker berhenti. Bila database sudah berubah: bash deploy/upgrade.sh rollback"
  info "migrasi database (prisma migrate deploy, image $tag)"
  "${C[@]}" run --rm --no-deps migrate 2>&1 | tee "$STATE/migrate.log" ||
    gate_fail "migrasi gagal (database TIDAK berubah untuk migrasi yang gagal: tiap migrasi satu transaksi)"
  grep -q "successfully applied\|No pending migrations" "$STATE/migrate.log" || gate_fail "hasil migrasi tidak dikenali"

  info "pemeriksaan pasca-migrasi"
  if ! post_migrate_checks; then gate_fail "pemeriksaan pasca-migrasi gagal"; fi
  record MIGRATED_AT "$(date -u +%s)"
  cat <<EOF

MIGRASI + PEMERIKSAAN LULUS. App/worker masih berhenti. Berikutnya: bash deploy/upgrade.sh start
EOF
}

gate_fail() {
  cat >&2 <<EOF

GAGAL: $1
App/worker tetap BERHENTI. Jangan menyalakan rilis baru. Kirim $STATE/*.log ke pengembang, lalu kembalikan
produksi lama: bash deploy/upgrade.sh rollback
EOF
  exit 1
}

# Migrasi pertama rilis G-6 (T-036). Pemeriksaan "data lama tetap non-periode" dan check-segments (satu segmen
# legacy per sheet) hanya bermakna untuk upgrade yang MELEWATI G-6: sesudahnya produksi sah punya data per
# periode (versi non-REPLACE, manifest > 1 segmen) dan gerbang itu akan selalu gagal (T-cfd7).
G6_FIRST_MIGRATION=20261019140000_t036_segments
crosses_g6() {
  local old=${OLD_MIGRATION:-}
  [ "$old" != "$G6_FIRST_MIGRATION" ] &&
    [ "$(printf '%s\n%s\n' "$old" "$G6_FIRST_MIGRATION" | LC_ALL=C sort | head -n1)" = "$old" ]
}

post_migrate_checks() {
  # Setiap gerbang memeriksa status keluarnya sendiri: fungsi ini dipanggil dalam konteks if/||, di mana
  # set -e mati — tanpa itu kueri yang error menghasilkan teks kosong dan terbaca "0 baris" (lulus).
  local ok=0 rows
  if crosses_g6; then
    echo "-- check-segments.mjs (T-036, model segmen)"
    if ! "${C[@]}" run --rm --no-deps -T worker node scripts/check-segments.mjs >"$STATE/check-segments.log" 2>&1; then
      ok=1; echo "   GAGAL (exit bukan 0)"
    fi
    sed 's/^/   /' "$STATE/check-segments.log"
  else
    echo "-- check-segments.mjs: dilewati (produksi sudah di G-6: $OLD_MIGRATION)"
  fi
  echo "-- T-gcn8: baris judul per file typed = baris judul sheet yang merujuknya (wajib 0 baris)"
  if rows=$(psql_q <<'SQL'
SELECT t.id FROM "SegmentTyped" t
JOIN "SheetSegment" m ON m."segmentTypedId" = t.id
JOIN "Sheet" s ON s.id = m."sheetId"
WHERE (SELECT count(*) FROM "SheetSegment" m2 WHERE m2."sheetId" = s.id) = 1
  AND t."headerRow" IS DISTINCT FROM s."headerRow"
UNION
SELECT m."segmentTypedId" FROM "SheetSegment" m JOIN "Sheet" s ON s.id = m."sheetId"
GROUP BY m."segmentTypedId" HAVING count(DISTINCT s."headerRow") > 1;
SQL
  ); then
    printf '%s\n' "$rows" >"$STATE/check-gcn8.log"
    if [ -n "$rows" ]; then echo "   $(echo "$rows" | wc -l) file typed tidak cocok"; ok=1; else echo "   0 baris"; fi
  else
    ok=1; echo "   GAGAL: kueri error (gerbang tertutup)"
  fi
  if crosses_g6; then
    echo "-- T-049/T-060: data lama tetap non-periode (wajib 0)"
    if rows=$(sql_count "SELECT (SELECT count(*) FROM \"DatasetVersion\" WHERE mode <> 'REPLACE'
        OR status = 'AWAITING_CONFIRM' OR \"periodGrain\" IS NOT NULL) + (SELECT count(*) FROM \"Segment\"
        WHERE \"periodKey\" IS NOT NULL OR \"groupId\" IS NOT NULL OR cardinality(\"colMap\") > 0);"); then
      echo "   $rows"; [ "$rows" = 0 ] || ok=1
    else
      ok=1; echo "   GAGAL: kueri error (gerbang tertutup)"
    fi
  else
    echo "-- T-049/T-060: dilewati (data per periode sah setelah G-6)"
  fi
  echo "-- quota-report.mjs (T-039; bandingkan dengan kuota-sebelum.txt)"
  if ! "${C[@]}" run --rm --no-deps -T worker node scripts/quota-report.mjs >"$STATE/quota-report.log" 2>&1; then
    ok=1; echo "   GAGAL (exit bukan 0)"
  fi
  cat "$STATE/quota-report.log"
  return $ok
}

# ---------------------------------------------------------------------------------------------------
start() {
  load_state
  [ -n "${MIGRATED_AT:-}" ] || die "migrasi belum lulus (bash deploy/upgrade.sh migrate)"
  not_rolled_back
  local app_host host port tls=() domain rc=0
  info "nyalakan rilis baru (deploy.sh --no-build: up, storage-init, tunggu sehat)"
  # Sekali saja (start pertama yang menyalakan worker baru = awal hitungan GC segmen 24 jam); start ulang
  # tidak menggeser batas rollback cepat.
  [ -n "${STARTED_AT:-}" ] || record STARTED_AT "$(date -u +%s)"
  bash deploy/deploy.sh --no-build || gate_fail "deploy.sh tidak hijau"

  info "verifikasi pasca-deploy"
  app_host=$(envval APP_HOST); host=${app_host%:*}; port=443
  [ "$host" != "$app_host" ] && port=${app_host##*:}
  grep -q '^CADDY_TLS=internal' "$ENV_FILE" && tls=(-k)
  [ -f deploy/certs/root.crt ] && tls=(--cacert deploy/certs/root.crt)
  local curl_=(curl -fsS "${tls[@]}" --resolve "$host:$port:127.0.0.1")
  local health
  health=$("${curl_[@]}" "https://$app_host/api/health") || rc=1
  echo "-- /api/health: ${health:0:200}"
  "${curl_[@]}" -o /dev/null -D "$STATE/login-headers.txt" "https://$app_host/login" || rc=1
  grep -qi '^strict-transport-security' "$STATE/login-headers.txt" && echo "-- /login 200 + HSTS" ||
    { echo "-- /login tanpa HSTS" >&2; rc=1; }
  # Salin ke papan klip (T-045) butuh secure context: APP_URL https (app menolak start bila bukan https).
  grep -q 'APP_URL: https://' docker-compose.prod.yml && echo "-- APP_URL https (secure context)" || rc=1

  echo "-- check-public-presign.mjs (unggah 16 MiB lewat proxy, allowlist storage)"
  local presign=(node deploy/check-public-presign.mjs)
  if [ -f deploy/certs/root.crt ]; then
    "${C[@]}" run --rm --no-deps -T -v "$PWD/deploy/certs/root.crt:/run/root.crt:ro" \
      -e NODE_EXTRA_CA_CERTS=/run/root.crt worker "${presign[@]}" || rc=1
  elif grep -q '^CADDY_TLS=internal' "$ENV_FILE"; then
    "${C[@]}" run --rm --no-deps -T worker "${presign[@]}" --insecure || rc=1
  else
    "${C[@]}" run --rm --no-deps -T worker "${presign[@]}" || rc=1
  fi

  echo "-- admin-restore.mjs dengan email tak dikenal (wajib exit 1, tanpa perubahan)"
  domain=$(envval ALLOWED_EMAIL_DOMAINS); domain=${domain%%,*}
  if "${C[@]}" exec -T app node scripts/admin-restore.mjs "tidak-ada-upgrade@$domain" --confirm >/dev/null 2>&1; then
    echo "   exit 0 — TIDAK diharapkan" >&2; rc=1
  else
    echo "   exit 1 (benar)"
  fi
  if crosses_g6; then
    echo "-- check-segments.mjs setelah start"
    "${C[@]}" run --rm --no-deps -T worker node scripts/check-segments.mjs >/dev/null || rc=1
  fi
  "${C[@]}" ps
  [ $rc = 0 ] || gate_fail "verifikasi pasca-deploy ada yang gagal (lihat di atas)"
  record VERIFIED_AT "$(date -u +%s)"
  cat <<EOF

UPGRADE SELESAI. Uji manual (runbook §7 langkah 6): login, buka dashboard, Lihat data + salin ke Excel,
ekspor PDF, unggah file kecil. Laporan kuota kedua besok setelah pemeriksaan malam 03.00 WIB:
  ${C[*]} run --rm --no-deps worker node scripts/quota-report.mjs
Rollback cepat hanya sampai ± 20 jam setelah start (sesudahnya: restore.sh dari $BACKUP_ARCHIVE).
Setelah backup harian berikutnya terverifikasi: hapus $STATE/db-*.dump (dump database tanpa enkripsi).
EOF
}

# ---------------------------------------------------------------------------------------------------
rollback() {
  load_state
  local now s ans dump2
  now=$(date -u +%s)
  if [ -n "${STARTED_AT:-}" ] && [ $((now - STARTED_AT)) -gt $((20 * 3600)) ] && [ "${ROLLBACK_LATE:-}" != 1 ]; then
    die "rilis baru sudah berjalan $(((now - STARTED_AT) / 3600)) jam: GC segmen (24 jam) bisa sudah menghapus file
yang dirujuk database lama. Pakai restore lengkap (runbook §5) dari $BACKUP_ARCHIVE, atau ROLLBACK_LATE=1."
  fi
  for s in "${SERVICES[@]}"; do
    docker image inspect "dashboard-$s:prev-$STAMP" >/dev/null 2>&1 || die "image dashboard-$s:prev-$STAMP tidak ada"
  done
  [ -s "$STATE/$DB_DUMP" ] || die "dump $STATE/$DB_DUMP tidak ada"
  rollback_target_check
  cat <<EOF
ROLLBACK ke kondisi $STAMP: image dashboard-*:prev-$STAMP, kode lama, database dari $DB_DUMP.
Semua perubahan data SETELAH dump itu (unggahan, dashboard, pengguna baru) hilang dari database; isinya
disimpan dulu ke dump pengaman di $STATE.
EOF
  if [ "${ROLLBACK_YES:-}" != 1 ]; then
    read -r -p "Ketik ROLLBACK untuk lanjut: " ans
    [ "$ans" = ROLLBACK ] || die "dibatalkan"
  fi
  info "hentikan app + worker"
  "${C[@]}" stop app worker

  info "dump pengaman database saat ini"
  dump2=db-sebelum-rollback-$(date -u +%Y%m%dT%H%M%SZ).dump
  "${C[@]}" run --rm --no-deps -T -v "$STATE:/out" backup bash -c \
    '. /usr/local/bin/pgenv.sh && pg_env_from_url "$DATABASE_URL" && umask 077 &&
     pg_dump --format=custom --no-owner --no-privileges --file "/out/$0"' "$dump2" ||
    die "dump pengaman gagal — database belum diubah"

  info "pulihkan database dari $DB_DUMP (satu transaksi: gagal = database tetap seperti sebelum langkah ini)"
  # Tabel + enum skema public dibuang lalu dump lama dimuat, di SATU transaksi. pg_restore --clean tidak
  # cukup: tabel baru (Segment, SheetSegment, …) tidak ada di dump lama dan FK-nya menahan DROP "Sheet".
  cat >"$STATE/rollback-drop.sql" <<'SQL'
SET client_min_messages = warning;
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
    EXECUTE format('DROP TABLE IF EXISTS public.%I CASCADE', r.tablename);
  END LOOP;
  FOR r IN SELECT t.typname FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
           WHERE n.nspname = 'public' AND t.typtype = 'e' LOOP
    EXECUTE format('DROP TYPE IF EXISTS public.%I CASCADE', r.typname);
  END LOOP;
END $$;
SQL
  "${C[@]}" run --rm --no-deps -T -v "$STATE:/in:ro" backup bash -c \
    '. /usr/local/bin/pgenv.sh && pg_env_from_url "$DATABASE_URL" &&
     { cat /in/rollback-drop.sql; pg_restore --no-owner --no-privileges --file - "/in/$0"; } |
     psql -X -q -v ON_ERROR_STOP=1 --single-transaction >/dev/null' "$DB_DUMP" ||
    die "restore database gagal (transaksi dibatalkan, database = rilis baru). App/worker tetap berhenti."
  echo "   migrasi terakhir sekarang: $(echo "SELECT max(migration_name) FROM _prisma_migrations;" | psql_q) (preflight: $OLD_MIGRATION)"

  info "kode lama + image lama"
  tar -xzf "$STATE/kode-lama.tar.gz"
  setenv IMAGE_TAG "prev-$STAMP"
  "${C[@]}" up -d --no-build --wait --wait-timeout 600
  "${C[@]}" up -d --no-deps --force-recreate --wait --wait-timeout 300 proxy backup
  record ROLLED_BACK_AT "$(date -u +%s)"
  cat <<EOF

ROLLBACK SELESAI: produksi memakai image prev-$STAMP dan database dari $DB_DUMP. Cek: bash deploy/deploy.sh --no-build
(health) atau buka aplikasi. Objek storage yang ditulis rilis baru (parquet/<dataset>/seg/…) tertinggal
tanpa rujukan — aman, bisa dibersihkan nanti. Database rilis baru tersimpan di $STATE/$dump2.
EOF
}

# Sebelum membuang apa pun: database tujuan = database preflight, dan setiap tabel public saat ini ada di
# dump atau termasuk tabel baru rilis ini. Selain itu (DATABASE_URL berubah, dump salah) → berhenti.
rollback_target_check() {
  local db cur dumpt extra
  info "periksa database tujuan rollback"
  db=$(echo "SELECT current_database();" | psql_q) && [ -n "$db" ] || die "nama database tidak terbaca"
  [ "$db" = "${OLD_DB:-}" ] || die "database sekarang '$db' ≠ database preflight '${OLD_DB:-?}' (DATABASE_URL berubah?)"
  cur=$(echo "SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY 1;" | psql_q) ||
    die "daftar tabel tidak terbaca"
  dumpt=$("${C[@]}" run --rm --no-deps -T -v "$STATE:/in:ro" backup pg_restore --list "/in/$DB_DUMP" \
    2> >(grep -v '^ Container .* Creat' >&2) | awk '$4 == "TABLE" && $5 == "public" {print $6}') ||
    die "isi dump $DB_DUMP tidak terbaca"
  grep -qx _prisma_migrations <<<"$dumpt" || die "dump $DB_DUMP tanpa _prisma_migrations — bukan dump aplikasi ini"
  extra=$(LC_ALL=C comm -23 <(LC_ALL=C sort -u <<<"$cur") \
    <(printf '%s\n' $dumpt $NEW_TABLES | LC_ALL=C sort -u))
  [ -z "$extra" ] || die "tabel di database yang tidak ada di dump maupun rilis ini: $(echo $extra) — rollback dibatalkan"
  echo "   database $db, $(echo "$cur" | wc -l) tabel ⊆ dump ($(echo "$dumpt" | wc -l)) + tabel baru rilis"
}

main() {
  local cmd=${1:-}
  shift || true
  require_app_dir
  case "$cmd" in
    preflight) preflight ;;
    load) load_images "$@" ;;
    build) build_images ;;
    migrate) migrate ;;
    start) start ;;
    rollback) rollback ;;
    *) sed -n '2,18p' "$0" >&2; exit 1 ;;
  esac
}

# Seluruh skrip dibaca dulu sebelum jalan: rollback mengekstrak kode lama di atas file ini.
main "$@"
exit
