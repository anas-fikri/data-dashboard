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
const logger = vi.hoisted(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }));
vi.mock("@/lib/logger", () => ({ logger }));
vi.mock("@/lib/storage/multipart", () => ({ s3Multipart: {} }));
vi.mock("@/lib/env", () => ({
  env: () => ({ USER_STORAGE_QUOTA_BYTES: 1000, ALLOWED_EMAIL_DOMAINS: ["pcpexpress.com"] }),
}));
const mail = vi.hoisted(() => ({
  sendInvitationEmail: vi.fn(async (_to: string, _token: string) => true),
}));
vi.mock("@/features/auth/email", () => mail);

const svc = await import("@/features/admin/service");
const { planNames, suffixedName } = await import("@/features/admin/transfer-names");
const { hashToken } = await import("@/features/auth/tokens");

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

  it("tujuan sudah 50 dataset → LIMIT_REACHED 'batas maksimal', bukan 'hanya 0 lagi'", async () => {
    seed(user(A, { isAdmin: true }), user(B, { isActive: false }), user(C));
    for (let i = 0; i < 50; i++) ds(C, `C ${i}`);
    ds(B, "B 0");
    const r = await svc.transferDatasets({ id: A }, B, C, IP, { storage });
    expect(r).toMatchObject({ ok: false, code: "LIMIT_REACHED" });
    if (!r.ok) {
      expect(r.message).toMatch(/^Pengguna tujuan sudah memiliki batas maksimal 50 dataset\./);
      expect(r.message).not.toMatch(/hanya 0/);
    }
    noWrites();
  });

  it("pemakaian tepat sama dengan kuota → quotaExceeded (unggahan berikutnya pasti ditolak)", async () => {
    seed(user(A, { isAdmin: true }), user(B, { isActive: false }), user(C));
    const d = ds(B, "Penuh");
    db.state.versions.push({
      id: cuid("vq"),
      datasetId: d.id,
      status: "READY",
      sourceKey: null,
      uploadId: null,
      sizeBytes: 800n,
    });
    const r = await svc.transferDatasets({ id: A }, B, C, IP, { storage, quotaBytes: 800 });
    expect(r).toMatchObject({ ok: true, data: { quotaExceeded: true } });
  });

  it("nama yang tidak bentrok tidak ikut diganti dan tidak diambil dataset lain (rantai)", async () => {
    seed(user(A, { isAdmin: true }), user(B, { isActive: false }), user(C));
    ds(C, "Penjualan Uji");
    const x = ds(B, "Penjualan Uji");
    const x2 = ds(B, "Penjualan Uji (2)");
    const r = await svc.transferDatasets({ id: A }, B, C, IP, { storage });
    const renamed = [{ datasetId: x.id, from: "Penjualan Uji", to: "Penjualan Uji (3)" }];
    expect(r).toMatchObject({ ok: true, data: { moved: 2, renamed } });
    expect(db.state.datasets.find((d) => d.id === x2.id)).toMatchObject({
      ownerId: C,
      name: "Penjualan Uji (2)",
    });
    expect(db.state.audits[0]!.meta).toMatchObject({ renamed });
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
          { datasetId: p.id, from: "Penjualan", to: "Penjualan (2)" },
          { datasetId: s2.id, from: "STOK", to: "STOK (3)" },
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
            { datasetId: p.id, from: "Penjualan", to: "Penjualan (2)" },
            { datasetId: s2.id, from: "STOK", to: "STOK (3)" },
          ],
          failedUploads: 1,
          sharesRemoved: 0,
        },
      },
    ]);
  });

  it("T-016: share milik pemilik baru di dashboard dataset yang dialihkan dihapus (jumlah di audit); share lain tetap", async () => {
    seed(user(A, { isAdmin: true }), user(B, { isActive: false }), user(C), user(D));
    const p = ds(B, "Penjualan");
    const other = ds(D, "Milik D");
    const share = (dashboardId: string, datasetId: string, userId: string) => ({
      dashboardId,
      datasetId,
      userId,
      role: "EDITOR" as const,
    });
    db.state.shares.push(
      share(cuid("dbp1"), p.id, C), // pemilik baru di dashboard yang ikut pindah → dihapus
      share(cuid("dbp2"), p.id, C),
      share(cuid("dbp1"), p.id, D), // orang lain di dashboard yang pindah → tetap
      share(cuid("dbo"), other.id, C), // pemilik baru di dataset lain → tetap
    );
    const r = await svc.transferDatasets({ id: A }, B, C, IP, { storage });
    expect(r).toMatchObject({ ok: true, data: { moved: 1 } });
    expect(db.tx.dashboardShare.deleteMany).toHaveBeenCalledWith({
      where: { userId: C, dashboard: { datasetId: { in: [p.id] } } },
    });
    expect(db.state.shares.map((s) => [s.dashboardId, s.userId])).toEqual([
      [cuid("dbp1"), D],
      [cuid("dbo"), C],
    ]);
    expect(db.state.audits[0]!.meta).toMatchObject({ sharesRemoved: 2 });
  });

  it("T-016: transfer gagal di tengah → share pemilik baru tidak terhapus (semua-atau-tidak)", async () => {
    seed(user(A, { isAdmin: true }), user(B, { isActive: false }), user(C));
    const p = ds(B, "Penjualan");
    db.state.shares.push({ dashboardId: cuid("dbp1"), datasetId: p.id, userId: C, role: "VIEWER" });
    db.tx.auditLog.create.mockRejectedValueOnce(new Error("db down"));
    await expect(svc.transferDatasets({ id: A }, B, C, IP, { storage })).rejects.toThrow("db down");
    expect(db.state.shares).toHaveLength(1);
    expect(db.state.datasets.find((d) => d.id === p.id)).toMatchObject({ ownerId: B });
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

describe("rencana nama: rantai", () => {
  const names = (plan: ReturnType<typeof planNames>) => plan.map((p) => [p.name, p.renamedFrom]);

  it("tujuan [X], masuk [X, X (2)] → X (2) tetap, X menjadi X (3)", () => {
    const plan = planNames(
      [
        { id: "1", name: "X", nameKey: "x" },
        { id: "2", name: "X (2)", nameKey: "x (2)" },
      ],
      [{ name: "X", nameKey: "x" }],
    );
    expect(names(plan)).toEqual([
      ["X (3)", "X"],
      ["X (2)", null],
    ]);
  });

  it("tujuan [data], masuk [Data, Data (2), DATA (3)] → hanya 'Data' diganti, ke nomor bebas", () => {
    const plan = planNames(
      [
        { id: "1", name: "Data", nameKey: "data" },
        { id: "2", name: "Data (2)", nameKey: "data (2)" },
        { id: "3", name: "DATA (3)", nameKey: "data (3)" },
      ],
      [{ name: "data", nameKey: "data" }],
    );
    expect(names(plan)).toEqual([
      ["Data (4)", "Data"],
      ["Data (2)", null],
      ["DATA (3)", null],
    ]);
  });

  it("dua dataset masuk yang bentrok satu sama lain (kunci lama) → yang belakangan diganti", () => {
    const plan = planNames(
      [
        { id: "1", name: "Stok", nameKey: "stok" },
        { id: "2", name: "STOK", nameKey: "stok-lama" },
      ],
      [],
    );
    expect(names(plan)).toEqual([
      ["Stok", null],
      ["STOK (2)", "STOK"],
    ]);
  });

  it("deterministik, dan tidak ada dua nama sama di pemilik baru setelah alih", () => {
    const incoming = [
      { id: "1", name: "A", nameKey: "a" },
      { id: "2", name: "A (3)", nameKey: "a (3)" },
      { id: "3", name: "A (2)", nameKey: "a (2)" },
      { id: "4", name: "a", nameKey: "a-lama" },
    ];
    const existing = [
      { name: "A", nameKey: "a" },
      { name: "A (2)", nameKey: "a (2)" },
      { name: "A (4)", nameKey: "a (4)" },
    ];
    const plan = planNames(incoming, existing);
    expect(planNames(incoming, existing)).toEqual(plan);
    expect(names(plan)).toEqual([
      ["A (5)", "A"],
      ["A (3)", null],
      ["A (2) (2)", "A (2)"],
      ["a (6)", "a"],
    ]);
    const keys = [...existing.map((e) => e.nameKey), ...plan.map((p) => p.nameKey)];
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe("listUsers / searchTransferTargets", () => {
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
      status: "all",
    });
  });

  it("tanpa kata kunci / halaman tidak valid → semua pengguna, halaman 1", async () => {
    db.prisma.user.count.mockResolvedValueOnce(0);
    db.prisma.user.findMany.mockResolvedValueOnce([]);
    const r = await svc.listUsers({ q: "   ", page: Number.NaN });
    expect(db.prisma.user.count).toHaveBeenCalledWith({ where: {} });
    expect(r).toMatchObject({ users: [], total: 0, page: 1 });
  });

  it("wildcard LIKE (_ % backslash) di-escape: q='_' tidak lagi cocok dengan semua pengguna", async () => {
    db.prisma.user.count.mockResolvedValueOnce(0);
    db.prisma.user.findMany.mockResolvedValueOnce([]);
    await svc.listUsers({ q: "a_b%c\\" });
    const like = "a\\_b\\%c\\\\";
    expect(db.prisma.user.count).toHaveBeenCalledWith({
      where: {
        OR: [
          { email: { contains: like, mode: "insensitive" } },
          { name: { contains: like, mode: "insensitive" } },
        ],
      },
    });
  });

  it("saring status: aktif/nonaktif/belum verifikasi; nonaktif urut dataset terbanyak", async () => {
    const cases: [string, object][] = [
      ["active", { isActive: true, emailVerifiedAt: { not: null } }],
      ["inactive", { isActive: false }],
      ["unverified", { isActive: true, emailVerifiedAt: null }],
      ["bukan-status", {}],
    ];
    for (const [status, where] of cases) {
      db.prisma.user.count.mockResolvedValueOnce(0);
      db.prisma.user.findMany.mockResolvedValueOnce([]);
      const r = await svc.listUsers({ status: status as "all" });
      expect(r.status).toBe(status === "bukan-status" ? "all" : status);
      expect(db.prisma.user.count).toHaveBeenLastCalledWith({ where });
    }
    // Tiap akun (termasuk nonaktif yang belum verifikasi) masuk tepat satu saringan, sama dengan
    // badge-nya: aktif + nonaktif + belum verifikasi = semua (review integritas T-019 putaran 2).
    const matches = (where: object, row: Record<string, unknown>) =>
      Object.entries(where).every(([k, v]) =>
        v && typeof v === "object" ? row[k] !== null : row[k] === v,
      );
    const rows = [
      { isActive: true, emailVerifiedAt: new Date(), badge: "active" },
      { isActive: true, emailVerifiedAt: null, badge: "unverified" },
      { isActive: false, emailVerifiedAt: new Date(), badge: "inactive" },
      { isActive: false, emailVerifiedAt: null, badge: "inactive" },
    ];
    for (const row of rows) {
      const hits = cases.slice(0, 3).filter(([, where]) => matches(where, row));
      expect(hits.map(([status]) => status)).toEqual([row.badge]);
    }
    expect(db.prisma.user.findMany.mock.calls[1]![0]).toMatchObject({
      orderBy: [{ datasets: { _count: "desc" } }, { email: "asc" }],
    });
    db.prisma.user.count.mockResolvedValueOnce(0);
    db.prisma.user.findMany.mockResolvedValueOnce([]);
    await svc.listUsers({ q: "budi", status: "inactive" });
    expect(db.prisma.user.count).toHaveBeenLastCalledWith({
      where: {
        isActive: false,
        OR: [
          { email: { contains: "budi", mode: "insensitive" } },
          { name: { contains: "budi", mode: "insensitive" } },
        ],
      },
    });
  });

  it("nama data lama dibersihkan dari karakter bidi/kontrol (anti menyamar)", async () => {
    db.prisma.user.count.mockResolvedValueOnce(1);
    db.prisma.user.findMany.mockResolvedValueOnce([
      {
        id: B,
        email: "b@pcpexpress.com",
        name: "\u202Emoc.sserpxepcp@x\u2066 Budi\u0000",
        isAdmin: false,
        isActive: true,
        emailVerifiedAt: new Date(0),
        lastLoginAt: null,
        createdAt: new Date(0),
        _count: { datasets: 0 },
      },
    ]);
    const r = await svc.listUsers();
    expect(r.users[0]!.name).toBe("moc.sserpxepcp@x Budi");
  });

  it("cari tujuan alih: aktif + terverifikasi selain sumber, cocok email/nama, ≤ 20, nama bersih", async () => {
    db.prisma.user.findMany.mockResolvedValueOnce([
      { id: C, email: "c@pcpexpress.com", name: "\u202ECici" },
    ]);
    const r = await svc.searchTransferTargets(B, "  Ci_ ");
    expect(r).toEqual({ ok: true, data: [{ id: C, email: "c@pcpexpress.com", name: "Cici" }] });
    expect(db.prisma.user.findMany).toHaveBeenCalledWith({
      where: {
        id: { not: B },
        isActive: true,
        emailVerifiedAt: { not: null },
        OR: [
          { email: { contains: "Ci\\_", mode: "insensitive" } },
          { name: { contains: "Ci\\_", mode: "insensitive" } },
        ],
      },
      orderBy: { email: "asc" },
      take: 20,
      select: { id: true, email: true, name: true },
    });
  });

  it("cari tujuan alih: q kosong → 20 pertama urut email; id sumber rusak → NOT_FOUND", async () => {
    db.prisma.user.findMany.mockResolvedValueOnce([]);
    expect(await svc.searchTransferTargets(B, "")).toEqual({ ok: true, data: [] });
    expect(db.prisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: { not: B }, isActive: true, emailVerifiedAt: { not: null } },
        take: 20,
      }),
    );
    expect(await svc.searchTransferTargets("../x", "a")).toMatchObject({
      ok: false,
      code: "NOT_FOUND",
    });
  });
});

describe("log penolakan akses", () => {
  it("pelaku dicabut di antara requireAdmin dan lock → warn 'aksi admin ditolak'", async () => {
    seed(user(A, { isAdmin: false }), user(B));
    expect(await svc.setUserActive({ id: A }, B, false, IP)).toMatchObject({ code: "NOT_FOUND" });
    expect(logger.warn).toHaveBeenCalledWith(
      { userId: A, code: "NOT_FOUND", action: "setUserActive" },
      "aksi admin ditolak",
    );
    noWrites();
  });
});

describe("createUser (T-c7wf)", () => {
  const HOUR = 3_600_000;

  it("akun terverifikasi tanpa password + token undangan 72 jam (hash saja) + audit; email setelah commit", async () => {
    seed(user(A, { isAdmin: true }));
    const before = Date.now();
    const r = await svc.createUser(
      { id: A },
      "  Baru@PCPExpress.com ",
      "  Budi  Santoso ",
      false,
      IP,
    );
    expect(r).toMatchObject({ ok: true, data: { email: "baru@pcpexpress.com", inviteSent: true } });
    if (!r.ok) return;
    const u = db.state.users.get(r.data.id)!;
    expect(u).toMatchObject({ email: "baru@pcpexpress.com", name: "Budi Santoso", isAdmin: false });
    expect(u.emailVerifiedAt).toBeInstanceOf(Date);
    expect(db.locks).toEqual(["admins"]);
    expect(db.state.tokens).toHaveLength(1);
    const tok = db.state.tokens[0]!;
    expect(tok).toMatchObject({ userId: r.data.id, purpose: "RESET_PASSWORD" });
    const ttl = tok.expiresAt.getTime() - before;
    expect(ttl).toBeGreaterThanOrEqual(72 * HOUR - 1_000);
    expect(ttl).toBeLessThanOrEqual(72 * HOUR + 5_000);
    // Token mentah hanya ke kotak surat pengguna; DB menyimpan hash-nya, admin tidak menerimanya.
    expect(mail.sendInvitationEmail).toHaveBeenCalledTimes(1);
    const [to, raw] = mail.sendInvitationEmail.mock.calls[0]!;
    expect(to).toBe("baru@pcpexpress.com");
    expect(tok.tokenHash).toBe(hashToken(raw));
    expect(JSON.stringify(r)).not.toContain(raw);
    expect(db.state.audits).toEqual([
      expect.objectContaining({
        actorId: A,
        action: "user.create",
        targetType: "user",
        targetId: r.data.id,
        meta: { isAdmin: false },
        ip: IP,
      }),
    ]);
  });

  it("jadikan admin sejak dibuat → isAdmin true, tercatat di meta audit", async () => {
    seed(user(A, { isAdmin: true }));
    const r = await svc.createUser({ id: A }, "kepala@pcpexpress.com", "", true, IP);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(db.state.users.get(r.data.id)).toMatchObject({ isAdmin: true, name: null });
    expect(db.state.audits[0]).toMatchObject({ meta: { isAdmin: true } });
  });

  it.each([
    ["bukan-email", "", false, "Masukkan alamat email yang valid."],
    ["orang@gmail.com", "", false, "Gunakan email perusahaan (@pcpexpress.com)."],
    ["orang@pcpexpress.com.evil.id", "", false, "Gunakan email perusahaan (@pcpexpress.com)."],
    ["orang@pcpexpress.com", "admin@pcpexpress.com", false, "Nama tidak boleh memuat tanda @."],
    ["orang@pcpexpress.com", "", "ya", "Permintaan tidak valid."],
  ])("masukan %s / %s / %s ditolak tanpa transaksi", async (email, name, isAdmin, message) => {
    seed(user(A, { isAdmin: true }));
    const r = await svc.createUser({ id: A }, email, name, isAdmin, IP);
    expect(r).toEqual({ ok: false, code: "INVALID", message });
    expect(db.prisma.$transaction).not.toHaveBeenCalled();
    expect(mail.sendInvitationEmail).not.toHaveBeenCalled();
  });

  it("email sudah terdaftar (beda kapital) → INVALID, tidak ada akun/token/audit/email baru", async () => {
    seed(user(A, { isAdmin: true }), user(B));
    const taken = db.state.users.get(B)!.email.toUpperCase();
    const r = await svc.createUser({ id: A }, taken, "", false, IP);
    expect(r).toMatchObject({ ok: false, code: "INVALID" });
    expect(db.state.users.size).toBe(2);
    expect(db.state.tokens).toHaveLength(0);
    expect(db.state.audits).toHaveLength(0);
    expect(mail.sendInvitationEmail).not.toHaveBeenCalled();
  });

  it("email terdaftar belum verifikasi → pesan menunjuk Hapus lalu tambah lagi", async () => {
    seed(user(A, { isAdmin: true }), user(B, { emailVerifiedAt: null }));
    const r = await svc.createUser({ id: A }, db.state.users.get(B)!.email, "", false, IP);
    expect(r).toMatchObject({ ok: false, code: "INVALID" });
    expect(!r.ok && r.message).toContain("belum verifikasi");
    expect(db.state.users.size).toBe(2);
  });

  it("email undangan gagal terkirim → akun tetap dibuat, inviteSent false", async () => {
    seed(user(A, { isAdmin: true }));
    mail.sendInvitationEmail.mockResolvedValueOnce(false);
    const r = await svc.createUser({ id: A }, "baru@pcpexpress.com", "", false, IP);
    expect(r).toMatchObject({ ok: true, data: { inviteSent: false } });
    expect(db.state.users.size).toBe(2);
    expect(db.state.tokens).toHaveLength(1);
  });

  it("pelaku sudah bukan admin aktif → NOT_FOUND tanpa tulis dan tanpa email", async () => {
    seed(user(A, { isAdmin: true, isActive: false }));
    const r = await svc.createUser({ id: A }, "baru@pcpexpress.com", "", false, IP);
    expect(r).toEqual({ ok: false, code: "NOT_FOUND", message: "Halaman tidak ditemukan." });
    expect(db.tx.user.create).not.toHaveBeenCalled();
    expect(mail.sendInvitationEmail).not.toHaveBeenCalled();
  });
});

describe("deleteUser (T-c7wf)", () => {
  const emailOf = (id: string) => db.state.users.get(id)!.email;

  it("akun tanpa dataset: baris, token, dan share yang diterima hilang; audit menyimpan email", async () => {
    seed(user(A, { isAdmin: true }), user(B, { isAdmin: true }));
    const email = emailOf(B);
    db.state.tokens.push({
      userId: B,
      purpose: "RESET_PASSWORD",
      tokenHash: "h",
      expiresAt: new Date(),
    });
    db.state.shares.push({ dashboardId: "d1", datasetId: "x1", userId: B, role: "VIEWER" });
    const r = await svc.deleteUser({ id: A }, B, `  ${email.toUpperCase()} `, IP);
    expect(r).toEqual({ ok: true, data: { email } });
    expect(db.state.users.has(B)).toBe(false);
    expect(db.state.tokens).toHaveLength(0);
    expect(db.state.shares).toHaveLength(0);
    expect(db.locks).toEqual(["admins", `datasets:${B}`]);
    expect(db.state.audits).toEqual([
      expect.objectContaining({
        actorId: A,
        action: "user.delete",
        targetType: "user",
        targetId: B,
        meta: { email, wasAdmin: true, wasActive: true },
        ip: IP,
      }),
    ]);
  });

  it("menghapus diri sendiri → FORBIDDEN", async () => {
    seed(user(A, { isAdmin: true }), user(D, { isAdmin: true }));
    const r = await svc.deleteUser({ id: A }, A, emailOf(A), IP);
    expect(r).toEqual({
      ok: false,
      code: "FORBIDDEN",
      message: "Anda tidak bisa menghapus akun sendiri.",
    });
    expect(db.tx.user.delete).not.toHaveBeenCalled();
  });

  it.each([["salah@pcpexpress.com"], [""], [null]])(
    "email konfirmasi %s tidak cocok → INVALID, akun tetap",
    async (confirm) => {
      seed(user(A, { isAdmin: true }), user(B));
      const r = await svc.deleteUser({ id: A }, B, confirm, IP);
      expect(r).toEqual({ ok: false, code: "INVALID", message: "Email konfirmasi tidak cocok." });
      expect(db.state.users.has(B)).toBe(true);
      expect(db.tx.user.delete).not.toHaveBeenCalled();
    },
  );

  it("masih memiliki dataset → INVALID dengan jumlah dan langkah alih, akun tetap", async () => {
    seed(user(A, { isAdmin: true }), user(B, { isActive: false }));
    for (const i of [1, 2]) {
      db.state.datasets.push({
        id: cuid(`dsdel${i}`),
        ownerId: B,
        name: `Data ${i}`,
        nameKey: `data ${i}`,
        createdAt: new Date(),
      });
    }
    const r = await svc.deleteUser({ id: A }, B, emailOf(B), IP);
    expect(r).toMatchObject({ ok: false, code: "INVALID" });
    expect(!r.ok && r.message).toContain("masih memiliki 2 dataset");
    expect(db.state.users.has(B)).toBe(true);
    expect(db.state.audits).toHaveLength(0);
  });

  it("id rusak atau pengguna tidak ada → NOT_FOUND", async () => {
    seed(user(A, { isAdmin: true }));
    expect(await svc.deleteUser({ id: A }, "../x", "a@pcpexpress.com", IP)).toMatchObject({
      code: "NOT_FOUND",
    });
    expect(await svc.deleteUser({ id: A }, B, "a@pcpexpress.com", IP)).toMatchObject({
      code: "NOT_FOUND",
    });
    expect(db.tx.user.delete).not.toHaveBeenCalled();
  });

  it("pelaku sudah bukan admin aktif → NOT_FOUND tanpa hapus", async () => {
    seed(user(A, { isAdmin: false }), user(B));
    const r = await svc.deleteUser({ id: A }, B, emailOf(B), IP);
    expect(r).toEqual({ ok: false, code: "NOT_FOUND", message: "Halaman tidak ditemukan." });
    expect(db.state.users.has(B)).toBe(true);
  });
});
