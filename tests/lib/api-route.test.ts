import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

/*
 * Kerangka Route Handler JSON bersama (T-008/T-010): Origin wajib = APP_URL, body JSON berbatas,
 * tanpa sesi → 401, error tak terduga → 503 tanpa detail (detail hanya di log), respons no-store.
 */
class AuthError extends Error {
  constructor(public code: string) {
    super(code);
  }
}
const requireUser = vi.fn();
const logError = vi.fn();
vi.mock("@/features/auth/session", () => ({ AuthError, requireUser }));
vi.mock("@/features/auth/rate-limit", () => ({ hit: vi.fn() }));
vi.mock("@/lib/redis", () => ({ redisReady: vi.fn() }));
vi.mock("@/lib/env", () => ({
  env: () => ({ APP_URL: "http://localhost:3100" }),
  appOrigins: () => ["http://localhost:3100"],
}));
vi.mock("@/lib/logger", () => ({ logger: { error: logError, info: vi.fn(), warn: vi.fn() } }));

const { json, readJson, rejectCrossOrigin, withUser } = await import("@/lib/api-route");

const req = (init: { origin?: string; type?: string; body?: string } = {}) =>
  new NextRequest("http://localhost:3100/api/dashboards/x/layout", {
    method: "PUT",
    headers: {
      ...(init.origin ? { origin: init.origin } : {}),
      ...(init.type ? { "content-type": init.type } : {}),
    },
    body: init.body,
  });

beforeEach(() => vi.clearAllMocks());

describe("api-route", () => {
  it("Origin harus sama dengan APP_URL; tanpa Origin atau Origin asing → 403", async () => {
    expect(rejectCrossOrigin(req({ origin: "http://localhost:3100" }))).toBeNull();
    for (const origin of [undefined, "https://evil.example", "http://localhost:3101", "null"]) {
      const r = rejectCrossOrigin(req({ origin }));
      expect(r?.status).toBe(403);
      expect(await r?.json()).toMatchObject({ code: "FORBIDDEN" });
    }
  });

  it("body: wajib application/json, JSON sah, dan ≤ batas (413 dengan pesan pemanggil)", async () => {
    const ok = await readJson(req({ type: "application/json", body: '{"a":1}' }), 64);
    expect(ok).toEqual({ body: { a: 1 } });
    const plain = await readJson(req({ type: "text/plain", body: '{"a":1}' }), 64);
    expect("response" in plain && plain.response.status).toBe(400);
    const broken = await readJson(req({ type: "application/json", body: "{a" }), 64);
    expect("response" in broken && broken.response.status).toBe(400);
    const big = await readJson(
      req({ type: "application/json", body: JSON.stringify({ x: "y".repeat(100) }) }),
      64,
      "Tata letak terlalu besar.",
    );
    expect("response" in big && big.response.status).toBe(413);
    expect("response" in big && (await big.response.json()).message).toBe(
      "Tata letak terlalu besar.",
    );
  });

  it("tanpa sesi → 401; error tak terduga → 503 tanpa detail; semua respons no-store", async () => {
    requireUser.mockRejectedValueOnce(new AuthError("UNAUTHENTICATED"));
    const anon = await withUser("x", async () => json({ ok: true }));
    expect(anon.status).toBe(401);

    requireUser.mockResolvedValue({ id: "u1" });
    const boom = await withUser("simpan tata letak gagal", async () => {
      throw new Error('relation "Dashboard" does not exist');
    });
    expect(boom.status).toBe(503);
    const body = await boom.json();
    expect(JSON.stringify(body)).not.toContain("Dashboard");
    expect(logError).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "u1" }),
      "simpan tata letak gagal",
    );
    expect(boom.headers.get("cache-control")).toBe("no-store");

    const fine = await withUser("x", async (userId) => json({ ok: true, userId }));
    expect(await fine.json()).toEqual({ ok: true, userId: "u1" });
    expect(fine.headers.get("cache-control")).toBe("no-store");
  });
});
