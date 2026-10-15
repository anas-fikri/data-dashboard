import { describe, expect, it, vi } from "vitest";
import { renderExchange } from "@/features/exports/render-route";
import {
  mintRenderToken,
  type RenderClaims,
  type RenderTokenStore,
} from "@/features/exports/render-token";

/*
 * T-018 AC2: GET /render/<token> → 303 Location /render + Set-Cookie dd.render (Path=/render, HttpOnly,
 * SameSite=Strict, Max-Age ≤ 60); token dipakai ulang / > 60 detik / rusak / Redis mati → 404 polos
 * (tanpa body, no-store, no-referrer). Galat dicatat tanpa token.
 */
vi.mock("@/lib/env", () => ({ env: () => ({}) }));
vi.mock("@/lib/redis", () => ({ redisReady: vi.fn() }));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() } }));

function memStore(): RenderTokenStore {
  const data = new Map<string, string>();
  return {
    setNx: async (k, v) => (data.has(k) ? false : (data.set(k, v), true)),
    getDel: async (k) => {
      const v = data.get(k) ?? null;
      data.delete(k);
      return v;
    },
  };
}

const CLAIMS: RenderClaims = {
  exportId: "cmv4kljx40009oczvdmpuexp0",
  userId: "cmv4kljx40009oczvdmpuown0",
  dashboardId: "cmv4kljx40009oczvdmpurrd0",
  requestedAt: "2026-10-16T01:00:00.000Z",
};
const T0 = Date.parse("2026-10-16T01:00:01.000Z");

async function expectBare404(res: Response) {
  expect(res.status).toBe(404);
  expect(await res.text()).toBe("");
  expect(res.headers.get("set-cookie")).toBeNull();
  expect(res.headers.get("location")).toBeNull();
  expect(res.headers.get("cache-control")).toBe("no-store");
  expect(res.headers.get("referrer-policy")).toBe("no-referrer");
}

describe("GET /render/<token>", () => {
  it("token sah → 303 /render + cookie render; dipakai lagi → 404 polos", async () => {
    const store = memStore();
    const token = await mintRenderToken(store, CLAIMS, T0);
    const deps = {
      store: async () => store,
      internalUrl: "http://web:3000",
      now: () => T0 + 15_000,
    };
    const res = await renderExchange(token, deps);
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("/render");
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(res.headers.get("referrer-policy")).toBe("no-referrer");
    const cookie = res.headers.get("set-cookie") ?? "";
    expect(cookie).toMatch(/^dd\.render=[A-Za-z0-9_-]{43};/);
    expect(cookie).toContain("Path=/render");
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toMatch(/SameSite=strict/i);
    expect(cookie).toContain("Max-Age=45");
    expect(cookie).not.toContain("Secure");
    // Token tidak ikut ke mana pun di respons.
    expect(cookie).not.toContain(token);
    await expectBare404(await renderExchange(token, deps));
  });

  it("APP_INTERNAL_URL https → Secure (tanpa awalan __Secure-)", async () => {
    const store = memStore();
    const token = await mintRenderToken(store, CLAIMS, T0);
    const res = await renderExchange(token, {
      store: async () => store,
      internalUrl: "https://web.internal",
      now: () => T0,
    });
    const cookie = res.headers.get("set-cookie") ?? "";
    expect(cookie).toMatch(/^dd\.render=/);
    expect(cookie).toContain("Secure");
  });

  it("> 60 detik, bentuk salah, token tak dikenal → 404 polos", async () => {
    const store = memStore();
    const token = await mintRenderToken(store, CLAIMS, T0);
    await expectBare404(
      await renderExchange(token, { store: async () => store, now: () => T0 + 60_001 }),
    );
    for (const bad of ["x", "a".repeat(43), "%2e%2e", "a".repeat(200)]) {
      await expectBare404(await renderExchange(bad, { store: async () => store }));
    }
  });

  it("Redis mati → 404 polos; log tanpa token", async () => {
    const log = vi.fn();
    const token = "c".repeat(43);
    const res = await renderExchange(token, {
      store: async () => {
        throw new Error("connect ECONNREFUSED 127.0.0.1:6380");
      },
      log,
    });
    await expectBare404(res);
    expect(log).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(log.mock.calls)).not.toContain(token);
  });
});
