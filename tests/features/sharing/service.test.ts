import { beforeEach, describe, expect, it, vi } from "vitest";
import { col, cuid, fakeShareDb, userRow } from "./fake-db";

/*
 * T-016: service berbagi dengan Prisma palsu yang mengevaluasi predikat akses. Hanya pemilik dataset
 * yang mengelola akses (editor/viewer → FORBIDDEN, tanpa akses → NOT_FOUND, dicatat); penerima hanya
 * akun aktif + terverifikasi selain pemilik; setiap perubahan menulis AuditLog di transaksi yang sama
 * (gagal → tidak ada yang berubah); pencarian pengguna prefix ≥ 3, maks. 10; peringatan dihitung di
 * server; audit buka dashboard dedup 30 menit lewat Redis dan tetap tercatat bila Redis mati.
 */
const fake = fakeShareDb();
vi.mock("@/lib/db", () => ({ prisma: fake.db }));
const { redis, redisReady, logAccessDenied, logger } = vi.hoisted(() => {
  const redis = { set: vi.fn(), del: vi.fn() };
  return {
    redis,
    redisReady: vi.fn(),
    logAccessDenied: vi.fn(async () => {}),
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  };
});
vi.mock("@/lib/redis", () => ({ redisReady }));
vi.mock("@/features/auth/denial-log", () => ({ logAccessDenied }));
vi.mock("@/lib/logger", () => ({ logger }));

const svc = await import("@/features/sharing/service");
const { dashboardAccess } = await import("@/features/sharing/access");

const OWNER = cuid("owner");
const EDITOR = cuid("editor");
const VIEWER = cuid("viewer");
const NEWBIE = cuid("newbie");
const INACTIVE = cuid("inactive");
const UNVERIFIED = cuid("unverified");
const STRANGER = cuid("stranger");
const SITI = cuid("siti");
const DS = cuid("dsx");
const VER = cuid("verx");
const S1 = cuid("sheetpenjualan");
const S2 = cuid("sheetstok");
const D1 = cuid("dash1");
const IP = "203.0.113.9";

const fmt = { style: "number", decimals: 0 };
const kpi = (sheetId: string) => ({ sheetId, measure: { agg: "count" }, format: fmt });

function seed() {
  const s = fake.state;
  s.users.push(
    userRow(OWNER, { email: "pemilik@pcpexpress.com", name: "Pemilik" }),
    userRow(EDITOR, { email: "editor@pcpexpress.com", name: "Eka Editor" }),
    userRow(VIEWER, { email: "viewer@pcpexpress.com", name: null }),
    userRow(NEWBIE, { email: "budi.santoso@pcpexpress.com", name: "Budi‮ Santoso" }),
    userRow(INACTIVE, { email: "budi.lama@pcpexpress.com", isActive: false }),
    userRow(UNVERIFIED, { email: "budiman@pcpexpress.com", emailVerifiedAt: null }),
    userRow(STRANGER, { email: "asing@pcpexpress.com" }),
    userRow(SITI, { email: "s.aminah@pcpexpress.com", name: "Siti Aminah" }),
  );
  s.datasets.push({ id: DS, ownerId: OWNER, name: "Penjualan", activeVersionId: VER });
  s.sheets.push(
    {
      id: S1,
      versionId: VER,
      datasetId: DS,
      name: "Penjualan",
      index: 0,
      typedKey: "t1",
      schema: [col(1, "Cabang", "text"), col(2, "Omzet", "decimal")],
    },
    {
      id: S2,
      versionId: VER,
      datasetId: DS,
      name: "Stok",
      index: 1,
      typedKey: "t2",
      schema: [col(1, "Cabang", "text"), col(2, "Qty", "integer")],
    },
  );
  s.dashboards.push({
    id: D1,
    datasetId: DS,
    name: "Ringkasan",
    orgShared: false,
    layout: [],
    layoutRevision: 0,
    filterColumns: [{ sheet: "Penjualan", column: "Cabang" }],
    updatedAt: new Date("2026-10-15T00:00:00Z"),
  });
  s.widgets.push(
    { id: cuid("w1"), dashboardId: D1, type: "kpi", title: "", spec: kpi(S1), missingColumns: [] },
    { id: cuid("w2"), dashboardId: D1, type: "kpi", title: "", spec: kpi(S2), missingColumns: [] },
  );
  s.shares.push(
    {
      dashboardId: D1,
      userId: EDITOR,
      role: "EDITOR",
      createdById: OWNER,
      createdAt: new Date("2026-10-14T00:00:00Z"),
    },
    {
      dashboardId: D1,
      userId: VIEWER,
      role: "VIEWER",
      createdById: OWNER,
      createdAt: new Date("2026-10-14T01:00:00Z"),
    },
  );
}

beforeEach(() => {
  fake.reset();
  seed();
  redis.set.mockResolvedValue("OK");
  redis.del.mockResolvedValue(1);
  redisReady.mockResolvedValue(redis);
});

const unchanged = () => JSON.stringify({ s: fake.state.shares, d: fake.state.dashboards });
const userNotFound = {
  ok: false,
  code: "NOT_FOUND",
  message: "Pengguna tidak ditemukan atau belum aktif.",
};

describe("pemilik saja: editor/viewer FORBIDDEN, tanpa akses NOT_FOUND (dicatat)", () => {
  const ops = {
    listShares: (u: string) => svc.listShares(u, D1),
    searchShareUsers: (u: string) => svc.searchShareUsers(u, D1, "budi"),
    grantShare: (u: string) => svc.grantShare(u, D1, { userId: NEWBIE }, "VIEWER", IP),
    setShareRole: (u: string) => svc.setShareRole(u, D1, VIEWER, "EDITOR", IP),
    revokeShare: (u: string) => svc.revokeShare(u, D1, VIEWER, IP),
    setOrgShare: (u: string) => svc.setOrgShare(u, D1, true, IP),
  };

  it.each(Object.entries(ops))("%s", async (_name, op) => {
    const before = unchanged();
    expect(await op(EDITOR)).toEqual({
      ok: false,
      code: "FORBIDDEN",
      message: "Hanya pemilik dataset yang bisa mengatur akses dashboard ini.",
    });
    expect(await op(VIEWER)).toMatchObject({ code: "FORBIDDEN" });
    expect(await op(STRANGER)).toEqual({
      ok: false,
      code: "NOT_FOUND",
      message: "Dashboard tidak ditemukan.",
    });
    expect(unchanged()).toBe(before);
    expect(fake.state.audits).toEqual([]);
    expect(logAccessDenied).toHaveBeenCalledWith(
      expect.stringMatching(/^share:/),
      expect.objectContaining({ userId: STRANGER, code: "NOT_FOUND", dashboardId: D1 }),
      "aksi berbagi ditolak",
    );
    expect(logAccessDenied).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ userId: EDITOR, code: "FORBIDDEN" }),
      "aksi berbagi ditolak",
    );
  });

  it("id dashboard rusak → NOT_FOUND tanpa query", async () => {
    expect(await svc.listShares(OWNER, "../x")).toMatchObject({ code: "NOT_FOUND" });
    expect(await svc.grantShare(OWNER, "../x", { userId: NEWBIE }, "VIEWER", IP)).toMatchObject({
      code: "NOT_FOUND",
    });
    expect(fake.db.$transaction).not.toHaveBeenCalled();
  });
});

describe("listShares + peringatan", () => {
  it("share organisasi, daftar orang (urut pemberian), peringatan editor + kolom filter lintas sheet", async () => {
    expect(await svc.listShares(OWNER, D1)).toEqual({
      ok: true,
      data: {
        orgShared: false,
        grants: [
          {
            userId: EDITOR,
            name: "Eka Editor",
            email: "editor@pcpexpress.com",
            role: "EDITOR",
            active: true,
          },
          {
            userId: VIEWER,
            name: null,
            email: "viewer@pcpexpress.com",
            role: "VIEWER",
            active: true,
          },
        ],
        // Cabang (kolom filter dari Penjualan) juga ada, teks, di Stok yang dipakai widget.
        warnings: { editor: true, filterColumns: ["Cabang"] },
      },
    });
  });

  it("tanpa editor dan satu sheet → tanpa peringatan; akun nonaktif ditandai active:false", async () => {
    fake.state.shares = fake.state.shares.filter((s) => s.userId !== EDITOR);
    fake.state.widgets = fake.state.widgets.filter(
      (w) => w.spec && (w.spec as { sheetId: string }).sheetId === S1,
    );
    fake.state.users.find((u) => u.id === VIEWER)!.isActive = false;
    const r = await svc.listShares(OWNER, D1);
    expect(r).toMatchObject({
      ok: true,
      data: {
        grants: [{ userId: VIEWER, active: false }],
        warnings: { editor: false, filterColumns: [] },
      },
    });
  });
});

describe("grantShare", () => {
  it("lewat email (dinormalisasi): share VIEWER + AuditLog grant di transaksi yang sama, di bawah lock dashboard", async () => {
    const r = await svc.grantShare(
      OWNER,
      D1,
      { email: "  Budi.Santoso@PCPEXPRESS.com " },
      "VIEWER",
      IP,
    );
    expect(r).toMatchObject({ ok: true, data: { orgShared: false } });
    if (r.ok) {
      expect(r.data.grants.map((g) => [g.userId, g.role, g.name])).toEqual([
        [EDITOR, "EDITOR", "Eka Editor"],
        [VIEWER, "VIEWER", null],
        [NEWBIE, "VIEWER", "Budi Santoso"],
      ]);
    }
    expect(fake.state.shares.find((s) => s.userId === NEWBIE)).toMatchObject({
      dashboardId: D1,
      role: "VIEWER",
      createdById: OWNER,
    });
    expect(fake.state.audits).toEqual([
      {
        actorId: OWNER,
        action: "dashboard.share.grant",
        targetType: "dashboard",
        targetId: D1,
        meta: { userId: NEWBIE, role: "VIEWER" },
        ip: IP,
      },
    ]);
    expect(fake.locks).toEqual([`dashboard:${D1}`]);
  });

  it("lewat userId (pemilih); sudah punya akses → peran diganti (audit role from/to); peran sama → tanpa audit", async () => {
    expect(await svc.grantShare(OWNER, D1, { userId: NEWBIE }, "EDITOR", IP)).toMatchObject({
      ok: true,
      data: { warnings: { editor: true } },
    });
    expect(await svc.grantShare(OWNER, D1, { userId: VIEWER }, "EDITOR", IP)).toMatchObject({
      ok: true,
    });
    expect(await svc.grantShare(OWNER, D1, { userId: VIEWER }, "EDITOR", IP)).toMatchObject({
      ok: true,
    });
    expect(fake.state.audits.map((a) => [a.action, a.meta])).toEqual([
      ["dashboard.share.grant", { userId: NEWBIE, role: "EDITOR" }],
      ["dashboard.share.role", { userId: VIEWER, from: "VIEWER", to: "EDITOR" }],
    ]);
    expect(fake.state.shares.filter((s) => s.userId === VIEWER)).toHaveLength(1);
  });

  it("pemilik sendiri, nonaktif, belum verifikasi, tidak dikenal, email rusak → NOT_FOUND pesan sama, tanpa perubahan", async () => {
    const before = unchanged();
    for (const target of [
      { userId: OWNER },
      { email: "pemilik@pcpexpress.com" },
      { userId: INACTIVE },
      { email: "budi.lama@pcpexpress.com" },
      { userId: UNVERIFIED },
      { email: "budiman@pcpexpress.com" },
      { email: "tidak.ada@pcpexpress.com" },
      { email: "bukan email" },
      { userId: "../x" },
    ]) {
      expect(await svc.grantShare(OWNER, D1, target, "VIEWER", IP)).toEqual(userNotFound);
    }
    expect(unchanged()).toBe(before);
    expect(fake.state.audits).toEqual([]);
  });

  it("peran atau bentuk penerima tidak valid → INVALID sebelum menyentuh DB", async () => {
    expect(await svc.grantShare(OWNER, D1, { userId: NEWBIE }, "OWNER", IP)).toMatchObject({
      code: "INVALID",
    });
    for (const target of [
      {},
      { userId: NEWBIE, email: "budi.santoso@pcpexpress.com" },
      { userId: NEWBIE, extra: 1 },
      "budi.santoso@pcpexpress.com",
      null,
    ]) {
      expect(await svc.grantShare(OWNER, D1, target, "VIEWER", IP)).toMatchObject({
        code: "INVALID",
      });
    }
    // Kunci bernilai undefined (serialisasi Server Action) tetap diterima.
    expect(
      await svc.grantShare(OWNER, D1, { userId: NEWBIE, email: undefined }, "VIEWER", IP),
    ).toMatchObject({ ok: true });
    expect(fake.db.$transaction).toHaveBeenCalledTimes(1);
  });

  it("AuditLog gagal → share tidak tersimpan (transaksi dibatalkan)", async () => {
    fake.db.auditLog.create.mockRejectedValueOnce(new Error("db down"));
    await expect(svc.grantShare(OWNER, D1, { userId: NEWBIE }, "VIEWER", IP)).rejects.toThrow(
      "db down",
    );
    expect(fake.state.shares.map((s) => s.userId)).toEqual([EDITOR, VIEWER]);
  });

  it("batas share per dashboard → LIMIT_REACHED tanpa menulis", async () => {
    for (let i = 0; i < svc.SHARES_PER_DASHBOARD - 2; i++) {
      fake.state.shares.push({
        dashboardId: D1,
        userId: cuid(`filler${i}`),
        role: "VIEWER",
        createdById: OWNER,
        createdAt: new Date(),
      });
    }
    expect(await svc.grantShare(OWNER, D1, { userId: NEWBIE }, "VIEWER", IP)).toMatchObject({
      code: "LIMIT_REACHED",
    });
    expect(fake.state.audits).toEqual([]);
  });
});

describe("setShareRole / revokeShare / setOrgShare", () => {
  it("ubah peran: audit role; tanpa share → NOT_FOUND; peran sama → tanpa audit", async () => {
    expect(await svc.setShareRole(OWNER, D1, VIEWER, "EDITOR", IP)).toMatchObject({ ok: true });
    expect(await svc.setShareRole(OWNER, D1, VIEWER, "EDITOR", IP)).toMatchObject({ ok: true });
    expect(await svc.setShareRole(OWNER, D1, NEWBIE, "EDITOR", IP)).toMatchObject({
      code: "NOT_FOUND",
    });
    expect(await svc.setShareRole(OWNER, D1, VIEWER, "ADMIN", IP)).toMatchObject({
      code: "INVALID",
    });
    expect(fake.state.audits).toEqual([
      {
        actorId: OWNER,
        action: "dashboard.share.role",
        targetType: "dashboard",
        targetId: D1,
        meta: { userId: VIEWER, from: "VIEWER", to: "EDITOR" },
        ip: IP,
      },
    ]);
  });

  it("cabut: share hilang + audit {userId, role}; cabut lagi → berhasil tanpa audit; akses berikutnya 404", async () => {
    expect(await dashboardAccess(EDITOR, D1)).toMatchObject({ role: "EDITOR" });
    const r = await svc.revokeShare(OWNER, D1, EDITOR, IP);
    expect(r).toMatchObject({ ok: true, data: { warnings: { editor: false } } });
    expect(await svc.revokeShare(OWNER, D1, EDITOR, IP)).toMatchObject({ ok: true });
    expect(fake.state.audits).toEqual([
      {
        actorId: OWNER,
        action: "dashboard.share.revoke",
        targetType: "dashboard",
        targetId: D1,
        meta: { userId: EDITOR, role: "EDITOR" },
        ip: IP,
      },
    ]);
    // Akses tidak di-cache: muatan berikutnya langsung tanpa akses (AC4).
    expect(await dashboardAccess(EDITOR, D1)).toBeNull();
  });

  it("organisasi: nyala → semua pengguna aktif bisa melihat (AC2); mati → 404 lagi (AC4); audit {on}", async () => {
    expect(await dashboardAccess(STRANGER, D1)).toBeNull();
    expect(await svc.setOrgShare(OWNER, D1, true, IP)).toMatchObject({
      ok: true,
      data: { orgShared: true },
    });
    expect(await dashboardAccess(STRANGER, D1)).toMatchObject({ role: "VIEWER" });
    // Share organisasi hanya VIEWER: viewer tetap tidak bisa mengelola akses.
    expect(await svc.setOrgShare(STRANGER, D1, false, IP)).toMatchObject({ code: "FORBIDDEN" });
    expect(await svc.setOrgShare(OWNER, D1, true, IP)).toMatchObject({ ok: true });
    expect(await svc.setOrgShare(OWNER, D1, false, IP)).toMatchObject({
      ok: true,
      data: { orgShared: false },
    });
    expect(await dashboardAccess(STRANGER, D1)).toBeNull();
    expect(fake.state.audits.map((a) => [a.action, a.meta, a.targetId])).toEqual([
      ["dashboard.org.share", { on: true }, D1],
      ["dashboard.org.share", { on: false }, D1],
    ]);
    expect(await svc.setOrgShare(OWNER, D1, "ya", IP)).toMatchObject({ code: "INVALID" });
  });
});

describe("searchShareUsers", () => {
  beforeEach(() => {
    for (let i = 1; i <= 12; i++) {
      const n = String(i).padStart(2, "0");
      fake.state.users.push(userRow(cuid(`budi${n}`), { email: `budi${n}@pcpexpress.com` }));
    }
  });

  it("< 3 karakter → daftar kosong tanpa query (tidak ada daftar awal untuk dijelajahi)", async () => {
    expect(await svc.searchShareUsers(OWNER, D1, "bu")).toEqual({ ok: true, data: [] });
    expect(await svc.searchShareUsers(OWNER, D1, "  b ‮ ")).toEqual({ ok: true, data: [] });
    expect(await svc.searchShareUsers(OWNER, D1, 42)).toEqual({ ok: true, data: [] });
    expect(fake.db.user.findMany).not.toHaveBeenCalled();
  });

  it("prefix email: aktif + terverifikasi saja, maks. 10 urut email, nama dibersihkan", async () => {
    const r = await svc.searchShareUsers(OWNER, D1, "BUDI");
    if (!r.ok) throw new Error(r.message);
    expect(r.data).toHaveLength(svc.SHARE_SEARCH_MAX);
    expect(r.data[0]).toEqual({
      id: NEWBIE,
      email: "budi.santoso@pcpexpress.com",
      name: "Budi Santoso",
    });
    const emails = r.data.map((u) => u.email);
    expect(emails).not.toContain("budi.lama@pcpexpress.com");
    expect(emails).not.toContain("budiman@pcpexpress.com");
  });

  it("prefix nama; pemilik sendiri tidak pernah muncul; email lengkap persis selalu didahulukan", async () => {
    expect(await svc.searchShareUsers(OWNER, D1, "siti")).toMatchObject({
      ok: true,
      data: [{ id: SITI }],
    });
    expect(await svc.searchShareUsers(OWNER, D1, "pemilik@pcpexpress.com")).toEqual({
      ok: true,
      data: [],
    });
    expect(await svc.searchShareUsers(OWNER, D1, "budi.lama@pcpexpress.com")).toEqual({
      ok: true,
      data: [],
    });
    const exact = await svc.searchShareUsers(OWNER, D1, "Budi07@pcpexpress.com");
    expect(exact).toMatchObject({ ok: true, data: [{ email: "budi07@pcpexpress.com" }] });
  });

  it("wildcard LIKE literal: '___' atau '%%%' tidak cocok dengan semua pengguna", async () => {
    expect(await svc.searchShareUsers(OWNER, D1, "___")).toEqual({ ok: true, data: [] });
    expect(await svc.searchShareUsers(OWNER, D1, "%%%")).toEqual({ ok: true, data: [] });
  });
});

describe("recordDashboardOpen (audit buka, dedup 30 menit)", () => {
  it("pertama kali → SET NX EX 1800 lalu AuditLog {role}; berikutnya (kunci masih ada) → tidak ditulis", async () => {
    await svc.recordDashboardOpen(VIEWER, D1, "VIEWER", IP);
    expect(redis.set).toHaveBeenCalledWith(`audit:open:${VIEWER}:${D1}`, "1", "EX", 1800, "NX");
    redis.set.mockResolvedValueOnce(null);
    await svc.recordDashboardOpen(VIEWER, D1, "VIEWER", IP);
    expect(fake.state.audits).toEqual([
      {
        actorId: VIEWER,
        action: "dashboard.open",
        targetType: "dashboard",
        targetId: D1,
        meta: { role: "VIEWER" },
        ip: IP,
      },
    ]);
  });

  it("Redis mati → tetap dicatat (warn), tidak melempar", async () => {
    redisReady.mockRejectedValueOnce(new Error("ECONNREFUSED"));
    await expect(svc.recordDashboardOpen(OWNER, D1, "OWNER", IP)).resolves.toBeUndefined();
    expect(fake.state.audits).toMatchObject([
      { action: "dashboard.open", meta: { role: "OWNER" } },
    ]);
    expect(logger.warn).toHaveBeenCalled();
  });

  it("AuditLog gagal → tidak melempar, dicatat error, kunci dedup dilepas agar pembukaan berikutnya tercatat", async () => {
    fake.db.auditLog.create.mockRejectedValueOnce(new Error("db down"));
    await expect(svc.recordDashboardOpen(EDITOR, D1, "EDITOR", IP)).resolves.toBeUndefined();
    expect(logger.error).toHaveBeenCalled();
    expect(redis.del).toHaveBeenCalledWith(`audit:open:${EDITOR}:${D1}`);
  });
});
