#!/usr/bin/env bash
# Rilis dengan SATU perintah langsung di server (tanpa Mac, tanpa git), runbook-deploy §14:
#
#   cd /data/docker-data/data-dashboard
#   bash deploy/server-release.sh 1.7.0          rilis v1.7.0 (backup harian ≤ 26 jam dipakai bila tanpa migrasi)
#   bash deploy/server-release.sh 1.7.0 --full   paksa backup lengkap baru
#
# Urutan (berhenti di langkah pertama yang gagal; produksi baru berubah di langkah 5):
#   1. unduh arsip kode rilis dari GitHub: tag v<versi>, atau main bila tag belum ada (versi wajib sama)
#   2. preflight dengan kode LAMA (backup + dump DB + catat image untuk rollback) — upgrade.sh versi rilis
#   3. sinkron kode rilis ke folder ini (.env.prod, sertifikat, data tidak tersentuh)
#   4. build image di VM (± 15–20 menit; produksi tetap jalan dengan image lama)
#   5. migrate → start (jeda layanan ± 2–5 menit) + verifikasi
# Variabel: REPO (bawaan anas-fikri/data-dashboard), FORCE / MIN_FREE_GB / BACKUP_EST_GB diteruskan ke preflight.
# ARCHIVE=/path/kode.tar.gz: server tanpa akses github.com — pakai arsip kode yang disalin dari Mac
# (curl -L https://github.com/<repo>/archive/refs/heads/main.tar.gz -o kode.tar.gz; scp ke server).
set -euo pipefail

REPO=${REPO:-anas-fikri/data-dashboard}
ver=${1:-}
full=${2:-}
die() { printf '\nGAGAL: %s\n' "$*" >&2; exit 1; }
step() { printf '\n== %s\n' "$*"; }

[[ "$ver" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || { sed -n '2,13p' "$0" >&2; exit 1; }
[ -z "$full" ] || [ "$full" = --full ] || die "argumen kedua hanya --full"
[[ "$REPO" =~ ^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$ ]] || die "REPO tidak valid"
[ -f .env.prod ] && [ -f docker-compose.prod.yml ] || die "jalankan dari folder aplikasi (berisi .env.prod)"
command -v curl >/dev/null && command -v tar >/dev/null || die "butuh curl dan tar"

work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT

ref="refs/tags/v$ver"
if [ -n "${ARCHIVE:-}" ]; then
  step "1/5 kode v$ver dari arsip lokal $ARCHIVE"
  [ -f "$ARCHIVE" ] || die "ARCHIVE $ARCHIVE tidak ada"
  cp "$ARCHIVE" "$work/src.tar.gz"
  ref="arsip lokal"
elif ! { step "1/5 unduh kode v$ver dari github.com/$REPO"; curl -fsSL --connect-timeout 15 "https://github.com/$REPO/archive/$ref.tar.gz" -o "$work/src.tar.gz"; }; then
  echo "   tag v$ver belum ada — memakai main (buat tag dari Mac nanti agar riwayat rilis rapi)"
  ref="refs/heads/main"
  curl -fsSL --connect-timeout 15 "https://github.com/$REPO/archive/$ref.tar.gz" -o "$work/src.tar.gz" ||
    die "unduh gagal (server tidak bisa ke github.com?) — salin arsip dari Mac lalu: ARCHIVE=/tmp/kode.tar.gz bash deploy/server-release.sh $ver"
fi
mkdir "$work/src"
tar -xzf "$work/src.tar.gz" -C "$work/src" --strip-components=1
got=$(sed -n 's/^  "version": *"\([^"]*\)".*/\1/p' "$work/src/package.json" | head -1)
[ "$got" = "$ver" ] ||
  die "kode di $ref berversi $got, bukan $ver — PR rilisnya sudah di-merge ke main?"
commit=$([ -n "${ARCHIVE:-}" ] || curl -fsSL --connect-timeout 10 "https://api.github.com/repos/$REPO/commits/${ref#refs/*/}" 2>/dev/null |
  sed -n 's/^  "sha": "\([0-9a-f]\{7\}\).*/\1/p' | head -1 || true)
echo "   versi $got (${ref#refs/}${commit:+, commit $commit})"
cur=$(sed -n 's/^  "version": *"\([^"]*\)".*/\1/p' package.json | head -1)
[ "$cur" != "$ver" ] || die "folder ini sudah berversi $ver — rilis sudah dijalankan?"

# Migrasi terakhir rilis: preflight hanya memakai backup harian bila sama dengan migrasi terakhir produksi.
expect=$(ls "$work/src/prisma/migrations" | grep -v '\.toml$' | sort | tail -n1)
[[ "$expect" =~ ^[0-9a-z_]+$ ]] || die "migrasi terakhir rilis tidak terbaca"
reuse=""
[ -n "$full" ] || reuse=26

step "2/5 preflight dengan kode lama (backup dulu; produksi belum diubah)"
REUSE_BACKUP_HOURS=$reuse EXPECT_MIGRATION=$expect bash "$work/src/deploy/upgrade.sh" preflight ||
  die "preflight gagal — produksi TIDAK berubah. Perbaiki sesuai pesan di atas lalu ulangi perintah ini."

step "3/5 sinkron kode v$ver ke $(pwd)"
tar -xzf "$work/src.tar.gz" -C . --strip-components=1 ||
  die "sinkron kode gagal — produksi masih image lama. Ulangi perintah ini (preflight dibuat ulang)."
grep -q "\"version\": \"$ver\"" package.json || die "package.json setelah sinkron bukan $ver"

step "4/5 build image v$ver di VM (± 15–20 menit, produksi tetap jalan)"
APP_COMMIT=$commit bash deploy/upgrade.sh build ||
  die "build gagal — produksi masih image lama. Ulangi HANYA: bash deploy/upgrade.sh build && bash deploy/upgrade.sh migrate && bash deploy/upgrade.sh start"

step "5/5 migrate → start (jeda layanan dimulai)"
bash deploy/upgrade.sh migrate || die "migrate berhenti — ikuti pesan upgrade.sh di atas (rollback: bash deploy/upgrade.sh rollback)"
bash deploy/upgrade.sh start || die "start/verifikasi berhenti — ikuti pesan upgrade.sh di atas"

printf '\nRILIS v%s SELESAI. Muat ulang browser (Ctrl+Shift+R) dan cek versi di footer.\n' "$ver"
