/*
 * Integrasi renderer PDF (T-018 AC5/AC6) terhadap origin tiruan lokal: server renderer sungguhan +
 * Chromium sungguhan (sandbox aktif). Dilewati bila Chromium tidak tersedia di mesin ini.
 */
import http from "node:http";
import type { AddressInfo } from "node:net";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { chromium } from "playwright-core";
import type { Browser } from "playwright-core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { browserEnv } from "../../renderer/render";
import { createRenderer } from "../../renderer/renderer";
import type { RenderConfig, RenderLog, Renderer } from "../../renderer/renderer";

const SECRET = "t".repeat(48);
const LAUNCH = { headless: true, chromiumSandbox: true, env: browserEnv(process.env) };

// Chromium belum terpasang (npx playwright install chromium) atau sandbox tidak didukung → skip.
const probe: Browser | null = await chromium.launch(LAUNCH).catch(() => null);

const VARIANTS = ["ok", "offorigin", "redirect", "navredirect", "websocket", "never"] as const;
type Variant = (typeof VARIANTS)[number];
const tok = (variant: string) => variant.padEnd(43, "x");
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
  "base64",
);

type Hit = { path: string; cookie?: string; referer?: string };
const appHits: Hit[] = [];
const otherHits: string[] = [];
const logs: Parameters<RenderLog>[0][] = [];

const listen = (server: http.Server) =>
  new Promise<string>((resolve) =>
    server.listen(0, "127.0.0.1", () =>
      resolve(`http://127.0.0.1:${(server.address() as AddressInfo).port}`),
    ),
  );

/** Origin lain (port berbeda): setiap hit di sini = kebocoran. */
const other = http.createServer((req, res) => {
  otherHits.push(req.url ?? "");
  res.writeHead(200, { "content-type": "image/png" });
  res.end(PNG);
});
other.on("upgrade", (req, socket) => {
  otherHits.push(`upgrade ${req.url}`);
  socket.destroy();
});
let otherOrigin = "";

const READY = (ms: number) =>
  `<script nonce="t018">setTimeout(function(){document.documentElement.dataset.renderReady="1"},${ms})</script>`;

function renderPage(variant: Variant): { html: string; csp?: string } {
  const head = `<!doctype html><html lang="id"><head><meta charset="utf-8"><style>@page{size:A4 landscape;margin:10mm}body{font-family:sans-serif}</style></head><body>`;
  switch (variant) {
    case "ok":
      // CSP ketat tanpa unsafe-eval: deteksi siap tidak boleh bergantung pada eval di halaman.
      return {
        csp: "default-src 'self'; script-src 'nonce-t018'; style-src 'unsafe-inline'; img-src 'self'",
        html: `${head}<h1>Omzet Jakarta Rp 1.234.568</h1><img src="/same.png" alt="">
<section style="break-before:page"><h2>Halaman kedua</h2></section>${READY(50)}</body></html>`,
      };
    case "offorigin":
      return { html: `${head}<p>x</p><img src="${otherOrigin}/leak.png" alt="">${READY(400)}` };
    case "redirect":
      return { html: `${head}<p>x</p><img src="/r" alt="">${READY(400)}` };
    case "websocket":
      return {
        html: `${head}<p>x</p><script>new WebSocket("${otherOrigin.replace("http", "ws")}/ws")</script>${READY(400)}`,
      };
    case "never":
    default:
      return { html: `${head}<p>tidak pernah siap</p></body></html>` };
  }
}

/** Origin app tiruan: tukar token → cookie (303), lalu /render sesuai cookie. */
const app = http.createServer((req, res) => {
  const url = req.url ?? "/";
  appHits.push({ path: url, cookie: req.headers.cookie, referer: req.headers.referer });
  const exchange = /^\/render\/([A-Za-z0-9_-]{43})$/.exec(url);
  if (exchange) {
    const variant = VARIANTS.find((v) => tok(v) === exchange[1]);
    if (!variant) {
      res.writeHead(404);
      return res.end();
    }
    res.writeHead(303, {
      location: "/render",
      "set-cookie": `dd.render=${variant}; Path=/render; HttpOnly; SameSite=Strict; Max-Age=60`,
    });
    return res.end();
  }
  if (url === "/render") {
    const variant = /(?:^|;\s*)dd\.render=([a-z]+)/.exec(req.headers.cookie ?? "")?.[1] as
      Variant | undefined;
    if (!variant || !VARIANTS.includes(variant)) {
      res.writeHead(404);
      return res.end();
    }
    if (variant === "navredirect") {
      res.writeHead(302, { location: `${otherOrigin}/leak-nav` });
      return res.end();
    }
    const { html, csp } = renderPage(variant);
    res.writeHead(200, {
      "content-type": "text/html; charset=utf-8",
      ...(csp ? { "content-security-policy": csp } : {}),
    });
    return res.end(html);
  }
  if (url === "/same.png") {
    res.writeHead(200, { "content-type": "image/png" });
    return res.end(PNG);
  }
  if (url === "/r") {
    res.writeHead(302, { location: `${otherOrigin}/leak-redirect` });
    return res.end();
  }
  res.writeHead(404);
  res.end();
});

let appOrigin = "";
let main: Renderer | undefined;
let strict: Renderer | undefined;
let mainUrl = "";
let strictUrl = "";

function config(overrides: Partial<RenderConfig>): RenderConfig {
  return {
    RENDERER_SECRET: SECRET,
    APP_INTERNAL_URL: appOrigin,
    RENDERER_CONCURRENCY: 2,
    RENDER_READY_TIMEOUT_MS: 15_000,
    ALLOW_DEV_WEBSOCKET: false,
    ...overrides,
  };
}

async function startRenderer(cfg: RenderConfig, launch: () => Promise<Browser>) {
  const renderer = createRenderer(cfg, launch, (entry) => logs.push(entry));
  await renderer.start(0, "127.0.0.1");
  const { port } = renderer.server.address() as AddressInfo;
  return { renderer, url: `http://127.0.0.1:${port}` };
}

function post(
  base: string,
  body: unknown,
  { secret = SECRET as string | null, contentType = "application/json" } = {},
) {
  const headers: Record<string, string> = { "content-type": contentType };
  if (secret !== null) headers["x-renderer-secret"] = secret;
  return fetch(`${base}/render`, {
    method: "POST",
    headers,
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

async function waitForHit(path: string) {
  for (let i = 0; i < 250 && !appHits.some((h) => h.path === path); i++) {
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

async function readPdf(bytes: ArrayBuffer) {
  const task = getDocument({
    data: new Uint8Array(bytes),
    disableFontFace: true,
    verbosity: 0,
  });
  const doc = await task.promise;
  const pages: { width: number; height: number; text: string }[] = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n);
    const { width, height } = page.getViewport({ scale: 1 });
    const items = (await page.getTextContent()).items;
    const text = items.map((item) => ("str" in item ? item.str : "")).join(" ");
    pages.push({ width, height, text: text.replace(/\s+/g, " ") });
  }
  await task.destroy();
  return pages;
}

describe.skipIf(!probe)("renderer PDF (integrasi, Chromium sungguhan)", () => {
  beforeAll(async () => {
    otherOrigin = await listen(other);
    appOrigin = await listen(app);
    let reuse = probe;
    const launch = () => {
      const browser = reuse;
      reuse = null;
      return browser ? Promise.resolve(browser) : chromium.launch(LAUNCH);
    };
    const [a, b] = await Promise.all([
      startRenderer(config({}), launch),
      startRenderer(config({ RENDERER_CONCURRENCY: 1, RENDER_READY_TIMEOUT_MS: 1_000 }), launch),
    ]);
    main = a.renderer;
    mainUrl = a.url;
    strict = b.renderer;
    strictUrl = b.url;
  }, 30_000);

  afterAll(async () => {
    await Promise.all([main?.stop(1_000), strict?.stop(1_000)]);
    await probe?.close().catch(() => {});
    other.close();
    app.close();
  });

  it("GET /healthz → 200 {ok:true} tanpa detail; path lain 404, metode salah 405", async () => {
    const health = await fetch(`${mainUrl}/healthz`);
    expect(health.status).toBe(200);
    expect(await health.json()).toEqual({ ok: true });
    expect((await fetch(`${mainUrl}/healthz`, { method: "POST" })).status).toBe(405);
    expect((await fetch(`${mainUrl}/render`)).status).toBe(405);
    expect((await fetch(`${mainUrl}/render/${tok("ok")}`)).status).toBe(404);
    expect((await fetch(`${mainUrl}/`)).status).toBe(404);
  });

  it("AC5: tanpa/dengan secret salah → 401 (sebelum body dibaca); {url} → 400", async () => {
    const missing = await post(mainUrl, { token: tok("ok") }, { secret: null });
    expect(missing.status).toBe(401);
    expect(await missing.json()).toEqual({ ok: false, code: "UNAUTHORIZED" });
    expect((await post(mainUrl, { token: tok("ok") }, { secret: `${SECRET}x` })).status).toBe(401);
    expect((await post(mainUrl, { url: `${otherOrigin}/x` }, { secret: "salah" })).status).toBe(
      401,
    );

    const url = await post(mainUrl, { url: `${appOrigin}/render/${tok("ok")}` });
    expect(url.status).toBe(400);
    expect(await url.json()).toEqual({ ok: false, code: "BAD_REQUEST" });
    expect((await post(mainUrl, { token: tok("ok"), url: otherOrigin })).status).toBe(400);
    expect((await post(mainUrl, { token: "pendek" })).status).toBe(400);
    expect((await post(mainUrl, { token: tok("ok") }, { contentType: "text/plain" })).status).toBe(
      415,
    );
    expect((await post(mainUrl, { token: tok("ok"), pad: "x".repeat(2048) })).status).toBe(413);
    expect(otherHits).toEqual([]);
  });

  it("{token} → PDF A4 landscape valid, nilai halaman + footer Halaman X dari Y", async () => {
    const res = await post(mainUrl, { token: tok("ok") });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/pdf");
    const bytes = await res.arrayBuffer();
    expect(Buffer.from(bytes).subarray(0, 5).toString("latin1")).toBe("%PDF-");

    const pages = await readPdf(bytes);
    expect(pages).toHaveLength(2);
    for (const page of pages) {
      expect(page.width).toBeCloseTo(841.92, 0);
      expect(page.height).toBeCloseTo(595, 0);
    }
    expect(pages[0]!.text).toContain("Omzet Jakarta Rp 1.234.568");
    expect(pages[0]!.text).toContain("Halaman 1 dari 2");
    expect(pages[1]!.text).toContain("Halaman 2 dari 2");

    // Cookie render dikirim ke /render; token tidak pernah ada di Referer subresource.
    expect(appHits.some((h) => h.path === "/render" && h.cookie === "dd.render=ok")).toBe(true);
    expect(appHits.some((h) => h.path === "/same.png")).toBe(true);
    expect(appHits.filter((h) => h.referer?.includes(tok("ok")))).toEqual([]);
  });

  it.each([
    { variant: "offorigin", why: "gambar dari origin lain" },
    { variant: "redirect", why: "302 same-origin ke origin lain (bypass redirect)" },
    { variant: "navredirect", why: "navigasi /render 302 ke origin lain" },
    { variant: "websocket", why: "WebSocket ke origin lain" },
  ] as const)("AC6: $variant ($why) diblokir dan job gagal tertutup", async ({ variant }) => {
    const res = await post(mainUrl, { token: tok(variant) });
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ ok: false, code: "RENDER_BLOCKED" });
    expect(otherHits).toEqual([]);
  });

  it("token ditolak app (dipakai/kedaluwarsa → 404) → 502 RENDER_TOKEN_REJECTED", async () => {
    const res = await post(mainUrl, { token: tok("dipakai") });
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ ok: false, code: "RENDER_TOKEN_REJECTED" });
  });

  it("halaman tidak pernah siap → 504 RENDER_TIMEOUT; slot penuh → 503 RENDERER_BUSY", async () => {
    const slow = post(strictUrl, { token: tok("never") });
    await waitForHit(`/render/${tok("never")}`);
    const busy = await post(strictUrl, { token: tok("ok") });
    expect(busy.status).toBe(503);
    expect(await busy.json()).toEqual({ ok: false, code: "RENDERER_BUSY" });

    const timedOut = await slow;
    expect(timedOut.status).toBe(504);
    expect(await timedOut.json()).toEqual({ ok: false, code: "RENDER_TIMEOUT" });
  });

  it("log hanya {requestId, ms, bytes, outcome} dan tidak memuat token", () => {
    expect(logs.length).toBeGreaterThan(0);
    for (const entry of logs) {
      expect(Object.keys(entry).sort()).toEqual(["bytes", "ms", "outcome", "requestId"]);
    }
    expect(logs.some((e) => e.outcome === "ok" && e.bytes > 0)).toBe(true);
    const all = JSON.stringify(logs);
    for (const variant of VARIANTS) expect(all).not.toContain(tok(variant));
  });
});
