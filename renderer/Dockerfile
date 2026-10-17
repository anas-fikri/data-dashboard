# syntax=docker/dockerfile:1
#
# Renderer PDF produksi (T-018/T-023): Chromium Playwright, non-root (pwuser), seccomp Playwright,
# hanya di jaringan internal "render". Build context = akar repo:
#   docker build -f renderer/Dockerfile -t dashboard-renderer .
# v1.64.0-noble = versi playwright-core di package.json (browser chromium_headless_shell-1248).
FROM mcr.microsoft.com/playwright:v1.64.0-noble@sha256:06a9939e57531807f8d5fd76ce44b53165ffb7d7501d87ab10e285c20b1e971f
WORKDIR /app
ENV NODE_ENV=production HOME=/tmp XDG_CACHE_HOME=/tmp/.cache XDG_CONFIG_HOME=/tmp/.config \
  RENDERER_HOST=0.0.0.0 RENDERER_PORT=3200
# Hanya kode renderer + dua dependensi runtime-nya (JS murni), versi persis sesuai package-lock.json.
COPY renderer ./renderer
RUN npm install --no-save --no-audit --no-fund --ignore-scripts playwright-core@1.64.0 zod@3.25.76 \
  && rm -rf /root/.npm
USER pwuser
EXPOSE 3200
HEALTHCHECK --interval=10s --timeout=3s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3200/healthz').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"]
CMD ["node", "--disable-warning=MODULE_TYPELESS_PACKAGE_JSON", "--import", "./renderer/loader.mjs", "renderer/server.ts"]
