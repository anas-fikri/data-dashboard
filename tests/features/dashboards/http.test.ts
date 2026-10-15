import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

/*
 * T-016: Route Handler kanvas dashboard — viewer (bisa melihat, tidak boleh mengubah) → 403 FORBIDDEN;
 * tanpa akses → 404; status lain tetap. Service dipalsukan: logika peran diuji di roles.test.ts.
 */
const { requireUser, hit, service } = vi.hoisted(() => ({
  requireUser: vi.fn(),
  hit: vi.fn(),
  service: {
    addWidget: vi.fn(),
    configureWidget: vi.fn(),
    deleteWidget: vi.fn(),
    renameWidget: vi.fn(),
    saveLayout: vi.fn(),
    setDashboardFilterColumns: vi.fn(),
  },
}));
vi.mock("@/features/auth/session", () => ({ AuthError: class extends Error {}, requireUser }));
vi.mock("@/features/auth/rate-limit", async (orig) => ({
  ...(await orig<typeof import("@/features/auth/rate-limit")>()),
  hit,
}));
vi.mock("@/lib/redis", () => ({ redisReady: vi.fn(async () => ({})) }));
vi.mock("@/lib/env", () => ({ env: () => ({ APP_URL: "http://localhost:3100" }) }));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() } }));
vi.mock("@/features/dashboards/service", () => service);

const http = await import("@/features/dashboards/http");

const D = "cmv4kljx40009oczvdmpurrd0";
const W = "cmv4kljx40009oczvdmpurrwa";
const req = (method: string, body?: unknown) =>
  new NextRequest(`http://localhost:3100/api/dashboards/${D}/layout`, {
    method,
    headers: { origin: "http://localhost:3100", "content-type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });

beforeEach(() => {
  vi.clearAllMocks();
  requireUser.mockResolvedValue({ id: "u1" });
  hit.mockResolvedValue({ allowed: true, remaining: 10, retryAfterSec: 60 });
});

const FORBIDDEN = {
  ok: false,
  code: "FORBIDDEN",
  message: "Anda hanya punya akses lihat ke dashboard ini.",
};

describe("status HTTP per kode (T-016)", () => {
  it("FORBIDDEN → 403 di setiap rute tulis; NOT_FOUND → 404", async () => {
    for (const fn of Object.values(service)) fn.mockResolvedValue(FORBIDDEN);
    const calls = [
      () => http.saveLayoutRoute(req("PUT", { baseRevision: 1, items: [] }), D),
      () => http.addWidgetRoute(req("POST", { baseRevision: 1 }), D),
      () => http.deleteWidgetRoute(req("DELETE"), D, W),
      () => http.updateWidgetRoute(req("PATCH", { title: "X" }), D, W),
      () => http.updateWidgetRoute(req("PATCH", { type: "kpi", spec: {} }), D, W),
      () => http.setFilterColumnsRoute(req("PATCH", { filterColumns: [] }), D),
    ];
    for (const call of calls) {
      const r = await call();
      expect(r.status).toBe(403);
      expect(await r.json()).toEqual(FORBIDDEN);
    }
    service.saveLayout.mockResolvedValueOnce({
      ok: false,
      code: "NOT_FOUND",
      message: "Dashboard tidak ditemukan.",
    });
    expect((await http.saveLayoutRoute(req("PUT", { baseRevision: 1, items: [] }), D)).status).toBe(
      404,
    );
  });

  it("isi + judul sekaligus: isi ditolak FORBIDDEN → judul tidak disimpan", async () => {
    service.configureWidget.mockResolvedValueOnce(FORBIDDEN);
    const r = await http.updateWidgetRoute(
      req("PATCH", { type: "kpi", spec: {}, title: "X" }),
      D,
      W,
    );
    expect(r.status).toBe(403);
    expect(service.renameWidget).not.toHaveBeenCalled();
  });

  it("review DI-1: version diteruskan ke service; isi + judul → judul memakai versi baru dari isi; STALE → 409", async () => {
    const V = "2026-10-15T01:02:03.004Z";
    const V2 = "2026-10-15T01:02:03.005Z";
    const V3 = "2026-10-15T01:02:03.006Z";
    service.configureWidget.mockResolvedValueOnce({
      ok: true,
      data: { type: "kpi", spec: {}, version: V2 },
    });
    service.renameWidget.mockResolvedValueOnce({ ok: true, data: { title: "X", version: V3 } });
    const r = await http.updateWidgetRoute(
      req("PATCH", { type: "kpi", spec: {}, title: "X", version: V }),
      D,
      W,
    );
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ ok: true, data: { title: "X", version: V3 } });
    expect(service.configureWidget).toHaveBeenCalledWith("u1", D, W, "kpi", {}, V);
    expect(service.renameWidget).toHaveBeenCalledWith("u1", D, W, "X", V2);

    const STALE = { ok: false, code: "STALE", message: "Widget ini sudah diubah." };
    service.renameWidget.mockResolvedValueOnce(STALE);
    const s = await http.updateWidgetRoute(req("PATCH", { title: "Y", version: V }), D, W);
    expect(s.status).toBe(409);
    expect(await s.json()).toEqual(STALE);
    expect(service.renameWidget).toHaveBeenLastCalledWith("u1", D, W, "Y", V);

    // Tanpa versi dari klien: judul juga tanpa CAS (shortcut pemanggil API lama).
    service.configureWidget.mockResolvedValueOnce({
      ok: true,
      data: { type: "kpi", spec: {}, version: V2 },
    });
    service.renameWidget.mockResolvedValueOnce({ ok: true, data: { title: "Z", version: V3 } });
    await http.updateWidgetRoute(req("PATCH", { type: "kpi", spec: {}, title: "Z" }), D, W);
    expect(service.renameWidget).toHaveBeenLastCalledWith("u1", D, W, "Z", undefined);
  });
});
