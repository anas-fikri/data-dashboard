import { beforeEach, describe, expect, it, vi } from "vitest";
import { col, cuid, fakeShareDb, userRow } from "../sharing/fake-db";

/*
 * T-016: peran per dashboard di service dashboard, dengan Prisma palsu yang MENGEVALUASI predikat akses.
 * Widget/tata letak: OWNER dan EDITOR; VIEWER (share atau organisasi) → FORBIDDEN tanpa menulis;
 * tanpa akses → NOT_FOUND — termasuk pemegang share dashboard LAIN di dataset yang sama (akses per
 * dashboard, bukan per dataset). Nama, kolom filter, hapus: pemilik saja (editor → FORBIDDEN). Sheet di
 * luar dataset dashboard → NOT_FOUND (AC6). Server Action edit → code FORBIDDEN (AC1).
 */
const fake = fakeShareDb();
vi.mock("@/lib/db", () => ({ prisma: fake.db }));
const { requireUser, revalidatePath, redirect } = vi.hoisted(() => ({
  requireUser: vi.fn(),
  revalidatePath: vi.fn(),
  redirect: vi.fn(() => {
    throw new Error("NEXT_REDIRECT");
  }),
}));
vi.mock("@/features/auth/session", () => ({ requireUser }));
vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("next/navigation", () => ({ redirect }));

const svc = await import("@/features/dashboards/service");
const actions = await import("@/features/dashboards/actions");

const OWNER = cuid("owner");
const EDITOR = cuid("editor");
const VIEWER = cuid("viewer");
const ORG = cuid("orguser");
const STRANGER = cuid("stranger");
const DS = cuid("dsx");
const DSY = cuid("dsy");
const VER = cuid("verx");
const VER_OLD = cuid("verxold");
const VERY = cuid("very");
const S1 = cuid("sheetpenjualan");
const S2 = cuid("sheetstok");
const S_OLD = cuid("sheetold");
const SY = cuid("sheety");
/** Dibagikan ke EDITOR (EDITOR) dan VIEWER (VIEWER). */
const D1 = cuid("dashprivate");
/** Dibagikan ke organisasi. */
const D2 = cuid("dashorg");
/** Dataset sama dengan D1, dibagikan ke STRANGER saja. */
const D3 = cuid("dashstranger");
const W1 = cuid("widget1");
const W2 = cuid("widget2");
const W3 = cuid("widget3");

const fmt = { style: "number", decimals: 0 };
const kpi = (sheetId: string) => ({ sheetId, measure: { agg: "count" }, format: fmt });
const bar = (sheetId: string) => ({
  sheetId,
  dimension: { column: 1 },
  measure: { agg: "sum", column: 2 },
  sort: "value_desc",
  topN: 12,
  format: fmt,
});

function seed() {
  const s = fake.state;
  s.users.push(
    userRow(OWNER, { name: "Pemilik‮ Satu", email: "pemilik@pcpexpress.com" }),
    userRow(EDITOR, { email: "editor@pcpexpress.com" }),
    userRow(VIEWER, { email: "viewer@pcpexpress.com" }),
    userRow(ORG, { email: "org@pcpexpress.com" }),
    userRow(STRANGER, { email: "asing@pcpexpress.com" }),
  );
  s.datasets.push(
    { id: DS, ownerId: OWNER, name: "Penjualan", activeVersionId: VER },
    { id: DSY, ownerId: STRANGER, name: "Rahasia Y", activeVersionId: VERY },
  );
  s.sheets.push(
    {
      id: S1,
      versionId: VER,
      datasetId: DS,
      name: "Penjualan",
      index: 0,
      typedKey: "t1",
      schema: [
        col(1, "Cabang", "text"),
        col(2, "Omzet", "decimal"),
        col(3, "Gaji", "decimal", true),
      ],
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
    {
      id: S_OLD,
      versionId: VER_OLD,
      datasetId: DS,
      name: "Penjualan",
      index: 0,
      typedKey: "t0",
      schema: [col(1, "Cabang", "text"), col(2, "Omzet", "decimal")],
    },
    {
      id: SY,
      versionId: VERY,
      datasetId: DSY,
      name: "Gaji",
      index: 0,
      typedKey: "ty",
      schema: [col(1, "Nama", "text"), col(2, "Gaji", "decimal")],
    },
  );
  const dash = (id: string, widget: string, orgShared = false) => ({
    id,
    datasetId: DS,
    name: `Dashboard ${id.slice(1, 8)}`,
    orgShared,
    layout: [{ i: widget, x: 0, y: 0, w: 4, h: 4 }],
    layoutRevision: 1,
    filterColumns: [
      { sheet: "Penjualan", column: "Cabang" },
      { sheet: "Penjualan", column: "Gaji" },
    ],
    updatedAt: new Date("2026-10-15T00:00:00Z"),
  });
  s.dashboards.push(dash(D1, W1), dash(D2, W2, true), dash(D3, W3));
  const widget = (id: string, dashboardId: string) => ({
    id,
    dashboardId,
    type: "kpi",
    title: "Jumlah",
    spec: kpi(S1),
    missingColumns: [],
  });
  s.widgets.push(widget(W1, D1), widget(W2, D2), widget(W3, D3));
  const share = (dashboardId: string, userId: string, role: "VIEWER" | "EDITOR") => ({
    dashboardId,
    userId,
    role,
    createdById: OWNER,
    createdAt: new Date("2026-10-14T00:00:00Z"),
  });
  s.shares.push(
    share(D1, EDITOR, "EDITOR"),
    share(D1, VIEWER, "VIEWER"),
    share(D3, STRANGER, "VIEWER"),
  );
}

beforeEach(() => {
  fake.reset();
  seed();
});

const widgetOf: Record<string, string> = { [D1]: W1, [D2]: W2, [D3]: W3 };
const editOps = {
  saveLayout: (u: string, d: string) =>
    svc.saveLayout(u, d, { baseRevision: 1, items: [{ i: widgetOf[d], x: 2, y: 0, w: 4, h: 4 }] }),
  addWidget: (u: string, d: string) => svc.addWidget(u, d, { baseRevision: 1 }),
  deleteWidget: (u: string, d: string) => svc.deleteWidget(u, d, widgetOf[d], 1),
  renameWidget: (u: string, d: string) => svc.renameWidget(u, d, widgetOf[d], "Judul baru"),
  configureWidget: (u: string, d: string) => svc.configureWidget(u, d, widgetOf[d], "bar", bar(S1)),
};
const ownerOps = {
  renameDashboard: (u: string, d: string) => svc.renameDashboard(u, d, "Nama baru"),
  deleteDashboard: (u: string, d: string) => svc.deleteDashboard(u, d),
  setDashboardFilterColumns: (u: string, d: string) =>
    svc.setDashboardFilterColumns(u, d, [{ sheet: "Penjualan", column: "Omzet" }]),
};

/** Tidak ada satu pun tulisan ke dashboard/widget yang tersimpan. */
function snapshot() {
  return JSON.stringify({ d: fake.state.dashboards, w: fake.state.widgets });
}

describe("widget dan tata letak: OWNER/EDITOR boleh, VIEWER FORBIDDEN, tanpa akses NOT_FOUND", () => {
  const cases = Object.entries(editOps);

  it.each(cases)("%s: pemilik dan editor berhasil", async (_name, op) => {
    expect(await op(OWNER, D1)).toMatchObject({ ok: true });
    fake.reset();
    seed();
    expect(await op(EDITOR, D1)).toMatchObject({ ok: true });
  });

  it.each(cases)(
    "%s: viewer share dan viewer organisasi → FORBIDDEN tanpa menulis",
    async (_name, op) => {
      const before = snapshot();
      expect(await op(VIEWER, D1)).toMatchObject({ ok: false, code: "FORBIDDEN" });
      expect(await op(ORG, D2)).toMatchObject({ ok: false, code: "FORBIDDEN" });
      // Editor D1 hanya viewer di D2 (organisasi): tetap FORBIDDEN di sana.
      expect(await op(EDITOR, D2)).toMatchObject({ ok: false, code: "FORBIDDEN" });
      expect(snapshot()).toBe(before);
    },
  );

  it.each(cases)(
    "%s: tanpa akses → NOT_FOUND, juga pemegang share dashboard lain di dataset yang sama",
    async (_name, op) => {
      const before = snapshot();
      expect(await op(STRANGER, D1)).toMatchObject({
        ok: false,
        code: "NOT_FOUND",
        message: "Dashboard tidak ditemukan.",
      });
      expect(await op(EDITOR, D3)).toMatchObject({ ok: false, code: "NOT_FOUND" });
      expect(snapshot()).toBe(before);
    },
  );

  it("cek akses di DALAM transaksi lock: tulis editor memakai canEditWhere setelah pg_advisory_xact_lock", async () => {
    expect(await editOps.saveLayout(EDITOR, D1)).toMatchObject({ ok: true });
    expect(fake.locks).toEqual([`dashboard:${D1}`]);
    // Panggilan findFirst pertama dalam transaksi (lockedDashboard) membawa predikat edit.
    expect(fake.db.dashboard.findFirst.mock.calls[0]![0].where).toEqual({
      id: D1,
      OR: [
        { dataset: { ownerId: EDITOR } },
        { shares: { some: { userId: EDITOR, role: "EDITOR" } } },
      ],
    });
  });

  it("dicabut di tengah sesi → NOT_FOUND; diturunkan ke VIEWER → FORBIDDEN (tanpa cache akses)", async () => {
    expect(await editOps.saveLayout(EDITOR, D1)).toMatchObject({ ok: true });
    fake.state.shares.find((s) => s.userId === EDITOR)!.role = "VIEWER";
    expect(
      await svc.saveLayout(EDITOR, D1, {
        baseRevision: 2,
        items: [{ i: W1, x: 0, y: 0, w: 4, h: 4 }],
      }),
    ).toMatchObject({ code: "FORBIDDEN" });
    fake.state.shares = fake.state.shares.filter((s) => s.userId !== EDITOR);
    expect(
      await svc.saveLayout(EDITOR, D1, {
        baseRevision: 2,
        items: [{ i: W1, x: 0, y: 0, w: 4, h: 4 }],
      }),
    ).toMatchObject({ code: "NOT_FOUND" });
  });

  it("editor: widget yang tidak ada / milik dashboard lain → 'Widget tidak ditemukan.', bukan FORBIDDEN", async () => {
    const missing = { ok: false, code: "NOT_FOUND", message: "Widget tidak ditemukan." };
    expect(await svc.renameWidget(EDITOR, D1, W2, "X")).toEqual(missing);
    expect(await svc.configureWidget(EDITOR, D1, cuid("nowidget"), "bar", bar(S1))).toEqual(
      missing,
    );
    expect(await svc.deleteWidget(EDITOR, D1, W2, 1)).toEqual(missing);
  });

  it("revisi lama tetap STALE untuk editor (CAS sama dengan pemilik)", async () => {
    expect(
      await svc.saveLayout(EDITOR, D1, {
        baseRevision: 0,
        items: [{ i: W1, x: 0, y: 0, w: 4, h: 4 }],
      }),
    ).toMatchObject({ code: "STALE" });
  });
});

describe("pemilik saja: nama, hapus, kolom filter", () => {
  const cases = Object.entries(ownerOps);

  it.each(cases)("%s: pemilik berhasil", async (_name, op) => {
    expect(await op(OWNER, D1)).toMatchObject({ ok: true });
  });

  it.each(cases)(
    "%s: editor dan viewer → FORBIDDEN tanpa menulis; tanpa akses → NOT_FOUND",
    async (_name, op) => {
      const before = snapshot();
      expect(await op(EDITOR, D1)).toMatchObject({
        ok: false,
        code: "FORBIDDEN",
        message: "Hanya pemilik dataset yang bisa melakukan ini.",
      });
      expect(await op(VIEWER, D1)).toMatchObject({ code: "FORBIDDEN" });
      expect(await op(ORG, D2)).toMatchObject({ code: "FORBIDDEN" });
      expect(await op(STRANGER, D1)).toMatchObject({ code: "NOT_FOUND" });
      expect(snapshot()).toBe(before);
      expect(fake.state.dashboards).toHaveLength(3);
    },
  );
});

describe("AC1: Server Action edit dashboard → code FORBIDDEN untuk viewer/editor", () => {
  const form = (o: Record<string, string>) => {
    const f = new FormData();
    for (const [k, v] of Object.entries(o)) f.set(k, v);
    return f;
  };

  it("ganti nama: viewer → FORBIDDEN, tanpa akses → NOT_FOUND, pemilik → sukses", async () => {
    requireUser.mockResolvedValue({ id: VIEWER });
    expect(
      await actions.renameDashboardAction({ status: "idle" }, form({ id: D1, name: "Baru" })),
    ).toMatchObject({ status: "error", code: "FORBIDDEN" });
    requireUser.mockResolvedValue({ id: STRANGER });
    expect(
      await actions.renameDashboardAction({ status: "idle" }, form({ id: D1, name: "Baru" })),
    ).toMatchObject({ status: "error", code: "NOT_FOUND" });
    expect(revalidatePath).not.toHaveBeenCalled();
    requireUser.mockResolvedValue({ id: OWNER });
    expect(
      await actions.renameDashboardAction({ status: "idle" }, form({ id: D1, name: "Baru" })),
    ).toMatchObject({ status: "success" });
  });

  it("hapus: editor → FORBIDDEN dan dashboard tetap ada", async () => {
    requireUser.mockResolvedValue({ id: EDITOR });
    expect(await actions.deleteDashboardAction({ status: "idle" }, form({ id: D1 }))).toMatchObject(
      {
        status: "error",
        code: "FORBIDDEN",
      },
    );
    expect(fake.state.dashboards.map((d) => d.id)).toContain(D1);
    expect(redirect).not.toHaveBeenCalled();
  });
});

describe("AC6: sheet di luar dataset dashboard → NOT_FOUND", () => {
  it("atur widget dengan sheet dataset lain atau sheet yang tidak ada → NOT_FOUND; sheet versi lama dataset ini → STALE", async () => {
    const notFound = { ok: false, code: "NOT_FOUND", message: "Sheet tidak ditemukan." };
    expect(await svc.configureWidget(EDITOR, D1, W1, "bar", bar(SY))).toEqual(notFound);
    expect(await svc.configureWidget(OWNER, D1, W1, "bar", bar(cuid("nosheet")))).toEqual(notFound);
    expect(await svc.configureWidget(EDITOR, D1, W1, "bar", bar(S_OLD))).toMatchObject({
      code: "STALE",
    });
    expect(fake.state.widgets.find((w) => w.id === W1)!.spec).toEqual(kpi(S1));
    // Sheet dataset ini di versi aktif → tersimpan.
    expect(await svc.configureWidget(EDITOR, D1, W1, "bar", bar(S2))).toMatchObject({ ok: true });
  });

  it("pulihkan widget (urungkan hapus) dengan sheet dataset lain → NOT_FOUND tanpa membuat; sheet yang sudah tidak ada → dipulihkan kosong", async () => {
    expect(
      await svc.addWidget(EDITOR, D1, { baseRevision: 1, type: "bar", spec: bar(SY) }),
    ).toEqual({ ok: false, code: "NOT_FOUND", message: "Sheet tidak ditemukan." });
    expect(fake.state.widgets.filter((w) => w.dashboardId === D1)).toHaveLength(1);
    expect(
      await svc.addWidget(EDITOR, D1, { baseRevision: 1, type: "bar", spec: bar(cuid("gone")) }),
    ).toMatchObject({ ok: true, data: { configDropped: true, widget: { type: "empty" } } });
  });
});

describe("baca: getDashboard, sumber panel, daftar", () => {
  it("getDashboard untuk semua peran: peran, nama pemilik bersih; non-pemilik tanpa kolom filter yang tidak tersedia", async () => {
    const owner = await svc.getDashboard(OWNER, D1);
    expect(owner).toMatchObject({ role: "OWNER", ownerName: "Pemilik Satu" });
    expect(owner!.filterColumns.map((f) => [f.column, f.available])).toEqual([
      ["Cabang", true],
      ["Gaji", false],
    ]);
    for (const [user, dash, role] of [
      [EDITOR, D1, "EDITOR"],
      [VIEWER, D1, "VIEWER"],
      [ORG, D2, "VIEWER"],
      [EDITOR, D2, "VIEWER"],
    ] as const) {
      const v = await svc.getDashboard(user, dash);
      expect(v).toMatchObject({ role, ownerName: "Pemilik Satu", dataset: { id: DS } });
      expect(v!.filterColumns.map((f) => f.column)).toEqual(["Cabang"]);
      // Tidak membawa data share/organisasi mentah ke klien.
      expect(Object.keys(v!).sort()).toEqual(Object.keys(owner!).sort());
    }
    expect(await svc.getDashboard(STRANGER, D1)).toBeNull();
    expect(await svc.getDashboard(EDITOR, D3)).toBeNull();
  });

  it("sumber panel: pemilik dan editor mendapat kolom tampil dataset dashboard; viewer/organisasi/tanpa akses → []", async () => {
    const expected = [
      {
        id: S1,
        name: "Penjualan",
        columns: [
          { pos: 1, name: "Cabang", type: "text" },
          { pos: 2, name: "Omzet", type: "decimal" },
        ],
      },
      {
        id: S2,
        name: "Stok",
        columns: [
          { pos: 1, name: "Cabang", type: "text" },
          { pos: 2, name: "Qty", type: "integer" },
        ],
      },
    ];
    expect(await svc.getDashboardSources(OWNER, D1)).toEqual(expected);
    expect(await svc.getDashboardSources(EDITOR, D1)).toEqual(expected);
    expect(await svc.getDashboardSources(VIEWER, D1)).toEqual([]);
    expect(await svc.getDashboardSources(ORG, D2)).toEqual([]);
    expect(await svc.getDashboardSources(STRANGER, D1)).toEqual([]);
    expect(await svc.getDashboardSources(OWNER, "bukan-id")).toEqual([]);
  });

  it("daftar pemilik membawa share organisasi + jumlah orang", async () => {
    const rows = await svc.listDashboards(OWNER);
    expect(Object.fromEntries(rows.map((r) => [r.id, [r.orgShared, r.shareCount]]))).toEqual({
      [D1]: [false, 2],
      [D2]: [true, 0],
      [D3]: [false, 1],
    });
  });

  it("Dibagikan ke saya: share user + organisasi, peran tertinggi, tanpa dashboard milik sendiri", async () => {
    const shared = async (u: string) =>
      Object.fromEntries((await svc.listSharedDashboards(u)).map((r) => [r.id, r.role]));
    expect(await shared(EDITOR)).toEqual({ [D1]: "EDITOR", [D2]: "VIEWER" });
    expect(await shared(VIEWER)).toEqual({ [D1]: "VIEWER", [D2]: "VIEWER" });
    expect(await shared(STRANGER)).toEqual({ [D2]: "VIEWER", [D3]: "VIEWER" });
    expect(await shared(OWNER)).toEqual({});
    const [row] = await svc.listSharedDashboards(ORG);
    expect(row).toEqual({
      id: D2,
      name: expect.any(String),
      datasetName: "Penjualan",
      ownerName: "Pemilik Satu",
      role: "VIEWER",
      widgetCount: 1,
      updatedAt: expect.any(Date),
    });
  });
});
