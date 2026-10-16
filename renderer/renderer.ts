/*
 * Renderer PDF (T-018 D5/D12): server node:http + satu Chromium persisten, context baru per job.
 * Alur satu job (token sudah divalidasi):
 *   1. ctx.request.get(APP_INTERNAL_URL/render/<token>, maxRedirects 0) → wajib 303 ke /render; cookie
 *      dd.render (Path=/render) tersimpan di context, token tidak pernah masuk URL halaman/riwayat/Referer.
 *   2. page.goto(APP_INTERNAL_URL/render) dengan media print; tunggu html[data-render-ready="1"].
 *   3. page.pdf A4 landscape + footer "Halaman X dari Y", bertanda (tagged) + kerangka dari judul.
 * Semua permintaan halaman lewat context.route: hanya origin app via route.fetch({maxRedirects:0}); 3xx
 * dan origin lain di-abort dan menggagalkan job (fail closed). WebSocket diblokir kecuali dev HMR.
 * Log hanya {requestId, ms, bytes, outcome}: token, URL, dan pesan error tidak pernah ditulis.
 */
import { randomUUID } from "node:crypto";
import http from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";
import { errors } from "playwright-core";
import type { Browser, BrowserContextOptions, Route, WebSocketRoute } from "playwright-core";
import type { RendererEnv } from "./env";
import {
  MAX_BODY_BYTES,
  RENDER_ERRORS,
  checkSecret,
  decideRoute,
  isAllowedUrl,
  isAllowedWebSocketUrl,
  validateBody,
} from "./render";
import type { RenderErrorCode } from "./render";

export type RenderConfig = Pick<
  RendererEnv,
  | "RENDERER_SECRET"
  | "APP_INTERNAL_URL"
  | "RENDERER_CONCURRENCY"
  | "RENDER_READY_TIMEOUT_MS"
  | "ALLOW_DEV_WEBSOCKET"
>;

/** Lebar cetak 277 mm (A4 landscape − margin 2 × 10 mm) ≈ 1047 px CSS; tinggi 190 mm ≈ 740 px (D6). */
export const CONTEXT_OPTIONS: BrowserContextOptions = {
  viewport: { width: 1047, height: 740 },
  reducedMotion: "reduce",
  colorScheme: "light",
  locale: "id-ID",
  timezoneId: "Asia/Jakarta",
  serviceWorkers: "block",
  acceptDownloads: false,
};

const FOOTER_TEMPLATE =
  '<div style="width:100%;padding:0 10mm;font-family:system-ui,sans-serif;font-size:8px;color:#555;text-align:right;">' +
  'Halaman <span class="pageNumber"></span> dari <span class="totalPages"></span></div>';

export class RenderError extends Error {
  readonly code: RenderErrorCode;

  constructor(code: RenderErrorCode) {
    super(code);
    this.name = "RenderError";
    this.code = code;
  }
}

/**
 * Satu job render. Batas waktu RENDER_READY_TIMEOUT_MS mencakup tukar token, navigasi, dan tunggu
 * siap; lewat → RENDER_TIMEOUT. `signal` dibatalkan saat pemanggil memutus koneksi (context ditutup).
 */
export async function renderPdf(
  browser: Browser,
  token: string,
  cfg: RenderConfig,
  signal?: AbortSignal,
): Promise<Buffer> {
  const origin = cfg.APP_INTERNAL_URL;
  const deadline = Date.now() + cfg.RENDER_READY_TIMEOUT_MS;
  const remaining = () => {
    const ms = deadline - Date.now();
    if (ms <= 0) throw new RenderError("RENDER_TIMEOUT");
    return ms;
  };

  let rejectBlocked: (error: RenderError) => void = () => {};
  const blocked = new Promise<never>((_, reject) => {
    rejectBlocked = reject;
  });
  blocked.catch(() => {});
  let violation = false;
  const block = () => {
    violation = true;
    rejectBlocked(new RenderError("RENDER_BLOCKED"));
  };
  /** Langkah halaman berpacu dengan pelanggaran allowlist: job gagal segera, tidak menunggu timeout. */
  const guarded = <T>(step: Promise<T>) => Promise.race([step, blocked]);

  const ctx = await browser.newContext(CONTEXT_OPTIONS);
  const onAbort = () => void ctx.close().catch(() => {});
  signal?.addEventListener("abort", onAbort, { once: true });
  if (signal?.aborted) onAbort();
  try {
    // Lapis kedua: permintaan apa pun yang tidak lewat route (mis. dari service worker) tetap terlihat.
    ctx.on("request", (request) => {
      if (!isAllowedUrl(request.url(), origin)) block();
    });
    const handleRoute = async (route: Route) => {
      const url = route.request().url();
      if (decideRoute(url, origin) === "abort") {
        block();
        return route.abort("blockedbyclient");
      }
      let response;
      try {
        response = await route.fetch({
          maxRedirects: 0,
          timeout: Math.max(1, deadline - Date.now()),
        });
      } catch {
        return route.abort("failed");
      }
      if (decideRoute(url, origin, response.status()) === "abort") {
        block();
        return route.abort("blockedbyclient");
      }
      return route.fulfill({ response });
    };
    // Error di handler (context sudah ditutup saat job selesai/batal) sengaja ditelan.
    await ctx.route("**/*", (route: Route) => handleRoute(route).catch(() => {}));
    await ctx.routeWebSocket(/.*/, (ws: WebSocketRoute) => {
      const sameOrigin = isAllowedWebSocketUrl(ws.url(), origin);
      if (sameOrigin && cfg.ALLOW_DEV_WEBSOCKET) {
        ws.connectToServer();
        return;
      }
      // Same-origin tanpa izin (HMR) cukup ditutup; lintas origin = pelanggaran (fail closed).
      if (!sameOrigin) block();
      void ws.close({ code: 1008, reason: "blocked" }).catch(() => {});
    });

    const exchange = await ctx.request.get(`${origin}/render/${token}`, {
      maxRedirects: 0,
      failOnStatusCode: false,
      timeout: remaining(),
    });
    const status = exchange.status();
    const location = exchange.headers()["location"] ?? "";
    const target = URL.canParse(location, origin) ? new URL(location, origin) : null;
    await exchange.dispose();
    // Location tidak diikuti (halaman selalu dibuka di origin/render); cek hanya memastikan 303 ke /render.
    if (status !== 303 || target?.pathname !== "/render") {
      throw new RenderError("RENDER_TOKEN_REJECTED");
    }

    const page = await ctx.newPage();
    await page.emulateMedia({ media: "print" });
    const response = await guarded(
      page.goto(`${origin}/render`, { waitUntil: "domcontentloaded", timeout: remaining() }),
    );
    if (response?.status() !== 200) throw new RenderError("RENDER_FAILED");
    // Selector berjalan di dunia utilitas Playwright: tidak terpengaruh CSP halaman (tanpa unsafe-eval).
    await guarded(
      page.waitForSelector('html[data-render-ready="1"]', {
        state: "attached",
        timeout: remaining(),
      }),
    );
    const pdf = await guarded(
      page.pdf({
        format: "A4",
        landscape: true,
        printBackground: true,
        preferCSSPageSize: true,
        displayHeaderFooter: true,
        headerTemplate: "<span></span>",
        footerTemplate: FOOTER_TEMPLATE,
        margin: { top: "10mm", right: "10mm", bottom: "10mm", left: "10mm" },
        // PDF bertanda (judul H1/H2, tabel, daftar untuk teknologi bantu; WCAG 1.3.1) + kerangka dari
        // judul (review R1-DS-4). Judul dokumen = <title> halaman (nama dashboard).
        tagged: true,
        outline: true,
      }),
    );
    if (violation) throw new RenderError("RENDER_BLOCKED");
    return pdf;
  } catch (error) {
    if (violation) throw new RenderError("RENDER_BLOCKED");
    if (error instanceof RenderError) throw error;
    if (error instanceof errors.TimeoutError) throw new RenderError("RENDER_TIMEOUT");
    throw new RenderError("RENDER_FAILED");
  } finally {
    signal?.removeEventListener("abort", onAbort);
    await ctx.close().catch(() => {});
  }
}

type Outcome = RenderErrorCode | "ok" | "client_closed";

export type RenderLog = (entry: {
  requestId: string;
  ms: number;
  bytes: number;
  outcome: Outcome;
}) => void;

const jsonLog: RenderLog = (entry) => {
  process.stdout.write(
    `${JSON.stringify({ level: "info", time: Date.now(), msg: "render", ...entry })}\n`,
  );
};

function sendError(
  res: ServerResponse,
  code: RenderErrorCode,
  headers: Record<string, string> = {},
) {
  const body = JSON.stringify({ ok: false, code });
  res.writeHead(RENDER_ERRORS[code], {
    "content-type": "application/json",
    "content-length": Buffer.byteLength(body),
    "cache-control": "no-store",
    // Body yang belum dibaca (mis. 401/413) tidak ditunggu: koneksi ditutup setelah respons.
    connection: "close",
    ...headers,
  });
  res.end(body);
}

/** Body sampai MAX_BODY_BYTES; null bila lebih (Content-Length atau aliran aktual). */
function readBody(req: IncomingMessage): Promise<Buffer | null> {
  const declared = Number(req.headers["content-length"]);
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) return Promise.resolve(null);
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on("data", (chunk: Buffer) => {
      size += chunk.byteLength;
      if (size > MAX_BODY_BYTES) {
        req.removeAllListeners("data");
        req.resume();
        resolve(null);
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

export type Renderer = {
  server: http.Server;
  /** Luncurkan Chromium lalu listen. Gagal luncur (mis. sandbox tidak didukung) → throw. */
  start(port: number, host: string): Promise<void>;
  /** Berhenti menerima job, tunggu job berjalan ≤ graceMs, lalu batalkan sisanya dan tutup Chromium. */
  stop(graceMs?: number): Promise<void>;
};

export function createRenderer(
  cfg: RenderConfig,
  launch: () => Promise<Browser>,
  log: RenderLog = jsonLog,
): Renderer {
  let browser: Browser | null = null;
  let stopping = false;
  let relaunchDelay = 1_000;
  let relaunchTimer: NodeJS.Timeout | undefined;
  let active = 0;
  const jobs = new Set<AbortController>();

  const connect = async () => {
    const launched = await launch();
    launched.on("disconnected", () => {
      if (browser === launched) browser = null;
      if (!stopping) scheduleRelaunch();
    });
    browser = launched;
    relaunchDelay = 1_000;
  };

  // Chromium mati (crash/OOM) → luncur ulang dengan backoff; /healthz 503 selama belum tersambung.
  const scheduleRelaunch = () => {
    clearTimeout(relaunchTimer);
    relaunchTimer = setTimeout(() => {
      connect().catch(() => {
        relaunchDelay = Math.min(relaunchDelay * 2, 30_000);
        if (!stopping) scheduleRelaunch();
      });
    }, relaunchDelay);
    relaunchTimer.unref();
  };

  const handleRender = async (req: IncomingMessage, res: ServerResponse, requestId: string) => {
    const started = Date.now();
    const done = (outcome: Outcome, bytes = 0) =>
      log({ requestId, ms: Date.now() - started, bytes, outcome });
    const fail = (code: RenderErrorCode, headers?: Record<string, string>) => {
      if (!res.headersSent && !res.destroyed) sendError(res, code, headers);
      done(code);
    };

    if (req.method !== "POST") return fail("METHOD_NOT_ALLOWED", { allow: "POST" });
    if (!checkSecret(req.headers["x-renderer-secret"], cfg.RENDERER_SECRET)) {
      return fail("UNAUTHORIZED");
    }
    const raw = await readBody(req);
    if (raw === null) return fail("PAYLOAD_TOO_LARGE");
    const body = validateBody(req.headers["content-type"], raw);
    if (!body.ok) return fail(body.code);
    const current = browser;
    if (stopping || !current?.isConnected()) return fail("RENDERER_UNAVAILABLE");
    if (active >= cfg.RENDERER_CONCURRENCY) return fail("RENDERER_BUSY");

    active += 1;
    const controller = new AbortController();
    jobs.add(controller);
    res.on("close", () => {
      if (!res.writableFinished) controller.abort();
    });
    try {
      const pdf = await renderPdf(current, body.token, cfg, controller.signal);
      if (controller.signal.aborted) return done("client_closed");
      res.writeHead(200, {
        "content-type": "application/pdf",
        "content-length": pdf.byteLength,
        "cache-control": "no-store",
      });
      res.end(pdf);
      done("ok", pdf.byteLength);
    } catch (error) {
      if (controller.signal.aborted) return done("client_closed");
      fail(error instanceof RenderError ? error.code : "RENDER_FAILED");
    } finally {
      active -= 1;
      jobs.delete(controller);
    }
  };

  // Klien lambat tidak boleh menahan socket: header ≤ 5 s, seluruh request (body ≤ 1 KB) ≤ 10 s.
  // Batas ini hanya untuk menerima request; respons render yang lama tidak terpotong (dicek).
  const server = http.createServer(
    { headersTimeout: 5_000, requestTimeout: 10_000 },
    (req, res) => {
      const requestId = randomUUID();
      res.setHeader("x-request-id", requestId);
      const path = (req.url ?? "/").split("?")[0];
      if (path === "/healthz") {
        if (req.method !== "GET" && req.method !== "HEAD") {
          return sendError(res, "METHOD_NOT_ALLOWED", { allow: "GET, HEAD" });
        }
        const ok = !stopping && browser?.isConnected() === true;
        const body = JSON.stringify({ ok });
        res.writeHead(ok ? 200 : 503, {
          "content-type": "application/json",
          "content-length": Buffer.byteLength(body),
          "cache-control": "no-store",
        });
        return res.end(req.method === "HEAD" ? undefined : body);
      }
      if (path === "/render") {
        handleRender(req, res, requestId).catch(() => {
          if (!res.headersSent && !res.destroyed) sendError(res, "RENDER_FAILED");
        });
        return;
      }
      sendError(res, "NOT_FOUND");
    },
  );

  return {
    server,
    async start(port, host) {
      await connect();
      try {
        await new Promise<void>((resolve, reject) => {
          server.once("error", reject);
          server.listen(port, host, () => {
            server.off("error", reject);
            resolve();
          });
        });
      } catch (error) {
        stopping = true;
        await browser?.close().catch(() => {});
        throw error;
      }
    },
    async stop(graceMs = cfg.RENDER_READY_TIMEOUT_MS + 5_000) {
      stopping = true;
      clearTimeout(relaunchTimer);
      const closed = new Promise<void>((resolve) => server.close(() => resolve()));
      server.closeIdleConnections();
      const until = Date.now() + graceMs;
      while (active > 0 && Date.now() < until) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      for (const job of jobs) job.abort();
      server.closeAllConnections();
      await closed;
      await browser?.close().catch(() => {});
      browser = null;
    },
  };
}
