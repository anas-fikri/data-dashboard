# syntax=docker/dockerfile:1
#
# Image produksi (T-023): satu build, dua target.
#   app    — Next.js output standalone (port 3100), membawa binding native DuckDB + Prisma + admin-restore.
#   worker — ingest/ekspor/orkestrasi PDF (BullMQ) lewat tsx; juga dipakai untuk migrasi Prisma dan skrip
#            operator (seed panduan, purge). Renderer PDF punya image sendiri: renderer/Dockerfile.
# Base image di-pin per digest; build tidak membutuhkan secret (semua env dibaca saat runtime).

ARG NODE_IMAGE=node:22-bookworm-slim@sha256:c3de60bf2f9dd0ac6370e6117950ff62d6e339527e7472301c9c78a017978392

# Manifest tanpa versi rilis (v1.15.1): `aitk release` menaikkan "version" package.json di setiap rilis, jadi
# tanpa ini lapisan npm ci (± 730 paket, unduhan ± 350 MB) selalu dibangun ulang walau dependensi sama.
# Tahap kecil ini selalu jalan (± 1 dtk), tetapi hasilnya identik selama dependensi sama → COPY --from di
# tahap deps tetap cache-hit. Tanpa fitur khusus BuildKit: build lama (docker compose build di VM) juga bisa.
FROM ${NODE_IMAGE} AS manifest
WORKDIR /m
COPY package.json package-lock.json ./
RUN node -e 'const fs = require("fs"); \
  for (const f of ["package.json", "package-lock.json"]) { \
    const j = JSON.parse(fs.readFileSync(f, "utf8")); j.version = "0.0.0"; \
    if (j.packages && j.packages[""]) j.packages[""].version = "0.0.0"; \
    fs.writeFileSync(f, JSON.stringify(j, null, 2) + "\n"); }'

FROM ${NODE_IMAGE} AS deps
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
# openssl: Prisma memilih engine sesuai versi OpenSSL yang terdeteksi saat generate (tanpa biner openssl
# ia menebak 1.1.x, yang gagal dimuat di bookworm/OpenSSL 3).
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
# Versi asli package.json masuk lagi di tahap build (COPY . .) — dibaca footer/health dan worker.
COPY --from=manifest /m/package.json /m/package-lock.json ./
COPY .npmrc ./
COPY prisma ./prisma
RUN npm ci --no-audit --no-fund && npx prisma generate

FROM deps AS build
# Pekerja build Next (bawaan: semua CPU host → membebani VM kecil); naikkan lewat --build-arg di VM besar.
ARG NEXT_BUILD_CPUS=2
ENV NEXT_BUILD_CPUS=${NEXT_BUILD_CPUS}
COPY . .
RUN npm run build \
  # Binding native DuckDB dipilih per platform saat runtime: nft standalone bisa melewatkannya (T-009).
  && cp -R node_modules/@duckdb .next/standalone/node_modules/ \
  && mkdir -p .next/standalone/node_modules/.prisma \
  && cp -R node_modules/.prisma/client .next/standalone/node_modules/.prisma/ \
  && cp -R node_modules/@prisma .next/standalone/node_modules/ \
  && cp -R .next/static .next/standalone/.next/static \
  # Isi public/, bukan foldernya: standalone sudah membuat public/ berisi aset yang di-trace nft, jadi
  # `cp -R public <tujuan>` menyalin ke public/public dan favicon/ikon/mark.png jadi 404 (v1.6.1).
  && mkdir -p .next/standalone/public && cp -R public/. .next/standalone/public/

FROM ${NODE_IMAGE} AS runtime-base
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/* \
  && groupadd -g 10001 app && useradd -u 10001 -g app -M -s /usr/sbin/nologin app \
  && mkdir -p /var/cache/dashboard /backup-config/app && chown app:app /var/cache/dashboard /backup-config/app

FROM runtime-base AS app
# BACKUP_CONFIG_DIR: volume bersama service backup (T-7psf): app menulis app/offsite.json, membaca status.json.
ENV HOSTNAME=0.0.0.0 PORT=3100 QUERY_CACHE_DIR=/var/cache/dashboard/query BACKUP_CONFIG_DIR=/backup-config
COPY --from=build /app/.next/standalone ./
# Pemulihan admin darurat (T-019): docker compose exec app node scripts/admin-restore.mjs <email>.
COPY --from=build /app/scripts/admin-restore.mjs ./scripts/admin-restore.mjs
# Commit pendek untuk /health admin (T-066); di akhir stage agar tidak membatalkan cache lapisan di atas.
ARG APP_COMMIT=
ENV APP_COMMIT=${APP_COMMIT}
USER app
EXPOSE 3100
HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3100/api/health/core').then(r=>process.exit(r.status<500?0:1),()=>process.exit(1))"]
CMD ["node", "server.js"]

FROM runtime-base AS worker
# BACKUP_CONFIG_DIR: hanya salinan status.json backup (volume backup-status, read-only) untuk job pantauan
# (T-8g53); SMTP worker dari SMTP_URL/MAIL_FROM .env.
ENV WORKER_TMP_DIR=/var/cache/dashboard/tmp QUERY_CACHE_DIR=/var/cache/dashboard/query BACKUP_CONFIG_DIR=/backup-status
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json /app/tsconfig.json ./
COPY --from=build /app/src ./src
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/scripts ./scripts
COPY --from=build /app/content ./content
COPY --from=build /app/deploy ./deploy
# Commit pendek di log start worker (T-066); versi dibaca dari package.json di atas.
ARG APP_COMMIT=
ENV APP_COMMIT=${APP_COMMIT}
USER app
CMD ["node_modules/.bin/tsx", "--conditions=react-server", "src/worker/index.ts"]
