#!/usr/bin/env bash
# Sertifikat TLS untuk akses LAN lewat IP (T-023, pengganti CA internal Caddy — review F5):
# root CA milik perusahaan dengan NAME CONSTRAINTS (hanya IP server ini), kunci root OFFLINE di mesin
# admin. Server hanya memegang kunci leaf; bila server dibobol, penyerang tetap tidak bisa membuat
# sertifikat untuk situs/IP lain yang dipercaya komputer pengguna.
#   1. mesin admin: deploy/lan-cert.sh root <folder-kunci> <ip>            → <folder>/dashboard-lan-root.{key,crt}
#   2. server     : deploy/lan-cert.sh csr <ip> > leaf.csr                 → deploy/certs/privkey.pem (kunci tetap di server)
#   3. mesin admin: deploy/lan-cert.sh sign <folder-kunci> leaf.csr <ip> > fullchain.pem  (825 hari)
#   4. server     : salin fullchain.pem ke deploy/certs/, CADDY_TLS="/certs/fullchain.pem /certs/privkey.pem"
# Root (dashboard-lan-root.crt) dipasang sekali di komputer pengguna (GPO). Perpanjangan: ulangi 2–4.
set -euo pipefail
OPENSSL=${OPENSSL:-openssl}
mode=${1:?pakai: lan-cert.sh root|csr|sign …}

case "$mode" in
  root)
    dir=${2:?folder kunci}
    ip=${3:?ip}
    umask 077
    [ -e "$dir/dashboard-lan-root.key" ] && { echo "$dir/dashboard-lan-root.key sudah ada" >&2; exit 1; }
    "$OPENSSL" req -x509 -new -newkey ec -pkeyopt ec_paramgen_curve:prime256v1 -nodes -sha256 -days 3650 \
      -keyout "$dir/dashboard-lan-root.key" -out "$dir/dashboard-lan-root.crt" \
      -subj "/O=PCP Express/CN=PCP Express Data Dashboard LAN Root ($ip)" \
      -addext "basicConstraints=critical,CA:TRUE,pathlen:0" \
      -addext "keyUsage=critical,keyCertSign,cRLSign" \
      -addext "nameConstraints=critical,permitted;IP:$ip/255.255.255.255"
    echo "root CA: $dir/dashboard-lan-root.crt (kunci privat: $dir/dashboard-lan-root.key — simpan offline)"
    ;;
  csr)
    ip=${2:?ip}
    cd "$(dirname "$0")/.."
    umask 077
    mkdir -p deploy/certs
    "$OPENSSL" req -new -newkey ec -pkeyopt ec_paramgen_curve:prime256v1 -nodes -sha256 \
      -keyout deploy/certs/privkey.pem -subj "/CN=$ip"
    ;;
  sign)
    dir=${2:?folder kunci}
    csr=${3:?berkas csr}
    ip=${4:?ip}
    ext=$(mktemp)
    trap 'rm -f "$ext"' EXIT
    printf 'basicConstraints=critical,CA:FALSE\nkeyUsage=critical,digitalSignature\nextendedKeyUsage=serverAuth\nsubjectAltName=IP:%s\n' "$ip" >"$ext"
    "$OPENSSL" x509 -req -in "$csr" -CA "$dir/dashboard-lan-root.crt" -CAkey "$dir/dashboard-lan-root.key" \
      -CAcreateserial -CAserial "$dir/dashboard-lan-root.srl" -days 825 -sha256 -extfile "$ext"
    ;;
  *)
    echo "mode tidak dikenal: $mode" >&2
    exit 1
    ;;
esac
