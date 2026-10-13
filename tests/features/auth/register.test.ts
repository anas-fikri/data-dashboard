import { beforeEach, describe, expect, it, vi } from "vitest";

/*
 * T-019 review (spoofing): nama dari registrasi tampil di daftar admin dan pemilih pemilik baru.
 * Karakter kontrol/bidi dibuang, nama berbentuk email ditolak sebelum apa pun disimpan.
 */
const prisma = vi.hoisted(() => ({
  user: { findUnique: vi.fn(), create: vi.fn() },
  verificationToken: { create: vi.fn() },
}));
const store = vi.hoisted(() => ({ eval: vi.fn(), set: vi.fn() }));

vi.mock("@/lib/env", () => ({ env: () => ({ ALLOWED_EMAIL_DOMAINS: ["pcpexpress.com"] }) }));
vi.mock("@/lib/db", () => ({ prisma }));
vi.mock("@/lib/redis", () => ({ redisReady: async () => store }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("@/features/auth/email", () => ({
  sendAlreadyRegisteredEmail: vi.fn(async () => {}),
  sendVerificationEmail: vi.fn(async () => {}),
}));
vi.mock("@/features/auth/password", () => ({
  hashPassword: vi.fn(async () => "hash"),
  isPasswordAcceptable: (p: string) => p.length >= 12,
  verifyPassword: vi.fn(),
}));

const { register } = await import("@/features/auth/service");

const base = { email: "budi@pcpexpress.com", password: "kalimat-panjang-12", ip: "10.0.0.1" };

beforeEach(() => {
  vi.clearAllMocks();
  store.eval.mockResolvedValue([1, 60]);
  store.set.mockResolvedValue(null);
  prisma.user.findUnique.mockResolvedValue(null);
  prisma.user.create.mockResolvedValue({ id: "u1" });
  prisma.verificationToken.create.mockResolvedValue({});
});

describe("register: nama tampilan", () => {
  it("nama berbentuk email ditolak dengan pesan yang jelas, tanpa menyimpan apa pun", async () => {
    for (const name of [
      "security-5@pcpexpress.com (Gudang Jakarta Timur)",
      "\u202Emoc.sserpxepcp@5-ytiruces",
      "budi\uFF20pcpexpress.com",
    ]) {
      expect(await register({ ...base, name })).toEqual({
        ok: false,
        code: "INVALID_NAME",
        message:
          "Nama tidak boleh berisi alamat email atau tanda @. Tulis nama Anda saja, mis. Budi Santoso.",
      });
    }
    expect(prisma.user.create).not.toHaveBeenCalled();
    expect(prisma.verificationToken.create).not.toHaveBeenCalled();
    expect(store.eval).not.toHaveBeenCalled();
  });

  it("karakter kontrol/bidi dibuang, spasi dirapikan sebelum disimpan di token", async () => {
    const r = await register({ ...base, name: "  Budi\u202E\u2066 \n Santoso\u0000 " });
    expect(r).toEqual({ ok: true, data: { email: "budi@pcpexpress.com" } });
    expect(prisma.verificationToken.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ userId: "u1", pendingName: "Budi Santoso" }),
    });
  });

  it("nama kosong atau hanya karakter tak terlihat → tanpa nama (null)", async () => {
    await register({ ...base, name: "\u202E  \u200B" });
    expect(prisma.verificationToken.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ pendingName: null }),
    });
  });
});
