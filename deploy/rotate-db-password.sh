#!/usr/bin/env bash
# Rotasi password role PostgreSQL aplikasi TANPA sudo (T-023): role mengganti password miliknya sendiri
# (ALTER ROLE CURRENT_USER) lewat koneksi yang ada; password baru dibuat di sini, dikirim sebagai SQL
# lewat stdin (bukan argumen), lalu POSTGRES_PASSWORD + DATABASE_URL di .env.prod diganti dan service
# yang memakainya dibuat ulang. Tidak mencetak password.
#   bash deploy/rotate-db-password.sh
set -euo pipefail
cd "$(dirname "$0")/.."
C=(docker compose --env-file .env.prod -f docker-compose.prod.yml)
COMPOSE_PROFILES=$(grep '^COMPOSE_PROFILES=' .env.prod | cut -d= -f2- || true)
export COMPOSE_PROFILES
# Format dicek SEBELUM ALTER ROLE: password baru yang tidak tersimpan = app terkunci dari DB.
[ "$(grep -c '^DATABASE_URL=' .env.prod)" = 1 ] && grep -qE '^DATABASE_URL=postgres(ql)?://[^:/@]+:[^@]*@' .env.prod ||
  { echo "DATABASE_URL tidak berformat postgresql://user:pass@host — ubah manual" >&2; exit 1; }
new=$(head -c 48 /dev/urandom | base64 | tr -dc 'A-Za-z0-9' | head -c 32)
printf "ALTER ROLE CURRENT_USER WITH PASSWORD '%s';\n" "$new" |
  "${C[@]}" exec -T backup bash -c '. /usr/local/bin/pgenv.sh; pg_env_from_url "$DATABASE_URL"; psql -v ON_ERROR_STOP=1 -q'
NEW="$new" python3 - <<'PY'
import os, re
p = ".env.prod"
s = open(p).read()
new = os.environ["NEW"]
s = re.sub(r"^POSTGRES_PASSWORD=.*$", lambda _m: f"POSTGRES_PASSWORD={new}", s, flags=re.M)
s, n = re.subn(r"^(DATABASE_URL=postgres(?:ql)?://[^:/@]+:)[^@]*(@.*)$", lambda m: f"{m.group(1)}{new}{m.group(2)}", s, flags=re.M)
if n != 1:
    raise SystemExit("DATABASE_URL tidak berformat postgresql://user:pass@host — ubah manual")
open(p, "w").write(s)
PY
"${C[@]}" up -d --no-build --wait --wait-timeout 600 app worker backup
echo "password PostgreSQL dirotasi; app/worker/backup memakai password baru"
