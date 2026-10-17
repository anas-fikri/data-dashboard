# syntax=docker/dockerfile:1
#
# Image produksi (T-023): satu build, dua target.
#   app    — Next.js output standalone (port 3100), membawa binding native DuckDB + Prisma + admin-restore.
#   worker — ingest/ekspor/orkestrasi PDF (BullMQ) lewat tsx; juga dipakai untuk migrasi Prisma dan skrip
#            operator (seed panduan, purge). Renderer PDF punya image sendiri: renderer/Dockerfile.
# Base image di-pin per digest; build tidak membutuhkan secret (semua env dibaca saat runtime).

ARG NODE_IMAGE=node:22-bookworm-slim@sha256:c3de60bf2f9dd0ac6370e6117950ff62d6e339527e7472301c9c78a017978392

FROM ${NODE_IMAGE} AS deps
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
# openssl: Prisma memilih engine sesuai versi OpenSSL yang terdeteksi saat generate (tanpa biner openssl
# ia menebak 1.1.x, yang gagal dimuat di bookworm/OpenSSL 3).
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json .npmrc ./
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
  && cp -R public .next/standalone/public

FROM ${NODE_IMAGE} AS runtime-base
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/* \
  && groupadd -g 10001 app && useradd -u 10001 -g app -M -s /usr/sbin/nologin app \
  && mkdir -p /var/cache/dashboard && chown app:app /var/cache/dashboard

FROM runtime-base AS app
ENV HOSTNAME=0.0.0.0 PORT=3100 QUERY_CACHE_DIR=/var/cache/dashboard/query
COPY --from=build /app/.next/standalone ./
# Pemulihan admin darurat (T-019): docker compose exec app node scripts/admin-restore.mjs <email>.
COPY --from=build /app/scripts/admin-restore.mjs ./scripts/admin-restore.mjs
USER app
EXPOSE 3100
HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3100/api/health/core').then(r=>process.exit(r.status<500?0:1),()=>process.exit(1))"]
CMD ["node", "server.js"]

FROM runtime-base AS worker
ENV WORKER_TMP_DIR=/var/cache/dashboard/tmp QUERY_CACHE_DIR=/var/cache/dashboard/query
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json /app/tsconfig.json ./
COPY --from=build /app/src ./src
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/scripts ./scripts
COPY --from=build /app/content ./content
COPY --from=build /app/deploy ./deploy
USER app
CMD ["node_modules/.bin/tsx", "--conditions=react-server", "src/worker/index.ts"]
