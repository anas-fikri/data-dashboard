import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { ColumnSchema } from "@/features/ingest/infer";

/*
 * T-072 (integrasi, PostgreSQL dev sungguhan): pivot tersimpan — akses pemilik/editor/viewer, CAS
 * revisi, batas 50, IN_USE, hapus dataset bersama widget terikat (FK NO ACTION), dan remap pada
 * aktivasi/rollback versi di transaksi aktivasi. Dilewati bila database tidak terjangkau (CI tanpa
 * compose); semua baris memakai id ber-awalan unik dan dibersihkan di afterAll.
 */
vi.mock("@/features/auth/denial-log", () => ({ logAccessDenied: vi.fn(async () => {}) }));

const { prisma } = await import("@/lib/db");
const probe = await prisma.$queryRaw`SELECT 1`.then(
  () => true,
  () => false,
);

const RUN = `t072${Date.now().toString(36)}`;
const id = (s: string) => `${RUN}${s}`.slice(0, 32).padEnd(20, "0");
const OWNER = id("owner");
const EDITOR = id("editor");
const VIEWER = id("viewer");
const STRANGER = id("stranger");
const DS = id("ds");
const DS_OTHER = id("dsother");
const V1 = id("v1");
const V2 = id("v2");
const V3 = id("v3");
const V_PENDING = id("vpending");
const V_OTHER = id("vother");
const S1 = id("s1");
const S2 = id("s2");
const S3 = id("s3");
const S_PENDING = id("spending");
const S_OTHER = id("sother");
const D1 = id("dash1");
const D2 = id("dash2");
const IP = "203.0.113.9";

const col = (pos: number, name: string, type: ColumnSchema["type"], original = name) =>
  ({
    pos,
    name,
    original,
    type,
    hidden: false,
    nullPct: 0,
    distinctCount: 0,
    castFailCount: 0,
  }) as ColumnSchema;

const SCHEMA_V1 = [
  col(1, "Cabang", "text"),
  col(2, "Omzet", "decimal"),
  col(3, "Biaya", "decimal"),
];
/** V2: kolom bergeser + "Biaya" diganti nama tampil (judul asli sama) → semua ketemu. */
const SCHEMA_V2 = [
  col(1, "Tanggal", "date"),
  col(2, "Cabang", "text"),
  col(3, "Omzet", "decimal"),
  col(4, "Ongkos", "decimal", "Biaya"),
];
/** V3: "Biaya" hilang. */
const SCHEMA_V3 = [col(1, "Cabang", "text"), col(2, "Omzet", "decimal")];

const fmt = { style: "auto", decimals: 0 };
const pivot = (sheetId: string, c = { cabang: 1, omzet: 2, biaya: 3 }) => ({
  sheetId,
  rows: [{ column: c.cabang }],
  values: [
    { agg: "sum", column: c.omzet },
    {
      kind: "calc",
      label: "Margin",
      expr: {
        op: "sub",
        args: [
          { agg: "sum", column: c.omzet },
          { agg: "sum", column: c.biaya },
        ],
      },
    },
  ],
  sort: "value_desc",
  format: fmt,
  totals: true,
  subtotals: false,
  filters: [{ column: c.biaya, op: "not_in", values: [null] }],
});

const svc = await import("@/features/saved-pivots/service");
const { activateVersionInTx } = await import("@/features/versions/activation");
const { deleteDataset } = await import("@/features/datasets/service");
const { MISSING_COLUMN } = await import("@/features/widgets/spec");

async function version(
  vid: string,
  datasetId: string,
  sid: string,
  schema: ColumnSchema[],
  status: "READY" | "AWAITING_CONFIRM" = "READY",
  at = new Date(),
) {
  const lineage = await prisma.sheetLineage.create({ data: { datasetId }, select: { id: true } });
  await prisma.datasetVersion.create({
    data: { id: vid, datasetId, status, originalName: `${vid}.xlsx`, createdAt: at },
  });
  await prisma.sheet.create({
    data: {
      id: sid,
      versionId: vid,
      index: 0,
      name: "Penjualan",
      rawKey: `raw/${datasetId}/${vid}/0.parquet`,
      rawRows: 10,
      colCount: schema.length,
      headerRow: 1,
      columns: [],
      typedKey: `parquet/${datasetId}/${vid}/0/typed-1.parquet`,
      schemaRevision: 1,
      schema: schema as unknown as object,
      lineageId: lineage.id,
    },
  });
}

/** Aktivasi seperti pemanggil sungguhan: lock baris Dataset dulu, lalu activateVersionInTx. */
const activate = (vid: string, audit = false) =>
  prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Dataset" WHERE id = ${DS} FOR UPDATE`;
    return activateVersionInTx(tx, DS, vid, { audit, actorId: OWNER, ip: IP });
  });

async function cleanup() {
  const users = [OWNER, EDITOR, VIEWER, STRANGER];
  await prisma.auditLog.deleteMany({ where: { actorId: { in: users } } });
  await prisma.storageCleanup.deleteMany({ where: { prefix: { contains: RUN } } });
  await prisma.dataset.deleteMany({ where: { id: { in: [DS, DS_OTHER] } } });
  await prisma.user.deleteMany({ where: { id: { in: users } } });
}

describe.skipIf(!probe)("pivot tersimpan (integrasi PostgreSQL, T-072)", () => {
  let pivotId = "";

  beforeAll(async () => {
    await cleanup();
    for (const u of [OWNER, EDITOR, VIEWER, STRANGER]) {
      await prisma.user.create({ data: { id: u, email: `${u}@pcpexpress.com` } });
    }
    await prisma.dataset.create({
      data: { id: DS, ownerId: OWNER, name: `T072 ${RUN}`, nameKey: `t072 ${RUN}` },
    });
    await prisma.dataset.create({
      data: { id: DS_OTHER, ownerId: STRANGER, name: `T072b ${RUN}`, nameKey: `t072b ${RUN}` },
    });
    await version(V1, DS, S1, SCHEMA_V1, "READY", new Date(Date.now() - 60_000));
    await version(V_OTHER, DS_OTHER, S_OTHER, SCHEMA_V1);
    await prisma.dataset.update({ where: { id: DS }, data: { activeVersionId: V1 } });
    await prisma.dataset.update({ where: { id: DS_OTHER }, data: { activeVersionId: V_OTHER } });
    await prisma.dashboard.create({
      data: {
        id: D1,
        datasetId: DS,
        name: "Ringkasan",
        nameKey: "ringkasan",
        shares: {
          create: [
            { userId: EDITOR, role: "EDITOR" },
            { userId: VIEWER, role: "VIEWER" },
          ],
        },
      },
    });
    await prisma.dashboard.create({
      data: { id: D2, datasetId: DS, name: "Area", nameKey: "area", orgShared: true },
    });
  });

  afterAll(async () => {
    if (probe) await cleanup();
  });

  it("AC2: pemilik membuat → revisi 1 + AuditLog; non-pemilik (editor/viewer/orang lain) → NOT_FOUND", async () => {
    const r = await svc.createSavedPivot(OWNER, DS, { name: "Margin cabang", spec: pivot(S1) }, IP);
    expect(r).toMatchObject({ ok: true, data: { revision: 1 } });
    if (!r.ok) return;
    pivotId = r.data.id;
    const row = await prisma.savedPivot.findUniqueOrThrow({ where: { id: pivotId } });
    expect(row).toMatchObject({ datasetId: DS, nameKey: "margin cabang", createdById: OWNER });
    expect(row.spec).toEqual(pivot(S1));
    const audit = await prisma.auditLog.findFirstOrThrow({
      where: { action: "savedPivot.create", targetId: pivotId },
    });
    expect(audit).toMatchObject({ actorId: OWNER, targetType: "savedPivot", ip: IP });
    expect(audit.meta).toEqual({ datasetId: DS, name: "Margin cabang", revision: 1 });

    for (const u of [EDITOR, VIEWER, STRANGER]) {
      const c = await svc.createSavedPivot(u, DS, { name: `x ${u}`, spec: pivot(S1) }, IP);
      expect(c).toMatchObject({ ok: false, code: "NOT_FOUND" });
      const up = await svc.updateSavedPivot(u, pivotId, { baseRevision: 1, name: "Curi" }, IP);
      expect(up).toMatchObject({ ok: false, code: "NOT_FOUND" });
      const del = await svc.deleteSavedPivot(u, pivotId, IP);
      expect(del).toMatchObject({ ok: false, code: "NOT_FOUND" });
    }
    // Pemilik dataset lain tidak bisa memakai sheet dataset ini, dan sebaliknya (IDOR lintas dataset).
    const foreign = await svc.createSavedPivot(
      OWNER,
      DS,
      { name: "Asing", spec: pivot(S_OTHER) },
      IP,
    );
    expect(foreign).toMatchObject({ ok: false, code: "NOT_FOUND" });
    const cross = await svc.createSavedPivot(
      STRANGER,
      DS_OTHER,
      { name: "Asing", spec: pivot(S1) },
      IP,
    );
    expect(cross).toMatchObject({ ok: false, code: "NOT_FOUND" });
    // Sheet yang tidak ada di mana pun → NOT_FOUND juga (tanpa oracle keberadaan sheet).
    const gone = await svc.createSavedPivot(
      OWNER,
      DS,
      { name: "Hilang", spec: pivot(id("sheetgone")) },
      IP,
    );
    expect(gone).toMatchObject({ ok: false, code: "NOT_FOUND", message: "Sheet tidak ditemukan." });
    expect(foreign).toEqual(gone);
    expect(await prisma.savedPivot.count({ where: { datasetId: { in: [DS, DS_OTHER] } } })).toBe(1);
  });

  it("AC2: baca — pemilik dan editor dashboard dataset (baca saja); viewer/orang lain → NOT_FOUND", async () => {
    const own = await svc.listSavedPivots(OWNER, DS);
    expect(own).toMatchObject({
      ok: true,
      data: [{ id: pivotId, canEdit: true, usage: { widgets: 0, dashboards: 0 } }],
    });
    const ed = await svc.getSavedPivot(EDITOR, pivotId);
    expect(ed).toMatchObject({ ok: true, data: { id: pivotId, canEdit: false, usage: null } });
    for (const u of [VIEWER, STRANGER]) {
      expect(await svc.listSavedPivots(u, DS)).toMatchObject({ ok: false, code: "NOT_FOUND" });
      expect(await svc.getSavedPivot(u, pivotId)).toMatchObject({ ok: false, code: "NOT_FOUND" });
    }
  });

  it("AC2: ubah/ganti nama — revisi naik; revisi basi → CONFLICT tanpa menimpa; validasi spec dan nama", async () => {
    const spec2 = { ...pivot(S1), sort: "label_asc" };
    const u1 = await svc.updateSavedPivot(OWNER, pivotId, { baseRevision: 1, spec: spec2 }, IP);
    expect(u1).toEqual({ ok: true, data: { id: pivotId, revision: 2 } });
    const staleWrite = await svc.updateSavedPivot(
      OWNER,
      pivotId,
      { baseRevision: 1, spec: pivot(S1) },
      IP,
    );
    expect(staleWrite).toMatchObject({ ok: false, code: "CONFLICT" });
    expect((await prisma.savedPivot.findUniqueOrThrow({ where: { id: pivotId } })).spec).toEqual(
      spec2,
    );
    const ren = await svc.updateSavedPivot(OWNER, pivotId, { baseRevision: 2, name: "Laba" }, IP);
    expect(ren).toEqual({ ok: true, data: { id: pivotId, revision: 3 } });
    const audit = await prisma.auditLog.findMany({
      where: { action: "savedPivot.update", targetId: pivotId },
      orderBy: { at: "asc" },
    });
    expect(audit.map((a) => a.meta)).toEqual([
      { datasetId: DS, name: "Margin cabang", specChanged: true, revision: 2 },
      {
        datasetId: DS,
        name: "Laba",
        renamedFrom: "Margin cabang",
        specChanged: false,
        revision: 3,
      },
    ]);
    // Kolom tidak ada di skema / sheet dataset lain / bentuk salah / nama kembar.
    const bad = await svc.updateSavedPivot(
      OWNER,
      pivotId,
      { baseRevision: 3, spec: { ...pivot(S1), rows: [{ column: 9 }] } },
      IP,
    );
    expect(bad).toMatchObject({ ok: false, code: "INVALID", field: "spec" });
    const shape = await svc.updateSavedPivot(
      OWNER,
      pivotId,
      { baseRevision: 3, spec: { ...pivot(S1), sql: "DROP TABLE x" } },
      IP,
    );
    expect(shape).toMatchObject({ ok: false, code: "INVALID" });
    await svc.createSavedPivot(OWNER, DS, { name: "Kedua", spec: pivot(S1) }, IP);
    const dup = await svc.updateSavedPivot(
      OWNER,
      pivotId,
      { baseRevision: 3, name: " KEDUA " },
      IP,
    );
    expect(dup).toMatchObject({ ok: false, code: "NAME_TAKEN" });
    expect((await prisma.savedPivot.findUniqueOrThrow({ where: { id: pivotId } })).revision).toBe(
      3,
    );
  });

  it("AC2: maks 50 per dataset → LIMIT_REACHED", async () => {
    const n = await prisma.savedPivot.count({ where: { datasetId: DS } });
    await prisma.savedPivot.createMany({
      data: Array.from({ length: svc.SAVED_PIVOTS_PER_DATASET - n }, (_, i) => ({
        datasetId: DS,
        name: `isi ${i}`,
        nameKey: `isi ${i}`,
        spec: pivot(S1),
      })),
    });
    const r = await svc.createSavedPivot(OWNER, DS, { name: "Ke-51", spec: pivot(S1) }, IP);
    expect(r).toMatchObject({ ok: false, code: "LIMIT_REACHED" });
    await prisma.savedPivot.deleteMany({ where: { datasetId: DS, name: { startsWith: "isi " } } });
  });

  it("AC3: dipakai 3 widget di 2 dashboard → IN_USE + daftar dashboard; tidak dipakai → terhapus + AuditLog", async () => {
    await prisma.widget.createMany({
      data: [
        { id: id("w1"), dashboardId: D1, type: "pivot", savedPivotId: pivotId },
        { id: id("w2"), dashboardId: D1, type: "bar", savedPivotId: pivotId },
        { id: id("w3"), dashboardId: D2, type: "kpi", savedPivotId: pivotId },
      ],
    });
    const r = await svc.deleteSavedPivot(OWNER, pivotId, IP);
    expect(r).toMatchObject({
      ok: false,
      code: "IN_USE",
      dashboards: [
        { id: D2, name: "Area" },
        { id: D1, name: "Ringkasan" },
      ],
    });
    expect(r.ok ? "" : r.message).toContain("3 widget");
    // FK NO ACTION juga menolak hapus langsung (penjaga kedua bila widget diikat bersamaan).
    await expect(prisma.savedPivot.delete({ where: { id: pivotId } })).rejects.toMatchObject({
      code: "P2003",
    });
    const other = await prisma.savedPivot.findFirstOrThrow({
      where: { datasetId: DS, name: "Kedua" },
    });
    expect(await svc.deleteSavedPivot(OWNER, other.id, IP, 99)).toMatchObject({
      ok: false,
      code: "CONFLICT",
    });
    expect(await svc.deleteSavedPivot(OWNER, other.id, IP)).toEqual({
      ok: true,
      data: { id: other.id },
    });
    const audit = await prisma.auditLog.findFirstOrThrow({
      where: { action: "savedPivot.delete", targetId: other.id },
    });
    expect(audit.meta).toEqual({ datasetId: DS, name: "Kedua", revision: 1 });
  });

  it("AC4: aktivasi versi baru → spec pivot tersimpan dipetakan (baris, nilai, field terhitung, Saring) di transaksi aktivasi", async () => {
    await version(V2, DS, S2, SCHEMA_V2, "READY", new Date(Date.now() - 30_000));
    await activate(V2);
    const row = await prisma.savedPivot.findUniqueOrThrow({ where: { id: pivotId } });
    expect(row.spec).toEqual({
      ...pivot(S2, { cabang: 2, omzet: 3, biaya: 4 }),
      sort: "label_asc",
    });
    expect(row.missingColumns).toEqual([]);
    expect(row.revision).toBe(4);
    // Versi yang hanya dipratinjau (AWAITING_CONFIRM) tidak bisa diaktifkan → pivot tidak berubah.
    await version(V_PENDING, DS, S_PENDING, SCHEMA_V3, "AWAITING_CONFIRM");
    await expect(activate(V_PENDING)).rejects.toThrow();
    const same = await prisma.savedPivot.findUniqueOrThrow({ where: { id: pivotId } });
    expect(same.spec).toEqual(row.spec);
    expect(same.revision).toBe(4);
    // Simpan dengan spec versi lama setelah aktivasi → STALE (tidak menimpa hasil remap).
    const old = await svc.updateSavedPivot(
      OWNER,
      pivotId,
      { baseRevision: 4, spec: pivot(S1) },
      IP,
    );
    expect(old).toMatchObject({ ok: false, code: "STALE" });
  });

  it("AC4: kolom hilang → missingColumns (spec tetap di sheet lama); rollback (audit) → pulih tanpa catatan", async () => {
    await version(V3, DS, S3, SCHEMA_V3);
    await activate(V3);
    const missing = await prisma.savedPivot.findUniqueOrThrow({ where: { id: pivotId } });
    expect(missing.missingColumns).toEqual(["Ongkos"]);
    expect((missing.spec as { sheetId: string }).sheetId).toBe(S2);
    expect(missing.revision).toBe(5);
    await activate(V1, true);
    const back = await prisma.savedPivot.findUniqueOrThrow({ where: { id: pivotId } });
    expect(back.spec).toEqual({ ...pivot(S1), sort: "label_asc" });
    expect(back.missingColumns).toEqual([]);
    expect(back.revision).toBe(6);
    expect(
      await prisma.auditLog.count({
        where: { action: "dataset.version.activate", targetId: DS, actorId: OWNER },
      }),
    ).toBe(1);
  });

  it("AC4: sheet lama ikut dibuang retensi → spec pindah ke target dengan penanda MISSING_COLUMN", async () => {
    // Spec di sheet V2 ("Ongkos" = pos 4); V4 tanpa kolom itu diaktifkan dan V2 menjadi READY tertua di
    // luar KEEP_READY (V4, V3, V1 disimpan) → V2 dibuang retensi di transaksi yang sama.
    const vNew = id("v4");
    const sNew = id("s4");
    await prisma.savedPivot.update({
      where: { id: pivotId },
      data: { spec: { ...pivot(S2, { cabang: 2, omzet: 3, biaya: 4 }), sort: "label_asc" } },
    });
    await version(vNew, DS, sNew, SCHEMA_V3);
    await prisma.datasetVersion.update({
      where: { id: V2 },
      data: { createdAt: new Date(Date.now() - 120_000) },
    });
    await activate(vNew);
    const row = await prisma.savedPivot.findUniqueOrThrow({ where: { id: pivotId } });
    expect(await prisma.datasetVersion.count({ where: { id: V2 } })).toBe(0);
    expect(row.spec).toEqual({
      ...pivot(sNew, { cabang: 1, omzet: 2, biaya: MISSING_COLUMN }),
      sort: "label_asc",
    });
    expect(row.missingColumns).toEqual(["Ongkos"]);
  });

  it("AC3: hapus dataset → dashboard, widget terikat, dan pivot tersimpan terhapus dalam satu transaksi tanpa galat FK", async () => {
    expect(await prisma.widget.count({ where: { savedPivotId: pivotId } })).toBe(3);
    const r = await deleteDataset(OWNER, DS, `T072 ${RUN}`, IP, {
      cancelJobs: async () => {},
      deleteObjects: async () => 0,
      forgetParquet: async () => {},
    });
    expect(r).toEqual({ ok: true, data: { id: DS } });
    expect(await prisma.savedPivot.count({ where: { datasetId: DS } })).toBe(0);
    expect(
      await prisma.widget.count({ where: { id: { in: [id("w1"), id("w2"), id("w3")] } } }),
    ).toBe(0);
    expect(await prisma.dashboard.count({ where: { datasetId: DS } })).toBe(0);
  });
});
