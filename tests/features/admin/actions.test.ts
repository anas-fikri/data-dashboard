import { beforeEach, describe, expect, it, vi } from "vitest";
import { cuid, fakeDb, user } from "./fake-db";

/*
 * T-019 Server Action admin: non-admin / tanpa sesi / sesi yang dicabut → NOT_FOUND tanpa satu pun
 * kueri tulis (AC3, AC6); rate limit per admin; cabut admin diri sendiri menerbitkan ulang sesi;
 * ip audit dari clientIp(headers, TRUST_PROXY).
 */
const { AuthError, requireAdmin, createSession } = vi.hoisted(() => {
  class AuthError extends Error {
    constructor(public readonly code: "UNAUTHENTICATED" | "NOT_FOUND") {
      super(code);
    }
  }
  return { AuthError, requireAdmin: vi.fn(), createSession: vi.fn(async () => {}) };
});
const db = fakeDb();
const store = { eval: vi.fn(async () => [1, 60]) };
const redisReady = vi.fn(async () => store);
const revalidatePath = vi.fn((_path: string) => {});
/** Seperti aslinya: hanya error kontrol alur Next (digest NEXT_*) yang dilempar ulang. */
const unstable_rethrow = vi.fn((e: unknown) => {
  if (e instanceof Error && "digest" in e && String(e.digest).startsWith("NEXT_")) throw e;
});

vi.mock("@/features/auth/session", () => ({ AuthError, requireAdmin, createSession }));
vi.mock("@/lib/db", () => ({ prisma: db.prisma }));
vi.mock("@/lib/redis", () => ({ redisReady }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/storage/multipart", () => ({ s3Multipart: {} }));
vi.mock("@/lib/env", () => ({
  env: () => ({ TRUST_PROXY: true, USER_STORAGE_QUOTA_BYTES: 10_000 }),
}));
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "x-real-ip": "203.0.113.9" }),
}));
vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("next/navigation", () => ({ unstable_rethrow }));

const actions = await import("@/features/admin/actions");

const A = cuid("admina");
const B = cuid("userb");
const C = cuid("userc");
const D = cuid("admind");
const asSession = (id: string, isAdmin = true) => ({
  id,
  email: "a@pcpexpress.com",
  name: null,
  isAdmin,
});

function expectNoDb() {
  expect(db.prisma.$transaction).not.toHaveBeenCalled();
  expect(db.tx.user.update).not.toHaveBeenCalled();
  expect(db.tx.dataset.updateMany).not.toHaveBeenCalled();
  expect(db.tx.auditLog.create).not.toHaveBeenCalled();
}

beforeEach(() => {
  db.reset();
  requireAdmin.mockReset();
  store.eval.mockResolvedValue([1, 60]);
  redisReady.mockResolvedValue(store);
});

describe("guard admin", () => {
  const calls = [
    () => actions.setUserAdminAction(B, true),
    () => actions.setUserActiveAction(B, false),
    () => actions.transferDatasetsAction(B, C),
  ];

  it("non-admin (AuthError NOT_FOUND) → NOT_FOUND tanpa perubahan apa pun (AC3)", async () => {
    requireAdmin.mockRejectedValue(new AuthError("NOT_FOUND"));
    for (const call of calls) {
      expect(await call()).toEqual({
        ok: false,
        code: "NOT_FOUND",
        message: "Halaman tidak ditemukan.",
      });
    }
    expectNoDb();
    expect(redisReady).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
    expect(requireAdmin).toHaveBeenCalledWith("action");
  });

  it("tanpa sesi / sesi dicabut (UNAUTHENTICATED) → juga NOT_FOUND (AC6)", async () => {
    requireAdmin.mockRejectedValue(new AuthError("UNAUTHENTICATED"));
    for (const call of calls) expect(await call()).toMatchObject({ ok: false, code: "NOT_FOUND" });
    expectNoDb();
  });

  it("redirect/notFound milik Next dilempar ulang, bukan ditelan", async () => {
    const redirectErr = Object.assign(new Error("NEXT_REDIRECT"), {
      digest: "NEXT_REDIRECT;replace;/login;307;",
    });
    requireAdmin.mockRejectedValue(redirectErr);
    await expect(actions.setUserActiveAction(B, false)).rejects.toBe(redirectErr);
    expectNoDb();
  });

  it("DB mati saat memeriksa sesi → BUSY (tidak melempar), tanpa perubahan", async () => {
    requireAdmin.mockRejectedValue(new Error("Can't reach database server"));
    expect(await actions.setUserAdminAction(B, true)).toEqual({
      ok: false,
      code: "BUSY",
      message: "Terjadi kesalahan. Coba lagi beberapa saat lagi.",
    });
    expectNoDb();
  });
});

describe("aksi admin", () => {
  beforeEach(() => requireAdmin.mockResolvedValue(asSession(A)));

  it("melewati rate limit → RATE_LIMITED tanpa perubahan", async () => {
    store.eval.mockResolvedValue([61, 42]);
    expect(await actions.setUserActiveAction(B, false)).toEqual({
      ok: false,
      code: "RATE_LIMITED",
      message: "Terlalu banyak perubahan. Coba lagi dalam 1 menit.",
    });
    expect(store.eval).toHaveBeenCalledWith(expect.any(String), 1, `rl:admin:user:${A}`, "60");
    expectNoDb();
  });

  it("nonaktifkan: sukses, audit memakai IP klien, halaman di-revalidate", async () => {
    db.state.users.set(A, user(A, { isAdmin: true }));
    db.state.users.set(B, user(B));
    expect(await actions.setUserActiveAction(B, false)).toEqual({ ok: true, data: null });
    expect(db.state.audits[0]).toMatchObject({
      actorId: A,
      action: "user.deactivate",
      targetId: B,
      ip: "203.0.113.9",
    });
    expect(revalidatePath).toHaveBeenCalledWith("/admin/pengguna");
  });

  it("Redis mati: aksi tetap jalan (pencabutan akses tidak boleh terhalang)", async () => {
    redisReady.mockRejectedValue(new Error("ECONNREFUSED"));
    db.state.users.set(A, user(A, { isAdmin: true }));
    db.state.users.set(B, user(B));
    expect(await actions.setUserActiveAction(B, false)).toMatchObject({ ok: true });
  });

  it("LAST_ADMIN diteruskan apa adanya", async () => {
    db.state.users.set(A, user(A, { isAdmin: true }));
    expect(await actions.setUserAdminAction(A, false)).toMatchObject({
      ok: false,
      code: "LAST_ADMIN",
    });
    expect(createSession).not.toHaveBeenCalled();
  });

  it("cabut admin diri sendiri: sesi perangkat ini diterbitkan ulang, tanpa revalidate", async () => {
    db.state.users.set(A, user(A, { isAdmin: true, sessionVersion: 3 }));
    db.state.users.set(D, user(D, { isAdmin: true }));
    expect(await actions.setUserAdminAction(A, false)).toEqual({
      ok: true,
      data: { selfDemoted: true },
    });
    expect(createSession).toHaveBeenCalledWith({ id: A, sessionVersion: 4 });
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("cabut admin orang lain: tanpa sesi baru, halaman di-revalidate", async () => {
    db.state.users.set(A, user(A, { isAdmin: true }));
    db.state.users.set(D, user(D, { isAdmin: true }));
    expect(await actions.setUserAdminAction(D, false)).toEqual({
      ok: true,
      data: { selfDemoted: false },
    });
    expect(createSession).not.toHaveBeenCalled();
    expect(revalidatePath).toHaveBeenCalledWith("/admin/pengguna");
  });

  it("alih kepemilikan sukses me-revalidate daftar dataset dan dashboard", async () => {
    db.state.users.set(A, user(A, { isAdmin: true }));
    db.state.users.set(B, user(B, { isActive: false }));
    db.state.users.set(C, user(C));
    db.state.datasets.push({
      id: cuid("ds1"),
      ownerId: B,
      name: "Penjualan",
      nameKey: "penjualan",
      createdAt: new Date(),
    });
    expect(await actions.transferDatasetsAction(B, C)).toEqual({
      ok: true,
      data: { moved: 1, renamed: [], quotaExceeded: false },
    });
    expect(revalidatePath.mock.calls.map((c) => c[0])).toEqual([
      "/admin/pengguna",
      "/datasets",
      "/dashboards",
    ]);
  });

  it("error tak terduga → BUSY tanpa detail internal", async () => {
    db.prisma.$transaction.mockRejectedValueOnce(new Error("connection reset by peer"));
    expect(await actions.setUserActiveAction(B, false)).toEqual({
      ok: false,
      code: "BUSY",
      message: "Terjadi kesalahan. Coba lagi beberapa saat lagi.",
    });
  });
});
