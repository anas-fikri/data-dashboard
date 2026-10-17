#!/usr/bin/env bash
# Sekali per server, oleh operator dengan sudo (T-023): role "dashboard" + database "data_dashboard" di
# PostgreSQL host, password diambil dari POSTGRES_PASSWORD di .env.prod (tidak dicetak, tidak masuk
# riwayat shell). Idempoten: menjalankan ulang hanya menyamakan password.
#   sudo bash deploy/host-db.sh        (dari folder aplikasi)
set -euo pipefail
cd "$(dirname "$0")/.."
pw=$(grep '^POSTGRES_PASSWORD=' .env.prod | cut -d= -f2-)
[ -n "$pw" ] || { echo "POSTGRES_PASSWORD kosong di .env.prod (jalankan deploy/deploy.sh dulu)" >&2; exit 1; }
# Password lewat stdin (bukan argumen): argumen sudo/psql tercatat di log sudo dan terlihat di ps.
lit=${pw//\'/\'\'}
sudo -u postgres psql -v ON_ERROR_STOP=1 -q <<SQL
SELECT 'CREATE ROLE dashboard LOGIN' WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'dashboard') \\gexec
ALTER ROLE dashboard WITH LOGIN PASSWORD '$lit';
SELECT \$\$CREATE DATABASE data_dashboard OWNER dashboard ENCODING 'UTF8' LC_COLLATE 'C.UTF-8' LC_CTYPE 'C.UTF-8' TEMPLATE template0\$\$ WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = 'data_dashboard') \\gexec
SELECT 'encoding ' || pg_encoding_to_char(encoding) FROM pg_database WHERE datname = 'data_dashboard';
SQL
# UTF8 eksplisit: cluster yang di-init dengan locale C mewariskan SQL_ASCII (tanpa validasi encoding,
# lower()/ILIKE hanya ASCII). C.UTF-8 = urutan byte seperti C, tapi huruf non-ASCII dikenali.
echo "PostgreSQL host siap: role dashboard + database data_dashboard"
