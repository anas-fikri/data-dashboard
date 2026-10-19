import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

/*
 * T-012: HTTP POST /api/dashboards/[id]/filter-values — Origin wajib, sesi, rate limit per user
 * (RULES.filterValues, 429 + Retry-After tanpa menyentuh query), status per kode, dan log tanpa
 * kolom/kata cari.
 */
class AuthError extends Error {
  constructor(public code: string) {
    super(code);
  }
}
const requireUser = vi.fn();
const hit = vi.fn();
const logError = vi.fn();
const runFilterValues = vi.fn();
vi.mock("@/features/auth/session", () => ({ AuthError, requireUser }));
vi.mock("@/features/auth/rate-limit", async (orig) => ({
  ...(await orig<typeof import("@/features/auth/rate-limit")>()),
  hit,
}));
vi.mock("@/lib/redis", () => ({ redisReady: vi.fn(async () => ({})) }));
vi.mock("@/lib/env", () => ({
  env: () => ({ APP_URL: "http://localhost:3100" }),
  appOrigins: () => ["http://localhost:3100"],
}));
vi.mock("@/lib/logger", () => ({ logger: { error: logError, info: vi.fn(), warn: vi.fn() } }));
vi.mock("@/features/query/runtime", () => ({ queryDeps: vi.fn(async () => ({})) }));
vi.mock("@/features/query/filter-values", () => ({ runFilterValues }));

const { filterValuesRoute } = await import("@/features/query/http");
const { RULES } = await import("@/features/auth/rate-limit");

const DASH = "cmv4kljx40009oczvdmpurrd0";
const req = (body: unknown, origin = "http://localhost:3100") =>
  new NextRequest(`http://localhost:3100/api/dashboards/${DASH}/filter-values`, {
    method: "POST",
    headers: { origin, "content-type": "application/json" },
    body: JSON.stringify(body),
  });

beforeEach(() => {
  vi.clearAllMocks();
  requireUser.mockResolvedValue({ id: "u1" });
  hit.mockResolvedValue({ allowed: true, remaining: 10, retryAfterSec: 60 });
});

describe("filter-values HTTP", () => {
  it("aturan rate limit sendiri: 300 per menit per user", () => {
    expect(RULES.filterValues).toEqual({ name: "filter-values:user", limit: 300, windowSec: 60 });
  });

  it("lewat batas → 429 + Retry-After, query tidak dijalankan", async () => {
    hit.mockResolvedValueOnce({ allowed: false, remaining: 0, retryAfterSec: 42 });
    const r = await filterValuesRoute(req({ column: "Kota", q: "jak" }), DASH);
    expect(r.status).toBe(429);
    expect(r.headers.get("retry-after")).toBe("42");
    expect(await r.json()).toMatchObject({ ok: false, code: "RATE_LIMITED" });
    expect(hit).toHaveBeenCalledWith(expect.anything(), RULES.filterValues, "u1");
    expect(runFilterValues).not.toHaveBeenCalled();
  });

  it("Origin asing → 403; tanpa sesi → 401; keduanya tanpa query", async () => {
    expect(
      (await filterValuesRoute(req({ column: "Kota" }, "https://evil.example"), DASH)).status,
    ).toBe(403);
    requireUser.mockRejectedValueOnce(new AuthError("UNAUTHENTICATED"));
    expect((await filterValuesRoute(req({ column: "Kota" }), DASH)).status).toBe(401);
    expect(runFilterValues).not.toHaveBeenCalled();
  });

  it("status per kode: NOT_FOUND → 404, INVALID → 400; sukses → 200 no-store", async () => {
    runFilterValues.mockResolvedValueOnce({
      ok: false,
      code: "NOT_FOUND",
      message: "Dashboard tidak ditemukan.",
    });
    expect((await filterValuesRoute(req({ column: "Kota" }), DASH)).status).toBe(404);
    runFilterValues.mockResolvedValueOnce({ ok: false, code: "INVALID", message: "x" });
    expect((await filterValuesRoute(req({ column: "Kota" }), DASH)).status).toBe(400);
    runFilterValues.mockResolvedValueOnce({
      ok: true,
      type: "text",
      values: ["Jakarta"],
      truncated: false,
    });
    const ok = await filterValuesRoute(req({ column: "Kota", q: "jak" }), DASH);
    expect(ok.status).toBe(200);
    expect(ok.headers.get("cache-control")).toBe("no-store");
    expect(runFilterValues).toHaveBeenLastCalledWith(
      "u1",
      DASH,
      { column: "Kota", q: "jak" },
      expect.anything(),
      // Sinyal permintaan diteruskan: ketikan berikutnya membatalkan query yang masih antre.
      expect.any(AbortSignal),
    );
  });

  it("error tak terduga → 503 tanpa detail; log tanpa kolom/kata cari", async () => {
    runFilterValues.mockRejectedValueOnce(new Error("koneksi DuckDB putus"));
    const r = await filterValuesRoute(req({ column: "Kota", q: "rahasia-cari" }), DASH);
    expect(r.status).toBe(503);
    expect(JSON.stringify(await r.json())).not.toContain("DuckDB");
    expect(JSON.stringify(logError.mock.calls)).not.toContain("rahasia-cari");
  });
});
