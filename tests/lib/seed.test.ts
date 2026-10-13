import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { parseDomains, seedAdmin } from "../../prisma/seed";

interface UpsertArgs {
  where: { email: string };
  create: { isAdmin: boolean; isActive: boolean; emailVerifiedAt: Date };
  update: Record<string, unknown>;
}

function fakePrisma() {
  const upsert = vi.fn(async (args: UpsertArgs) => ({ id: "u1", email: args.where.email }));
  return { prisma: { user: { upsert } } as unknown as PrismaClient, upsert };
}

describe("seedAdmin", () => {
  it("menormalkan email dan membuat admin aktif terverifikasi", async () => {
    const { prisma, upsert } = fakePrisma();
    const admin = await seedAdmin(prisma, "  Admin@PCPExpress.com ", ["pcpexpress.com"]);
    expect(admin.email).toBe("admin@pcpexpress.com");
    const call = upsert.mock.calls[0]?.[0];
    if (!call) throw new Error("upsert tidak dipanggil");
    expect(call.create).toMatchObject({ isAdmin: true, isActive: true });
    expect(call.create.emailVerifiedAt).toBeInstanceOf(Date);
    // Akun yang sudah ada tidak disentuh (T-019): seed ulang tidak mengaktifkan/mengangkat lagi.
    expect(call.update).toEqual({});
  });

  it("seed ulang tidak mengaktifkan kembali atau mengangkat admin akun yang sudah ada", async () => {
    const upsert = vi.fn(async (args: UpsertArgs) => ({
      id: "u1",
      email: args.where.email,
      isAdmin: false,
      isActive: false,
      ...args.update,
    }));
    const prisma = { user: { upsert } } as unknown as PrismaClient;
    const admin = await seedAdmin(prisma, "admin@pcpexpress.com", ["pcpexpress.com"]);
    expect(admin).toMatchObject({ isAdmin: false, isActive: false });
    expect(upsert.mock.calls[0]?.[0].update).not.toHaveProperty("isActive");
    expect(upsert.mock.calls[0]?.[0].update).not.toHaveProperty("isAdmin");
  });

  it("gagal jelas bila SEED_ADMIN_EMAIL kosong, bukan email, atau di luar whitelist", async () => {
    const { prisma, upsert } = fakePrisma();
    await expect(seedAdmin(prisma, undefined, [])).rejects.toThrow(/SEED_ADMIN_EMAIL/);
    await expect(seedAdmin(prisma, "bukan-email", [])).rejects.toThrow();
    await expect(seedAdmin(prisma, "admin@evil.example", ["pcpexpress.com"])).rejects.toThrow(
      /ALLOWED_EMAIL_DOMAINS/,
    );
    expect(upsert).not.toHaveBeenCalled();
  });
});

describe("parseDomains", () => {
  it("memisahkan koma, memangkas spasi, dan menurunkan kapital", () => {
    expect(parseDomains(" A.com, b.ID ,")).toEqual(["a.com", "b.id"]);
    expect(parseDomains(undefined)).toEqual([]);
  });
});
