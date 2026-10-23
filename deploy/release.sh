#!/usr/bin/env bash
# Rilis ke produksi dengan SATU perintah dari mesin pemilik (Mac), runbook-deploy §13:
#
#   bash deploy/release.sh            rilis versi package.json (main harus sudah memuat commit rilisnya)
#   bash deploy/release.sh --quick    + pakai backup harian terverifikasi ≤ 26 jam (rilis TANPA migrasi)
#   bash deploy/release.sh --seed susun-dashboard,widget-pivot   + perbarui artikel panduan itu
#
# Urutan (berhenti di langkah pertama yang gagal; produksi baru diubah di langkah 6):
#   1. lokal: branch main bersih = origin/main; tag v<versi> di commit "chore(release): v<versi>"
#      (dibuat + di-push bila belum ada)
#   2. image: build bila belum ada di Docker lokal; arsip ~/dashboard-v<versi>.tar.gz bila belum ada
#   3. kirim arsip + deploy/upgrade.sh rilis ini ke server (/tmp)
#   4. server: preflight dengan kode LAMA (backup + dump database; --quick memakai backup harian)
#   5. sinkron kode: git archive v<versi> → folder aplikasi di server
#   6. server: load → migrate → start (jeda layanan ± 2–5 menit)
#   7. (opsional) seed panduan --update --only <slug>
#
# Satu koneksi SSH dipakai ulang (ControlMaster): password/kunci diminta sekali, tidak ada login berulang
# (fail2ban). Gagal sesudah langkah 6 dimulai: JANGAN ulangi skrip — baca pesan upgrade.sh (rollback =
# ganti IMAGE_TAG ke prev-<stamp>, §11). Kompatibel bash 3.2 (macOS).
# Variabel: SERVER (bawaan olympus), APP_DIR (bawaan /data/docker-data/data-dashboard).
set -euo pipefail

SERVER=${SERVER:-olympus}
APP_DIR=${APP_DIR:-/data/docker-data/data-dashboard}
QUICK=""
SEED=""
while [ $# -gt 0 ]; do
  case $1 in
    --quick) QUICK=1 ;;
    --seed) SEED=${2:?--seed butuh daftar slug, mis. susun-dashboard,widget-pivot}; shift ;;
    *) sed -n '2,24p' "$0" >&2; exit 1 ;;
  esac
  shift
done

die() { echo "GAGAL: $*" >&2; exit 1; }
step() { printf '\n== %s\n' "$*"; }

cd "$(dirname "$0")/.."
ver=$(node -p 'require("./package.json").version')
tag="v$ver"
archive="$HOME/dashboard-$tag.tar.gz"
mkdir -p "$HOME/.ssh"
SSH_OPTS=(-o ControlMaster=auto -o "ControlPath=$HOME/.ssh/cm-dashboard-%r@%h:%p" -o ControlPersist=20m)
rssh() { ssh "${SSH_OPTS[@]}" "$SERVER" "$@"; }

step "1/7 cek lokal ($tag)"
[ "$(git rev-parse --abbrev-ref HEAD)" = main ] || die "jalankan dari branch main (git checkout main)"
[ -z "$(git status --porcelain)" ] || die "ada perubahan lokal yang belum di-commit (git status)"
git fetch -q origin main --tags
[ "$(git rev-parse HEAD)" = "$(git rev-parse origin/main)" ] || die "main lokal beda dengan origin/main (git pull --ff-only origin main)"
if ! git rev-parse -q --verify "refs/tags/$tag" >/dev/null; then
  rel=$(git log --format=%H --grep="^chore(release): $tag\$" -1)
  [ -n "$rel" ] || die "commit \"chore(release): $tag\" tidak ada di main — rilis dulu (aitk release) dan gabungkan PR-nya"
  git tag -a "$tag" -m "$tag" "$rel"
  git push -q origin "$tag"
  echo "   tag $tag dibuat di $(git rev-parse --short "$rel") dan di-push"
else
  echo "   tag $tag sudah ada ($(git rev-parse --short "$tag^{commit}"))"
fi

step "2/7 image $tag"
if docker image inspect "dashboard-app:$tag" >/dev/null 2>&1; then
  echo "   image dashboard-*:$tag sudah ada di Docker lokal"
else
  bash deploy/images.sh build "$tag"
fi
if [ -s "$archive" ]; then
  echo "   arsip $archive sudah ada ($(du -h "$archive" | cut -f1))"
else
  bash deploy/images.sh save "$archive" "$tag"
fi

step "3/7 kirim arsip + upgrade.sh ke $SERVER (password/kunci SSH diminta sekali di sini)"
rssh true || die "tidak bisa masuk ke $SERVER — cek jaringan/VPN (jangan ulangi login berkali-kali)"
scp "${SSH_OPTS[@]}" -q "$archive" "$SERVER:/tmp/dashboard-images.tar.gz"
scp "${SSH_OPTS[@]}" -q deploy/upgrade.sh "$SERVER:/tmp/upgrade.sh"
echo "   terkirim"

step "4/7 preflight di server (kode lama; produksi belum diubah)"
reuse=""
[ -z "$QUICK" ] || reuse="REUSE_BACKUP_HOURS=26"
rssh -t "cd '$APP_DIR' && $reuse bash /tmp/upgrade.sh preflight" ||
  die "preflight gagal — produksi TIDAK diubah; perbaiki sesuai pesan di atas lalu jalankan ulang skrip ini"

step "5/7 sinkron kode $tag ke $APP_DIR"
git archive "$tag" | rssh "tar -x -C '$APP_DIR'"
got=$(rssh "grep -m1 '\"version\"' '$APP_DIR/package.json'")
case $got in *"\"$ver\""*) echo "   package.json di server: $got" ;; *) die "versi di server ($got) ≠ $ver setelah sinkron" ;; esac

step "6/7 load → migrate → start (jeda layanan dimulai)"
rssh -t "cd '$APP_DIR' && bash deploy/upgrade.sh load /tmp/dashboard-images.tar.gz &&
  bash deploy/upgrade.sh migrate && bash deploy/upgrade.sh start" ||
  die "upgrade berhenti — JANGAN ulangi skrip; ikuti pesan upgrade.sh di atas (runbook-deploy §11/§12)"

if [ -n "$SEED" ]; then
  step "7/7 perbarui panduan: $SEED"
  rssh "cd '$APP_DIR' && docker compose --env-file .env.prod -f docker-compose.prod.yml run --rm worker \
    node_modules/.bin/tsx --conditions=react-server scripts/seed-guides.ts --update --only '$SEED'"
else
  step "7/7 panduan: tidak ada yang diperbarui (pakai --seed <slug,…> bila rilis mengubah panduan)"
fi

rm -f "$archive"
printf '\nRILIS %s SELESAI. Cek /health sebagai admin (versi %s). Arsip lokal dihapus.\n' "$tag" "$ver"
