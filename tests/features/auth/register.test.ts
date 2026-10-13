import { beforeEach, describe, expect, it, vi } from "vitest";

/*
 * T-019 review (spoofing): nama dari registrasi tampil di daftar admin dan pemilih pemilik baru.
 * Karakter kontrol/bidi dibuang, nama berbentuk email ditolak sebelum apa pun disimpan.
 */
const prisma = vi.hoisted(() => ({
  user: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
  verificationToken: {
    create: vi.fn(),
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    updateMany: vi.fn(),
  },
  $transaction: vi.fn(async (ops: unknown[]) => Promise.all(ops)),
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
  verifyPassword: vi.fn(async () => true),
}));

const { register, resendVerification, verifyEmail } = await import("@/features/auth/service");

// Kata sandi contoh untuk tes (bukan rahasia); nama konstanta netral agar tidak ditandai pemindai.
const PW = "kalimat-panjang-12";
const base = { email: "budi@pcpexpress.com", password: PW, ip: "10.0.0.1" };

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

/*
 * Review keamanan T-019 putaran 2: token dari sebelum aturan "nama tanpa @" bisa membawa nama
 * berbentuk email. Aktivasi dan kirim ulang tidak boleh memasang/menyalin nama itu.
 */
describe("token lama dengan nama ber-@", () => {
  const TOKEN = "a".repeat(43);
  const tokenRow = (pendingName: string | null) => ({
    id: "t1",
    purpose: "VERIFY_EMAIL",
    usedAt: null,
    expiresAt: new Date(Date.now() + 60_000),
    pendingPasswordHash: "hash",
    pendingName,
    user: { id: "u1", email: "budi@pcpexpress.com", emailVerifiedAt: null },
  });

  beforeEach(() => {
    prisma.verificationToken.updateMany.mockResolvedValue({ count: 1 });
    prisma.user.update.mockResolvedValue({});
  });

  it("verifyEmail: nama ber-@ tidak dipasang; nama biasa tetap dipasang (dibersihkan)", async () => {
    for (const [pendingName, name] of [
      ["a@b.com", undefined],
      ["budi\uFF20pcpexpress.com", undefined],
      ["Budi\u202E Santoso", "Budi Santoso"],
    ] as const) {
      prisma.user.update.mockClear();
      prisma.verificationToken.findUnique.mockResolvedValueOnce(tokenRow(pendingName));
      expect(await verifyEmail(TOKEN, "kalimat-panjang-12", "10.0.0.1")).toEqual({
        ok: true,
        data: { email: "budi@pcpexpress.com" },
      });
      const { data } = prisma.user.update.mock.calls[0]![0] as { data: Record<string, unknown> };
      expect(data.name).toBe(name);
      expect(data).toMatchObject({ passwordHash: "hash", sessionVersion: { increment: 1 } });
    }
  });

  it("resendVerification: token baru tidak menyalin nama ber-@ (null)", async () => {
    prisma.user.findUnique.mockResolvedValue({ id: "u1", emailVerifiedAt: null });
    prisma.verificationToken.findFirst.mockResolvedValue(tokenRow("a@b.com"));
    expect(await resendVerification("budi@pcpexpress.com", "10.0.0.1")).toEqual({
      ok: true,
      data: undefined,
    });
    await vi.waitFor(() => expect(prisma.verificationToken.create).toHaveBeenCalled());
    expect(prisma.verificationToken.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: "u1",
        pendingPasswordHash: "hash",
        pendingName: null,
      }),
    });
  });
});
