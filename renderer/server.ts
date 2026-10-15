/*
 * Entry renderer PDF (T-018 D12): proses terpisah dari app dan worker, dipanggil worker lewat
 * POST /render {token} + header x-renderer-secret. GET /healthz → {ok} saja.
 * Dev/e2e: npm run renderer (tsx, membaca .env). Container: lihat renderer/README.md.
 * Siap saat log "renderer berjalan"; SIGTERM/SIGINT → berhenti menerima job, tunggu job berjalan, tutup Chromium.
 */
import { chromium } from "playwright-core";
import { parseRendererEnv } from "./env";
import { browserArgs, browserEnv } from "./render";
import { createRenderer } from "./renderer";

function logLine(level: "info" | "fatal", msg: string, extra: Record<string, unknown> = {}) {
  const stream = level === "fatal" ? process.stderr : process.stdout;
  stream.write(`${JSON.stringify({ level, time: Date.now(), msg, ...extra })}\n`);
}

async function main(): Promise<void> {
  const env = parseRendererEnv(process.env);
  const renderer = createRenderer(env, () =>
    chromium.launch({
      headless: true,
      // Sandbox Chromium tetap aktif (tanpa --no-sandbox); di container butuh seccomp profile Playwright.
      chromiumSandbox: true,
      env: browserEnv(process.env),
      // Dev (ALLOW_DEV_WEBSOCKET) saja: WebSocket HMR tidak diblokir Local Network Access (render.ts).
      args: browserArgs(env),
      // Sinyal ditangani di sini agar job berjalan selesai dulu sebelum peramban ditutup.
      handleSIGINT: false,
      handleSIGTERM: false,
      handleSIGHUP: false,
    }),
  );
  await renderer.start(env.RENDERER_PORT, env.RENDERER_HOST);
  logLine("info", "renderer berjalan", {
    port: env.RENDERER_PORT,
    concurrency: env.RENDERER_CONCURRENCY,
  });

  let stopping = false;
  const shutdown = (signal: string) => {
    if (stopping) return;
    stopping = true;
    logLine("info", "renderer berhenti", { signal });
    renderer.stop().then(
      () => process.exit(0),
      () => process.exit(1),
    );
  };
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

main().catch((error: unknown) => {
  // Pesan env tidak memuat nilai variabel; pesan peluncuran Chromium tidak memuat env.
  logLine("fatal", "renderer gagal start", {
    err: error instanceof Error ? error.message : String(error),
  });
  process.exit(1);
});
