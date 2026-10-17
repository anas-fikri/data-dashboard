#!/usr/bin/env bash
# Sidik isi deploy (T-023, untuk latihan restore): jumlah baris per tabel aplikasi + hash daftar objek
# storage (ukuran + path). Dijalankan di service backup; tanpa kredensial di argumen proses (pgenv.sh).
set -euo pipefail
# shellcheck source=deploy/pgenv.sh
. /usr/local/bin/pgenv.sh
pg_env_from_url "$DATABASE_URL"
local_s3_env
rows=$(psql -tA -v ON_ERROR_STOP=1 <<'SQL'
SELECT string_agg(format('%s=%s', table_name,
  (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from %I', table_name), false, true, '')))[1]::text),
  ' ' ORDER BY table_name)
FROM information_schema.tables
WHERE table_schema = 'public' AND table_name NOT LIKE '\_prisma%';
SQL
)
objects=$(rclone lsf -R --files-only --format sp "locals3:$S3_BUCKET" | sort | sha256sum | cut -c1-16)
echo "rows: $rows"
echo "objects: $objects"
