import { beforeEach, describe, expect, it, vi } from "vitest";

/*
 * T-020 AC3: Server Action panduan — non-admin / tanpa sesi → NOT_FOUND tanpa menyentuh service;
 * admin → service dipanggil dengan id pelaku + ip, halaman admin dan /panduan di-revalidate.
 */
const { AuthError, requireAdmin, service, revalidatePath } = vi.hoisted(() => {
  class AuthError extends Error {
    constructor(
      public readonly code: "UNAUTHENTICATED" | "NOT_FOUND",
      public readonly userId?: string,
    ) {
      super(code);
    }
  }
  const ok = async () => ({ ok: true as const, data: null });
  return {
    AuthError,
    requireAdmin: vi.fn(),
    revalidatePath: vi.fn(),
    service: {
      createGuide: vi.fn(async () => ({ ok: true as const, data: { id: "g1" } })),
      updateGuide: vi.fn(ok),
      setGuideStatus: vi.fn(ok),
      moveGuide: vi.fn(ok),
      deleteGuide: vi.fn(ok),
    },
  };
});

vi.mock("@/features/auth/session", () => ({ AuthError, requireAdmin }));
vi.mock("@/features/auth/denial-log", () => ({ logAccessDenied: vi.fn(async () => {}) }));
vi.mock("@/features/guides/service", () => service);
vi.mock("@/lib/redis", () => ({ redisReady: async () => ({ eval: async () => [1, 60] }) }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/env", () => ({ env: () => ({ TRUST_PROXY: true }) }));
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "x-real-ip": "203.0.113.9" }),
}));
vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("next/navigation", () => ({ unstable_rethrow: () => {} }));

const actions = await import("@/features/guides/actions");
const ID = "cmv4kljx40009oczvdmpurrga";
const input = { title: "A", slug: "a", role: "VIEWER", contextKey: "SCHEMA", bodyMarkdown: "x" };

beforeEach(() => vi.clearAllMocks());

describe("Server Action panduan (T-020)", () => {
  it("AC3: non-admin dan tanpa sesi → NOT_FOUND, service tidak disentuh", async () => {
    for (const err of [new AuthError("NOT_FOUND", "u1"), new AuthError("UNAUTHENTICATED")]) {
      requireAdmin.mockRejectedValue(err);
      const results = await Promise.all([
        actions.createGuideAction(input),
        actions.updateGuideAction(ID, input),
        actions.setGuideStatusAction(ID, true),
        actions.moveGuideAction(ID, "up"),
        actions.deleteGuideAction(ID),
      ]);
      for (const r of results) expect(r).toMatchObject({ ok: false, code: "NOT_FOUND" });
    }
    for (const fn of Object.values(service)) expect(fn).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("admin → service dengan id pelaku + ip; halaman di-revalidate", async () => {
    requireAdmin.mockResolvedValue({ id: "admin1", isAdmin: true });
    expect(await actions.createGuideAction(input)).toEqual({ ok: true, data: { id: "g1" } });
    // T-0vjt AC3: buat/ubah juga menerima pelaku + ip untuk AuditLog guide.create/guide.update.
    expect(service.createGuide).toHaveBeenCalledWith("admin1", input, "203.0.113.9");
    expect(await actions.updateGuideAction(ID, input)).toMatchObject({ ok: true });
    expect(service.updateGuide).toHaveBeenCalledWith("admin1", ID, input, "203.0.113.9");
    expect(await actions.setGuideStatusAction(ID, true)).toMatchObject({ ok: true });
    expect(service.setGuideStatus).toHaveBeenCalledWith("admin1", ID, "PUBLISHED", "203.0.113.9");
    expect(await actions.deleteGuideAction(ID)).toMatchObject({ ok: true });
    expect(service.deleteGuide).toHaveBeenCalledWith("admin1", ID, "203.0.113.9");
    expect(revalidatePath).toHaveBeenCalledWith("/admin/panduan");
    expect(revalidatePath).toHaveBeenCalledWith("/panduan");
  });

  it("arah urutan selain up/down ditolak tanpa service", async () => {
    requireAdmin.mockResolvedValue({ id: "admin1", isAdmin: true });
    expect(await actions.moveGuideAction(ID, "kiri" as "up")).toMatchObject({ code: "NOT_FOUND" });
    expect(service.moveGuide).not.toHaveBeenCalled();
  });
});
