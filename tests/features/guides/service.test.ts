import { Prisma } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

/*
 * T-0vjt AC3: buat/ubah artikel panduan menulis AuditLog guide.create/guide.update {slug, role} di
 * transaksi yang sama (tanpa isi artikel); terbitkan ulang artikel yang sudah terbit tidak menulis baris
 * audit ganda. Prisma dimock; recordAudit asli (menulis ke tx.auditLog.create).
 */
const prisma = {
  guideArticle: {
    aggregate: vi.fn(async () => ({ _max: { order: 3 } })),
    create: vi.fn(async () => ({ id: ART })),
    updateMany: vi.fn(async () => ({ count: 1 })),
    findUnique: vi.fn(async () => ({ slug: "unggah-data", role: "OWNER" })),
  },
  auditLog: { create: vi.fn(async () => ({ id: "a1" })) },
  $transaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn(prisma)),
};
vi.mock("@/lib/db", () => ({ prisma }));
vi.mock("@/features/guides/videos", () => ({
  removeVideoObjects: vi.fn(),
  scheduleVideoCleanup: vi.fn(),
}));

const { createGuide, updateGuide, setGuideStatus } = await import("@/features/guides/service");

const ART = "cmv4kljx40009oczvdmpuart1";
const ADMIN = "cmv4kljx40009oczvdmpuadm1";
const IP = "203.0.113.9";
const input = {
  title: "Unggah data",
  slug: "unggah-data",
  role: "OWNER",
  contextKey: "UPLOAD",
  bodyMarkdown: "Isi **rahasia** artikel yang tidak boleh masuk audit.",
};
const audits = () => prisma.auditLog.create.mock.calls.map((c) => (c as unknown[])[0]);

beforeEach(() => vi.clearAllMocks());

describe("audit buat/ubah artikel (T-0vjt)", () => {
  it("buat → guide.create {slug, role} di transaksi yang sama, tanpa judul/isi", async () => {
    expect(await createGuide(ADMIN, input, IP)).toEqual({ ok: true, data: { id: ART } });
    expect(audits()).toEqual([
      {
        data: {
          actorId: ADMIN,
          action: "guide.create",
          targetType: "guide",
          targetId: ART,
          meta: { slug: "unggah-data", role: "OWNER" },
          ip: IP,
        },
        select: { id: true },
      },
    ]);
    expect(JSON.stringify(audits())).not.toMatch(/rahasia|Unggah data/);
  });

  it("ubah → guide.update dengan slug/peran baru; artikel tidak ada → NOT_FOUND tanpa audit", async () => {
    const next = { ...input, slug: "unggah-data-baru", role: "ALL" };
    expect(await updateGuide(ADMIN, ART, next, IP)).toEqual({ ok: true, data: null });
    expect(audits()).toMatchObject([
      {
        data: {
          action: "guide.update",
          targetId: ART,
          meta: { slug: "unggah-data-baru", role: "ALL" },
        },
      },
    ]);
    vi.clearAllMocks();
    prisma.guideArticle.updateMany.mockResolvedValueOnce({ count: 0 });
    expect(await updateGuide(ADMIN, ART, input, IP)).toMatchObject({ code: "NOT_FOUND" });
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
  });

  it("isian tidak valid atau slug sudah dipakai → tanpa audit", async () => {
    expect(await createGuide(ADMIN, { ...input, slug: "Bukan Slug" }, IP)).toMatchObject({
      code: "INVALID",
    });
    expect(await updateGuide(ADMIN, "bukan-id", input, IP)).toMatchObject({ code: "NOT_FOUND" });
    const taken = new Prisma.PrismaClientKnownRequestError("unik", {
      code: "P2002",
      clientVersion: "6.12.0",
    });
    prisma.guideArticle.create.mockRejectedValueOnce(taken);
    expect(await createGuide(ADMIN, input, IP)).toMatchObject({ code: "SLUG_TAKEN" });
    prisma.guideArticle.updateMany.mockRejectedValueOnce(taken);
    expect(await updateGuide(ADMIN, ART, input, IP)).toMatchObject({ code: "SLUG_TAKEN" });
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
  });
});

describe("terbit/tarik tanpa audit ganda (T-0vjt)", () => {
  it("terbitkan draf → guide.publish; terbitkan ulang yang sudah terbit → ok tanpa baris audit", async () => {
    expect(await setGuideStatus(ADMIN, ART, "PUBLISHED", IP)).toEqual({ ok: true, data: null });
    // Syarat status ada di UPDATE itu sendiri: permintaan serentak kedua tidak mengubah apa-apa.
    expect(prisma.guideArticle.updateMany).toHaveBeenCalledWith({
      where: { id: ART, status: { not: "PUBLISHED" } },
      data: { status: "PUBLISHED" },
    });
    expect(audits()).toMatchObject([
      { data: { action: "guide.publish", meta: { slug: "unggah-data", role: "OWNER" } } },
    ]);

    vi.clearAllMocks();
    prisma.guideArticle.updateMany.mockResolvedValueOnce({ count: 0 });
    expect(await setGuideStatus(ADMIN, ART, "PUBLISHED", IP)).toEqual({ ok: true, data: null });
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
  });

  it("tarik draf (sudah draf) → tanpa audit; artikel tidak ada → NOT_FOUND", async () => {
    prisma.guideArticle.updateMany.mockResolvedValueOnce({ count: 0 });
    expect(await setGuideStatus(ADMIN, ART, "DRAFT", IP)).toEqual({ ok: true, data: null });
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
    prisma.guideArticle.findUnique.mockResolvedValueOnce(null as never);
    expect(await setGuideStatus(ADMIN, ART, "DRAFT", IP)).toMatchObject({ code: "NOT_FOUND" });
    expect(prisma.guideArticle.updateMany).toHaveBeenCalledTimes(1);
  });
});
