import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

/*
 * T-017 HTTP /api/exports: Origin wajib untuk POST, sesi (401), status per kode (202/400/429 +
 * Retry-After/404/410), no-store di semua jawaban, dan 302 unduh dengan no-store + no-referrer.
 */
class AuthError extends Error {
  constructor(public code: string) {
    super(code);
  }
}
const requireUser = vi.fn();
const createExport = vi.fn();
const exportStatus = vi.fn();
const downloadExport = vi.fn();
vi.mock("@/features/auth/session", () => ({ AuthError, requireUser }));
vi.mock("@/lib/redis", () => ({ redisReady: vi.fn(async () => ({})) }));
vi.mock("@/lib/env", () => ({
  env: () => ({ APP_URL: "http://localhost:3100", TRUST_PROXY: true }),
}));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() } }));
vi.mock("@/features/query/runtime", () => ({ prismaQueryRepo: {} }));
vi.mock("@/features/exports/repo", () => ({ prismaExportRepo: {} }));
vi.mock("@/features/exports/service", async (orig) => ({
  ...(await orig<typeof import("@/features/exports/service")>()),
  createExport,
  exportStatus,
  downloadExport,
}));

const { createExportRoute, exportDownloadRoute, exportStatusRoute } =
  await import("@/features/exports/http");

const ID = "cmv4kljx40009oczvdmpuexp0";
const post = (body: unknown, origin = "http://localhost:3100") =>
  new NextRequest("http://localhost:3100/api/exports", {
    method: "POST",
    headers: { origin, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
const get = (path: string) =>
  new NextRequest(`http://localhost:3100${path}`, { headers: { "x-real-ip": "10.1.2.3" } });

beforeEach(() => {
  vi.clearAllMocks();
  requireUser.mockResolvedValue({ id: "u1" });
});

describe("POST /api/exports", () => {
  it("202 { ok, exportId } no-store", async () => {
    createExport.mockResolvedValueOnce({ ok: true, exportId: ID });
    const r = await createExportRoute(post({ widgetId: ID, format: "csv" }));
    expect(r.status).toBe(202);
    expect(r.headers.get("cache-control")).toBe("no-store");
    expect(await r.json()).toEqual({ ok: true, exportId: ID });
    expect(createExport).toHaveBeenCalledWith(
      "u1",
      { widgetId: ID, format: "csv" },
      expect.anything(),
    );
  });

  it("Origin asing → 403, tanpa sesi → 401, keduanya tanpa membuat ekspor", async () => {
    expect((await createExportRoute(post({}, "https://evil.example"))).status).toBe(403);
    requireUser.mockRejectedValueOnce(new AuthError("UNAUTHENTICATED"));
    expect((await createExportRoute(post({}))).status).toBe(401);
    expect(createExport).not.toHaveBeenCalled();
  });

  it("status per kode: INVALID 400, EXPORT_BUSY 429, RATE_LIMITED 429 + Retry-After, COLUMN_UNAVAILABLE 409", async () => {
    createExport.mockResolvedValueOnce({ ok: false, code: "INVALID", message: "x" });
    expect((await createExportRoute(post({}))).status).toBe(400);
    createExport.mockResolvedValueOnce({ ok: false, code: "EXPORT_BUSY", message: "x" });
    expect((await createExportRoute(post({}))).status).toBe(429);
    createExport.mockResolvedValueOnce({
      ok: false,
      code: "RATE_LIMITED",
      message: "x",
      retryAfterSec: 77,
    });
    const limited = await createExportRoute(post({}));
    expect(limited.status).toBe(429);
    expect(limited.headers.get("retry-after")).toBe("77");
    createExport.mockResolvedValueOnce({ ok: false, code: "COLUMN_UNAVAILABLE", message: "x" });
    expect((await createExportRoute(post({}))).status).toBe(409);
  });

  it("galat tak terduga (antrean mati) → 503 tanpa detail", async () => {
    createExport.mockRejectedValueOnce(new Error("redis ECONNREFUSED 127.0.0.1:6380"));
    const r = await createExportRoute(post({}));
    expect(r.status).toBe(503);
    expect(JSON.stringify(await r.json())).not.toContain("ECONNREFUSED");
  });
});

describe("GET /api/exports/[id] dan /download", () => {
  it("status: 200 pemilik / 404 lainnya, no-store", async () => {
    exportStatus.mockResolvedValueOnce({ ok: true, state: "running" });
    const ok = await exportStatusRoute(ID);
    expect(ok.status).toBe(200);
    expect(ok.headers.get("cache-control")).toBe("no-store");
    exportStatus.mockResolvedValueOnce({ ok: false, code: "NOT_FOUND", message: "x" });
    expect((await exportStatusRoute(ID)).status).toBe(404);
  });

  it("unduh: 302 ke presigned + no-store + no-referrer; ip dari proxy tepercaya", async () => {
    downloadExport.mockResolvedValueOnce({ ok: true, url: "http://localhost:9100/b/k?sig=1" });
    const r = await exportDownloadRoute(get(`/api/exports/${ID}/download`), ID);
    expect(r.status).toBe(302);
    expect(r.headers.get("location")).toBe("http://localhost:9100/b/k?sig=1");
    expect(r.headers.get("cache-control")).toBe("no-store");
    expect(r.headers.get("referrer-policy")).toBe("no-referrer");
    expect(downloadExport).toHaveBeenCalledWith("u1", ID, "10.1.2.3", expect.anything());
  });

  it("unduh: 404 bukan pemilik, 410 kedaluwarsa, 401 tanpa sesi", async () => {
    downloadExport.mockResolvedValueOnce({ ok: false, code: "NOT_FOUND", message: "x" });
    expect((await exportDownloadRoute(get("/x"), ID)).status).toBe(404);
    downloadExport.mockResolvedValueOnce({ ok: false, code: "EXPORT_EXPIRED", message: "x" });
    expect((await exportDownloadRoute(get("/x"), ID)).status).toBe(410);
    requireUser.mockRejectedValueOnce(new AuthError("UNAUTHENTICATED"));
    expect((await exportDownloadRoute(get("/x"), ID)).status).toBe(401);
  });
});
