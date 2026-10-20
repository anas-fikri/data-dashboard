import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PeriodLimits } from "@/features/ingest/period-plan";

/*
 * Commit unggahan periode (T-052 AC5): rencana dihitung ulang di bawah lock; acuan cast basi → stale;
 * sidik rencana yang dikonfirmasi berbeda → PLAN_STALE (rencana baru dibekukan, tanpa tulisan lain);
 * aktivasi meneruskan sheetMap setelah gerbang integritas (kunci yang tidak terbukti ada → batal).
 * Prisma ditiru di tingkat transaksi.
 */
const activateVersionInTx = vi.fn();
const recordAudit = vi.fn();
vi.mock("@/features/versions/activation", () => ({ activateVersionInTx }));
vi.mock("@/features/audit/service", () => ({ recordAudit }));
vi.mock("@/lib/db", () => ({ prisma: {} }));

const { commitPeriodInTx } = await import("@/features/versions/period-commit");
const { IntegrityError } = await import("@/features/versions/integrity-check");
const { periodPlanDigest } = await import("@/features/ingest/period-upload-plan");

const LIMITS: PeriodLimits = {
  keepDefault: 24,
  keepMax: 60,
  sheetMaxRows: 10_000_000,
  datasetMaxBytes: 16 * 1024 ** 3,
  sheetMaxSegments: 120,
  shrinkConfirmPct: 50,
  strayPct: 10,
  warnPct: 80,
};
const DS = "cmv4klj5r0007oczvgiofocpg";
const VER = "cmv4kljx40009oczvdmpurrv2";
const ACTIVE = "cmv4kljx40009oczvdmpurrv1";
const SHEET = "cmv4kljx40009oczvdmpurrsa";
const L1 = "lineage1";
const day = (iso: string) => new Date(`${iso}T00:00:00Z`);

const activeSeg = (start: string, rows: number) => ({
  ordinal: 0,
  segmentTyped: {
    id: `t-${start}`,
    typedKey: `parquet/${DS}/seg/g${start}/typed-2.parquet`,
    dataRows: rows,
    typedBytes: 100n,
    schemaRevision: 2,
    segment: {
      id: `g${start}`,
      rawKey: `parquet/${DS}/seg/g${start}/raw.parquet`,
      rawRows: rows + 1,
      rawBytes: 100n,
      rowBase: BigInt(Number(start.slice(5, 7)) * 1000),
      maxSrcRow: rows + 1,
      periodKey: start.slice(0, 7),
      periodStart: day(start),
      sha256: "lama",
    },
  },
});
const activeSheet = () => ({
  id: SHEET,
  index: 0,
  name: "Kirim",
  aliasName: null,
  lineageId: L1,
  rawKey: "r",
  rawRows: 0,
  colCount: 3,
  headerRow: 1,
  columns: [],
  truncatedCells: 0,
  preview: null,
  typedKey: "x",
  schemaRevision: 2,
  schema: [],
  periodSource: "COLUMN",
  periodColumn: 2,
  segments: [activeSeg("2026-01-01", 30), activeSeg("2026-02-01", 28)].map((g, i) => ({
    ...g,
    ordinal: i,
  })),
});
const incomingRow = (start: string, rows: number, rev = 2) => ({
  id: `new${start}`,
  lineageId: L1,
  periodKey: start.slice(0, 7),
  periodStart: day(start),
  rawKey: `parquet/${DS}/seg/new${start}/raw.parquet`,
  rawRows: rows + 1,
  rawBytes: 50n,
  rowBase: 90_000n,
  maxSrcRow: rows + 1,
  typed: [
    {
      id: `nt-${start}`,
      typedKey: `parquet/${DS}/seg/new${start}/typed-2.parquet`,
      dataRows: rows,
      typedBytes: 50n,
      schemaRevision: rev,
    },
  ],
});

const FACTS = {
  grain: "MONTH" as const,
  source: "COLUMN" as const,
  fileSheets: [L1],
  droppedRows: 0,
  ignoredSheets: [],
  fileSha256: "baru",
};

let version: Record<string, unknown>;
let incoming: ReturnType<typeof incomingRow>[];
const tx = {
  datasetVersion: { findUnique: vi.fn(), updateMany: vi.fn() },
  $queryRaw: vi.fn(),
  segment: { findMany: vi.fn(), updateMany: vi.fn() },
  sheet: { deleteMany: vi.fn(), create: vi.fn() },
  sheetSegment: { createMany: vi.fn() },
  segmentTyped: { updateMany: vi.fn() },
};

const allKeys = () =>
  new Set([
    ...activeSheet().segments.flatMap((g) => [
      g.segmentTyped.segment.rawKey,
      g.segmentTyped.typedKey,
    ]),
    ...incoming.flatMap((g) => [g.rawKey, g.typed[0]!.typedKey]),
  ]);

/**
 * findUnique tiruan: versi ini (status) atau — bila select memuat sheets — manifest yang ditulis
 * transaksi ini (dibaca ulang gerbang integritas); versi aktif = sheet aktif.
 */
async function findUnique({
  where,
  select,
}: {
  where: { id: string };
  select?: { sheets?: { select?: { segments?: unknown } } };
}) {
  if (where.id === ACTIVE) return { periodGrain: "MONTH", sheets: [activeSheet()] };
  if (where.id !== VER) return null;
  if (!select?.sheets) return version;
  const files = new Map<string, { typedKey: string; dataRows: number; segment: unknown }>();
  for (const g of activeSheet().segments) files.set(g.segmentTyped.id, g.segmentTyped);
  for (const g of incoming) {
    files.set(g.typed[0]!.id, {
      typedKey: g.typed[0]!.typedKey,
      dataRows: g.typed[0]!.dataRows,
      segment: g,
    });
  }
  return {
    periodGrain: "MONTH",
    sheets: tx.sheet.create.mock.calls.map(([{ data }], i) => ({
      id: "newsheet",
      name: data.name,
      typedKey: data.typedKey,
      periodSource: data.periodSource,
      segments: (tx.sheetSegment.createMany.mock.calls[i]?.[0].data ?? []).map(
        (m: { segmentTypedId: string; ordinal: number }) => ({
          ordinal: m.ordinal,
          segmentTyped: files.get(m.segmentTypedId),
        }),
      ),
    })),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  version = {
    datasetId: DS,
    status: "INGESTING",
    mode: "PERIOD",
    periodGrain: "MONTH",
    sha256: null,
    plan: null,
  };
  incoming = [incomingRow("2026-03-01", 31)];
  tx.datasetVersion.findUnique.mockImplementation(findUnique);
  tx.$queryRaw.mockResolvedValue([
    { activeVersionId: ACTIVE, keepPeriods: null, onLimit: "REJECT" },
  ]);
  tx.segment.findMany.mockImplementation(async () => incoming);
  tx.sheet.create.mockImplementation(async ({ data }: { data: { typedKey: string | null } }) => ({
    id: "newsheet",
    typedKey: data.typedKey,
  }));
  tx.datasetVersion.updateMany.mockResolvedValue({ count: 1 });
  activateVersionInTx.mockResolvedValue({ deletedTypedKeys: [] });
});

const snapshot = { activeVersionId: ACTIVE, sheets: [{ id: SHEET, schemaRevision: 2 }] };
const auto = (over: Record<string, unknown> = {}) =>
  commitPeriodInTx(tx as never, {
    versionId: VER,
    from: "INGESTING",
    snapshot,
    facts: FACTS,
    sha256: "baru",
    include: [],
    mode: { kind: "auto", allowAuto: true },
    present: allKeys(),
    limits: LIMITS,
    ...over,
  });

describe("commitPeriodInTx (worker)", () => {
  it("murni menambah → READY + aktif dengan sheetMap; manifest = file typed lama + baru, urut periode", async () => {
    const r = await auto();
    expect(r.outcome).toBe("activated");
    expect(tx.$queryRaw.mock.calls[0]![0].join("")).toMatch(/FOR UPDATE/);
    expect(tx.sheet.create.mock.calls[0]![0].data).toMatchObject({
      lineageId: L1,
      typedKey: `parquet/${DS}/seg/g2026-01-01/typed-2.parquet`,
      rawRows: 31 + 29 + 32,
      periodSource: "COLUMN",
      periodColumn: 2,
    });
    expect(tx.sheetSegment.createMany.mock.calls[0]![0].data).toEqual([
      { sheetId: "newsheet", segmentTypedId: "t-2026-01-01", ordinal: 0 },
      { sheetId: "newsheet", segmentTypedId: "t-2026-02-01", ordinal: 1 },
      { sheetId: "newsheet", segmentTypedId: "nt-2026-03-01", ordinal: 2 },
    ]);
    expect(tx.datasetVersion.updateMany).toHaveBeenCalledWith({
      where: { id: VER, status: "INGESTING" },
      data: expect.objectContaining({ status: "READY", sha256: "baru", ingestStage: "typed" }),
    });
    expect(activateVersionInTx).toHaveBeenCalledWith(tx, DS, VER, {
      sheetMap: { [SHEET]: "newsheet" },
    });
    expect(recordAudit).not.toHaveBeenCalled();
  });

  it("revisi skema sheet aktif berubah sejak segmen ditulis → stale tanpa tulisan", async () => {
    expect(
      (await auto({ snapshot: { ...snapshot, sheets: [{ id: SHEET, schemaRevision: 1 }] } }))
        .outcome,
    ).toBe("stale");
    incoming = [incomingRow("2026-03-01", 31, 1)];
    expect((await auto()).outcome).toBe("stale");
    expect(tx.sheet.create).not.toHaveBeenCalled();
    expect(activateVersionInTx).not.toHaveBeenCalled();
  });

  it("menggantikan periode → AWAITING_CONFIRM + rencana beku, tidak aktif", async () => {
    incoming = [incomingRow("2026-02-01", 27)];
    const r = await auto();
    expect(r.outcome).toBe("awaiting");
    expect(tx.datasetVersion.updateMany).toHaveBeenCalledWith({
      where: { id: VER, status: "INGESTING" },
      data: expect.objectContaining({ status: "AWAITING_CONFIRM" }),
    });
    expect(activateVersionInTx).not.toHaveBeenCalled();
  });

  it("file baru versi ini tidak terbukti ada → IntegrityError (transaksi batal), tidak aktif", async () => {
    const present = allKeys();
    present.delete(`parquet/${DS}/seg/new2026-03-01/typed-2.parquet`);
    await expect(auto({ present })).rejects.toBeInstanceOf(IntegrityError);
    expect(activateVersionInTx).not.toHaveBeenCalled();
  });

  it("review M1: file periode lama belum di-HEAD (manifest aktif berubah, mis. recast sheet lain) → retry tanpa tulisan, bukan gagal", async () => {
    const present = allKeys();
    present.delete(`parquet/${DS}/seg/g2026-01-01/typed-2.parquet`);
    expect(await auto({ present })).toEqual({ outcome: "retry" });
    expect(tx.sheet.deleteMany).not.toHaveBeenCalled();
    expect(tx.sheet.create).not.toHaveBeenCalled();
    expect(tx.datasetVersion.updateMany).not.toHaveBeenCalled();
    expect(activateVersionInTx).not.toHaveBeenCalled();
  });

  it("review L1: status versi dibaca ulang setelah lock (dibuang/kedaluwarsa sebelum lock) → gone", async () => {
    let calls = 0;
    tx.datasetVersion.findUnique.mockImplementation(async (q: Parameters<typeof findUnique>[0]) => {
      if (q.where.id === VER && !q.select?.sheets && ++calls === 2) return null;
      return findUnique(q);
    });
    expect(await auto()).toEqual({ outcome: "gone" });
    expect(tx.sheet.create).not.toHaveBeenCalled();
  });

  it("versi bukan INGESTING / bukan PERIOD → gone", async () => {
    version.status = "FAILED";
    expect((await auto()).outcome).toBe("gone");
    version.status = "INGESTING";
    version.mode = "REPLACE";
    expect((await auto()).outcome).toBe("gone");
  });
});

describe('commitPeriodInTx ("Terapkan" pemilik)', () => {
  /** Rencana yang ditinjau pemilik (dihitung saat worker selesai, versi masih AWAITING_CONFIRM). */
  async function pending() {
    incoming = [incomingRow("2026-02-01", 27)];
    const r = await auto();
    if (r.outcome !== "awaiting") throw new Error(r.outcome);
    vi.clearAllMocks();
    tx.datasetVersion.updateMany.mockResolvedValue({ count: 1 });
    activateVersionInTx.mockResolvedValue({ deletedTypedKeys: ["lama"] });
    version = { ...version, status: "AWAITING_CONFIRM", plan: JSON.parse(JSON.stringify(r.plan)) };
    return r.plan;
  }
  const confirm = (digest: string, over: Record<string, unknown> = {}) =>
    commitPeriodInTx(tx as never, {
      versionId: VER,
      from: "AWAITING_CONFIRM",
      include: [],
      mode: { kind: "confirm", digest, ack: { shrink: false, droppedRows: 0 } },
      present: allKeys(),
      limits: LIMITS,
      audit: { actorId: "owner", ip: "1.2.3.4" },
      ...over,
    });

  it("sidik sama → aktif (sheetMap) + AuditLog dataset.period.confirm", async () => {
    const plan = await pending();
    const r = await confirm(periodPlanDigest(plan));
    expect(r).toMatchObject({ outcome: "activated", deletedTypedKeys: ["lama"] });
    expect(activateVersionInTx).toHaveBeenCalledWith(tx, DS, VER, {
      sheetMap: { [SHEET]: "newsheet" },
    });
    expect(recordAudit).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        action: "dataset.period.confirm",
        meta: expect.objectContaining({ summary: "Februari 2026 diganti (28 → 27 baris)" }),
      }),
    );
  });

  it("pengaturan berubah sejak ditinjau → PLAN_STALE: rencana baru dibekukan, tanpa manifest/aktivasi", async () => {
    const plan = await pending();
    tx.$queryRaw.mockResolvedValue([
      { activeVersionId: ACTIVE, keepPeriods: 1, onLimit: "EVICT_OLDEST" },
    ]);
    const r = await confirm(periodPlanDigest(plan));
    expect(r.outcome).toBe("plan_stale");
    expect(tx.datasetVersion.updateMany).toHaveBeenCalledWith({
      where: { id: VER, status: "AWAITING_CONFIRM" },
      data: { plan: expect.objectContaining({ keep: 1, onLimit: "EVICT_OLDEST" }) },
    });
    expect(tx.sheet.create).not.toHaveBeenCalled();
    expect(activateVersionInTx).not.toHaveBeenCalled();
  });

  it("versi aktif berbeda dengan dasar rencana beku → stale (file diproses ulang)", async () => {
    const plan = await pending();
    tx.$queryRaw.mockResolvedValue([
      { activeVersionId: "cmv4kljx40009oczvlain0001", keepPeriods: null, onLimit: "REJECT" },
    ]);
    tx.datasetVersion.findUnique.mockImplementation(async (q: Parameters<typeof findUnique>[0]) =>
      q.where.id === VER ? findUnique(q) : { periodGrain: "MONTH", sheets: [activeSheet()] },
    );
    expect((await confirm(periodPlanDigest(plan))).outcome).toBe("stale");
  });

  it("tinjauan (dryRun) tidak mengunci dan tidak menulis apa pun", async () => {
    await pending();
    const r = await confirm("", { dryRun: true });
    expect(r.outcome).toBe("preview");
    expect(tx.$queryRaw.mock.calls[0]![0].join("")).not.toMatch(/FOR UPDATE/);
    expect(tx.datasetVersion.updateMany).not.toHaveBeenCalled();
    expect(tx.sheet.deleteMany).not.toHaveBeenCalled();
  });
});

describe("T-057: perubahan skema sheet + commit pemetaan", () => {
  const change = (over: Record<string, unknown> = {}) => ({
    lineageId: L1,
    baseRevision: 2,
    colCount: 4,
    columns: [{ pos: 4, name: "catatan", original: "catatan" }],
    added: [
      {
        pos: 4,
        name: "catatan",
        original: "catatan",
        type: "text" as const,
        hidden: true,
        nullPct: 0,
        distinctCount: 1,
        castFailCount: 0,
        nonEmpty: 31,
      },
    ],
    aliases: [],
    normalized: [],
    ...over,
  });

  it("kolom baru dibawa ke sheet versi baru (colCount/columns/schema), revisi tetap; fakta ditulis ke versi", async () => {
    const meta = { ignoredSheets: [], changes: [change()] };
    expect((await auto({ meta })).outcome).toBe("activated");
    const data = tx.sheet.create.mock.calls[0]![0].data;
    expect(data).toMatchObject({ colCount: 4, schemaRevision: 2 });
    expect(data.columns).toEqual([{ pos: 4, name: "catatan", original: "catatan" }]);
    expect(data.schema).toEqual([expect.objectContaining({ pos: 4, hidden: true, type: "text" })]);
    expect(tx.datasetVersion.updateMany).toHaveBeenCalledWith({
      where: { id: VER, status: "INGESTING" },
      data: expect.objectContaining({ status: "READY", periodMeta: meta }),
    });
  });

  it("perubahan dihitung atas revisi skema lain → stale tanpa tulisan", async () => {
    expect(
      (await auto({ meta: { ignoredSheets: [], changes: [change({ baseRevision: 1 })] } })).outcome,
    ).toBe("stale");
    expect(tx.sheet.create).not.toHaveBeenCalled();
  });

  it("'Terapkan' (AWAITING_CONFIRM): perubahan dibaca dari versi; bentuk rusak → stale", async () => {
    version.periodMeta = { ignoredSheets: [], changes: [change()] };
    incoming = [incomingRow("2026-02-01", 27)];
    const r = await auto({ meta: version.periodMeta });
    if (r.outcome !== "awaiting") throw new Error(r.outcome);
    vi.clearAllMocks();
    tx.datasetVersion.updateMany.mockResolvedValue({ count: 1 });
    tx.sheet.create.mockImplementation(async ({ data }: { data: { typedKey: string | null } }) => ({
      id: "newsheet",
      typedKey: data.typedKey,
    }));
    activateVersionInTx.mockResolvedValue({ deletedTypedKeys: [] });
    version.status = "AWAITING_CONFIRM";
    version.plan = JSON.parse(JSON.stringify(r.plan));
    const confirm = () =>
      commitPeriodInTx(tx as never, {
        versionId: VER,
        from: "AWAITING_CONFIRM",
        include: [],
        mode: {
          kind: "confirm",
          digest: periodPlanDigest(r.plan),
          ack: { shrink: true, droppedRows: 0 },
        },
        present: allKeys(),
        limits: LIMITS,
      });
    expect((await confirm()).outcome).toBe("activated");
    expect(tx.sheet.create.mock.calls[0]![0].data).toMatchObject({ colCount: 4 });
    version.periodMeta = { changes: [{ lineageId: 5 }] };
    expect((await confirm()).outcome).toBe("stale");
  });

  it("pemetaan (dari AWAITING_MAPPING) → AuditLog dataset.version.map dengan id job, juga saat menunggu konfirmasi", async () => {
    version.status = "AWAITING_MAPPING";
    incoming = [incomingRow("2026-02-01", 27)];
    const r = await auto({
      from: "AWAITING_MAPPING",
      meta: { ignoredSheets: [], changes: [] },
      mapAudit: { actorId: "u1", ip: "ip", meta: { jobId: "mp_1" } },
    });
    expect(r.outcome).toBe("awaiting");
    expect(recordAudit).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        action: "dataset.version.map",
        actorId: "u1",
        meta: expect.objectContaining({ versionId: VER, jobId: "mp_1" }),
      }),
    );
    expect(tx.datasetVersion.updateMany).toHaveBeenCalledWith({
      where: { id: VER, status: "AWAITING_MAPPING" },
      data: expect.not.objectContaining({ ingestStage: "typed" }),
    });
  });
});
