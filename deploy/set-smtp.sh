#!/usr/bin/env bash
# Isi SMTP di .env.prod tanpa password lewat chat/riwayat shell (T-023): password diketik tersembunyi,
# di-URL-encode, ditulis ke SMTP_URL (smtps, port 465 SSL/TLS). Lalu jalankan deploy/deploy.sh lagi.
#   bash deploy/set-smtp.sh <email-pengirim> [host]     (host bawaan: mail.<domain email>)
set -euo pipefail
cd "$(dirname "$0")/.."
user=${1:?pakai: set-smtp.sh <email-pengirim> [host]}
host=${2:-mail.${user#*@}}
read -r -s -p "Password email $user: " pw
echo
[ -n "$pw" ] || { echo "password kosong" >&2; exit 1; }
SMTP_USER="$user" SMTP_PW="$pw" SMTP_HOST="$host" python3 - <<'PY'
import os, re, urllib.parse

def q(s):
    return urllib.parse.quote(s, safe="")

env = os.environ
url = "smtps://%s:%s@%s:465" % (q(env["SMTP_USER"]), q(env["SMTP_PW"]), env["SMTP_HOST"])
values = {"SMTP_URL": url, "MAIL_FROM": "Data Dashboard <%s>" % env["SMTP_USER"]}
p = ".env.prod"
s = open(p).read()
for key, val in values.items():
    s, n = re.subn(r"^%s=.*$" % key, lambda _m, k=key, v=val: "%s=%s" % (k, v), s, flags=re.M)
    if not n:
        s += "\n%s=%s\n" % (key, val)
open(p, "w").write(s)
PY
echo "SMTP diisi untuk $user via $host:465 (SSL/TLS). Jalankan: deploy/deploy.sh"
