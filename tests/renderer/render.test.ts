import { describe, expect, it } from "vitest";
import {
  MAX_BODY_BYTES,
  browserArgs,
  browserEnv,
  checkSecret,
  decideRoute,
  isAllowedUrl,
  isAllowedWebSocketUrl,
  validateBody,
} from "../../renderer/render";

const TOKEN = "A".repeat(40) + "-_9";
const JSON_CT = "application/json";
const body = (value: unknown) => Buffer.from(JSON.stringify(value));

describe("validateBody", () => {
  it("menerima persis {token} 43 karakter base64url", () => {
    expect(validateBody(JSON_CT, body({ token: TOKEN }))).toEqual({ ok: true, token: TOKEN });
    expect(validateBody("Application/JSON; charset=utf-8", body({ token: TOKEN })).ok).toBe(true);
  });

  it("menolak content-type selain application/json (415)", () => {
    for (const ct of [undefined, "", "text/plain", "application/x-www-form-urlencoded", "json"]) {
      expect(validateBody(ct, body({ token: TOKEN })), String(ct)).toEqual({
        ok: false,
        code: "UNSUPPORTED_MEDIA_TYPE",
      });
    }
  });

  it("menolak body > 1 KB (413)", () => {
    const big = Buffer.from(JSON.stringify({ token: TOKEN, pad: "x".repeat(MAX_BODY_BYTES) }));
    expect(validateBody(JSON_CT, big)).toEqual({ ok: false, code: "PAYLOAD_TOO_LARGE" });
  });

  it("AC5: URL dan kunci tambahan ditolak (400) — renderer tidak pernah menerima URL", () => {
    for (const value of [
      { url: "http://evil.example/" },
      { token: TOKEN, url: "http://evil.example/" },
      { token: TOKEN, path: "/render/x" },
      JSON.parse(`{"token":"${TOKEN}","__proto__":{"x":1}}`),
    ]) {
      expect(validateBody(JSON_CT, body(value)), JSON.stringify(value)).toEqual({
        ok: false,
        code: "BAD_REQUEST",
      });
    }
  });

  it("menolak token salah bentuk dan JSON rusak (400)", () => {
    for (const raw of [
      body({ token: TOKEN.slice(1) }),
      body({ token: `${TOKEN}A` }),
      body({ token: `${TOKEN.slice(1)}/` }),
      body({ token: `${TOKEN.slice(1)}=` }),
      body({ token: 123 }),
      body([TOKEN]),
      body(null),
      body(TOKEN),
      Buffer.from("{token:"),
      Buffer.from(""),
    ]) {
      expect(validateBody(JSON_CT, raw), raw.toString()).toEqual({
        ok: false,
        code: "BAD_REQUEST",
      });
    }
  });
});

describe("checkSecret", () => {
  const secret = "k".repeat(40);

  it("true hanya untuk secret yang sama persis", () => {
    expect(checkSecret(secret, secret)).toBe(true);
    expect(checkSecret(`${secret} `, secret)).toBe(false);
    expect(checkSecret("k".repeat(39) + "K", secret)).toBe(false);
  });

  it("header hilang, kosong, ganda, atau beda panjang → false tanpa melempar", () => {
    expect(checkSecret(undefined, secret)).toBe(false);
    expect(checkSecret("", secret)).toBe(false);
    expect(checkSecret([secret, secret], secret)).toBe(false);
    expect(checkSecret("pendek", secret)).toBe(false);
    expect(checkSecret("x".repeat(500), secret)).toBe(false);
    expect(checkSecret("", "")).toBe(false);
  });
});

describe("isAllowedUrl", () => {
  const origin = "http://dashboard-web:3100";

  it("hanya origin app persis (skema, host, port)", () => {
    expect(isAllowedUrl("http://dashboard-web:3100/render", origin)).toBe(true);
    expect(isAllowedUrl("http://DASHBOARD-WEB:3100/_next/static/a.js?v=1#x", origin)).toBe(true);
    expect(isAllowedUrl("http://dashboard-web:3101/render", origin)).toBe(false);
    expect(isAllowedUrl("https://dashboard-web:3100/render", origin)).toBe(false);
    expect(isAllowedUrl("http://dashboard-web.evil:3100/", origin)).toBe(false);
    expect(isAllowedUrl("http://127.0.0.1:3100/", "http://localhost:3100")).toBe(false);
    // Port default dinormalkan URL (env juga menormalkan APP_INTERNAL_URL lewat URL.origin).
    expect(isAllowedUrl("http://web:80/x", new URL("http://web:80").origin)).toBe(true);
  });

  it("menolak data:, blob:, about:, file:, javascript:, ws:, kredensial, dan URL rusak", () => {
    for (const url of [
      "data:image/png;base64,AAAA",
      `blob:${origin}/0b6c1b1e-0000-4000-8000-000000000000`,
      "about:blank",
      "file:///etc/passwd",
      "javascript:alert(1)",
      "ws://dashboard-web:3100/_next/webpack-hmr",
      "http://user:pass@dashboard-web:3100/",
      "bukan url",
    ]) {
      expect(isAllowedUrl(url, origin), url).toBe(false);
    }
  });
});

describe("isAllowedWebSocketUrl", () => {
  it("ws ↔ http dan wss ↔ https pada origin yang sama saja", () => {
    expect(isAllowedWebSocketUrl("ws://localhost:3100/_next/hmr", "http://localhost:3100")).toBe(
      true,
    );
    expect(isAllowedWebSocketUrl("wss://web/x", "https://web")).toBe(true);
    expect(isAllowedWebSocketUrl("wss://localhost:3100/x", "http://localhost:3100")).toBe(false);
    expect(isAllowedWebSocketUrl("ws://localhost:3101/x", "http://localhost:3100")).toBe(false);
    expect(isAllowedWebSocketUrl("http://localhost:3100/x", "http://localhost:3100")).toBe(false);
  });
});

describe("decideRoute", () => {
  const origin = "http://dashboard-web:3100";

  it("origin app → fetch (maxRedirects 0); origin lain, data:, blob: → abort", () => {
    expect(decideRoute(`${origin}/render`, origin)).toBe("fetch");
    expect(decideRoute("http://example.com/x.png", origin)).toBe("abort");
    expect(decideRoute("http://169.254.169.254/latest/meta-data", origin)).toBe("abort");
    expect(decideRoute("data:text/plain,hi", origin)).toBe("abort");
    expect(decideRoute(`blob:${origin}/id`, origin)).toBe("abort");
  });

  it("respons 3xx dari origin app → abort (menutup bypass redirect); lainnya → fulfill", () => {
    for (const status of [300, 301, 302, 303, 304, 307, 308]) {
      expect(decideRoute(`${origin}/r`, origin, status), String(status)).toBe("abort");
    }
    for (const status of [200, 204, 404, 500]) {
      expect(decideRoute(`${origin}/x`, origin, status), String(status)).toBe("fulfill");
    }
    expect(decideRoute("http://example.com/x", origin, 200)).toBe("abort");
  });
});

describe("browserEnv", () => {
  it("hanya meneruskan variabel yang dibutuhkan peramban; secret dan URL app dibuang", () => {
    const env = browserEnv({
      PATH: "/usr/bin",
      HOME: "/home/pwuser",
      LANG: "C.UTF-8",
      LC_ALL: "C.UTF-8",
      XDG_CACHE_HOME: "/tmp/.cache",
      RENDERER_SECRET: "rahasia",
      AUTH_SECRET: "rahasia",
      DATABASE_URL: "postgresql://u:p@db/x",
      S3_SECRET_KEY: "rahasia",
      APP_INTERNAL_URL: "http://web:3100",
      NODE_OPTIONS: "--require /tmp/x.js",
    });
    expect(env).toEqual({
      PATH: "/usr/bin",
      HOME: "/home/pwuser",
      LANG: "C.UTF-8",
      LC_ALL: "C.UTF-8",
      XDG_CACHE_HOME: "/tmp/.cache",
    });
  });
});

describe("browserArgs", () => {
  it("dev (ALLOW_DEV_WEBSOCKET): Local Network Access dimatikan agar WebSocket HMR tidak diblokir", () => {
    expect(browserArgs({ ALLOW_DEV_WEBSOCKET: true })).toEqual([
      "--disable-features=LocalNetworkAccessChecks",
    ]);
  });

  it("produksi/tanpa izin WebSocket: tanpa argumen tambahan (proteksi peramban bawaan tetap)", () => {
    expect(browserArgs({ ALLOW_DEV_WEBSOCKET: false })).toEqual([]);
  });
});
