import { describe, expect, it, vi } from "vitest";
import { HEALTH_TIMEOUT_MS, rendererClient } from "@/features/exports/renderer-client";

/*
 * T-018 D1/D12/AC3/AC5: klien renderer dengan fetch palsu — hanya { token } + x-renderer-secret yang
 * dikirim (tidak pernah URL), cek kesehatan ≤ 3 detik, dan pemetaan galat: tidak bisa dihubungi /
 * tidak dikonfigurasi → RENDERER_UNAVAILABLE, 503 → penuh (busy), waktu habis/504 → EXPORT_TIMEOUT,
 * lebih dari batas → EXPORT_TOO_LARGE, lainnya → EXPORT_FAILED.
 */

const URL_ = "http://127.0.0.1:3200/";
const SECRET = "s".repeat(43); // nilai uji
const TOKEN = "t".repeat(43);
const PDF = new TextEncoder().encode("%PDF-1.7\n%%EOF\n");

const pdfResponse = (body: BodyInit = PDF, headers: Record<string, string> = {}) =>
  new Response(body, { status: 200, headers: { "content-type": "application/pdf", ...headers } });

/** fetch yang tidak pernah menjawab sampai dibatalkan (renderer menggantung). */
const hanging = vi.fn(
  (_url: string | URL | Request, init?: RequestInit) =>
    new Promise<Response>((_, reject) => {
      init?.signal?.addEventListener("abort", () => reject(init.signal!.reason));
    }),
);

/** Galat jaringan seperti undici (fetch failed + cause.code). */
const refused = vi.fn(async () => {
  throw Object.assign(new TypeError("fetch failed"), { cause: { code: "ECONNREFUSED" } });
});

describe("health", () => {
  it("200 /healthz → true; status lain, galat, tidak dikonfigurasi → false", async () => {
    const f = vi.fn(async () => new Response('{"ok":true}', { status: 200 }));
    expect(await rendererClient({ url: URL_, secret: SECRET, fetch: f }).health()).toBe(true);
    expect(f).toHaveBeenCalledWith("http://127.0.0.1:3200/healthz", expect.anything());
    const down = vi.fn(async () => new Response("", { status: 500 }));
    expect(await rendererClient({ url: URL_, secret: SECRET, fetch: down }).health()).toBe(false);
    expect(await rendererClient({ url: URL_, secret: SECRET, fetch: refused }).health()).toBe(
      false,
    );
    expect(await rendererClient({ url: undefined, secret: SECRET, fetch: f }).health()).toBe(false);
    expect(await rendererClient({ url: URL_, secret: undefined, fetch: f }).health()).toBe(false);
    expect(rendererClient({ url: URL_, secret: undefined }).configured).toBe(false);
  });

  it("renderer menggantung → false dalam batas waktu (AC3: anggaran 3 detik)", async () => {
    expect(HEALTH_TIMEOUT_MS).toBeLessThanOrEqual(3_000);
    const c = rendererClient({ url: URL_, secret: SECRET, fetch: hanging });
    const t0 = performance.now();
    expect(await c.health(150)).toBe(false);
    expect(performance.now() - t0).toBeLessThan(1_000);
  });
});

describe("render", () => {
  it("POST /render hanya { token } + x-renderer-secret, tanpa ikut redirect; 200 PDF → ok", async () => {
    const f = vi.fn(async () => pdfResponse());
    const c = rendererClient({ url: URL_, secret: SECRET, fetch: f });
    const r = await c.render(TOKEN, { timeoutMs: 5_000, maxBytes: 1024 });
    expect(r).toEqual({ ok: true, pdf: expect.any(Uint8Array) });
    expect(Buffer.from((r as { pdf: Uint8Array }).pdf).toString()).toBe("%PDF-1.7\n%%EOF\n");
    const [url, init] = f.mock.calls[0]! as unknown as [string, RequestInit];
    expect(url).toBe("http://127.0.0.1:3200/render");
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toEqual({ token: TOKEN });
    expect(init.headers).toEqual({
      "content-type": "application/json",
      "x-renderer-secret": SECRET,
    });
    expect(init.redirect).toBe("error");
  });

  it("tidak dikonfigurasi / tidak bisa dihubungi → RENDERER_UNAVAILABLE (bukan busy)", async () => {
    const none = await rendererClient({}).render(TOKEN, { timeoutMs: 1_000, maxBytes: 1024 });
    expect(none).toMatchObject({ ok: false, code: "RENDERER_UNAVAILABLE" });
    const r = await rendererClient({ url: URL_, secret: SECRET, fetch: refused }).render(TOKEN, {
      timeoutMs: 1_000,
      maxBytes: 1024,
    });
    expect(r).toEqual({
      ok: false,
      code: "RENDERER_UNAVAILABLE",
      detail: "renderer tidak bisa dihubungi (ECONNREFUSED)",
    });
  });

  it("menggantung → EXPORT_TIMEOUT tepat setelah batas", async () => {
    const c = rendererClient({ url: URL_, secret: SECRET, fetch: hanging });
    const t0 = performance.now();
    const r = await c.render(TOKEN, { timeoutMs: 100, maxBytes: 1024 });
    expect(r).toMatchObject({ ok: false, code: "EXPORT_TIMEOUT" });
    expect(performance.now() - t0).toBeLessThan(1_000);
  });

  it("body PDF yang macet di tengah → EXPORT_TIMEOUT", async () => {
    const stalled = new ReadableStream<Uint8Array>({
      start(ctl) {
        ctl.enqueue(PDF.slice(0, 5));
      },
    });
    const c = rendererClient({
      url: URL_,
      secret: SECRET,
      fetch: async () => pdfResponse(stalled),
    });
    const r = await c.render(TOKEN, { timeoutMs: 100, maxBytes: 1024 });
    expect(r).toMatchObject({ ok: false, code: "EXPORT_TIMEOUT" });
  });

  it("status: 503 → RENDERER_UNAVAILABLE busy; 504/408 → EXPORT_TIMEOUT; 400/401/404/500 → EXPORT_FAILED", async () => {
    const at = (status: number) =>
      rendererClient({
        url: URL_,
        secret: SECRET,
        fetch: async () => new Response("x", { status }),
      }).render(TOKEN, { timeoutMs: 1_000, maxBytes: 1024 });
    expect(await at(503)).toMatchObject({ ok: false, code: "RENDERER_UNAVAILABLE", busy: true });
    expect(await at(504)).toMatchObject({ ok: false, code: "EXPORT_TIMEOUT" });
    expect(await at(408)).toMatchObject({ ok: false, code: "EXPORT_TIMEOUT" });
    for (const s of [400, 401, 404, 405, 500]) {
      const r = await at(s);
      expect(r).toMatchObject({ ok: false, code: "EXPORT_FAILED" });
      expect(r).not.toHaveProperty("busy");
    }
  });

  it("ukuran: Content-Length atau stream melebihi batas → EXPORT_TOO_LARGE; tipe bukan PDF → EXPORT_FAILED", async () => {
    const big = new Uint8Array(2048).fill(0x41);
    const declared = rendererClient({
      url: URL_,
      secret: SECRET,
      fetch: async () => pdfResponse(big, { "content-length": "2048" }),
    });
    expect(await declared.render(TOKEN, { timeoutMs: 1_000, maxBytes: 1024 })).toMatchObject({
      ok: false,
      code: "EXPORT_TOO_LARGE",
    });
    const chunks = new ReadableStream<Uint8Array>({
      start(ctl) {
        for (let i = 0; i < 4; i++) ctl.enqueue(new Uint8Array(400));
        ctl.close();
      },
    });
    const streamed = rendererClient({
      url: URL_,
      secret: SECRET,
      fetch: async () => pdfResponse(chunks),
    });
    expect(await streamed.render(TOKEN, { timeoutMs: 1_000, maxBytes: 1024 })).toMatchObject({
      ok: false,
      code: "EXPORT_TOO_LARGE",
    });
    const html = rendererClient({
      url: URL_,
      secret: SECRET,
      fetch: async () => new Response("<html>", { headers: { "content-type": "text/html" } }),
    });
    expect(await html.render(TOKEN, { timeoutMs: 1_000, maxBytes: 1024 })).toMatchObject({
      ok: false,
      code: "EXPORT_FAILED",
    });
  });

  it("detail galat tidak pernah memuat token atau secret", async () => {
    for (const f of [refused, async () => new Response("x", { status: 401 })]) {
      const r = await rendererClient({ url: URL_, secret: SECRET, fetch: f }).render(TOKEN, {
        timeoutMs: 1_000,
        maxBytes: 1024,
      });
      expect(JSON.stringify(r)).not.toContain(TOKEN);
      expect(JSON.stringify(r)).not.toContain(SECRET);
    }
  });
});
