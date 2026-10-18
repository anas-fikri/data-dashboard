#!/usr/bin/env bash
# T-y3y1: konversi database produksi data_dashboard di PostgreSQL host dari SQL_ASCII ke UTF8 (C.UTF-8).
# Sekali, oleh operator dengan sudo, dari folder aplikasi, di dalam tmux (SSH putus tidak memotong langkah tengah;
# downtime ± 1–3 menit):
#   tmux new -s utf8 'sudo bash deploy/convert-db-utf8.sh; read -p "Enter untuk menutup"'
# Langkah: hentikan app/worker/backup → sidik isi (fingerprint.sh) → pg_dump format custom → ganti nama DB lama
# menjadi data_dashboard_sqlascii_<UTC> (DISIMPAN, tidak dihapus) → CREATE DATABASE UTF8 C.UTF-8 template0 →
# pg_restore (pemilik objek tetap) → sidik ulang wajib sama → layanan dinyalakan → /api/health.
# Gagal/dihentikan (Ctrl-C, SSH putus) sebelum sidik cocok → DB baru dibuang hanya bila DB lama masih ada di
# nama cadangannya, nama DB lama dikembalikan, layanan dinyalakan lagi hanya bila $DB kembali SQL_ASCII; selain
# itu layanan dibiarkan mati dan langkah pulih manual dicetak.
# DB lama dan dump dihapus manual oleh operator setelah beberapa hari normal:
#   sudo -u postgres dropdb <nama-lama>; sudo rm /var/tmp/data_dashboard-<UTC>.dump
# Kait uji (hanya untuk latihan di cluster tiruan): PGRUN (awalan perintah postgres, bawaan "sudo -u postgres"),
# COMPOSE_CMD (bawaan docker compose produksi), FP_CMD (bawaan fingerprint.sh di service backup),
# HEALTH_URL (kosong = lewati cek health), DUMP_DIR (bawaan /var/tmp).
set -euo pipefail
# Dump berisi email, hash password/token, dan audit: hanya pemilik (postgres) yang boleh membaca (sudo memakai
# umask yang lebih ketat dari dua sisi).
umask 077
cd "$(dirname "$0")/.."
read -r -a PG <<<"${PGRUN:-sudo -u postgres}"
read -r -a C <<<"${COMPOSE_CMD:-docker compose --env-file .env.prod -f docker-compose.prod.yml}"
DB=data_dashboard
stamp=$(date -u +%Y%m%dT%H%M%SZ)
old="${DB}_sqlascii_$(date -u +%Y%m%d%H%M%S)"
dump="${DUMP_DIR:-/var/tmp}/$DB-$stamp.dump"
fingerprint() {
  if [ -n "${FP_CMD:-}" ]; then bash -c "$FP_CMD"; else "${C[@]}" run --rm -T --no-deps backup bash /usr/local/bin/fingerprint.sh; fi
}
q() { "${PG[@]}" psql -X -v ON_ERROR_STOP=1 -qtA "$@"; }

enc=$(q -c "SELECT pg_encoding_to_char(encoding) FROM pg_database WHERE datname = '$DB'")
[ -n "$enc" ] || { echo "database $DB tidak ada" >&2; exit 1; }
[ "$enc" = SQL_ASCII ] || { echo "database $DB sudah $enc — tidak ada yang dikonversi"; exit 0; }

# pg_restore dari dump SQL_ASCII TIDAK memvalidasi byte (client_encoding SQL_ASCII = tanpa konversi), jadi byte
# bukan UTF-8 akan ikut masuk ke database UTF8 secara diam-diam (terbukti di latihan). Cek setiap baris lebih dulu,
# sebelum layanan dihentikan: baris rusak → berhenti tanpa downtime, tabel + jumlah baris dilaporkan.
echo "0/7 cek semua baris berisi UTF-8 valid"
bad=$(q -d "$DB" <<'SQL'
CREATE FUNCTION pg_temp.ok_utf8(b bytea) RETURNS boolean LANGUAGE plpgsql IMMUTABLE AS $f$
BEGIN PERFORM convert_from(b, 'UTF8'); RETURN true; EXCEPTION WHEN OTHERS THEN RETURN false; END $f$;
SELECT coalesce(string_agg(format('%s:%s', table_name, n), ' '), '') FROM (
  SELECT table_name, (xpath('/row/n/text()', query_to_xml(format(
    $q$SELECT count(*) AS n FROM %I t WHERE NOT pg_temp.ok_utf8(convert_to(t::text, 'SQL_ASCII'))$q$, table_name),
    false, true, '')))[1]::text::bigint AS n
  FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE') x
WHERE n > 0;
SQL
)
if [ -n "$bad" ]; then
  echo "ada baris dengan byte bukan UTF-8 (tabel:jumlah) — perbaiki dulu, tidak ada yang diubah: $bad" >&2
  exit 1
fi

ok=0
stopped=0
renamed=0
restore_old() {
  [ "$ok" = 1 ] && return
  set +e
  echo "GAGAL — mengembalikan database lama ($old → $DB)" >&2
  if [ "$renamed" = 1 ]; then
    # DB baru hanya dibuang bila DB asli masih utuh di nama cadangannya (pemanggilan ganda tidak menghapusnya).
    if [ "$(q -c "SELECT 1 FROM pg_database WHERE datname = '$old'")" = 1 ] &&
      q -c "DROP DATABASE IF EXISTS $DB WITH (FORCE)" && q -c "ALTER DATABASE $old RENAME TO $DB"; then
      renamed=0
    fi
  fi
  if [ "$renamed" = 1 ] || [ "$(q -c "SELECT pg_encoding_to_char(encoding) FROM pg_database WHERE datname = '$DB'")" != SQL_ASCII ]; then
    echo "PULIH MANUAL: layanan TIDAK dinyalakan. Pastikan $DB = database asli (SQL_ASCII; cadangan $old," >&2
    echo "  dump $dump), lalu: ${C[*]} up -d app worker backup" >&2
    return
  fi
  [ "$stopped" = 1 ] && "${C[@]}" up -d app worker backup
  echo "database lama dipulihkan, layanan dinyalakan; tidak ada yang berubah" >&2
}
trap restore_old EXIT
trap 'exit 130' INT TERM HUP

echo "1/7 hentikan app, worker, backup (downtime mulai $(date -u +%T) UTC)"
stopped=1
"${C[@]}" stop app worker backup
# Sidik sesudah berhenti: tulisan pengguna/worker di masa tenggang stop tidak membuat sidik palsu berbeda.
echo "2/7 sidik isi sebelum konversi"
before=$(fingerprint)

echo "3/7 pg_dump → $dump"
"${PG[@]}" pg_dump -Fc -d "$DB" -f "$dump"
echo "4/7 ganti nama $DB → $old, buat $DB UTF8 (C.UTF-8)"
owner=$(q -c "SELECT pg_get_userbyid(datdba) FROM pg_database WHERE datname = '$DB'")
q <<SQL
SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '$DB' AND pid <> pg_backend_pid();
ALTER DATABASE $DB RENAME TO $old;
SQL
renamed=1
q -v owner="$owner" <<SQL
CREATE DATABASE $DB OWNER :"owner" ENCODING 'UTF8' LC_COLLATE 'C.UTF-8' LC_CTYPE 'C.UTF-8' TEMPLATE template0;
SQL
echo "5/7 pg_restore (gagal = rollback)"
"${PG[@]}" pg_restore --exit-on-error -d "$DB" "$dump"
q -d "$DB" -c "ANALYZE" >/dev/null

echo "6/7 sidik isi sesudah konversi"
after=$(fingerprint)
if [ "$before" != "$after" ]; then
  echo "sidik berbeda:" >&2
  diff <(echo "$before") <(echo "$after") >&2 || true
  false
fi
ok=1

echo "7/7 nyalakan layanan"
"${C[@]}" up -d app worker backup
check=$(q -d "$DB" -c "SELECT pg_encoding_to_char(encoding) || ' ' || datcollate || ' ' || ((upper('ádí') = 'ÁDÍ') AND ('ÉLISE' ILIKE 'élise'))::text FROM pg_database WHERE datname = current_database()" || true)
echo "   $check (encoding, collate, huruf non-ASCII sadar kapital)"
url=${HEALTH_URL-https://$(sed -n 's/^APP_HOST=//p' .env.prod 2>/dev/null)/api/health}
if [ -n "$url" ]; then
  for _ in $(seq 1 40); do
    code=$(curl -sk -o /dev/null -w '%{http_code}' "$url" || true)
    [ "$code" = 200 ] && break
    sleep 3
  done
  echo "   health $url → $code"
fi
echo "selesai $(date -u +%T) UTC. Database lama disimpan sebagai $old, dump di $dump."
