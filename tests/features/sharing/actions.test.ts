import { beforeEach, describe, expect, it, vi } from "vitest";

/*
 * T-016 Server Action berbagi: tanpa sesi → NOT_FOUND tanpa menyentuh service (D2); rate limit per
 * pengguna (RULES.share untuk perubahan, RULES.shareSearch untuk baca/cari); Redis mati → perubahan
 * jalan, pencarian ditolak; ip audit dari clientIp(headers, TRUST_PROXY); error tak terduga → pesan
 * umum; daftar dashboard di-revalidate setelah perubahan.
 */
const { AuthError, requireUser, hit, redisReady, service, revalidatePath, logger } = vi.hoisted(
  () => {
    class AuthError extends Error {
      constructor(public readonly code: string) {
        super(code);
      }
    }
    const ok = async (..._args: unknown[]): Promise<unknown> => ({
      ok: true,
      data: { orgShared: false, grants: [], warnings: {} },
    });
    return {
      AuthError,
      requireUser: vi.fn(),
      hit: vi.fn(),
      redisReady: vi.fn(async (): Promise<unknown> => ({})),
      service: {
        listShares: vi.fn(ok),
        searchShareUsers: vi.fn(async (..._args: unknown[]): Promise<unknown> => ({
          ok: true,
          data: [],
        })),
        grantShare: vi.fn(ok),
        setShareRole: vi.fn(ok),
        revokeShare: vi.fn(ok),
        setOrgShare: vi.fn(ok),
      },
      revalidatePath: vi.fn(),
      logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    };
  },
);
vi.mock("@/features/auth/session", () => ({ AuthError, requireUser }));
vi.mock("@/features/auth/rate-limit", async (orig) => ({
  ...(await orig<typeof import("@/features/auth/rate-limit")>()),
  hit,
}));
vi.mock("@/lib/redis", () => ({ redisReady }));
vi.mock("@/lib/env", () => ({ env: () => ({ TRUST_PROXY: true }) }));
vi.mock("@/lib/logger", () => ({ logger }));
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "x-real-ip": "198.51.100.7" }),
}));
vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("next/navigation", () => ({
  unstable_rethrow: (e: unknown) => {
    if (e instanceof Error && "digest" in e) throw e;
  },
}));
vi.mock("@/features/sharing/service", () => service);

const actions = await import("@/features/sharing/actions");
const { RULES } = await import("@/features/auth/rate-limit");

const U = "cuser00000000000000000000";
const D = "cdash00000000000000000000";

beforeEach(() => {
  vi.clearAllMocks();
  requireUser.mockResolvedValue({ id: U });
  hit.mockResolvedValue({ allowed: true, remaining: 10, retryAfterSec: 60 });
});

const mutations = {
  grantShareAction: () => actions.grantShareAction(D, { email: "a@pcpexpress.com" }, "VIEWER"),
  setShareRoleAction: () => actions.setShareRoleAction(D, "cother0000000000000000000", "EDITOR"),
  revokeShareAction: () => actions.revokeShareAction(D, "cother0000000000000000000"),
  setOrgShareAction: () => actions.setOrgShareAction(D, true),
};
const reads = {
  listSharesAction: () => actions.listSharesAction(D),
  searchShareUsersAction: () => actions.searchShareUsersAction(D, "budi"),
};

describe("aturan rate limit", () => {
  it("share 60/10 menit (perubahan), shareSearch 120/menit (baca + cari)", () => {
    expect(RULES.share).toEqual({ name: "share:user", limit: 60, windowSec: 600 });
    expect(RULES.shareSearch).toEqual({ name: "share-search:user", limit: 120, windowSec: 60 });
  });
});

describe("Server Action berbagi", () => {
  it.each(Object.entries({ ...mutations, ...reads }))(
    "%s: tanpa sesi aktif → NOT_FOUND tanpa memanggil service",
    async (_name, call) => {
      requireUser.mockRejectedValueOnce(new AuthError("UNAUTHENTICATED"));
      expect(await call()).toEqual({
        ok: false,
        code: "NOT_FOUND",
        message: "Dashboard tidak ditemukan.",
      });
      expect(requireUser).toHaveBeenCalledWith("action");
      for (const fn of Object.values(service)) expect(fn).not.toHaveBeenCalled();
    },
  );

  it.each(Object.entries(mutations))(
    "%s: RULES.share per pengguna; ip dari header proxy; revalidate daftar dashboard",
    async (_name, call) => {
      expect(await call()).toMatchObject({ ok: true });
      expect(hit).toHaveBeenCalledWith(expect.anything(), RULES.share, U);
      expect(revalidatePath).toHaveBeenCalledWith("/dashboards");
      const called = Object.values(service).find((fn) => fn.mock.calls.length > 0)!;
      expect(called.mock.calls[0]![0]).toBe(U);
      expect(called.mock.calls[0]!.at(-1)).toBe("198.51.100.7");
    },
  );

  it.each(Object.entries(reads))("%s: RULES.shareSearch, tanpa revalidate", async (_name, call) => {
    expect(await call()).toMatchObject({ ok: true });
    expect(hit).toHaveBeenCalledWith(expect.anything(), RULES.shareSearch, U);
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("lewat batas → RATE_LIMITED tanpa memanggil service", async () => {
    hit.mockResolvedValue({ allowed: false, remaining: 0, retryAfterSec: 125 });
    expect(await mutations.grantShareAction()).toEqual({
      ok: false,
      code: "RATE_LIMITED",
      message: "Terlalu banyak permintaan. Coba lagi dalam 3 menit.",
    });
    expect(await reads.searchShareUsersAction()).toMatchObject({ code: "RATE_LIMITED" });
    expect(service.grantShare).not.toHaveBeenCalled();
    expect(service.searchShareUsers).not.toHaveBeenCalled();
  });

  it("Redis mati: perubahan tetap jalan (dicatat); pencarian pengguna ditolak (tidak ada penjelajahan tanpa batas)", async () => {
    redisReady.mockRejectedValue(new Error("ECONNREFUSED"));
    expect(await mutations.revokeShareAction()).toMatchObject({ ok: true });
    expect(await reads.searchShareUsersAction()).toMatchObject({ ok: false, code: "BUSY" });
    expect(service.searchShareUsers).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledTimes(2);
    redisReady.mockResolvedValue({});
  });

  it("hasil gagal service diteruskan apa adanya, tanpa revalidate", async () => {
    service.grantShare.mockResolvedValueOnce({
      ok: false,
      code: "FORBIDDEN",
      message: "Hanya pemilik dataset yang bisa mengatur akses dashboard ini.",
    });
    expect(await mutations.grantShareAction()).toMatchObject({ code: "FORBIDDEN" });
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("error tak terduga → pesan umum (detail hanya di log); kontrol alur Next dilempar ulang", async () => {
    service.setOrgShare.mockRejectedValueOnce(new Error("relation does not exist"));
    expect(await mutations.setOrgShareAction()).toEqual({
      ok: false,
      code: "BUSY",
      message: "Terjadi kesalahan. Coba lagi beberapa saat lagi.",
    });
    expect(logger.error).toHaveBeenCalledWith(
      { action: "setOrgShare", err: "relation does not exist" },
      "aksi berbagi gagal",
    );
    const redirect = Object.assign(new Error("NEXT_REDIRECT"), { digest: "NEXT_REDIRECT;x" });
    service.listShares.mockRejectedValueOnce(redirect);
    await expect(reads.listSharesAction()).rejects.toBe(redirect);
  });
});
