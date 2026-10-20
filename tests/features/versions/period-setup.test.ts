import { beforeEach, describe, expect, it, vi } from "vitest";

/*
 * "Atur periode" sisi app (T-051): pemilik saja (NOT_FOUND), batas "Simpan N periode" dari env,
 * "Buang N baris" wajib eksplisit, acuan basi/versi tertunda ditolak, versi PERIOD_SETUP + job, dan
 * AuditLog pengaturan. Atur ulang dataset yang sudah per periode (T-qqyx): banyak segmen, kelompok
 * bagian per periode baru, "ikuti periode sekarang". Prisma, mesin query, dan antrean dimock.
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
          { pos: 3, name: "Tanggal Bayar", type: "date" },
        ],
        periodSource: null,
        periodColumn: null,
        segments: [
          {
            segmentTyped: {
              typedKey: "parquet/x/seg/y/typed-3.parquet",
              legacyRow: false,
              columns: [1, 2, 3],
              typedBytes: 1000n,
              segment: { rawBytes: 2000n, rowBase: 0n, maxSrcRow: 10, originalName: "a.csv" },
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

/** Isian Terapkan dengan tinjauan yang baru saja dilihat (versi dasar + sidik dari Tinjau). */
async function reviewed(over: Record<string, unknown> = {}) {
  const p = await svc.previewPeriodSetup(OWNER, DS, input(over));
  if (!p.ok) throw new Error(p.message);
  const reviewed = { baseVersionId: p.data.baseVersionId, digest: p.data.digest };
  return { ...input(over), reviewed };
}

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
    samples: missing
      ? [
          { row: 4, seg: 0 },
          { row: 9, seg: 0 },
        ]
      : [],
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
});

/** Versi aktif per bulan dari kolom 2, tiga segmen (Jan, Feb, Mar) — dasar atur ulang (T-qqyx). */
const periodRow = (source: "COLUMN" | "LABEL" = "COLUMN") => {
  const sheet = activeRow.activeVersion.sheets[0]!;
  const seg = (i: number, name: string) => ({
    segmentTyped: {
      ...sheet.segments[0]!.segmentTyped,
      typedKey: `parquet/x/seg/s${i}/typed-3.parquet`,
      segment: { rawBytes: 2000n, rowBase: BigInt(i * 100), maxSrcRow: 40, originalName: name },
    },
  });
  return {
    activeVersion: {
      ...activeRow.activeVersion,
      periodGrain: "MONTH",
      sheets: [
        {
          ...sheet,
          periodSource: source,
          periodColumn: source === "COLUMN" ? 2 : null,
          segments: [seg(0, "jan.csv"), seg(1, "feb.csv"), seg(2, "mar.csv")],
        },
      ],
    },
  };
};

describe("atur ulang dataset yang sudah per periode (T-qqyx)", () => {
  /** Mesin query palsu yang benar-benar memanggil `work`: SQL yang dibangun ikut diperiksa. */
  const sqls: string[] = [];
  const fakeEngine = (periods: unknown[][], missing = 0, samples: unknown[][] = []) =>
    runOnParquet.mockImplementation(async (_u, _src, _d, work) => {
      const exec = async ({ sql }: { sql: string }) => {
        sqls.push(sql);
        if (/GROUP BY 1/.test(sql)) return { rows: periods };
        if (/FILTER/.test(sql)) return { rows: [[8 + missing, missing]] };
        return { rows: samples };
      };
      return { ok: true, value: await work("p", exec, ["p"]) };
    });

  beforeEach(() => {
    sqls.length = 0;
    prisma.dataset.findFirst.mockResolvedValue(periodRow());
  });

  it("satuan baru: sebaran per kuartal dari tiga segmen → satu periode tiga bagian; job membawa bagian + satuan dasar", async () => {
    fakeEngine([["2026-01-01", 8, 3]]);
    const body = await reviewed({ grain: "QUARTER" });
    expect(sqls.some((q) => q.includes("seg(i, lo, hi)"))).toBe(true);
    // Rentang `_row` setiap segmen dari DB (rowBase + 1 .. rowBase + maxSrcRow).
    expect(sqls.find((q) => q.includes("seg(i, lo, hi)"))).toContain(
      "(1, 100::BIGINT + 1, 100::BIGINT + 40)",
    );
    const p = await svc.previewPeriodSetup(OWNER, DS, input({ grain: "QUARTER" }));
    expect(p.ok && p.data).toMatchObject({
      blockers: [],
      plan: { resetFrom: "MONTH", grain: "QUARTER" },
      sheets: [{ periods: [{ start: "2026-01-01", rows: 8, parts: 3 }] }],
    });
    const r = await svc.applyPeriodSetup(OWNER, DS, body, "ip");
    expect(r).toEqual({ ok: true, data: { versionId: NEW } });
    expect(tx.datasetVersion.create.mock.calls[0]![0].data).toMatchObject({
      mode: "PERIOD_SETUP",
      periodGrain: "QUARTER",
      originalName: "Atur ulang periode (per kuartal)",
    });
    expect(enqueuePeriodSetup.mock.calls[0]![0]).toMatchObject({
      grain: "QUARTER",
      baseGrain: "MONTH",
      sheets: [
        {
          source: "COLUMN",
          column: 2,
          expected: { periods: { "2026-01-01": 8 }, parts: { "2026-01-01": 3 }, missing: 0 },
        },
      ],
    });
  });

  it("kolom lain: baris tanpa tanggal valid disebut bersama nama file asalnya", async () => {
    fakeEngine([["2026-01-01", 6, 2]], 2, [
      [7, 0],
      [3, 2],
    ]);
    const p = await svc.previewPeriodSetup(
      OWNER,
      DS,
      input({ sheets: [{ sheetId: SHEET, source: "COLUMN", column: 3 }] }),
    );
    expect(p.ok && p.data.sheets[0]).toMatchObject({
      missing: 2,
      missingSamples: [7, 3],
      missingSampleFiles: ["jan.csv", "mar.csv"],
    });
    expect(p.ok && p.data.blockers).toEqual([]);
  });

  it("sama persis dengan sekarang → Terapkan nonaktif; 'ikuti periode sekarang' ke satuan lebih kecil → nonaktif", async () => {
    fakeEngine([
      ["2026-01-01", 3, 1],
      ["2026-02-01", 3, 1],
      ["2026-03-01", 2, 1],
    ]);
    const same = await svc.previewPeriodSetup(OWNER, DS, input());
    expect(same.ok && same.data.blockers[0]).toMatch(/sama dengan yang sekarang/);
    prisma.dataset.findFirst.mockResolvedValue({
      activeVersion: { ...periodRow("LABEL").activeVersion, periodGrain: "QUARTER" },
    });
    const keep = { sheets: [{ sheetId: SHEET, source: "KEEP", column: null }] };
    const finer = await svc.previewPeriodSetup(OWNER, DS, input(keep));
    expect(finer.ok && finer.data.blockers[0]).toMatch(/tidak bisa dipecah menjadi per bulan/);
    // KEEP membaca `_period` segmen (bukan kolom pengguna).
    expect(sqls.some((q) => q.includes("date_trunc('month', t._period)"))).toBe(true);
    const sameLabel = await svc.previewPeriodSetup(OWNER, DS, input({ ...keep, grain: "QUARTER" }));
    expect(sameLabel.ok && sameLabel.data.blockers[0]).toMatch(/sama dengan yang sekarang/);
    const coarser = await svc.applyPeriodSetup(
      OWNER,
      DS,
      await reviewed({ ...keep, grain: "YEAR" }),
      "ip",
    );
    expect(coarser).toEqual({ ok: true, data: { versionId: NEW } });
    expect(enqueuePeriodSetup.mock.calls[0]![0].sheets[0]).toMatchObject({
      source: "LABEL",
      keep: true,
      label: null,
    });
  });

  it("satu label untuk semua baris di dataset periode, atau 'ikuti periode sekarang' di data biasa → INVALID", async () => {
    fakeEngine([["2026-01-01", 8, 3]]);
    expect(
      await svc.previewPeriodSetup(
        OWNER,
        DS,
        input({ sheets: [{ sheetId: SHEET, source: "LABEL", column: null }], label: "2026-01-01" }),
      ),
    ).toMatchObject({ code: "INVALID", message: expect.stringMatching(/Ikuti periode sekarang/) });
    prisma.dataset.findFirst.mockResolvedValue(activeRow);
    expect(
      await svc.previewPeriodSetup(
        OWNER,
        DS,
        input({ sheets: [{ sheetId: SHEET, source: "KEEP", column: null }] }),
      ),
    ).toMatchObject({ code: "INVALID" });
    expect(runOnParquet).not.toHaveBeenCalled();
  });

  it("segmen lama tanpa rentang baris → INVALID dengan arahan ganti semua data", async () => {
    const row = periodRow();
    row.activeVersion.sheets[0]!.segments[1]!.segmentTyped.segment.maxSrcRow =
      null as unknown as number;
    prisma.dataset.findFirst.mockResolvedValue(row);
    const r = await svc.previewPeriodSetup(OWNER, DS, input({ grain: "QUARTER" }));
    expect(r).toMatchObject({
      code: "INVALID",
      message: expect.stringMatching(/Ganti semua data/),
    });
  });
});

describe("applyPeriodSetup", () => {
  it("ada baris tanpa tanggal valid tanpa 'Buang N baris' → INVALID, tidak ada versi (AC 2)", async () => {
    const r = await svc.applyPeriodSetup(OWNER, DS, await reviewed(), "10.0.0.1");
    expect(r).toMatchObject({ ok: false, code: "INVALID" });
    expect(!r.ok && r.message).toMatch(/Buang 2 baris/);
    expect(tx.datasetVersion.create).not.toHaveBeenCalled();
  });

  it("'Buang 2 baris' → versi PERIOD_SETUP (rencana beku) + job berisi sebaran yang ditinjau (AC 3)", async () => {
    const r = await svc.applyPeriodSetup(
      OWNER,
      DS,
      await reviewed({ dropMissing: 2, keepPeriods: 36, onLimit: "EVICT_OLDEST" }),
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
      baseGrain: null,
      base: { activeVersionId: BASE, sheets: [{ id: SHEET, schemaRevision: 3 }] },
      sheets: [
        {
          sheetId: SHEET,
          source: "COLUMN",
          column: 2,
          label: null,
          expected: {
            periods: { "2026-01-01": 5, "2026-02-01": 3 },
            missing: 2,
            parts: { "2026-01-01": 1, "2026-02-01": 1 },
          },
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
    expect(await svc.applyPeriodSetup(OWNER, DS, await reviewed(), "ip")).toMatchObject({
      code: "NOT_FOUND",
    });
    tx.datasetVersion.count.mockResolvedValueOnce(1);
    expect(await svc.applyPeriodSetup(OWNER, DS, await reviewed(), "ip")).toMatchObject({
      code: "DATASET_BUSY",
    });
    tx.sheet.findMany.mockResolvedValueOnce([{ id: SHEET, schemaRevision: 4 }]);
    expect(await svc.applyPeriodSetup(OWNER, DS, await reviewed(), "ip")).toMatchObject({
      code: "STALE",
    });
    tx.$queryRaw.mockResolvedValueOnce([
      { activeVersionId: "lain", keepPeriods: null, onLimit: "REJECT" },
    ]);
    expect(await svc.applyPeriodSetup(OWNER, DS, await reviewed(), "ip")).toMatchObject({
      code: "STALE",
    });
    expect(tx.datasetVersion.create).not.toHaveBeenCalled();
  });

  it("antrean mati → versi langsung FAILED (tidak menahan dataset) + DATASET_BUSY", async () => {
    runOnParquet.mockResolvedValue(distribution(0));
    enqueuePeriodSetup.mockRejectedValue(new Error("redis mati"));
    expect(await svc.applyPeriodSetup(OWNER, DS, await reviewed(), "ip")).toMatchObject({
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

describe("applyPeriodSetup — tinjauan yang diterapkan", () => {
  it("tanpa tinjauan → INVALID; versi dasar / sebaran berbeda dari yang ditinjau → STALE, tanpa versi", async () => {
    expect(await svc.applyPeriodSetup(OWNER, DS, input({ dropMissing: 2 }), "ip")).toMatchObject({
      code: "INVALID",
      message: "Tinjau dulu sebelum menerapkan.",
    });
    const ok = await reviewed({ dropMissing: 2 });
    const stale = "Data berubah sejak ditinjau. Tinjau ulang sebelum menerapkan.";
    expect(
      await svc.applyPeriodSetup(
        OWNER,
        DS,
        { ...ok, reviewed: { ...ok.reviewed, baseVersionId: "cmv4kljx40009oczvlainnya01" } },
        "ip",
      ),
    ).toEqual({ ok: false, code: "STALE", message: stale });
    // Satu baris pindah periode sejak ditinjau (jumlah total sama) → sidik berbeda.
    runOnParquet.mockResolvedValue({
      ok: true,
      value: {
        ...distribution().value,
        periods: [
          { start: "2026-01-01", rows: 4 },
          { start: "2026-02-01", rows: 4 },
        ],
      },
    });
    expect(await svc.applyPeriodSetup(OWNER, DS, ok, "ip")).toEqual({
      ok: false,
      code: "STALE",
      message: stale,
    });
    expect(tx.datasetVersion.create).not.toHaveBeenCalled();
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
