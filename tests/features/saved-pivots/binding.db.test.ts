import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { ColumnSchema } from "@/features/ingest/infer";

/*
 * T-073 (integrasi, PostgreSQL dev sungguhan): mengikat widget ke pivot tersimpan — akses per peran,
 * pivot tersimpan wajib sedataset dengan dashboard (DB tidak menjaminnya), spec efektif di halaman
 * dashboard (rincian sumber hanya pemilik/editor), kolom filter silang dari spec efektif (D6), lepas
 * dari sumber (spec disalin), dan hapus widget/dashboard melepas rujukan (IN_USE hilang). Query lewat
 * prismaQueryRepo sungguhan dengan mesin DuckDB palsu (otorisasi + kunci, bukan nilai). Dilewati bila
 * database tidak terjangkau; semua baris ber-awalan unik dan dibersihkan di afterAll.
 */
vi.mock("@/features/auth/denial-log", () => ({ logAccessDenied: vi.fn(async () => {}) }));

const { prisma } = await import("@/lib/db");
const probe = await prisma.$queryRaw`SELECT 1`.then(
  () => true,
  () => false,
);

const RUN = `t073${Date.now().toString(36)}`;
const id = (s: string) => `${RUN}${s}`.slice(0, 32).padEnd(20, "0");
const OWNER = id("owner");
const EDITOR = id("editor");
const VIEWER = id("viewer");
const STRANGER = id("stranger");
const DS = id("ds");
const DS_OTHER = id("dsother");
const V1 = id("v1");
const V_OTHER = id("vother");
const S1 = id("s1");
const S_OTHER = id("sother");
const D1 = id("dash1");
const D_OTHER = id("dashother");
const W = (s: string) => id(`w${s}`);
const IP = "203.0.113.9";

const col = (pos: number, name: string, type: ColumnSchema["type"]) =>
  ({
    pos,
    name,
    original: name,
    type,
    hidden: false,
    nullPct: 0,
    distinctCount: 0,
    castFailCount: 0,
  }) as ColumnSchema;
const SCHEMA = [
  col(1, "Cabang", "text"),
  col(2, "Omzet", "decimal"),
  col(3, "Biaya", "decimal"),
  col(4, "Layanan", "text"),
];
const fmt = { style: "auto", decimals: 0 };
const pivot = (sheetId: string) => ({
  sheetId,
  rows: [{ column: 1 }, { column: 4 }],
  values: [
    { agg: "sum", column: 2 },
    {
      kind: "calc",
      label: "Margin",
      expr: {
        op: "div",
        args: [
          {
            op: "sub",
            args: [
              { agg: "sum", column: 2 },
              { agg: "sum", column: 3 },
            ],
          },
          { agg: "sum", column: 2 },
        ],
      },
    },
  ],
  sort: "value_desc",
  format: fmt,
  totals: true,
  subtotals: false,
  filters: [{ column: 4, op: "in", values: ["Reguler"] }],
  // Filter silang pivot tersimpan TIDAK diwarisi widget (tampilan yang memutuskan).
  crossFilter: true,
});
const DISPLAY = {
  pivot: { sort: "label_asc", totals: true, subtotals: true },
  bar: { dimension: "row", value: 0, sort: "value_desc", topN: 10, crossFilter: true },
  kpi: { value: 1 },
  table: { sort: "label_asc", totals: false },
} as const;

const dash = await import("@/features/dashboards/service");
const svc = await import("@/features/saved-pivots/service");
const { prismaQueryRepo } = await import("@/features/query/runtime");
const { runWidgetQuery } = await import("@/features/query/service");
const { ResultCache } = await import("@/features/query/cache");

async function version(vid: string, datasetId: string, sid: string) {
  const lineage = await prisma.sheetLineage.create({ data: { datasetId }, select: { id: true } });
  await prisma.datasetVersion.create({
    data: { id: vid, datasetId, status: "READY", originalName: `${vid}.xlsx` },
  });
  await prisma.sheet.create({
    data: {
      id: sid,
      versionId: vid,
      index: 0,
      name: "Penjualan",
      rawKey: `raw/${datasetId}/${vid}/0.parquet`,
      rawRows: 10,
      colCount: SCHEMA.length,
      headerRow: 1,
      columns: [],
      typedKey: `parquet/${datasetId}/${vid}/0/typed-1.parquet`,
      schemaRevision: 1,
      schema: SCHEMA as unknown as object,
      lineageId: lineage.id,
    },
  });
}

/** Mesin DuckDB palsu: mencatat SQL; hasil kosong (yang diuji otorisasi, SQL, dan kunci). */
function queryDeps() {
  const exec = vi.fn(async (_sql: string, _params: unknown) => ({
    columns: [] as string[],
    rows: [] as unknown[][],
  }));
  return {
    exec,
    deps: {
      repo: prismaQueryRepo,
      parquet: { acquire: async () => ({ path: "/tmp/t073.parquet", release: () => {} }) },
      engine: { withSlot: <T>(_u: string, fn: () => Promise<T>) => fn(), exec },
      cache: new ResultCache<never>(1 << 20),
      timeoutMs: 5_000,
    },
  };
}

async function cleanup() {
  const users = [OWNER, EDITOR, VIEWER, STRANGER];
  await prisma.auditLog.deleteMany({ where: { actorId: { in: users } } });
  await prisma.storageCleanup.deleteMany({ where: { prefix: { contains: RUN } } });
  // Widget dulu (FK NO ACTION ke pivot tersimpan dataset lain pada uji rujukan lintas dataset).
  await prisma.widget.deleteMany({ where: { id: { startsWith: RUN } } });
  await prisma.dataset.deleteMany({ where: { id: { in: [DS, DS_OTHER] } } });
  await prisma.user.deleteMany({ where: { id: { in: users } } });
}

describe.skipIf(!probe)("widget terikat pivot tersimpan (integrasi PostgreSQL, T-073)", () => {
  let sp = "";
  let spOther = "";
  const version0 = new Map<string, string>();

  beforeAll(async () => {
    await cleanup();
    for (const u of [OWNER, EDITOR, VIEWER, STRANGER]) {
      await prisma.user.create({ data: { id: u, email: `${u}@pcpexpress.com` } });
    }
    await prisma.dataset.create({
      data: { id: DS, ownerId: OWNER, name: `T073 ${RUN}`, nameKey: `t073 ${RUN}` },
    });
    await prisma.dataset.create({
      data: { id: DS_OTHER, ownerId: STRANGER, name: `T073b ${RUN}`, nameKey: `t073b ${RUN}` },
    });
    await version(V1, DS, S1);
    await version(V_OTHER, DS_OTHER, S_OTHER);
    await prisma.dataset.update({ where: { id: DS }, data: { activeVersionId: V1 } });
    await prisma.dataset.update({ where: { id: DS_OTHER }, data: { activeVersionId: V_OTHER } });
    await prisma.dashboard.create({
      data: {
        id: D1,
        datasetId: DS,
        name: "Ringkasan",
        nameKey: "ringkasan",
        filterColumns: [],
        shares: {
          create: [
            { userId: EDITOR, role: "EDITOR" },
            { userId: VIEWER, role: "VIEWER" },
          ],
        },
      },
    });
    await prisma.dashboard.create({
      data: { id: D_OTHER, datasetId: DS_OTHER, name: "Lain", nameKey: "lain" },
    });
    for (const n of ["pivot", "bar", "kpi", "table", "free", "evil"]) {
      const w = await prisma.widget.create({
        data: { id: W(n), dashboardId: D1 },
        select: { updatedAt: true },
      });
      version0.set(n, w.updatedAt.toISOString());
    }
    const a = await svc.createSavedPivot(OWNER, DS, { name: "Margin", spec: pivot(S1) }, IP);
    const b = await svc.createSavedPivot(
      STRANGER,
      DS_OTHER,
      { name: "Lain", spec: pivot(S_OTHER) },
      IP,
    );
    if (!a.ok || !b.ok) throw new Error(JSON.stringify([a, b]));
    sp = a.data.id;
    spOther = b.data.id;
  });

  afterAll(async () => {
    if (probe) await cleanup();
  });

  it("ikat: pemilik dan editor dashboard boleh memilih sumber; viewer FORBIDDEN; orang lain NOT_FOUND", async () => {
    const owner = await dash.configureWidget(
      OWNER,
      D1,
      W("bar"),
      "bar",
      DISPLAY.bar,
      undefined,
      sp,
    );
    expect(owner).toMatchObject({
      ok: true,
      data: {
        type: "bar",
        spec: { sheetId: S1, dimension: { column: 1 }, measure: { agg: "sum", column: 2 } },
        source: {
          savedPivotId: sp,
          name: "Margin",
          revision: 1,
          type: "bar",
          display: DISPLAY.bar,
        },
      },
    });
    const editor = await dash.configureWidget(
      EDITOR,
      D1,
      W("kpi"),
      "kpi",
      DISPLAY.kpi,
      undefined,
      sp,
    );
    expect(editor).toMatchObject({ ok: true, data: { type: "kpi" } });
    for (const n of ["pivot", "table"] as const) {
      expect(
        await dash.configureWidget(OWNER, D1, W(n), n, DISPLAY[n], undefined, sp),
      ).toMatchObject({ ok: true, data: { type: "pivot" } });
    }
    expect(
      await dash.configureWidget(VIEWER, D1, W("free"), "kpi", DISPLAY.kpi, undefined, sp),
    ).toMatchObject({ ok: false, code: "FORBIDDEN" });
    expect(
      await dash.configureWidget(STRANGER, D1, W("free"), "kpi", DISPLAY.kpi, undefined, sp),
    ).toMatchObject({ ok: false, code: "NOT_FOUND" });
    // Tersimpan: jenis + tampilan saja, rujukan pivot tersimpan.
    const row = await prisma.widget.findUniqueOrThrow({ where: { id: W("bar") } });
    expect(row).toMatchObject({ type: "bar", spec: DISPLAY.bar, savedPivotId: sp });
  });

  it("AC2: pivot tersimpan dataset lain → NOT_FOUND tanpa menulis; tampilan tidak cocok → INVALID", async () => {
    const r = await dash.configureWidget(
      OWNER,
      D1,
      W("free"),
      "kpi",
      DISPLAY.kpi,
      undefined,
      spOther,
    );
    expect(r).toEqual({
      ok: false,
      code: "NOT_FOUND",
      message: "Pivot tersimpan tidak ditemukan.",
    });
    expect(
      await dash.configureWidget(OWNER, D1, W("free"), "kpi", { value: 7 }, undefined, sp),
    ).toMatchObject({
      ok: false,
      code: "INVALID",
      message: expect.stringContaining("Pilih ulang"),
    });
    expect(
      await dash.configureWidget(OWNER, D1, W("free"), "kpi", DISPLAY.kpi, undefined, "x y"),
    ).toMatchObject({ ok: false, code: "NOT_FOUND" });
    const row = await prisma.widget.findUniqueOrThrow({ where: { id: W("free") } });
    expect(row).toMatchObject({ type: "empty", savedPivotId: null });
  });

  it("halaman dashboard: spec efektif untuk semua peran; rincian sumber hanya pemilik/editor; filter silang dari tampilan", async () => {
    for (const u of [OWNER, EDITOR, VIEWER]) {
      const d = await dash.getDashboard(u, D1);
      const bar = d!.widgets.find((w) => w.id === W("bar"))!;
      expect(bar).toMatchObject({ type: "bar", spec: { sheetId: S1, topN: 10 } });
      const table = d!.widgets.find((w) => w.id === W("table"))!;
      expect(table).toMatchObject({
        type: "pivot",
        spec: { rows: [{ column: 1 }, { column: 4 }] },
      });
      if (u === VIEWER) expect(bar.source).toBeUndefined();
      else expect(bar.source).toMatchObject({ savedPivotId: sp, type: "bar" });
      // D6: dimensi grafik (cross-filter aktif) saja — baris "Layanan" pivot tersimpan tidak ikut
      // walau pivot tersimpan ber-crossFilter true (pivot terikat tidak menyalakannya).
      expect(d!.crossFilterColumns).toEqual(["Cabang"]);
    }
    expect(await dash.filterSourcesFor(D1)).toEqual([{ name: "Cabang", type: "text" }]);
  });

  it("AC2/AC3: viewer {widgetId, dashboardFilters} → hasil; kolom yang tidak tampil di widget mana pun → INVALID", async () => {
    const { deps, exec } = queryDeps();
    const ok = await runWidgetQuery(
      VIEWER,
      {
        widgetId: W("bar"),
        dashboardFilters: [{ column: "Cabang", op: "in", values: ["Bandung"] }],
      },
      deps,
    );
    expect(ok).toMatchObject({ ok: true });
    // Saring pivot tersimpan (Layanan) + filter dashboard dalam satu WHERE.
    const sql = exec.mock.calls[0]![0];
    expect(sql).toContain(`lower("c4") IN`);
    expect(sql).toContain(`lower("c1") IN`);
    const bad = await runWidgetQuery(
      VIEWER,
      {
        widgetId: W("kpi"),
        dashboardFilters: [{ column: "Layanan", op: "in", values: ["Kilat"] }],
      },
      deps,
    );
    expect(bad).toMatchObject({ ok: false, code: "INVALID" });
    for (const extra of [{ savedPivotId: sp }, { spec: pivot(S1) }]) {
      expect(await runWidgetQuery(VIEWER, { widgetId: W("kpi"), ...extra }, deps)).toMatchObject({
        ok: false,
        code: "INVALID",
      });
    }
  });

  it("AC2: endpoint definisi pivot tersimpan tertutup untuk viewer (NOT_FOUND)", async () => {
    expect(await svc.getSavedPivot(VIEWER, sp)).toMatchObject({ ok: false, code: "NOT_FOUND" });
    expect(await svc.listSavedPivots(VIEWER, DS)).toMatchObject({ ok: false, code: "NOT_FOUND" });
    expect(await svc.getSavedPivot(EDITOR, sp)).toMatchObject({ ok: true });
  });

  it("AC1: edit pivot tersimpan → revisi baru dibaca bersama widget (kunci hasil + sumber filter berubah)", async () => {
    const before = await prismaQueryRepo.widget(VIEWER, W("kpi"));
    expect(before).toMatchObject({ savedPivotId: sp, savedPivot: { revision: 1 } });
    expect(before!.sourceStamp).toBe(`${sp}@1`);
    const u = await svc.updateSavedPivot(
      OWNER,
      sp,
      { spec: { ...pivot(S1), values: [{ agg: "sum", column: 3 }] }, baseRevision: 1 },
      IP,
    );
    expect(u).toMatchObject({ ok: true, data: { revision: 2 } });
    const after = await prismaQueryRepo.widget(VIEWER, W("kpi"));
    expect(after!.sourceStamp).toBe(`${sp}@2`);
    // KPI memilih nilai ke-2 yang kini tidak ada → pesan per widget (bukan error dashboard).
    const d = await dash.getDashboard(OWNER, D1);
    const kpi = d!.widgets.find((w) => w.id === W("kpi"))!;
    expect(kpi.sourceError).toContain("Pilih ulang nilai di pengaturan widget.");
    expect(d!.widgets.find((w) => w.id === W("bar"))!.sourceError).toBeUndefined();
    const { deps } = queryDeps();
    expect(await runWidgetQuery(VIEWER, { widgetId: W("kpi") }, deps)).toMatchObject({
      ok: false,
      code: "INVALID",
      message: expect.stringContaining("Pilih ulang nilai"),
    });
    // Kembalikan dua nilai untuk uji berikutnya.
    expect(
      await svc.updateSavedPivot(OWNER, sp, { spec: pivot(S1), baseRevision: 2 }, IP),
    ).toMatchObject({ ok: true, data: { revision: 3 } });
  });

  it("rujukan lintas dataset yang ditulis langsung ke DB → NOT_FOUND di query, kartu tanpa rincian", async () => {
    await prisma.widget.update({
      where: { id: W("evil") },
      data: { type: "kpi", spec: DISPLAY.kpi, savedPivotId: spOther },
    });
    const { deps, exec } = queryDeps();
    for (const u of [OWNER, VIEWER]) {
      expect(await runWidgetQuery(u, { widgetId: W("evil") }, deps)).toEqual({
        ok: false,
        code: "NOT_FOUND",
        message: "Widget tidak ditemukan.",
      });
    }
    expect(exec).not.toHaveBeenCalled();
    const d = await dash.getDashboard(OWNER, D1);
    const evil = d!.widgets.find((w) => w.id === W("evil"))!;
    expect(evil.source).toBeUndefined();
    expect(evil.sourceError).toBeTruthy();
    expect(JSON.stringify(evil)).not.toContain(spOther);
    expect(await dash.detachWidget(OWNER, D1, W("evil"))).toMatchObject({
      ok: false,
      code: "INVALID",
    });
    await prisma.widget.delete({ where: { id: W("evil") } });
  });

  it("lepas dari sumber: spec efektif revisi terbaru disalin, rujukan dilepas, CAS versi", async () => {
    const stale = await dash.detachWidget(OWNER, D1, W("kpi"), version0.get("kpi"));
    expect(stale).toMatchObject({ ok: false, code: "STALE" });
    const r = await dash.detachWidget(EDITOR, D1, W("kpi"));
    expect(r).toMatchObject({
      ok: true,
      data: {
        type: "kpi",
        spec: { sheetId: S1, measure: { kind: "calc", label: "Margin" } },
        filtersDropped: true,
      },
    });
    const row = await prisma.widget.findUniqueOrThrow({ where: { id: W("kpi") } });
    expect(row).toMatchObject({ type: "kpi", savedPivotId: null });
    expect(row.spec).toEqual(r.ok && r.data.spec);
    expect(await dash.detachWidget(OWNER, D1, W("kpi"))).toMatchObject({
      ok: false,
      code: "INVALID",
      message: "Widget ini tidak memakai pivot tersimpan.",
    });
    expect(await dash.detachWidget(VIEWER, D1, W("bar"))).toMatchObject({
      ok: false,
      code: "FORBIDDEN",
    });
  });

  it("simpan pengaturan mandiri melepas ikatan; hapus widget lalu dashboard membebaskan pivot tersimpan", async () => {
    const plain = await dash.configureWidget(OWNER, D1, W("pivot"), "pivot", {
      ...pivot(S1),
      crossFilter: false,
    });
    expect(plain).toMatchObject({ ok: true });
    expect(plain.ok && "source" in plain.data).toBe(false);
    expect(
      (await prisma.widget.findUniqueOrThrow({ where: { id: W("pivot") } })).savedPivotId,
    ).toBeNull();

    expect(await svc.deleteSavedPivot(OWNER, sp, IP)).toMatchObject({ ok: false, code: "IN_USE" });
    const d = await prisma.dashboard.findUniqueOrThrow({ where: { id: D1 } });
    const del = await dash.deleteWidget(OWNER, D1, W("bar"), d.layoutRevision);
    expect(del).toMatchObject({ ok: true });
    // Tabel terikat masih ada → tetap IN_USE; hapus dashboard-nya → bebas.
    expect(await svc.deleteSavedPivot(OWNER, sp, IP)).toMatchObject({ ok: false, code: "IN_USE" });
    expect(await dash.deleteDashboard(OWNER, D1, IP)).toMatchObject({ ok: true });
    expect(await svc.deleteSavedPivot(OWNER, sp, IP)).toMatchObject({ ok: true });
  });
});
