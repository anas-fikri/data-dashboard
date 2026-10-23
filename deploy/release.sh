#!/usr/bin/env bash
# Rilis ke produksi dengan SATU perintah dari mesin pemilik (Mac), runbook-deploy §13:
#
#   bash deploy/release.sh            rilis versi package.json (main harus sudah memuat commit rilisnya)
#   bash deploy/release.sh --quick    + pakai backup harian terverifikasi ≤ 26 jam (ditolak bila rilis bermigrasi)
#   bash deploy/release.sh --seed susun-dashboard,widget-pivot   + perbarui artikel panduan itu
#
# Semua yang dikirim berasal dari TAG v<versi> (bukan HEAD main): image dibangun dari worktree tag, dan
# kode + deploy/upgrade.sh juga dari tag — PR lain yang sudah digabung sesudah rilis tidak ikut.
# Urutan (berhenti di langkah pertama yang gagal; produksi baru berubah di langkah 7):
#   1. lokal: main bersih = origin/main; tag v<versi> di commit "chore(release): v<versi>" (dibuat/di-push)
#   2. image dari tag (dibangun ulang bila belum ada / commit-nya beda); arsip ~/dashboard-v<versi>.tar.gz
#   3. kirim arsip + upgrade.sh tag ke folder sementara baru di server
#   4. server: preflight dengan kode LAMA (backup + dump database; --quick memakai backup harian)
#   5. server: load image (produksi masih image lama)
#   6. sinkron kode tag → folder aplikasi
#   7. server: migrate → start (jeda layanan ± 2–5 menit)
#   8. (opsional) seed panduan --update --only <slug>
# Gagal SETELAH langkah 4 lulus: jangan jalankan ulang skrip (preflight baru akan mengarsipkan kode yang
# mungkin sudah tercampur); pesan galat menyebut perintah lanjutan yang tepat. Satu koneksi SSH dipakai ulang
# (ControlMaster): password/kunci diminta sekali (fail2ban). Kompatibel bash 3.2 (macOS).
# Variabel: SERVER (bawaan olympus), APP_DIR (bawaan /data/docker-data/data-dashboard); FORCE, MIN_FREE_GB,
# BACKUP_EST_GB diteruskan ke preflight server bila diisi (petunjuk galat preflight), mis.
#   BACKUP_EST_GB=8 bash deploy/release.sh
set -euo pipefail

SERVER=${SERVER:-olympus}
APP_DIR=${APP_DIR:-/data/docker-data/data-dashboard}
QUICK=""
SEED=""
while [ $# -gt 0 ]; do
  case $1 in
    --quick) QUICK=1 ;;
    --seed) SEED=${2:?--seed butuh daftar slug, mis. susun-dashboard,widget-pivot}; shift ;;
    *) sed -n '2,25p' "$0" >&2; exit 1 ;;
  esac
  shift
done

die() { printf 'GAGAL: %s\n' "$*" >&2; exit 1; }
step() { printf '\n== %s\n' "$*"; }

case $APP_DIR in *[!A-Za-z0-9/_.-]*) die "APP_DIR hanya boleh huruf, angka, / _ . -" ;; esac
case $SEED in *[!a-z0-9,-]*) die "--seed hanya slug (huruf kecil, angka, -, koma)" ;; esac
# Variabel preflight yang diteruskan ke server (hanya angka: aman disisipkan ke perintah jarak jauh).
fwd=""
for v in FORCE MIN_FREE_GB BACKUP_EST_GB; do
  val=$(eval "printf %s \"\${$v:-}\"")
  [ -n "$val" ] || continue
  case $val in *[!0-9]* | 0?*) die "$v harus angka bulat (tanpa nol di depan)" ;; esac
  fwd="$fwd $v=$val"
done

cd "$(dirname "$0")/.."
ver=$(node -p 'require("./package.json").version')
tag="v$ver"
archive="$HOME/dashboard-$tag.tar.gz"
mkdir -p "$HOME/.ssh"
# %C = hash koneksi: path socket pendek (batas 104 byte di macOS), multiplexing tidak mati diam-diam.
SSH_OPTS=(-o ControlMaster=auto -o "ControlPath=$HOME/.ssh/cm-dash-%C" -o ControlPersist=20m)
rssh() { ssh "${SSH_OPTS[@]}" "$SERVER" "$@"; }

step "1/8 cek lokal ($tag)"
[ "$(git rev-parse --abbrev-ref HEAD)" = main ] || die "jalankan dari branch main (git checkout main)"
[ -z "$(git status --porcelain)" ] || die "ada perubahan lokal yang belum di-commit (git status)"
git fetch -q origin main || die "git fetch origin main gagal (jaringan?)"
git fetch -q origin --tags || die "git fetch --tags gagal — tag lokal bentrok dengan origin? (git tag -d <tag>)"
[ "$(git rev-parse HEAD)" = "$(git rev-parse origin/main)" ] || die "main lokal beda dengan origin/main (git pull --ff-only origin main)"
if ! git rev-parse -q --verify "refs/tags/$tag" >/dev/null; then
  rel=$(git log --format=%H --grep="^chore(release): $tag\$" -1)
  [ -n "$rel" ] || die "commit \"chore(release): $tag\" tidak ada di main — rilis dulu (aitk release) dan gabungkan PR-nya"
  git tag -a "$tag" -m "$tag" "$rel"
  echo "   tag $tag dibuat di $(git rev-parse --short "$rel")"
fi
if [ -z "$(git ls-remote --tags origin "refs/tags/$tag")" ]; then
  git push -q origin "$tag" || die "push tag $tag gagal"
  echo "   tag $tag di-push"
fi
tagc=$(git rev-parse "$tag^{commit}")
git merge-base --is-ancestor "$tagc" HEAD || die "tag $tag ($tagc) bukan bagian dari main"
echo "   tag $tag = $(git rev-parse --short "$tagc")"
[ "$(git show "$tag:package.json" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s).version))')" = "$ver" ] ||
  die "package.json di tag $tag bukan versi $ver — tag salah tempat (git tag -d $tag, lalu ulangi)"
# Migrasi terakhir rilis ini: preflight server hanya memakai backup harian (--quick) bila sama dengan
# migrasi terakhir database produksi (rilis tanpa migrasi).
expect=$(git ls-tree --name-only "$tag:prisma/migrations" | grep -v '\.toml$' | sort | tail -n1)
case $expect in "" | *[!0-9a-z_]*) die "migrasi terakhir di tag $tag tidak terbaca" ;; esac
if [ -n "$QUICK" ]; then
  prev=$(git describe --tags --abbrev=0 "$tag^" 2>/dev/null || true)
  if [ -n "$prev" ] && [ -n "$(git diff --name-only "$prev" "$tag" -- prisma/migrations)" ]; then
    die "rilis $tag berisi migrasi database (sejak $prev) — jalankan tanpa --quick (backup lengkap)"
  fi
fi

step "2/8 image $tag dari tag"
IMAGES="app worker renderer backup"
# Commit pendek di image (APP_COMMIT, app + worker) harus awalan commit tag; keempat image harus ada.
commit_of() {
  docker image inspect -f '{{range .Config.Env}}{{println .}}{{end}}' "dashboard-$1:$tag" 2>/dev/null |
    sed -n 's/^APP_COMMIT=//p' | head -n1 || true
}
have=1
for s in $IMAGES; do docker image inspect "dashboard-$s:$tag" >/dev/null 2>&1 || have=""; done
for s in app worker; do
  c=$(commit_of "$s")
  [ ${#c} -ge 7 ] || have=""
  case $tagc in "$c"*) ;; *) have="" ;; esac
done
if [ -n "$have" ]; then
  echo "   image dashboard-*:$tag sudah ada (commit $(git rev-parse --short "$tagc"))"
else
  # Tag lama dilepas dulu: build yang gagal di tengah tidak meninggalkan campuran image commit lain.
  for s in $IMAGES; do docker image rm "dashboard-$s:$tag" >/dev/null 2>&1 || true; done
  wtp=$(mktemp -d)
  wt="$wtp/rilis-$tag"
  git worktree add -q --detach "$wt" "$tag"
  (cd "$wt" && bash deploy/images.sh build "$tag") || {
    git worktree remove --force "$wt"; rm -rf "$wtp"; die "build image gagal"
  }
  git worktree remove --force "$wt"
  rm -rf "$wtp"
fi
# Arsip dipakai ulang hanya bila dibuat dari image yang sama persis (ID keempat image dicatat di .ids).
ids=$(for s in $IMAGES; do docker image inspect -f '{{.Id}}' "dashboard-$s:$tag"; done)
if [ -s "$archive" ] && [ "$(cat "$archive.ids" 2>/dev/null)" = "$ids" ] && gzip -t "$archive" 2>/dev/null; then
  echo "   arsip $archive sudah ada ($(du -h "$archive" | cut -f1))"
else
  rm -f "$archive" "$archive.ids"
  bash deploy/images.sh save "$archive" "$tag"
  printf '%s\n' "$ids" >"$archive.ids"
fi

step "3/8 kirim arsip + upgrade.sh ke $SERVER (password/kunci SSH diminta sekali di sini)"
rssh true || die "tidak bisa masuk ke $SERVER — cek jaringan/VPN (jangan ulangi login berkali-kali)"
rdir=$(rssh 'mktemp -d /tmp/dashboard-rilis.XXXXXX') || die "folder sementara di server gagal dibuat"
case $rdir in /tmp/dashboard-rilis.[A-Za-z0-9][A-Za-z0-9][A-Za-z0-9][A-Za-z0-9][A-Za-z0-9][A-Za-z0-9]) ;;
  *) die "folder sementara di server tidak terduga: $rdir" ;;
esac
git show "$tag:deploy/upgrade.sh" >"$HOME/.dashboard-upgrade-$tag.sh"
scp "${SSH_OPTS[@]}" -q "$archive" "$SERVER:$rdir/images.tar.gz" || die "kirim arsip gagal (produksi tidak diubah)"
scp "${SSH_OPTS[@]}" -q "$HOME/.dashboard-upgrade-$tag.sh" "$SERVER:$rdir/upgrade.sh" || die "kirim upgrade.sh gagal"
rm -f "$HOME/.dashboard-upgrade-$tag.sh"
echo "   terkirim ke $SERVER:$rdir"

step "4/8 preflight di server (kode lama; produksi belum diubah)"
reuse=""
[ -z "$QUICK" ] || reuse="REUSE_BACKUP_HOURS=26"
rssh -t "cd $APP_DIR && $reuse EXPECT_MIGRATION=$expect$fwd bash $rdir/upgrade.sh preflight" ||
  die "preflight gagal — produksi TIDAK diubah; perbaiki sesuai pesan di atas lalu jalankan ulang skrip ini"

# Mulai di sini skrip tidak boleh dijalankan ulang: setiap galat menyebut lanjutan yang tepat.
cont() { printf '\nLanjutkan manual (JANGAN jalankan ulang skrip):\n%s\n' "$*" >&2; }

step "5/8 muat image $tag di server (produksi masih image lama)"
if ! rssh -t "cd $APP_DIR && bash $rdir/upgrade.sh load $rdir/images.tar.gz"; then
  cont "  produksi masih berjalan dengan image + kode lama. Perbaiki penyebab (lihat di atas), lalu di server:
    cd $APP_DIR && bash $rdir/upgrade.sh load $rdir/images.tar.gz
  lalu dari Mac:  git archive $tag | ssh $SERVER 'tar -x -C $APP_DIR'
  lalu di server: bash deploy/upgrade.sh migrate && bash deploy/upgrade.sh start"
  die "load image gagal"
fi

step "6/8 sinkron kode $tag ke $APP_DIR"
if ! git archive "$tag" | rssh "tar -x -C $APP_DIR"; then
  cont "  produksi masih berjalan dengan image lama; kode di server mungkin sebagian baru. Dari Mac ulangi HANYA:
    git archive $tag | ssh $SERVER 'tar -x -C $APP_DIR'
  lalu di server: cd $APP_DIR && bash deploy/upgrade.sh migrate && bash deploy/upgrade.sh start"
  die "sinkron kode gagal"
fi
got=$(rssh "grep -m1 '\"version\"' $APP_DIR/package.json" || true)
case $got in
  *"\"$ver\""*) echo "   package.json di server: $got" ;;
  *) cont "  periksa $APP_DIR/package.json di server, ulangi: git archive $tag | ssh $SERVER 'tar -x -C $APP_DIR'
  lalu: bash deploy/upgrade.sh migrate && bash deploy/upgrade.sh start"
     die "versi di server ($got) ≠ $ver setelah sinkron" ;;
esac

step "7/8 migrate → start (jeda layanan dimulai)"
if ! rssh -t "cd $APP_DIR && bash deploy/upgrade.sh migrate && bash deploy/upgrade.sh start"; then
  cont "  ikuti pesan upgrade.sh di atas: migrate/start bisa diulang di server
    (cd $APP_DIR && bash deploy/upgrade.sh migrate && bash deploy/upgrade.sh start);
  rollback rilis tanpa migrasi = ganti IMAGE_TAG ke prev-<stamp> (runbook §11); Redis rusak = §12."
  die "upgrade berhenti"
fi

if [ -n "$SEED" ]; then
  step "8/8 perbarui panduan: $SEED"
  rssh "cd $APP_DIR && docker compose --env-file .env.prod -f docker-compose.prod.yml run --rm worker \
    node_modules/.bin/tsx --conditions=react-server scripts/seed-guides.ts --update --only $SEED" ||
    die "RILIS $tag SUDAH TERPASANG, hanya seed panduan yang gagal — ulangi perintah seed (runbook 'Isi panduan')"
else
  step "8/8 panduan: tidak ada yang diperbarui (pakai --seed <slug,…> bila rilis mengubah panduan)"
fi

rssh "rm -rf $rdir" || true
rm -f "$archive" "$archive.ids"
printf '\nRILIS %s SELESAI. Cek /health sebagai admin (versi %s).\n' "$tag" "$ver"
