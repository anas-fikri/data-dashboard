import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { seedAdmin } from "../../prisma/seed";

interface UpsertArgs {
  where: { email: string };
  create: { isAdmin: boolean; isActive: boolean; emailVerifiedAt: Date };
  update: { isAdmin: boolean; isActive: boolean };
}

function fakePrisma() {
  const upsert = vi.fn(async (args: UpsertArgs) => ({ id: "u1", email: args.where.email }));
  return { prisma: { user: { upsert } } as unknown as PrismaClient, upsert };
}

describe("seedAdmin", () => {
  it("menormalkan email dan membuat admin aktif terverifikasi", async () => {
    const { prisma, upsert } = fakePrisma();
    const admin = await seedAdmin(prisma, "  Admin@PCPExpress.com ");
    expect(admin.email).toBe("admin@pcpexpress.com");
    const call = upsert.mock.calls[0]?.[0];
    if (!call) throw new Error("upsert tidak dipanggil");
    expect(call.create).toMatchObject({ isAdmin: true, isActive: true });
    expect(call.create.emailVerifiedAt).toBeInstanceOf(Date);
    expect(call.update).toEqual({ isAdmin: true, isActive: true });
  });

  it("gagal jelas bila SEED_ADMIN_EMAIL kosong", async () => {
    const { prisma } = fakePrisma();
    await expect(seedAdmin(prisma, undefined)).rejects.toThrow(/SEED_ADMIN_EMAIL/);
  });
});
