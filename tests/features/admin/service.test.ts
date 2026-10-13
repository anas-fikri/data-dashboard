import { Prisma } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { cuid, fakeDb, user, type FakeDataset } from "./fake-db";

/*
 * T-019: service admin pengguna dengan Prisma palsu dalam memori. Aturan admin aktif terakhir,
 * larangan menonaktifkan diri sendiri, sessionVersion naik saat cabut admin/nonaktif, AuditLog
 * (actor, target, ip) di transaksi yang sama, dan alih kepemilikan dataset semua-atau-tidak.
 */
const db = fakeDb();
vi.mock("@/lib/db", () => ({ prisma: db.prisma }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/storage/multipart", () => ({ s3Multipart: {} }));
vi.mock("@/lib/env", () => ({ env: () => ({ USER_STORAGE_QUOTA_BYTES: 1000 }) }));

const svc = await import("@/features/admin/service");
const { planNames, suffixedName } = await import("@/features/admin/transfer-names");

const A = cuid("admina");
const B = cuid("userb");
const C = cuid("userc");
const D = cuid("admind");
const IP = "10.0.0.7";

const known = (code: string) =>
  new Prisma.PrismaClientKnownRequestError("x", { code, clientVersion: "6.12.0" });

function seed(...users: ReturnType<typeof user>[]) {
  for (const u of users) db.state.users.set(u.id, u);
}

function noWrites() {
  expect(db.tx.user.update).not.toHaveBeenCalled();
  expect(db.tx.dataset.updateMany).not.toHaveBeenCalled();
  expect(db.tx.datasetVersion.updateMany).not.toHaveBeenCalled();
  expect(db.tx.auditLog.create).not.toHaveBeenCalled();
}

beforeEach(() => db.reset());

describe("setUserAdmin", () => {
  it("admin aktif satu-satunya mencabut admin dirinya → LAST_ADMIN tanpa perubahan", async () => {
    seed(user(A, { isAdmin: true }), user(B));
    const r = await svc.setUserAdmin({ id: A }, A, false, IP);
    expect(r).toEqual({
      ok: false,
      code: "LAST_ADMIN",
      message: "Minimal harus ada satu admin aktif.",
    });
    noWrites();
    expect(db.locks[0]).toBe("admins");
  });

  it("admin nonaktif tidak dihitung: dua admin, satu nonaktif → tetap LAST_ADMIN", async () => {
    seed(user(A, { isAdmin: true }), user(D, { isAdmin: true, isActive: false }));
    const r = await svc.setUserAdmin({ id: A }, A, false, IP);
    expect(r).toMatchObject({ ok: false, code: "LAST_ADMIN" });
  });

  it("cabut admin lain: isAdmin=false, sessionVersion naik (AC6), AuditLog actor/target/ip", async () => {
    seed(user(A, { isAdmin: true }), user(D, { isAdmin: true, sessionVersion: 4 }));
    const r = await svc.setUserAdmin({ id: A }, D, false, IP);
    expect(r).toEqual({ ok: true, data: { changed: true, selfDemoted: false, sessionVersion: 5 } });
    expect(db.state.users.get(D)).toMatchObject({ isAdmin: false, sessionVersion: 5 });
    expect(db.state.audits).toEqual([
      {
        actorId: A,
        action: "user.admin.revoke",
        targetType: "user",
        targetId: D,
        meta: undefined,
        ip: IP,
      },
    ]);
  });

  it("cabut admin diri sendiri saat masih ada admin aktif lain → selfDemoted + sessionVersion baru", async () => {
    seed(user(A, { isAdmin: true, sessionVersion: 2 }), user(D, { isAdmin: true }));
    const r = await svc.setUserAdmin({ id: A }, A, false, IP);
    expect(r).toEqual({ ok: true, data: { changed: true, selfDemoted: true, sessionVersion: 3 } });
  });

  it("mencabut admin yang sudah nonaktif tidak mengurangi admin aktif → boleh", async () => {
    seed(user(A, { isAdmin: true }), user(D, { isAdmin: true, isActive: false }));
    const r = await svc.setUserAdmin({ id: A }, D, false, IP);
    expect(r).toMatchObject({ ok: true, data: { changed: true } });
  });

  it("beri admin: sesi tidak diputus (sessionVersion tetap) + audit grant; pengguna nonaktif/belum verifikasi → INVALID", async () => {
    seed(
      user(A, { isAdmin: true }),
      user(B),
      user(C, { isActive: false }),
      user(D, { emailVerifiedAt: null }),
    );
    expect(await svc.setUserAdmin({ id: A }, B, true, IP)).toMatchObject({ ok: true });
    expect(db.state.users.get(B)).toMatchObject({ isAdmin: true, sessionVersion: 1 });
    expect(db.state.audits[0]).toMatchObject({ action: "user.admin.grant", targetId: B });
    db.tx.auditLog.create.mockClear();
    db.tx.user.update.mockClear();
    expect(await svc.setUserAdmin({ id: A }, C, true, IP)).toEqual({
      ok: false,
      code: "INVALID",
      message: "Aktifkan pengguna dulu.",
    });
    expect(await svc.setUserAdmin({ id: A }, D, true, IP)).toMatchObject({ code: "INVALID" });
    noWrites();
  });

  it("tanpa perubahan (sudah admin) → changed:false tanpa tulis/audit", async () => {
    seed(user(A, { isAdmin: true }), user(D, { isAdmin: true }));
    const r = await svc.setUserAdmin({ id: A }, D, true, IP);
    expect(r).toMatchObject({ ok: true, data: { changed: false, selfDemoted: false } });
    noWrites();
  });

  it("pelaku sudah bukan admin aktif (dicabut bersamaan) → NOT_FOUND tanpa perubahan", async () => {
    seed(user(A, { isAdmin: false }), user(D, { isAdmin: true }));
    const r = await svc.setUserAdmin({ id: A }, D, false, IP);
    expect(r).toMatchObject({ ok: false, code: "NOT_FOUND" });
    noWrites();
  });

  it("target tidak ada / id rusak → NOT_FOUND; argumen bukan boolean → INVALID", async () => {
    seed(user(A, { isAdmin: true }));
    expect(await svc.setUserAdmin({ id: A }, B, true, IP)).toMatchObject({ code: "NOT_FOUND" });
    db.prisma.$transaction.mockClear();
    expect(await svc.setUserAdmin({ id: A }, "../x", true, IP)).toMatchObject({
      code: "NOT_FOUND",
    });
    expect(await svc.setUserAdmin({ id: A }, B, "true", IP)).toMatchObject({ code: "INVALID" });
    expect(db.prisma.$transaction).not.toHaveBeenCalled();
  });

  it("antrean lock habis waktu (P2028) → BUSY", async () => {
    db.prisma.$transaction.mockRejectedValueOnce(known("P2028"));
    expect(await svc.setUserAdmin({ id: A }, B, true, IP)).toMatchObject({ code: "BUSY" });
  });
});

describe("setUserActive", () => {
  it("admin aktif satu-satunya menonaktifkan dirinya → LAST_ADMIN", async () => {
    seed(user(A, { isAdmin: true }), user(B));
    const r = await svc.setUserActive({ id: A }, A, false, IP);
    expect(r).toMatchObject({ ok: false, code: "LAST_ADMIN" });
    noWrites();
  });

  it("menonaktifkan diri sendiri saat ada admin lain → FORBIDDEN", async () => {
    seed(user(A, { isAdmin: true }), user(D, { isAdmin: true }));
    const r = await svc.setUserActive({ id: A }, A, false, IP);
    expect(r).toEqual({
      ok: false,
      code: "FORBIDDEN",
      message: "Anda tidak bisa menonaktifkan akun sendiri.",
    });
    noWrites();
  });

  it("nonaktifkan B: isActive=false + sessionVersion naik (AC1) + audit dengan ip", async () => {
    seed(user(A, { isAdmin: true }), user(B, { sessionVersion: 7 }));
    const r = await svc.setUserActive({ id: A }, B, false, IP);
    expect(r).toEqual({ ok: true, data: { changed: true } });
    expect(db.state.users.get(B)).toMatchObject({ isActive: false, sessionVersion: 8 });
    expect(db.state.audits).toEqual([
      expect.objectContaining({
        actorId: A,
        action: "user.deactivate",
        targetType: "user",
        targetId: B,
        ip: IP,
      }),
    ]);
  });

  it("aktifkan kembali: isActive=true, sessionVersion tetap (token lama tetap basi)", async () => {
    seed(user(A, { isAdmin: true }), user(B, { isActive: false, sessionVersion: 8 }));
    const r = await svc.setUserActive({ id: A }, B, true, IP);
    expect(r).toEqual({ ok: true, data: { changed: true } });
    expect(db.state.users.get(B)).toMatchObject({ isActive: true, sessionVersion: 8 });
    expect(db.state.audits[0]).toMatchObject({ action: "user.activate", targetId: B });
  });

  it("sudah nonaktif → changed:false tanpa audit", async () => {
    seed(user(A, { isAdmin: true }), user(B, { isActive: false }));
    expect(await svc.setUserActive({ id: A }, B, false, IP)).toEqual({
      ok: true,
      data: { changed: false },
    });
    noWrites();
  });
});

describe("transferDatasets", () => {
  const storage = {
    abort: vi.fn(async () => {}),
    remove: vi.fn(async () => {}),
  } as unknown as import("@/lib/storage/multipart").MultipartStorage;

  let n = 0;
  function ds(ownerId: string, name: string, nameKey = name.toLowerCase()): FakeDataset {
    n++;
    const d = {
      id: cuid(`ds${n}x`),
      ownerId,
      name,
      nameKey,
      createdAt: new Date(2026, 9, 1, 0, n),
    };
    db.state.datasets.push(d);
    return d;
  }

  beforeEach(() => {
    vi.mocked(storage.abort).mockClear();
    vi.mocked(storage.remove).mockClear();
  });

  it("sumber masih aktif → INVALID tanpa perubahan", async () => {
    seed(user(A, { isAdmin: true }), user(B), user(C));
    ds(B, "Penjualan");
    const r = await svc.transferDatasets({ id: A }, B, C, IP, { storage });
    expect(r).toEqual({
      ok: false,
      code: "INVALID",
      message: "Nonaktifkan pengguna dulu sebelum mengalihkan datasetnya.",
    });
    noWrites();
  });

  it("tujuan nonaktif, belum verifikasi, atau sama dengan sumber → INVALID", async () => {
    seed(
      user(A, { isAdmin: true }),
      user(B, { isActive: false }),
      user(C, { isActive: false }),
      user(D, { emailVerifiedAt: null }),
    );
    ds(B, "Penjualan");
    for (const to of [C, D, B]) {
      expect(await svc.transferDatasets({ id: A }, B, to, IP, { storage })).toMatchObject({
        ok: false,
        code: "INVALID",
      });
    }
    noWrites();
  });

  it("sumber tanpa dataset → INVALID 'tidak punya dataset'", async () => {
    seed(user(A, { isAdmin: true }), user(B, { isActive: false }), user(C));
    const r = await svc.transferDatasets({ id: A }, B, C, IP, { storage });
    expect(r).toEqual({ ok: false, code: "INVALID", message: "Pengguna ini tidak punya dataset." });
  });

  it("melewati batas 50 dataset tujuan → LIMIT_REACHED dengan jumlah yang muat", async () => {
    seed(user(A, { isAdmin: true }), user(B, { isActive: false }), user(C));
    for (let i = 0; i < 48; i++) ds(C, `C ${i}`);
    for (let i = 0; i < 3; i++) ds(B, `B ${i}`);
    const r = await svc.transferDatasets({ id: A }, B, C, IP, { storage });
    expect(r).toMatchObject({ ok: false, code: "LIMIT_REACHED" });
    if (!r.ok) expect(r.message).toMatch(/48 dataset, jadi hanya 2 lagi.*dialihkan 3/);
    noWrites();
  });

  it("memindahkan semua dataset, mengganti nama yang bentrok, menggagalkan unggahan, mengaudit", async () => {
    seed(user(A, { isAdmin: true }), user(B, { isActive: false }), user(C));
    ds(C, "Penjualan");
    ds(C, "Stok (2)");
    const p = ds(B, "Penjualan");
    const s = ds(B, "Stok");
    const s2 = ds(B, "STOK", "stok-lama"); // kunci lama berbeda, nama sama tampilannya
    db.state.versions.push(
      {
        id: cuid("v1"),
        datasetId: p.id,
        status: "UPLOADING",
        sourceKey: `raw/${p.id}/v1/source.csv`,
        uploadId: "mp-1",
        sizeBytes: 600n,
      },
      {
        id: cuid("v2"),
        datasetId: s.id,
        status: "READY",
        sourceKey: `raw/${s.id}/v2/source.csv`,
        uploadId: null,
        sizeBytes: 900n,
      },
    );

    const r = await svc.transferDatasets({ id: A }, B, C, IP, { storage, quotaBytes: 800 });
    expect(r).toEqual({
      ok: true,
      data: {
        moved: 3,
        renamed: [
          { from: "Penjualan", to: "Penjualan (2)" },
          { from: "STOK", to: "STOK (3)" },
        ],
        // 900 byte READY > kuota 800; unggahan 600 byte FAILED tidak dihitung.
        quotaExceeded: true,
      },
    });
    expect(db.locks).toEqual(["admins", `datasets:${C}`, `uploads:${C}`]);
    expect(db.state.datasets.filter((d) => d.ownerId === B)).toEqual([]);
    expect(db.state.datasets.find((d) => d.id === p.id)).toMatchObject({
      ownerId: C,
      name: "Penjualan (2)",
      nameKey: "penjualan (2)",
    });
    expect(db.state.datasets.find((d) => d.id === s.id)).toMatchObject({
      ownerId: C,
      name: "Stok",
      nameKey: "stok",
    });
    expect(db.state.datasets.find((d) => d.id === s2.id)).toMatchObject({ nameKey: "stok (3)" });
    expect(db.state.versions[0]).toMatchObject({ status: "FAILED", uploadId: null });
    expect(db.state.versions[1]).toMatchObject({ status: "READY" });
    expect(storage.abort).toHaveBeenCalledWith(`raw/${p.id}/v1/source.csv`, "mp-1");
    expect(storage.remove).toHaveBeenCalledWith(`raw/${p.id}/v1/source.csv`);
    expect(db.state.audits).toEqual([
      {
        actorId: A,
        action: "datasets.transfer",
        targetType: "user",
        targetId: B,
        ip: IP,
        meta: {
          from: B,
          to: C,
          moved: 3,
          datasetIds: [p.id, s.id, s2.id],
          renamed: [
            { from: "Penjualan", to: "Penjualan (2)" },
            { from: "STOK", to: "STOK (3)" },
          ],
          failedUploads: 1,
        },
      },
    ]);
  });

  it("dataset berubah di tengah transaksi → BUSY, semua perubahan dibatalkan, storage tak disentuh", async () => {
    seed(user(A, { isAdmin: true }), user(B, { isActive: false }), user(C));
    const p = ds(B, "Penjualan");
    db.state.versions.push({
      id: cuid("v1"),
      datasetId: p.id,
      status: "UPLOADING",
      sourceKey: "raw/x/source.csv",
      uploadId: "mp-1",
      sizeBytes: 1n,
    });
    db.tx.dataset.updateMany.mockResolvedValueOnce({ count: 0 });
    const r = await svc.transferDatasets({ id: A }, B, C, IP, { storage });
    expect(r).toMatchObject({ ok: false, code: "BUSY" });
    expect(db.state.versions[0]).toMatchObject({ status: "UPLOADING", uploadId: "mp-1" });
    expect(db.state.audits).toEqual([]);
    expect(storage.abort).not.toHaveBeenCalled();
  });

  it("pelaku bukan admin aktif lagi → NOT_FOUND sebelum menyentuh data pengguna", async () => {
    seed(user(A, { isAdmin: true, isActive: false }), user(B, { isActive: false }), user(C));
    ds(B, "Penjualan");
    const r = await svc.transferDatasets({ id: A }, B, C, IP, { storage });
    expect(r).toMatchObject({ ok: false, code: "NOT_FOUND" });
    expect(db.locks).toEqual(["admins"]);
    noWrites();
  });

  it("nama bentrok karena pemilik baru mengganti nama bersamaan (P2002) → BUSY", async () => {
    db.prisma.$transaction.mockRejectedValueOnce(known("P2002"));
    expect(await svc.transferDatasets({ id: A }, B, C, IP, { storage })).toMatchObject({
      code: "BUSY",
    });
  });
});

describe("rencana nama", () => {
  it("akhiran (n) dipasang tanpa melewati 80 karakter dan tanpa spasi ganda", () => {
    expect(suffixedName("Penjualan", 2)).toBe("Penjualan (2)");
    const long = `${"a".repeat(75)} bcd`;
    const out = suffixedName(long, 12);
    expect(out.length).toBeLessThanOrEqual(80);
    expect(out).toBe(`${"a".repeat(75)} (12)`);
    // Tidak memotong pasangan surrogate (emoji) di tengah.
    const emoji = suffixedName(`${"x".repeat(75)}😀😀`, 2);
    expect(emoji.length).toBeLessThanOrEqual(80);
    expect(emoji).toBe(`${"x".repeat(75)} (2)`);
  });

  it("melewati nomor yang sudah dipakai, termasuk di antara dataset yang masuk", () => {
    const plan = planNames(
      [
        { id: "1", name: "A", nameKey: "a" },
        { id: "2", name: "a ", nameKey: "a-lama" },
      ],
      [
        { name: "A", nameKey: "a" },
        { name: "A (2)", nameKey: "a (2)" },
      ],
    );
    expect(plan.map((p) => [p.name, p.nameKey, p.renamedFrom])).toEqual([
      ["A (3)", "a (3)", "A"],
      ["a (4)", "a (4)", "a "],
    ]);
  });
});

describe("listUsers / listTransferTargets", () => {
  it("cari email/nama tanpa peka kapital, aktif dulu, halaman 50, halaman di luar batas dijepit", async () => {
    db.prisma.user.count.mockResolvedValueOnce(51);
    db.prisma.user.findMany.mockResolvedValueOnce([
      {
        id: B,
        email: "b@pcpexpress.com",
        name: "Budi",
        isAdmin: false,
        isActive: false,
        emailVerifiedAt: null,
        lastLoginAt: null,
        createdAt: new Date(0),
        _count: { datasets: 3 },
      },
    ]);
    const r = await svc.listUsers({ q: "  BuDi\u0000 ", page: 9 });
    const where = {
      OR: [
        { email: { contains: "BuDi", mode: "insensitive" } },
        { name: { contains: "BuDi", mode: "insensitive" } },
      ],
    };
    expect(db.prisma.user.count).toHaveBeenCalledWith({ where });
    expect(db.prisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where,
        orderBy: [{ isActive: "desc" }, { email: "asc" }],
        skip: 50,
        take: 50,
      }),
    );
    expect(r).toEqual({
      users: [
        {
          id: B,
          email: "b@pcpexpress.com",
          name: "Budi",
          isAdmin: false,
          isActive: false,
          emailVerified: false,
          lastLoginAt: null,
          createdAt: new Date(0),
          datasetCount: 3,
        },
      ],
      total: 51,
      page: 2,
      pageSize: 50,
    });
  });

  it("tanpa kata kunci / halaman tidak valid → semua pengguna, halaman 1", async () => {
    db.prisma.user.count.mockResolvedValueOnce(0);
    db.prisma.user.findMany.mockResolvedValueOnce([]);
    const r = await svc.listUsers({ q: "   ", page: Number.NaN });
    expect(db.prisma.user.count).toHaveBeenCalledWith({ where: {} });
    expect(r).toMatchObject({ users: [], total: 0, page: 1 });
  });

  it("tujuan alih: aktif + terverifikasi selain sumber, urut email", async () => {
    db.prisma.user.findMany.mockResolvedValueOnce([]);
    await svc.listTransferTargets(B);
    expect(db.prisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: { not: B }, isActive: true, emailVerifiedAt: { not: null } },
        orderBy: { email: "asc" },
        select: { id: true, email: true, name: true },
      }),
    );
  });
});
