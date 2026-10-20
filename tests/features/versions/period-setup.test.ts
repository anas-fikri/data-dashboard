import { beforeEach, describe, expect, it, vi } from "vitest";

/*
 * "Atur periode" sisi app (T-051): pemilik saja (NOT_FOUND), batas "Simpan N periode" dari env,
 * "Buang N baris" wajib eksplisit, acuan basi/versi tertunda ditolak, versi PERIOD_SETUP + job, dan
 * AuditLog pengaturan. Prisma, mesin query, dan antrean dimock.
 */
const tx = {
  $queryRaw: vi.fn(),
  sheet: { findMany: vi.fn() },
  datasetVersion: { count: vi.fn(), create: vi.fn() },
  dataset: { update: vi.fn() },
};
const prisma = {
  $transaction: vi.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
  dataset: { findFirst: vi.fn() },
  datasetVersion: { count: vi.fn(), updateMany: vi.fn() },
};
vi.mock("@/lib/db", () => ({ prisma }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() } }));
vi.mock("@/lib/env", () => ({
  env: () => ({
    PERIOD_KEEP_DEFAULT: 24,
    PERIOD_KEEP_MAX: 60,
    PERIOD_SHEET_MAX_ROWS: 10_000_000,
    DATASET_MAX_DATA_BYTES: 16 * 1024 ** 3,
    PERIOD_SHEET_MAX_SEGMENTS: 120,
    PERIOD_SHRINK_CONFIRM_PCT: 50,
    PERIOD_STRAY_PCT: 10,
    PERIOD_WARN_PCT: 80,
  }),
}));
const recordAudit = vi.fn();
vi.mock("@/features/audit/service", () => ({ recordAudit }));
const enqueuePeriodSetup = vi.fn();
vi.mock("@/lib/queue/versions", () => ({ enqueuePeriodSetup }));
vi.mock("@/features/query/runtime", () => ({ queryDeps: async () => ({}) }));
const runOnParquet = vi.fn();
vi.mock("@/features/query/service", () => ({
  runOnParquet,
  sourceOf: (s: { typedKey: string }) => s.typedKey,
}));

const svc = await import("@/features/versions/period-setup");

const OWNER = "owner1";
const DS = "cmv4klj5r0007oczvgiofocpg";
const BASE = "cmv4kljx40009oczvdmpurrxf";
const SHEET = "cmv4kljx40009oczvsheet0001";
const NEW = "cmv4kljx40009oczvsetup0001";

const activeRow = {
  activeVersion: {
    id: BASE,
    status: "READY",
    periodGrain: null,
    sheets: [
      {
        id: SHEET,
        name: "Pengiriman",
        lineageId: "l1",
        schemaRevision: 3,
        typedKey: "parquet/x/seg/y/typed-3.parquet",
        schema: [
          { pos: 1, name: "Kode", type: "text" },
          { pos: 2, name: "Tanggal Kirim", type: "date" },
        ],
        segments: [
          {
            segmentTyped: {
              typedKey: "parquet/x/seg/y/typed-3.parquet",
              legacyRow: false,
              columns: [1, 2],
              typedBytes: 1000n,
              segment: { rawBytes: 2000n },
            },
          },
        ],
      },
    ],
  },
};

const input = (over: Record<string, unknown> = {}) => ({
  grain: "MONTH",
  sheets: [{ sheetId: SHEET, source: "COLUMN", column: 2 }],
  label: null,
  keepPeriods: null,
  onLimit: "REJECT",
  dropMissing: 0,
  ...over,
});

/** Sebaran dari mesin query: Jan 5 baris, Feb 3 baris, 2 baris tanpa tanggal valid. */
const distribution = (missing = 2) => ({
  ok: true,
  value: {
    total: 8 + missing,
    periods: [
      { start: "2026-01-01", rows: 5 },
      { start: "2026-02-01", rows: 3 },
    ],
    missing,
    samples: missing ? [4, 9] : [],
  },
});

beforeEach(() => {
  vi.clearAllMocks();
  prisma.$transaction.mockImplementation(async (fn) => fn(tx));
  prisma.dataset.findFirst.mockResolvedValue(activeRow);
  runOnParquet.mockResolvedValue(distribution());
  tx.$queryRaw.mockResolvedValue([{ activeVersionId: BASE, keepPeriods: null, onLimit: "REJECT" }]);
  tx.sheet.findMany.mockResolvedValue([{ id: SHEET, schemaRevision: 3 }]);
  tx.datasetVersion.count.mockResolvedValue(0);
  tx.datasetVersion.create.mockResolvedValue({ id: NEW });
  enqueuePeriodSetup.mockResolvedValue(undefined);
});

describe("previewPeriodSetup", () => {
  it("bukan pemilik / id asing → NOT_FOUND tanpa query", async () => {
    prisma.dataset.findFirst.mockResolvedValue(null);
    expect(await svc.previewPeriodSetup("lain", DS, input())).toMatchObject({ code: "NOT_FOUND" });
    expect(await svc.previewPeriodSetup(OWNER, "../x", input())).toMatchObject({
      code: "NOT_FOUND",
    });
    expect(runOnParquet).not.toHaveBeenCalled();
    expect(prisma.dataset.findFirst.mock.calls[0]![0].where).toEqual({ id: DS, ownerId: "lain" });
  });

  it("sebaran per periode, baris tanpa tanggal + contoh, meter; tidak menulis apa pun (AC 1)", async () => {
    const r = await svc.previewPeriodSetup(OWNER, DS, input());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.sheets[0]).toMatchObject({
      column: { pos: 2, name: "Tanggal Kirim" },
      periods: [
        { start: "2026-01-01", rows: 5 },
        { start: "2026-02-01", rows: 3 },
      ],
      missing: 2,
      missingSamples: [4, 9],
      bytes: 3000,
    });
    expect(r.data.plan.usage.find((u) => u.limit === "periods")).toMatchObject({
      used: 2,
      max: 24,
    });
    expect(r.data.projection).toMatchObject({ binding: "periods", remaining: 22 });
    expect(r.data.needsDrop).toBe(true);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("kolom bukan tanggal → INVALID; 'Simpan 61 periode' → INVALID (AC 4)", async () => {
    expect(
      await svc.previewPeriodSetup(
        OWNER,
        DS,
        input({ sheets: [{ sheetId: SHEET, source: "COLUMN", column: 1 }] }),
      ),
    ).toMatchObject({ code: "INVALID" });
    expect(await svc.previewPeriodSetup(OWNER, DS, input({ keepPeriods: 61 }))).toEqual({
      ok: false,
      code: "INVALID",
      message: "Simpan paling banyak 60 periode.",
    });
  });

  it("dataset sudah per periode → INVALID (atur ulang lewat ganti semua data)", async () => {
    prisma.dataset.findFirst.mockResolvedValue({
      activeVersion: { ...activeRow.activeVersion, periodGrain: "MONTH" },
    });
    expect(await svc.previewPeriodSetup(OWNER, DS, input())).toMatchObject({ code: "INVALID" });
  });
});

describe("applyPeriodSetup", () => {
  it("ada baris tanpa tanggal valid tanpa 'Buang N baris' → INVALID, tidak ada versi (AC 2)", async () => {
    const r = await svc.applyPeriodSetup(OWNER, DS, input(), "10.0.0.1");
    expect(r).toMatchObject({ ok: false, code: "INVALID" });
    expect(!r.ok && r.message).toMatch(/Buang 2 baris/);
    expect(tx.datasetVersion.create).not.toHaveBeenCalled();
  });

  it("'Buang 2 baris' → versi PERIOD_SETUP (rencana beku) + job berisi sebaran yang ditinjau (AC 3)", async () => {
    const r = await svc.applyPeriodSetup(
      OWNER,
      DS,
      input({ dropMissing: 2, keepPeriods: 36, onLimit: "EVICT_OLDEST" }),
      "10.0.0.1",
    );
    expect(r).toEqual({ ok: true, data: { versionId: NEW } });
    const data = tx.datasetVersion.create.mock.calls[0]![0].data;
    expect(data).toMatchObject({
      datasetId: DS,
      status: "INGESTING",
      mode: "PERIOD_SETUP",
      periodGrain: "MONTH",
      ingestStage: "period-setup",
      uploadedById: OWNER,
    });
    expect(data.plan).toMatchObject({ droppedRows: 2, keep: 36, onLimit: "EVICT_OLDEST" });
    expect(enqueuePeriodSetup).toHaveBeenCalledWith({
      versionId: NEW,
      datasetId: DS,
      baseVersionId: BASE,
      grain: "MONTH",
      base: { activeVersionId: BASE, sheets: [{ id: SHEET, schemaRevision: 3 }] },
      sheets: [
        {
          sheetId: SHEET,
          source: "COLUMN",
          column: 2,
          label: null,
          expected: { periods: { "2026-01-01": 5, "2026-02-01": 3 }, missing: 2 },
        },
      ],
      dropMissing: 2,
      actorId: OWNER,
      ip: "10.0.0.1",
    });
    // Pengaturan berubah → disimpan + AuditLog.
    expect(tx.dataset.update).toHaveBeenCalledWith({
      where: { id: DS },
      data: { keepPeriods: 36, onLimit: "EVICT_OLDEST" },
    });
    expect(recordAudit).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        action: "dataset.period.settings",
        actorId: OWNER,
        targetId: DS,
        meta: {
          from: { keepPeriods: null, onLimit: "REJECT" },
          to: { keepPeriods: 36, onLimit: "EVICT_OLDEST" },
        },
      }),
    );
  });

  it("bukan pemilik di bawah lock → NOT_FOUND; versi tertunda → DATASET_BUSY; acuan berubah → STALE", async () => {
    runOnParquet.mockResolvedValue(distribution(0));
    tx.$queryRaw.mockResolvedValueOnce([]);
    expect(await svc.applyPeriodSetup(OWNER, DS, input(), "ip")).toMatchObject({
      code: "NOT_FOUND",
    });
    tx.datasetVersion.count.mockResolvedValueOnce(1);
    expect(await svc.applyPeriodSetup(OWNER, DS, input(), "ip")).toMatchObject({
      code: "DATASET_BUSY",
    });
    tx.sheet.findMany.mockResolvedValueOnce([{ id: SHEET, schemaRevision: 4 }]);
    expect(await svc.applyPeriodSetup(OWNER, DS, input(), "ip")).toMatchObject({ code: "STALE" });
    tx.$queryRaw.mockResolvedValueOnce([
      { activeVersionId: "lain", keepPeriods: null, onLimit: "REJECT" },
    ]);
    expect(await svc.applyPeriodSetup(OWNER, DS, input(), "ip")).toMatchObject({ code: "STALE" });
    expect(tx.datasetVersion.create).not.toHaveBeenCalled();
  });

  it("antrean mati → versi langsung FAILED (tidak menahan dataset) + DATASET_BUSY", async () => {
    runOnParquet.mockResolvedValue(distribution(0));
    enqueuePeriodSetup.mockRejectedValue(new Error("redis mati"));
    expect(await svc.applyPeriodSetup(OWNER, DS, input(), "ip")).toMatchObject({
      code: "DATASET_BUSY",
    });
    expect(prisma.datasetVersion.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: NEW, status: "INGESTING" },
        data: expect.objectContaining({ status: "FAILED" }),
      }),
    );
  });
});

describe("savePeriodSettings", () => {
  it("pemilik saja, ≤ PERIOD_KEEP_MAX, AuditLog hanya bila berubah (AC 4)", async () => {
    tx.$queryRaw.mockResolvedValueOnce([]);
    expect(
      await svc.savePeriodSettings("lain", DS, { keepPeriods: 12, onLimit: "REJECT" }, "ip"),
    ).toMatchObject({ code: "NOT_FOUND" });
    expect(
      await svc.savePeriodSettings(OWNER, DS, { keepPeriods: 61, onLimit: "REJECT" }, "ip"),
    ).toMatchObject({ code: "INVALID", message: "Simpan paling banyak 60 periode." });
    expect(
      await svc.savePeriodSettings(OWNER, DS, { keepPeriods: null, onLimit: "REJECT" }, "ip"),
    ).toEqual({ ok: true, data: { keepPeriods: null, onLimit: "REJECT" } });
    expect(recordAudit).not.toHaveBeenCalled();
    expect(
      await svc.savePeriodSettings(OWNER, DS, { keepPeriods: 12, onLimit: "EVICT_OLDEST" }, "ip"),
    ).toEqual({ ok: true, data: { keepPeriods: 12, onLimit: "EVICT_OLDEST" } });
    expect(recordAudit).toHaveBeenCalledTimes(1);
    expect(recordAudit.mock.calls[0]![1]).toMatchObject({ action: "dataset.period.settings" });
  });
});
