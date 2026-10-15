import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  DASH,
  DS,
  EDITOR,
  FOREIGN_SHEET,
  OWNER,
  SPEC,
  STRANGER,
  VIEWER,
  WID,
  WIDGET_UPDATED_AT,
  makeDeps,
} from "./sharing-fixtures";

/*
 * T-016: HTTP /api/query — pilihan mode dari kunci body (widgetId → widget, dashboardId → editor,
 * lainnya → query bebas), status per kode (tanpa akses 404, body salah 400), JSON tanpa cached/ms untuk
 * non-pemilik, rate limit per user yang sama untuk semua mode, dan log tanpa isi spec.
 */
class AuthError extends Error {
  constructor(public code: string) {
    super(code);
  }
}
const hit = vi.fn();
const logError = vi.fn();
vi.mock("@/features/auth/session", () => ({ AuthError, requireUser: vi.fn() }));
vi.mock("@/features/auth/rate-limit", async (orig) => ({
  ...(await orig<typeof import("@/features/auth/rate-limit")>()),
  hit,
}));
vi.mock("@/lib/redis", () => ({ redisReady: vi.fn(async () => ({})) }));
vi.mock("@/lib/env", () => ({ env: () => ({ APP_URL: "http://localhost:3100" }) }));
vi.mock("@/lib/logger", () => ({ logger: { error: logError, info: vi.fn(), warn: vi.fn() } }));
let current = makeDeps();
vi.mock("@/features/query/runtime", () => ({ queryDeps: vi.fn(async () => current.deps) }));

const { runtimeQuery } = await import("@/features/query/http");
const { RULES } = await import("@/features/auth/rate-limit");

const req = (body: unknown) =>
  new NextRequest("http://localhost:3100/api/query", {
    method: "POST",
    headers: { origin: "http://localhost:3100", "content-type": "application/json" },
    body: JSON.stringify(body),
  });
const call = async (user: string, body: unknown) => {
  const r = await runtimeQuery(req(body), user);
  return { status: r.status, json: (await r.json()) as Record<string, unknown> };
};

beforeEach(() => {
  vi.clearAllMocks();
  current = makeDeps();
  hit.mockResolvedValue({ allowed: true, remaining: 10, retryAfterSec: 60 });
});

describe("/api/query widget { widgetId, … } (T-016)", () => {
  it("viewer/editor 200 tanpa cached/ms; pemilik dengan cached/ms; orang asing 404", async () => {
    for (const user of [VIEWER, EDITOR]) {
      const r = await call(user, { widgetId: WID("kpi") });
      expect(r.status).toBe(200);
      expect(r.json).toMatchObject({ ok: true, rows: [[42]] });
      expect(r.json).not.toHaveProperty("cached");
      expect(r.json).not.toHaveProperty("ms");
    }
    const owner = await call(OWNER, { widgetId: WID("kpi") });
    expect(owner.status).toBe(200);
    expect(owner.json).toMatchObject({ ok: true, cached: true, ms: expect.any(Number) });
    expect(await call(STRANGER, { widgetId: WID("kpi") })).toMatchObject({
      status: 404,
      json: { ok: false, code: "NOT_FOUND" },
    });
    // Rate limit yang sama (per user) untuk semua peran.
    expect(hit).toHaveBeenCalledWith(expect.anything(), RULES.query, VIEWER);
  });

  it("AC3: viewer memfilter kolom yang tidak diizinkan dashboard → 400", async () => {
    const r = await call(VIEWER, {
      widgetId: WID("kpi"),
      dashboardFilters: [{ column: "Omzet", op: "in", values: ["1"] }],
    });
    // Tetap 400 (AC3), dengan petunjuk muat ulang + versi widget di JSON (review T-016 R2 CL-2).
    expect(r).toEqual({
      status: 400,
      json: {
        ok: false,
        code: "INVALID",
        message:
          "Filter tidak diizinkan untuk dashboard ini. Muat ulang halaman bila pengaturan dashboard baru diubah.",
        widgetVersion: WIDGET_UPDATED_AT.toISOString(),
      },
    });
    expect(current.exec).not.toHaveBeenCalled();
  });

  it("viewer: kolom tersembunyi → 409 dengan pesan umum tanpa nama kolom", async () => {
    const r = await call(VIEWER, { widgetId: WID("hidden") });
    expect(r.status).toBe(409);
    expect(r.json).toEqual({
      ok: false,
      code: "COLUMN_UNAVAILABLE",
      message: "Kolom yang dipakai widget ini tidak tersedia.",
      widgetVersion: WIDGET_UPDATED_AT.toISOString(),
    });
  });

  it("review R2 CL-2: urutan kolom yang sudah tidak ada di tabel → 400 + widgetVersion; 404 tanpa versi", async () => {
    const r = await call(VIEWER, { widgetId: WID("gone"), sort: { column: 2, dir: "asc" } });
    expect(r).toEqual({
      status: 400,
      json: {
        ok: false,
        code: "INVALID",
        message: "Urutan hanya untuk kolom di tabel ini.",
        widgetVersion: WIDGET_UPDATED_AT.toISOString(),
      },
    });
    const denied = await call(STRANGER, { widgetId: WID("gone"), sort: { column: 2, dir: "asc" } });
    expect(denied.status).toBe(404);
    expect(denied.json).not.toHaveProperty("widgetVersion");
  });
});

describe("/api/query { dashboardId, spec } (T-016, AC6)", () => {
  it("editor 200 tanpa cached/ms; viewer dan orang asing 404; sheet dataset lain 404", async () => {
    const editor = await call(EDITOR, { dashboardId: DASH, spec: SPEC });
    expect(editor.status).toBe(200);
    expect(editor.json).not.toHaveProperty("cached");
    for (const user of [VIEWER, STRANGER]) {
      expect((await call(user, { dashboardId: DASH, spec: SPEC })).status).toBe(404);
    }
    expect(
      (await call(EDITOR, { dashboardId: DASH, spec: { ...SPEC, sheetId: FOREIGN_SHEET } })).status,
    ).toBe(404);
    expect((await call(OWNER, { dashboardId: DASH, spec: SPEC })).json).toHaveProperty("cached");
  });

  it("body salah → 400 sebelum otorisasi", async () => {
    for (const body of [
      { dashboardId: DASH },
      { dashboardId: DASH, spec: SPEC, datasetId: DS },
      { dashboardId: 42, spec: SPEC },
    ]) {
      expect((await call(STRANGER, body)).status).toBe(400);
    }
    expect(current.repo.dashboardAccess).not.toHaveBeenCalled();
  });
});

describe("/api/query mode bebas dan pemilihan mode", () => {
  it("AC1: { datasetId, spec } dari non-pemilik → 404; pemilik → 200", async () => {
    for (const user of [VIEWER, EDITOR, STRANGER]) {
      expect(await call(user, { datasetId: DS, spec: SPEC })).toMatchObject({
        status: 404,
        json: { ok: false, code: "NOT_FOUND" },
      });
    }
    expect((await call(OWNER, { datasetId: DS, spec: SPEC })).status).toBe(200);
    expect(current.repo.dashboardAccess).not.toHaveBeenCalled();
  });

  it("widgetId menang atas dashboardId (body strict → 400); bukan objek → mode bebas 400", async () => {
    expect((await call(EDITOR, { widgetId: WID("kpi"), dashboardId: DASH })).status).toBe(400);
    expect(current.repo.widget).not.toHaveBeenCalled();
    expect(current.repo.dashboardAccess).not.toHaveBeenCalled();
    for (const body of [[{ dashboardId: DASH }], "dashboardId", null]) {
      expect((await call(EDITOR, body)).status).toBe(400);
    }
    expect(current.repo.ownedDataset).not.toHaveBeenCalled();
  });

  it("error tak terduga → 500 tanpa detail; log hanya userId + mode + pesan error", async () => {
    current.repo.dashboardAccess.mockRejectedValueOnce(new Error("koneksi DB putus"));
    const r = await call(EDITOR, { dashboardId: DASH, spec: { ...SPEC, limit: 77 } });
    expect(r.status).toBe(500);
    expect(JSON.stringify(r.json)).not.toContain("DB");
    expect(logError).toHaveBeenCalledWith(
      { userId: EDITOR, mode: "dashboard", err: "koneksi DB putus" },
      "query gagal",
    );
  });
});
