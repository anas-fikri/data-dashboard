import { beforeEach, describe, expect, it, vi } from "vitest";
import { SEED_WIDGET_AT, col, cuid, fakeShareDb, userRow } from "../sharing/fake-db";

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
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "x-real-ip": "198.51.100.7" }),
}));
vi.mock("@/lib/env", () => ({ env: () => ({ TRUST_PROXY: true }) }));

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
  // T-k2ec (keputusan pemilik 2026-10-22): editor boleh mengatur kolom filter.
  setDashboardFilterColumns: (u: string, d: string) =>
    svc.setDashboardFilterColumns(u, d, [{ sheet: "Penjualan", column: "Omzet" }]),
};
const ownerOps = {
  renameDashboard: (u: string, d: string) => svc.renameDashboard(u, d, "Nama baru"),
  deleteDashboard: (u: string, d: string) => svc.deleteDashboard(u, d, "198.51.100.7"),
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
    // Baris Dashboard dikunci setelah lock advisory, sebelum widget mana pun (review T-016 R2 DI-1).
    expect(fake.rowLocks).toEqual([D1]);
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

  it("editor mengubah tata letak lebih dulu → pemilik STALE dengan penyebab netral, bukan 'tab atau perangkat lain' (review R4 CC-2)", async () => {
    expect(await svc.addWidget(EDITOR, D1, { baseRevision: 1 })).toMatchObject({ ok: true });
    const stale = {
      ok: false,
      code: "STALE",
      message:
        "Perubahan terakhir Anda belum tersimpan karena dashboard ini baru saja diubah orang lain atau di tab lain. Muat ulang, lalu ulangi perubahan.",
    };
    expect(await editOps.saveLayout(OWNER, D1)).toEqual(stale);
    expect(await editOps.addWidget(OWNER, D1)).toEqual(stale);
    expect(await editOps.deleteWidget(OWNER, D1)).toEqual(stale);
  });
});

describe("pemilik saja: nama dan hapus", () => {
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

describe("T-k2ec: kolom filter oleh editor", () => {
  const stored = () => fake.state.dashboards.find((d) => d.id === D1)!.filterColumns;

  it("kolom tersimpan yang disembunyikan dipertahankan; namanya tidak dikirim ke editor", async () => {
    const r = await svc.setDashboardFilterColumns(EDITOR, D1, [
      { sheet: "Penjualan", column: "Omzet" },
    ]);
    expect(r).toMatchObject({ ok: true });
    if (!r.ok) return;
    expect(r.data.filterColumns.map((f) => f.column)).toEqual(["Omzet"]);
    // "Cabang" (tersedia) dihapus editor; "Gaji" (disembunyikan, tidak pernah terlihat) tetap.
    expect(stored()).toEqual([
      { sheet: "Penjualan", column: "Omzet" },
      { sheet: "Penjualan", column: "Gaji" },
    ]);
  });

  it("pemilik menyimpan apa adanya (kolom tersembunyi ikut terhapus bila tidak dikirim)", async () => {
    expect(
      await svc.setDashboardFilterColumns(OWNER, D1, [{ sheet: "Penjualan", column: "Omzet" }]),
    ).toMatchObject({ ok: true, data: { filterColumns: [{ column: "Omzet", available: true }] } });
    expect(stored()).toEqual([{ sheet: "Penjualan", column: "Omzet" }]);
  });
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
    // Statistik skema ikut untuk isian bawaan widget (T-12zs); fixture menyimpan 0.
    const ZERO_STATS = { distinct: 0, nullPct: 0 };
    const expected = [
      {
        id: S1,
        name: "Penjualan",
        columns: [
          { pos: 1, name: "Cabang", type: "text", ...ZERO_STATS },
          { pos: 2, name: "Omzet", type: "decimal", ...ZERO_STATS },
        ],
      },
      {
        id: S2,
        name: "Stok",
        columns: [
          { pos: 1, name: "Cabang", type: "text", ...ZERO_STATS },
          { pos: 2, name: "Qty", type: "integer", ...ZERO_STATS },
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
      Object.fromEntries((await svc.listSharedDashboards(u)).items.map((r) => [r.id, r.role]));
    expect(await shared(EDITOR)).toEqual({ [D1]: "EDITOR", [D2]: "VIEWER" });
    expect(await shared(VIEWER)).toEqual({ [D1]: "VIEWER", [D2]: "VIEWER" });
    expect(await shared(STRANGER)).toEqual({ [D2]: "VIEWER", [D3]: "VIEWER" });
    expect(await shared(OWNER)).toEqual({});
    const { items, hidden } = await svc.listSharedDashboards(ORG);
    expect(hidden).toBe(0);
    expect(items[0]).toEqual({
      id: D2,
      name: expect.any(String),
      datasetName: "Penjualan",
      ownerName: "Pemilik Satu",
      ownerEmail: "pemilik@pcpexpress.com",
      role: "VIEWER",
      widgetCount: 1,
      updatedAt: expect.any(Date),
    });
  });
});

describe("review SEC-1: nama kolom tersembunyi tidak bisa didaftar lewat atur widget", () => {
  const chart = (column: number, agg = "sum") => ({ ...bar(S1), measure: { agg, column } });
  beforeEach(() => {
    // Kolom tanggal tersembunyi: tipenya tidak boleh mengubah jawaban untuk editor.
    fake.state.sheets.find((s) => s.id === S1)!.schema!.push(col(4, "Tgl Rahasia", "date", true));
  });

  it("editor: kolom tersembunyi/tidak ada → pesan umum tanpa nama; tipe kolom tersembunyi tidak terlihat", async () => {
    const before = snapshot();
    const generic = { ok: false, code: "INVALID", message: svc.COLUMN_UNAVAILABLE_EDITOR };
    expect(await svc.configureWidget(EDITOR, D1, W1, "bar", chart(3))).toEqual(generic);
    expect(
      await svc.configureWidget(EDITOR, D1, W1, "kpi", {
        sheetId: S1,
        measure: { agg: "sum", column: 3 },
        format: fmt,
      }),
    ).toEqual(generic);
    // min/maks grafik: kolom tanggal tersembunyi dijawab sama dengan kolom angka tersembunyi, bukan
    // "Grafik hanya bisa menggambar nilai angka" (yang membocorkan tipe tanggal).
    expect(await svc.configureWidget(EDITOR, D1, W1, "bar", chart(4, "min"))).toEqual(generic);
    expect(await svc.configureWidget(EDITOR, D1, W1, "bar", chart(3, "min"))).toEqual(generic);
    // Kolom yang tidak ada sama sekali: jawaban sama (tersembunyi vs tidak ada tidak bisa dibedakan).
    expect(await svc.configureWidget(EDITOR, D1, W1, "bar", chart(99))).toEqual(generic);
    expect(snapshot()).toBe(before);
  });

  it("pemilik tetap mendapat pesan rinci (nama kolom) untuk diperbaiki; tipe dicek setelah kolom", async () => {
    const r = await svc.configureWidget(OWNER, D1, W1, "bar", chart(4, "min"));
    expect(r).toMatchObject({ ok: false, code: "INVALID" });
    expect(!r.ok && r.message).toContain('"Tgl Rahasia" disembunyikan');
  });
});

describe("review SEC-3: Dibagikan ke saya — share langsung dulu", () => {
  it("banjir share organisasi yang lebih baru tidak mendorong share langsung (atau share organisasi pemilik lain) keluar daftar/5 teratas", async () => {
    // STRANGER (pemilik DSY) membagikan banyak dashboard ke organisasi, semuanya lebih baru dari D1.
    const flood = Array.from({ length: svc.SHARED_LIST_MAX + 5 }, (_, n) => ({
      id: cuid(`f${String(n).padStart(4, "0")}`),
      datasetId: DSY,
      name: `Banjir ${n}`,
      orgShared: true,
      layout: [],
      layoutRevision: 0,
      filterColumns: [],
      updatedAt: new Date(Date.UTC(2026, 9, 16, 0, 0, n)),
    }));
    fake.state.dashboards.push(...flood);
    const { items, hidden } = await svc.listSharedDashboards(VIEWER);
    // Share langsung (D1) pertama; lalu share organisasi terbaru dulu: 20 dari STRANGER, lalu D2 dari
    // pemilik lain yang tidak lagi terdesak (review T-016 R4 DI-2).
    expect(items.map((r) => r.id)).toEqual([
      D1,
      ...flood
        .slice(-svc.SHARED_PER_OWNER_MAX)
        .reverse()
        .map((d) => d.id),
      D2,
    ]);
    expect(hidden).toBe(flood.length + 2 - items.length);
    // Pemilik banjir dinonaktifkan → share organisasinya hilang dari daftar (dan dari hitungan).
    fake.state.users.find((u) => u.id === STRANGER)!.isActive = false;
    expect(await svc.listSharedDashboards(VIEWER)).toMatchObject({
      items: [{ id: D1 }, { id: D2 }],
      hidden: 0,
    });
  });

  it("share langsung tetap terdaftar walau pemilik nonaktif; share + organisasi → sekali dengan peran share", async () => {
    fake.state.dashboards.find((d) => d.id === D1)!.orgShared = true;
    const rows = (await svc.listSharedDashboards(EDITOR)).items;
    expect(rows.map((r) => [r.id, r.role])).toEqual([
      [D1, "EDITOR"],
      [D2, "VIEWER"],
    ]);
    fake.state.users.find((u) => u.id === OWNER)!.isActive = false;
    expect((await svc.listSharedDashboards(EDITOR)).items.map((r) => r.id)).toEqual([D1]);
  });
});

describe("review R3 SEC-2 / R4 DI-1, DI-2: batas per pemilik dataset hanya bila daftar melewati batas", () => {
  /**
   * STRANGER (pemilik DSY) membuat n dashboard yang lebih baru dari D1 (detik ke-`start` + i pada
   * 2026-10-16): dibagikan langsung ke `to` dan/atau ke organisasi (`org`).
   */
  function flood(
    n: number,
    {
      to,
      org = false,
      tag = "g",
      start = 0,
    }: { to?: string; org?: boolean; tag?: string; start?: number },
  ) {
    const rows = Array.from({ length: n }, (_, i) => ({
      id: cuid(`${tag}${String(i).padStart(4, "0")}`),
      datasetId: DSY,
      name: `Banjir ${tag} ${i}`,
      orgShared: org,
      layout: [],
      layoutRevision: 0,
      filterColumns: [],
      updatedAt: new Date(Date.UTC(2026, 9, 16, 0, 0, start + i)),
    }));
    fake.state.dashboards.push(...rows);
    if (to) {
      fake.state.shares.push(
        ...rows.map((d) => ({
          dashboardId: d.id,
          userId: to,
          role: "VIEWER" as const,
          createdById: STRANGER,
          createdAt: new Date("2026-10-16T00:00:00Z"),
        })),
      );
    }
    return rows;
  }
  const newestFirst = (rows: { id: string }[], take = rows.length) =>
    rows
      .slice(-take)
      .reverse()
      .map((d) => d.id);
  const listed = async (u: string) => {
    const { items, hidden } = await svc.listSharedDashboards(u);
    return { ids: items.map((r) => r.id), hidden };
  };

  it("pemakaian normal: 25 share langsung dari satu pemilik + 3 share organisasi → semua 28 terdaftar, tanpa catatan", async () => {
    const direct = flood(25, { to: ORG });
    const [orgNew] = flood(1, { org: true, tag: "h", start: 100 });
    const d3 = fake.state.dashboards.find((d) => d.id === D3)!;
    Object.assign(d3, { orgShared: true, updatedAt: new Date("2026-10-14T00:00:00Z") });
    const { items, hidden } = await svc.listSharedDashboards(ORG);
    // Lebih dari 20 dari STRANGER tetap terdaftar: tidak ada banjir (review T-016 R4 DI-1).
    expect(items.map((r) => r.id)).toEqual([...newestFirst(direct), orgNew!.id, D2, D3]);
    expect(items.every((r) => r.role === "VIEWER")).toBe(true);
    expect(hidden).toBe(0);
  });

  it("batas tepat SHARED_LIST_MAX: semua terdaftar; satu lagi → paling banyak 20 per pemilik untuk langsung + organisasi bersama", async () => {
    // D1 (langsung) + D2 (organisasi) dari OWNER + 198 share langsung dari STRANGER = 200.
    const direct = flood(svc.SHARED_LIST_MAX - 2, { to: VIEWER });
    expect(await listed(VIEWER)).toEqual({ ids: [...newestFirst(direct), D1, D2], hidden: 0 });
    // Share organisasi STRANGER yang lebih baru: total 201. Jatah STRANGER diisi share langsungnya dulu,
    // jadi share organisasinya tidak ikut dan catatan tidak bertentangan dengan baris yang terlihat.
    flood(1, { org: true, tag: "h", start: 500 });
    expect(await listed(VIEWER)).toEqual({
      ids: [...newestFirst(direct, svc.SHARED_PER_OWNER_MAX), D1, D2],
      hidden: svc.SHARED_LIST_MAX + 1 - (svc.SHARED_PER_OWNER_MAX + 2),
    });
  });

  it("banjir share langsung: 20 terbaru dari pemberi share, share pemilik lain + organisasi tetap; dashboard langsung + organisasi dihitung sekali; SQL berparameter", async () => {
    const rows = flood(svc.SHARED_LIST_MAX + 5, { to: VIEWER });
    // D1 dibagikan langsung DAN ke organisasi: satu kandidat, sebagai share langsung.
    fake.state.dashboards.find((d) => d.id === D1)!.orgShared = true;
    const { items, hidden } = await svc.listSharedDashboards(VIEWER);
    expect(items.map((r) => r.id)).toEqual([
      ...newestFirst(rows, svc.SHARED_PER_OWNER_MAX),
      D1,
      D2,
    ]);
    expect(hidden).toBe(rows.length + 2 - items.length);
    expect(items.find((r) => r.id === D1)).toMatchObject({
      ownerEmail: "pemilik@pcpexpress.com",
      role: "VIEWER",
    });
    // Satu query; peringkat dihitung Postgres per pemilik (window function); semua nilai parameter
    // terikat, tidak pernah masuk teks SQL.
    expect(fake.db.$queryRaw).toHaveBeenCalledTimes(1);
    const [sql, ...values] = fake.db.$queryRaw.mock.calls[0]!;
    const text = (sql as string[]).join("?");
    expect(text).toContain(
      'ROW_NUMBER() OVER (PARTITION BY ds."ownerId" ORDER BY s."userId" IS NULL, d."updatedAt" DESC, d.id DESC)',
    );
    expect(text).not.toContain(VIEWER);
    expect(values).toEqual([
      VIEWER,
      VIEWER,
      svc.SHARED_LIST_MAX,
      svc.SHARED_PER_OWNER_MAX,
      svc.SHARED_LIST_MAX,
    ]);
  });

  it("banjir share organisasi dari pemberi share langsung: share langsungnya dulu dalam jatah 20; pemilik nonaktif → share organisasi saja hilang", async () => {
    const direct = flood(2, { to: VIEWER });
    const org = flood(svc.SHARED_LIST_MAX + 5, { org: true, tag: "h", start: 100 });
    const total = direct.length + org.length + 2;
    expect(await listed(VIEWER)).toEqual({
      ids: [
        ...newestFirst(direct),
        D1,
        ...newestFirst(org, svc.SHARED_PER_OWNER_MAX - direct.length),
        D2,
      ],
      hidden: total - (svc.SHARED_PER_OWNER_MAX + 2),
    });
    fake.state.users.find((u) => u.id === STRANGER)!.isActive = false;
    expect(await listed(VIEWER)).toEqual({ ids: [...newestFirst(direct), D1, D2], hidden: 0 });
  });

  it("tanpa banjir: tidak ada yang tersembunyi; share yang dicabut di antara dua query tidak ikut", async () => {
    flood(3, { to: VIEWER });
    expect((await svc.listSharedDashboards(VIEWER)).hidden).toBe(0);
    expect((await svc.listSharedDashboards(STRANGER)).hidden).toBe(0);
    // Peringkat dibaca saat share masih ada, lalu share D1 dicabut sebelum baris dibaca.
    const real = fake.db.$queryRaw.getMockImplementation()!;
    fake.db.$queryRaw.mockImplementationOnce(async (...args: unknown[]) => {
      const r = await real(...(args as Parameters<typeof real>));
      fake.state.shares = fake.state.shares.filter((x) => x.dashboardId !== D1);
      return r;
    });
    expect((await svc.listSharedDashboards(VIEWER)).items.map((r) => r.id)).not.toContain(D1);
  });
});

describe("review R3 CC-1/CC-2: email pemilik + ringkasan akses di DashboardView", () => {
  it("email pemilik untuk semua peran; jumlah share + organisasi hanya untuk pemilik", async () => {
    expect(await svc.getDashboard(OWNER, D1)).toMatchObject({
      ownerEmail: "pemilik@pcpexpress.com",
      access: { orgShared: false, shareCount: 2 },
    });
    expect(await svc.getDashboard(OWNER, D2)).toMatchObject({
      access: { orgShared: true, shareCount: 0 },
    });
    for (const [user, dash] of [
      [EDITOR, D1],
      [VIEWER, D1],
      [ORG, D2],
    ] as const) {
      expect(await svc.getDashboard(user, dash)).toMatchObject({
        ownerEmail: "pemilik@pcpexpress.com",
        access: null,
      });
    }
  });
});

describe("review R3 CC-2: hapus dashboard tercatat di AuditLog", () => {
  it("pemilik: dashboard.delete {name, shares, orgShared} + IP, di bawah lock dashboard; share ikut terhapus", async () => {
    fake.state.dashboards.find((d) => d.id === D1)!.orgShared = true;
    expect(await svc.deleteDashboard(OWNER, D1, "198.51.100.7")).toEqual({
      ok: true,
      data: { id: D1 },
    });
    expect(fake.locks).toEqual([`dashboard:${D1}`]);
    expect(fake.state.shares.some((x) => x.dashboardId === D1)).toBe(false);
    expect(fake.state.audits).toEqual([
      {
        actorId: OWNER,
        action: "dashboard.delete",
        targetType: "dashboard",
        targetId: D1,
        meta: { name: "Dashboard dashpri", shares: 2, orgShared: true },
        ip: "198.51.100.7",
      },
    ]);
  });

  it("jejak gagal ditulis → hapus dibatalkan utuh (satu transaksi)", async () => {
    fake.db.auditLog.create.mockRejectedValueOnce(new Error("audit down"));
    await expect(svc.deleteDashboard(OWNER, D1, "198.51.100.7")).rejects.toThrow("audit down");
    expect(fake.state.dashboards.map((d) => d.id)).toContain(D1);
    expect(fake.state.shares.filter((x) => x.dashboardId === D1)).toHaveLength(2);
  });

  it("editor → FORBIDDEN, orang asing → NOT_FOUND, tanpa jejak; Server Action meneruskan IP klien", async () => {
    expect(await svc.deleteDashboard(EDITOR, D1, "x")).toMatchObject({ code: "FORBIDDEN" });
    expect(await svc.deleteDashboard(cuid("nobody"), D1, "x")).toMatchObject({
      code: "NOT_FOUND",
    });
    expect(fake.state.audits).toEqual([]);
    requireUser.mockResolvedValue({ id: OWNER });
    const f = new FormData();
    f.set("id", D1);
    await expect(actions.deleteDashboardAction({ status: "idle" }, f)).rejects.toThrow(
      "NEXT_REDIRECT",
    );
    expect(fake.state.audits).toMatchObject([
      { action: "dashboard.delete", targetId: D1, ip: "198.51.100.7" },
    ]);
  });
});

describe("review DI-1: versi pengaturan widget (Widget.updatedAt) — CAS atur isi/ganti judul", () => {
  const V0 = SEED_WIDGET_AT.toISOString();
  const stale = {
    ok: false,
    code: "STALE",
    message:
      "Widget ini sudah berubah sejak halaman ini dimuat. Muat ulang halaman untuk melihat versi terbaru.",
  };
  const missing = { ok: false, code: "NOT_FOUND", message: "Widget tidak ditemukan." };
  const w1 = () => fake.state.widgets.find((w) => w.id === W1)!;

  it("getDashboard: tiap widget membawa version = updatedAt ISO (semua peran); tambah widget → versinya", async () => {
    for (const user of [OWNER, EDITOR, VIEWER]) {
      expect((await svc.getDashboard(user, D1))!.widgets.map((w) => w.version)).toEqual([V0]);
    }
    const r = await svc.addWidget(EDITOR, D1, { baseRevision: 1 });
    expect(r.ok && r.data.widget.version).toBe(fake.state.widgets.at(-1)!.updatedAt!.toISOString());
  });

  it("dua tab: A menyimpan dengan versi yang dilihat → versi baru; B dengan versi lama → STALE tanpa menimpa", async () => {
    const a = await svc.configureWidget(OWNER, D1, W1, "bar", bar(S1), V0);
    expect(a).toMatchObject({ ok: true, data: { type: "bar" } });
    const v1 = a.ok ? a.data.version : "";
    expect(v1 > V0).toBe(true);
    expect(w1().updatedAt!.toISOString()).toBe(v1);
    // Tab B (editor) masih memegang V0: atur isi dan ganti judul ditolak, tidak ada yang tertulis.
    const before = snapshot();
    expect(await svc.configureWidget(EDITOR, D1, W1, "kpi", kpi(S2), V0)).toEqual(stale);
    expect(await svc.renameWidget(EDITOR, D1, W1, "Judul B", V0)).toEqual(stale);
    expect(snapshot()).toBe(before);
    // Setelah muat ulang (versi terbaru) editor bisa menyimpan; versinya berantai.
    const b = await svc.renameWidget(EDITOR, D1, W1, "Judul B", v1);
    expect(b).toMatchObject({ ok: true, data: { title: "Judul B" } });
    expect(b.ok && b.data.version > v1).toBe(true);
    expect(w1()).toMatchObject({ title: "Judul B", type: "bar" });
  });

  it("viewer → FORBIDDEN, tanpa akses → NOT_FOUND SEBELUM versi dibandingkan; widget hilang → widget NOT_FOUND", async () => {
    const before = snapshot();
    for (const version of [V0, "2020-01-01T00:00:00.000Z"]) {
      for (const op of [
        (u: string) => svc.configureWidget(u, D1, W1, "bar", bar(S1), version),
        (u: string) => svc.renameWidget(u, D1, W1, "X", version),
      ]) {
        expect(await op(VIEWER)).toMatchObject({ code: "FORBIDDEN" });
        expect(await op(STRANGER)).toMatchObject({
          code: "NOT_FOUND",
          message: "Dashboard tidak ditemukan.",
        });
      }
    }
    expect(snapshot()).toBe(before);
    fake.state.widgets = fake.state.widgets.filter((w) => w.id !== W1);
    expect(await svc.renameWidget(EDITOR, D1, W1, "X", V0)).toEqual(missing);
    expect(await svc.configureWidget(EDITOR, D1, W1, "bar", bar(S1), V0)).toEqual(missing);
  });

  it("versi bukan bentuk toISOString → INVALID (400); tanpa versi → tulis tanpa CAS (pemanggil API lama)", async () => {
    const invalid = { ok: false, code: "INVALID", message: "Versi widget tidak valid." };
    for (const bad of ["kemarin", 123, null, "2026-02-31T00:00:00.000Z", "2026-10-01T00:00:00Z"]) {
      expect(await svc.configureWidget(EDITOR, D1, W1, "bar", bar(S1), bad)).toEqual(invalid);
      expect(await svc.renameWidget(EDITOR, D1, W1, "X", bad)).toEqual(invalid);
    }
    w1().updatedAt = new Date("2026-10-15T05:00:00.000Z");
    expect(await svc.renameWidget(EDITOR, D1, W1, "Tanpa versi")).toMatchObject({ ok: true });
    expect(await svc.configureWidget(EDITOR, D1, W1, "bar", bar(S1))).toMatchObject({ ok: true });
  });

  it("aktivasi versi data (spec + versi widget berganti), panel lama → pesan 'berganti versi', tidak ditulis", async () => {
    w1().updatedAt = new Date("2026-10-15T07:00:00.000Z");
    expect(await svc.configureWidget(EDITOR, D1, W1, "bar", bar(S_OLD), V0)).toEqual({
      ok: false,
      code: "STALE",
      message:
        "Data dataset ini baru saja berganti versi. Muat ulang halaman, lalu atur lagi widget ini.",
    });
    expect(w1().spec).toEqual(kpi(S1));
  });

  it("versi berganti di antara cek awal dan tulis (simpan bersamaan) → STALE, tidak tertimpa", async () => {
    const orig = fake.db.widget.updateMany.getMockImplementation()!;
    fake.db.widget.updateMany.mockImplementationOnce(async (args: Parameters<typeof orig>[0]) => {
      // Tab lain menyimpan tepat sebelum tulisan ini: CAS mengenai 0 baris, widget masih ada.
      w1().updatedAt = new Date("2026-10-15T06:00:00.000Z");
      return orig(args);
    });
    expect(await svc.configureWidget(EDITOR, D1, W1, "bar", bar(S1), V0)).toEqual(stale);
    expect(w1().spec).toEqual(kpi(S1));
  });
});
