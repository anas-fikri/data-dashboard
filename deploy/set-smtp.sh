#!/usr/bin/env bash
# Isi SMTP di .env.prod tanpa password lewat chat/riwayat shell (T-023): password diketik tersembunyi,
# di-URL-encode, ditulis ke SMTP_URL (smtps, port 465 SSL/TLS). Lalu jalankan deploy/deploy.sh lagi.
#   bash deploy/set-smtp.sh [email-pengirim] [host]
set -euo pipefail
cd "$(dirname "$0")/.."
user=${1:-no-reply@pcpexpress.com}
host=${2:-mail.pcpexpress.com}
read -r -s -p "Password email $user: " pw
echo
[ -n "$pw" ] || { echo "password kosong" >&2; exit 1; }
url=$(SMTP_USER="$user" SMTP_PW="$pw" SMTP_HOST="$host" python3 -c '
import os, urllib.parse as u
q = lambda s: u.quote(s, safe="")
print(f"smtps://{q(os.environ[\"SMTP_USER\"])}:{q(os.environ[\"SMTP_PW\"])}@{os.environ[\"SMTP_HOST\"]}:465")')
SMTP_URL_NEW="$url" MAIL_FROM_NEW="Data Dashboard <$user>" python3 - <<'PY'
import os, re
p = ".env.prod"
s = open(p).read()
for key, val in (("SMTP_URL", os.environ["SMTP_URL_NEW"]), ("MAIL_FROM", os.environ["MAIL_FROM_NEW"])):
    s, n = re.subn(rf"^{key}=.*$", lambda _m: f"{key}={val}", s, flags=re.M)
    if not n:
        s += f"\n{key}={val}\n"
open(p, "w").write(s)
PY
echo "SMTP diisi untuk $user via $host:465 (SSL/TLS). Jalankan: deploy/deploy.sh"
