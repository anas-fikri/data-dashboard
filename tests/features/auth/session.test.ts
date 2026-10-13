import { beforeEach, describe, expect, it, vi } from "vitest";
import { signSession } from "@/features/auth/jwt";
import { loginUrl } from "@/features/auth/redirect";

/*
 * T-019 AC1: sesi yang JWT-nya sah tetapi akunnya dinonaktifkan admin → /login?next=…&reason=disabled.
 * Alasan lain (tanpa cookie, token rusak, sessionVersion basi, akun hilang) tetap tanpa reason.
 */
const SECRET = "s".repeat(32);
const jar = new Map<string, string>();
const findUnique = vi.fn();
const logger = vi.hoisted(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }));

vi.mock("@/lib/env", () => ({
  env: () => ({ APP_URL: "http://localhost:3100", AUTH_SECRET: [SECRET] }),
}));
vi.mock("@/lib/db", () => ({ prisma: { user: { findUnique } } }));
vi.mock("@/lib/logger", () => ({ logger }));
/** Pembatas volume log diuji di denial-log.test.ts; di sini diteruskan ke warn. */
const logAccessDenied = vi.hoisted(() => vi.fn());
vi.mock("@/features/auth/denial-log", () => ({
  logAccessDenied: async (action: string, fields: object, msg: string) => {
    logAccessDenied(action, fields, msg);
    logger.warn(fields, msg);
  },
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (jar.has(name) ? { name, value: jar.get(name) } : undefined),
  }),
  headers: async () => new Headers({ "x-current-path": "/datasets?tab=1" }),
}));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT ${url}`);
  },
  notFound: () => {
    throw new Error("NOT_FOUND_PAGE");
  },
}));

const { AuthError, getSessionUser, requireAdmin, requireUser } =
  await import("@/features/auth/session");

const ID = "cmv4klj5r0007oczvgiofocpg";
const row = (over: Record<string, unknown> = {}) => ({
  id: ID,
  email: "b@pcpexpress.com",
  name: null,
  isAdmin: false,
  isActive: true,
  sessionVersion: 3,
  emailVerifiedAt: new Date(),
  ...over,
});

async function login(sv = 3) {
  jar.set("dd.session", await signSession({ sub: ID, sv }, [SECRET]));
}

beforeEach(() => {
  jar.clear();
  findUnique.mockReset();
});

describe("requireUser / getSessionUser", () => {
  it("akun dinonaktifkan (sessionVersion sudah naik) → redirect dengan reason=disabled", async () => {
    await login(3);
    findUnique.mockResolvedValue(row({ isActive: false, sessionVersion: 4 }));
    await expect(requireUser()).rejects.toThrow(
      "REDIRECT /login?next=%2Fdatasets%3Ftab%3D1&reason=disabled",
    );
    expect(await getSessionUser()).toBeNull();
  });

  it("sessionVersion basi / akun hilang / tanpa cookie / token rusak → redirect tanpa reason", async () => {
    const plain = "REDIRECT /login?next=%2Fdatasets%3Ftab%3D1";
    await login(3);
    findUnique.mockResolvedValue(row({ sessionVersion: 4 }));
    await expect(requireUser()).rejects.toThrow(new Error(plain));
    findUnique.mockResolvedValue(null);
    await expect(requireUser()).rejects.toThrow(new Error(plain));
    jar.set("dd.session", "bukan-jwt");
    await expect(requireUser()).rejects.toThrow(new Error(plain));
    jar.clear();
    await expect(requireUser()).rejects.toThrow(new Error(plain));
  });

  it("mode action tetap melempar AuthError (tanpa redirect) untuk akun nonaktif", async () => {
    await login(3);
    findUnique.mockResolvedValue(row({ isActive: false }));
    await expect(requireUser("action")).rejects.toBeInstanceOf(AuthError);
    await expect(requireAdmin("action")).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
  });

  it("sesi sah: user dari DB; non-admin di requireAdmin('action') → NOT_FOUND", async () => {
    await login(3);
    findUnique.mockResolvedValue(row());
    expect(await requireUser()).toEqual({
      id: ID,
      email: "b@pcpexpress.com",
      name: null,
      isAdmin: false,
    });
    await expect(requireAdmin("action")).rejects.toMatchObject({ code: "NOT_FOUND", userId: ID });
  });

  it("non-admin membuka halaman admin → 404 dan penolakan dicatat (userId + path tanpa query)", async () => {
    await login(3);
    findUnique.mockResolvedValue(row());
    logger.warn.mockClear();
    await expect(requireAdmin()).rejects.toThrow("NOT_FOUND_PAGE");
    expect(logger.warn).toHaveBeenCalledWith(
      { userId: ID, code: "NOT_FOUND", path: "/datasets" },
      "akses halaman admin ditolak",
    );
    // Jatah log per pengguna untuk semua halaman admin (bukan per path).
    expect(logAccessDenied).toHaveBeenCalledWith(
      "page",
      { userId: ID, code: "NOT_FOUND", path: "/datasets" },
      "akses halaman admin ditolak",
    );
  });

  it("admin → lolos tanpa log penolakan", async () => {
    await login(3);
    findUnique.mockResolvedValue(row({ isAdmin: true }));
    logger.warn.mockClear();
    expect(await requireAdmin()).toMatchObject({ id: ID, isAdmin: true });
    expect(logger.warn).not.toHaveBeenCalled();
  });
});

describe("loginUrl", () => {
  it("menambahkan reason=disabled, juga tanpa next", () => {
    expect(loginUrl("/datasets", "disabled")).toBe("/login?next=%2Fdatasets&reason=disabled");
    expect(loginUrl("/", "disabled")).toBe("/login?reason=disabled");
    expect(loginUrl("//evil.example", "disabled")).toBe("/login?reason=disabled");
  });
});
