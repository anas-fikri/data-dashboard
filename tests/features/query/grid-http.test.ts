import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

/*
 * T-042: route "Lihat data" memakai aturan rate grid sendiri (bukan aturan query widget) dan mesin
 * lewat gerbang grid; jatah query tidak tersentuh.
 */
class AuthError extends Error {
  constructor(public code: string) {
    super(code);
  }
}
const requireUser = vi.fn();
const hit = vi.fn();
const runGridRows = vi.fn();
const runGridCell = vi.fn();
vi.mock("@/features/auth/session", () => ({ AuthError, requireUser }));
vi.mock("@/features/auth/rate-limit", async (orig) => ({
  ...(await orig<typeof import("@/features/auth/rate-limit")>()),
  hit,
}));
vi.mock("@/lib/redis", () => ({ redisReady: vi.fn(async () => ({})) }));
vi.mock("@/lib/db", () => ({ prisma: {} }));
vi.mock("@/lib/env", () => ({
  env: () => ({ APP_URL: "http://localhost:3100" }),
  appOrigins: () => ["http://localhost:3100"],
}));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() } }));
vi.mock("@/features/query/runtime", async () => {
  const { GridGate } = await import("@/features/query/grid-gate");
  return {
    gridRuntime: vi.fn(async () => ({
      deps: { engine: { withSlot: vi.fn(), exec: vi.fn() }, cache: null, timeoutMs: 1000 },
      gate: new GridGate({ maxGlobal: 2, perUser: 2, queueWaitMs: 100 }),
    })),
  };
});
vi.mock("@/features/query/grid-service", () => ({ runGridRows, runGridCell }));

const { gridRowsRoute, gridCellRoute } = await import("@/features/query/grid-http");
const { RULES } = await import("@/features/auth/rate-limit");

const SHEET = "cmv4kljx40009oczvdgridsh1";
const VER = "cmv4kljx40009oczvdgridve1";

beforeEach(() => {
  vi.clearAllMocks();
  requireUser.mockResolvedValue({ id: "u1" });
  hit.mockResolvedValue({ allowed: true, remaining: 10, retryAfterSec: 60 });
});

describe("grid HTTP rate limit", () => {
  it("POST rows memakai RULES.grid; lewat batas → 429 tanpa menjalankan query", async () => {
    hit.mockResolvedValueOnce({ allowed: false, remaining: 0, retryAfterSec: 7 });
    const r = await gridRowsRoute(
      new NextRequest(`http://localhost:3100/api/sheets/${SHEET}/rows`, {
        method: "POST",
        headers: { origin: "http://localhost:3100", "content-type": "application/json" },
        body: JSON.stringify({ versionId: VER, rowStart: 0, rowCount: 10, cols: [1] }),
      }),
      SHEET,
    );
    expect(r.status).toBe(429);
    expect(r.headers.get("retry-after")).toBe("7");
    expect(hit).toHaveBeenCalledWith(expect.anything(), RULES.grid, "u1");
    expect(hit).not.toHaveBeenCalledWith(expect.anything(), RULES.query, expect.anything());
    expect(runGridRows).not.toHaveBeenCalled();
  });

  it("GET cell memakai RULES.grid dan mesin gerbang grid (withUser/withGlobal)", async () => {
    runGridCell.mockResolvedValueOnce({ ok: false, code: "NOT_FOUND", message: "x" });
    const r = await gridCellRoute(
      new NextRequest(
        `http://localhost:3100/api/sheets/${SHEET}/cell?versionId=${VER}&row=2&pos=1`,
      ),
      SHEET,
    );
    expect(r.status).toBe(404);
    expect(hit).toHaveBeenCalledWith(expect.anything(), RULES.grid, "u1");
    const deps = runGridCell.mock.calls[0]![3];
    expect(typeof deps.engine.withUser).toBe("function");
    expect(typeof deps.engine.withGlobal).toBe("function");
  });
});
