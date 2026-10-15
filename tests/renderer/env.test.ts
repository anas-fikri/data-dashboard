import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { isHstsPreloadedHost, parseRendererEnv } from "../../renderer/env";

const SECRET = "s".repeat(32);
const valid: Record<string, string> = {
  RENDERER_SECRET: SECRET,
  APP_INTERNAL_URL: "http://dashboard-web:3100",
};

describe("parseRendererEnv", () => {
  it("menerima env minimal dengan default D11 dan menormalkan APP_INTERNAL_URL ke origin", () => {
    const env = parseRendererEnv({ ...valid, APP_INTERNAL_URL: "http://Dashboard-Web:3100/" });
    expect(env).toMatchObject({
      NODE_ENV: "development",
      APP_INTERNAL_URL: "http://dashboard-web:3100",
      RENDERER_HOST: "127.0.0.1",
      RENDERER_PORT: 3200,
      RENDERER_CONCURRENCY: 1,
      RENDER_READY_TIMEOUT_MS: 30_000,
      ALLOW_DEV_WEBSOCKET: false,
    });
  });

  it("menolak RENDERER_SECRET < 32 karakter tanpa menulis nilainya di pesan", () => {
    const short = "rahasia-pendek-123";
    let message = "";
    try {
      parseRendererEnv({ ...valid, RENDERER_SECRET: short });
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toMatch(/RENDERER_SECRET/);
    expect(message).not.toContain(short);
    expect(() => parseRendererEnv({ APP_INTERNAL_URL: valid.APP_INTERNAL_URL })).toThrow(
      /RENDERER_SECRET/,
    );
  });

  it("wajib APP_INTERNAL_URL berupa origin http(s) tanpa path, query, atau kredensial", () => {
    expect(() => parseRendererEnv({ RENDERER_SECRET: SECRET })).toThrow(/APP_INTERNAL_URL/);
    for (const bad of [
      "bukan url",
      "ftp://dashboard-web:21",
      "http://dashboard-web:3100/render",
      "http://dashboard-web:3100/?a=1",
      "http://user:pass@dashboard-web:3100",
    ]) {
      expect(() => parseRendererEnv({ ...valid, APP_INTERNAL_URL: bad }), bad).toThrow(
        /APP_INTERNAL_URL/,
      );
    }
  });

  it("menolak host http yang dipaksa https oleh HSTS preload Chromium (app, dev, *.app, …)", () => {
    for (const bad of [
      "http://app:3100",
      "http://APP:3100",
      "http://dev:3100",
      "http://page",
      "http://foo:8080",
      "http://renderer.app:3100",
      "http://web.dev.:3100",
    ]) {
      expect(() => parseRendererEnv({ ...valid, APP_INTERNAL_URL: bad }), bad).toThrow(/HSTS/);
    }
  });

  it("menerima nama service yang lolos uji Chromium, localhost, IP, dan https", () => {
    for (const ok of [
      "http://web:3100",
      "http://dashboard-web:3100",
      "http://renderer-app:3100",
      "http://prod:3100",
      "http://localhost:3100",
      "http://127.0.0.1:3100",
      "https://app.internal.example:443",
    ]) {
      expect(() => parseRendererEnv({ ...valid, APP_INTERNAL_URL: ok }), ok).not.toThrow();
    }
  });

  it("RENDERER_CONCURRENCY 1–2, port dan timeout dibatasi, angka dari string", () => {
    expect(parseRendererEnv({ ...valid, RENDERER_CONCURRENCY: "2" }).RENDERER_CONCURRENCY).toBe(2);
    expect(() => parseRendererEnv({ ...valid, RENDERER_CONCURRENCY: "0" })).toThrow(
      /RENDERER_CONCURRENCY/,
    );
    expect(() => parseRendererEnv({ ...valid, RENDERER_CONCURRENCY: "3" })).toThrow(
      /RENDERER_CONCURRENCY/,
    );
    expect(parseRendererEnv({ ...valid, RENDERER_PORT: "4300" }).RENDERER_PORT).toBe(4300);
    expect(() => parseRendererEnv({ ...valid, RENDERER_PORT: "70000" })).toThrow(/RENDERER_PORT/);
    expect(() => parseRendererEnv({ ...valid, RENDER_READY_TIMEOUT_MS: "10" })).toThrow(
      /RENDER_READY_TIMEOUT_MS/,
    );
  });

  it("ALLOW_DEV_WEBSOCKET hanya true/false dan ditolak di produksi", () => {
    expect(parseRendererEnv({ ...valid, ALLOW_DEV_WEBSOCKET: "true" }).ALLOW_DEV_WEBSOCKET).toBe(
      true,
    );
    expect(() => parseRendererEnv({ ...valid, ALLOW_DEV_WEBSOCKET: "yes" })).toThrow(
      /ALLOW_DEV_WEBSOCKET/,
    );
    expect(() =>
      parseRendererEnv({ ...valid, NODE_ENV: "production", ALLOW_DEV_WEBSOCKET: "true" }),
    ).toThrow(/ALLOW_DEV_WEBSOCKET/);
    expect(parseRendererEnv({ ...valid, NODE_ENV: "production" }).NODE_ENV).toBe("production");
  });

  it("produksi menolak RENDERER_SECRET placeholder dari .env.example", () => {
    expect(() =>
      parseRendererEnv({
        ...valid,
        NODE_ENV: "production",
        RENDERER_SECRET: "change-me-change-me-change-me-change-me",
      }),
    ).toThrow(/RENDERER_SECRET/);
  });
});

describe("isHstsPreloadedHost", () => {
  it("melihat label terakhir, tidak peka kapital, titik akhir diabaikan", () => {
    expect(isHstsPreloadedHost("app")).toBe(true);
    expect(isHstsPreloadedHost("Renderer.DEV.")).toBe(true);
    expect(isHstsPreloadedHost("app.internal")).toBe(false);
    expect(isHstsPreloadedHost("dashboard-web")).toBe(false);
  });
});

describe("batas modul renderer", () => {
  it("tidak mengimpor kode app (src/, alias @/), termasuk src/lib/env.ts", () => {
    const dir = join(process.cwd(), "renderer");
    for (const file of readdirSync(dir).filter((f) => /\.(ts|mjs)$/.test(f))) {
      const source = readFileSync(join(dir, file), "utf8");
      expect(source, file).not.toMatch(/from\s+["'](@\/|\.\.\/src\/|.*\/src\/lib\/)/);
    }
  });
});
