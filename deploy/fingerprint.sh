#!/usr/bin/env bash
# Sidik isi deploy (T-023, untuk latihan restore): per tabel aplikasi jumlah baris + md5 isi (baris
# diurutkan, format teks dipatok agar PG host dan PG container sama) + hash daftar objek storage
# (ukuran + path; ETag tidak dipakai karena berubah bila rclone memecah unggahan berbeda). Dijalankan
# di service backup; tanpa kredensial di argumen proses (pgenv.sh).
set -euo pipefail
# shellcheck source=deploy/pgenv.sh
. /usr/local/bin/pgenv.sh
pg_env_from_url "$DATABASE_URL"
local_s3_env
rows=$(psql -tA -q -v ON_ERROR_STOP=1 <<'SQL'
SET TimeZone = 'UTC'; SET DateStyle = 'ISO, YMD'; SET IntervalStyle = 'postgres';
SET extra_float_digits = 1; SET bytea_output = 'hex';
SELECT string_agg(format('%s=%s', table_name,
  (xpath('/row/c/text()', query_to_xml(format(
    $q$select count(*) || ':' || left(coalesce(md5(string_agg(t::text, E'\n' ORDER BY t::text)), '-'), 12) as c from %I t$q$,
    table_name), false, true, '')))[1]::text),
  ' ' ORDER BY table_name)
FROM information_schema.tables
WHERE table_schema = 'public' AND table_name NOT LIKE '\_prisma%';
SQL
)
objects=$(rclone lsf -R --files-only --format sp "locals3:$S3_BUCKET" | sort | sha256sum | cut -c1-16)
echo "rows: $rows"
echo "objects: $objects"
