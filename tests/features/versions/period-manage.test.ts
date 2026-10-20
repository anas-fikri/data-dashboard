import { beforeEach, describe, expect, it, vi } from "vitest";

/*
 * Hapus / pulihkan periode sisi app (T-056 AC2/AC3): pemilik saja (NOT_FOUND), versi aktif harus sama
 * dengan yang dilihat (PLAN_STALE), versi non-terminal → DATASET_BUSY, periode terakhir ditolak, kunci
 * yang tidak terbukti ada → coba lagi; berhasil = versi READY PERIOD_REMOVE/PERIOD_RESTORE baru dengan
 * manifest (file typed lama dirujuk, tanpa job worker) + aktivasi sheetMap + AuditLog. Prisma ditiru di
 * tingkat transaksi (pola period-commit.test.ts).
 */
const activateVersionInTx = vi.fn();
const recordAudit = vi.fn();
vi.mock("@/features/versions/activation", () => ({ activateVersionInTx }));
vi.mock("@/features/audit/service", () => ({ recordAudit }));
const prisma = {
  dataset: { findFirst: vi.fn() },
  datasetVersion: { findMany: vi.fn() },
  $transaction: vi.fn(),
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
const objectExists = vi.fn(async (_key: string) => true);
vi.mock("@/lib/storage/objects", () => ({ objectExists }));
const forgetLocalParquet = vi.fn();
vi.mock("@/features/query/local-parquet", () => ({ forgetLocalParquet }));
vi.mock("@/features/query/warm", () => ({ announceVersionActivated: vi.fn(async () => {}) }));
vi.mock("@/lib/redis", () => ({ redisReady: async () => ({}) }));

const svc = await import("@/features/versions/period-manage");

const OWNER = "owner1";
const DS = "cmv4klj5r0007oczvgiofocpg";
const ACTIVE = "cmv4kljx40009oczvdmpurrv1";
const OLD = "cmv4kljx40009oczvdmpurrv0";
const NEW = "cmv4kljx40009oczvdmpurrvn";
const day = (iso: string) => new Date(`${iso}T00:00:00Z`);

const segRow = (start: string, rows: number, id = `g${start}`) => ({
  ordinal: 0,
  segmentTyped: {
    id: `t-${id}`,
    typedKey: `parquet/${DS}/seg/${id}/typed-2.parquet`,
    dataRows: rows,
    typedBytes: 100n,
    schemaRevision: 2,
    segment: {
      id,
      rawKey: `parquet/${DS}/seg/${id}/raw.parquet`,
      rawRows: rows + 1,
      rawBytes: 100n,
      rowBase: BigInt(Number(start.slice(5, 7)) * 1000 + (id.endsWith("old") ? 500 : 0)),
      maxSrcRow: rows + 1,
      periodKey: start.slice(0, 7),
      periodStart: day(start),
      sha256: null,
    },
  },
});
const sheetRow = (segments: ReturnType<typeof segRow>[], id = "sheet-a") => ({
  id,
  index: 0,
  name: "Kirim",
  aliasName: null,
  lineageId: "L1",
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
  segments: segments.map((g, i) => ({ ...g, ordinal: i })),
});

let activeSheets: ReturnType<typeof sheetRow>[];
let oldSheets: ReturnType<typeof sheetRow>[];
let lock: { activeVersionId: string | null; keepPeriods: number | null; onLimit: string }[];

const tx = {
  $queryRaw: vi.fn(async () => lock),
  datasetVersion: {
    count: vi.fn(async () => 0),
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    create: vi.fn(async () => ({ id: NEW })),
  },
  sheet: { deleteMany: vi.fn(), create: vi.fn() },
  sheetSegment: { createMany: vi.fn() },
  segmentTyped: { updateMany: vi.fn() },
  segment: { updateMany: vi.fn() },
};

/** findUnique tiruan: versi aktif, atau manifest versi baru yang ditulis transaksi ini. */
async function findUnique({ where }: { where: { id: string } }) {
  if (where.id === ACTIVE) return { periodGrain: "MONTH", sheets: activeSheets };
  if (where.id !== NEW) return null;
  const files = new Map(
    [...activeSheets, ...oldSheets].flatMap((s) =>
      s.segments.map((g) => [g.segmentTyped.id, g.segmentTyped] as const),
    ),
  );
  return {
    periodGrain: "MONTH",
    sheets: tx.sheet.create.mock.calls.map(([{ data }], i) => ({
      id: `new-${i}`,
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
  activeSheets = [
    sheetRow([
      segRow("2026-01-01", 30),
      segRow("2026-02-01", 28, "gfeb-new"),
      segRow("2026-03-01", 31),
    ]),
  ];
  oldSheets = [
    sheetRow(
      [segRow("2026-01-01", 30), segRow("2026-02-01", 40, "gfeb-old"), segRow("2026-03-01", 31)],
      "sheet-old",
    ),
  ];
  lock = [{ activeVersionId: ACTIVE, keepPeriods: null, onLimit: "REJECT" }];
  prisma.dataset.findFirst.mockResolvedValue({ activeVersionId: ACTIVE });
  prisma.datasetVersion.findMany.mockImplementation(
    async ({ where }: { where: { id: { in: string[] } } }) =>
      where.id.in.map((id) => ({ sheets: id === ACTIVE ? activeSheets : oldSheets })),
  );
  prisma.$transaction.mockImplementation(async (fn: (t: unknown) => unknown) => fn(tx));
  tx.datasetVersion.findUnique.mockImplementation(findUnique);
  tx.datasetVersion.findFirst.mockImplementation(async ({ where }: { where: { id: string } }) =>
    where.id === OLD ? { periodGrain: "MONTH", sheets: oldSheets } : null,
  );
  tx.sheet.create.mockImplementation(async ({ data }: { data: { typedKey: string | null } }) => ({
    id: `new-${tx.sheet.create.mock.calls.length - 1}`,
    typedKey: data.typedKey,
  }));
  activateVersionInTx.mockResolvedValue({ deletedTypedKeys: ["k-lama"] });
  objectExists.mockResolvedValue(true);
});

const remove = (payload: unknown = { periodKey: "2026-02", baseVersionId: ACTIVE }) =>
  svc.removePeriod(OWNER, DS, payload, "1.2.3.4");
const restore = (over: Record<string, unknown> = {}) =>
  svc.restorePeriod(
    OWNER,
    DS,
    { periodKey: "2026-02", baseVersionId: ACTIVE, sourceVersionId: OLD, ...over },
    "1.2.3.4",
  );
const written = () =>
  (tx.sheetSegment.createMany.mock.calls[0]?.[0].data ?? []).map(
    (m: { segmentTypedId: string }) => m.segmentTypedId,
  );

describe("removePeriod", () => {
  it("versi PERIOD_REMOVE READY aktif: manifest tanpa periode itu (file lama dirujuk), sheetMap, AuditLog", async () => {
    const r = await remove();
    expect(r).toEqual({ ok: true, data: { label: "Februari 2026", versionId: NEW } });
    expect(tx.datasetVersion.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          datasetId: DS,
          status: "READY",
          mode: "PERIOD_REMOVE",
          periodGrain: "MONTH",
          baseVersionId: ACTIVE,
          uploadedById: OWNER,
          plan: expect.objectContaining({ kind: "REMOVE", key: "2026-02", beforeRows: 28 }),
        }),
      }),
    );
    expect(written()).toEqual(["t-g2026-01-01", "t-g2026-03-01"]);
    expect(activateVersionInTx).toHaveBeenCalledWith(tx, DS, NEW, {
      sheetMap: { "sheet-a": "new-0" },
    });
    expect(recordAudit).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        action: "dataset.period.remove",
        actorId: OWNER,
        meta: { from: ACTIVE, versionId: NEW, period: "2026-02", rows: 28 },
        ip: "1.2.3.4",
      }),
    );
    expect(forgetLocalParquet).toHaveBeenCalledWith(["k-lama"]);
  });

  it("periode terakhir ditolak tanpa tulisan; diarahkan ke Ganti semua data", async () => {
    activeSheets = [sheetRow([segRow("2026-01-01", 30)])];
    const r = await remove({ periodKey: "2026-01", baseVersionId: ACTIVE });
    expect(r).toMatchObject({ ok: false, code: "INVALID" });
    expect(!r.ok && r.message).toContain("Ganti semua data");
    expect(tx.datasetVersion.create).not.toHaveBeenCalled();
    expect(activateVersionInTx).not.toHaveBeenCalled();
  });

  it("versi aktif berganti sejak halaman dimuat → PLAN_STALE (sebelum dan di bawah lock)", async () => {
    prisma.dataset.findFirst.mockResolvedValue({ activeVersionId: OLD });
    expect(await remove()).toMatchObject({ ok: false, code: "PLAN_STALE" });
    expect(prisma.$transaction).not.toHaveBeenCalled();
    prisma.dataset.findFirst.mockResolvedValue({ activeVersionId: ACTIVE });
    lock = [{ activeVersionId: OLD, keepPeriods: null, onLimit: "REJECT" }];
    expect(await remove()).toMatchObject({ ok: false, code: "PLAN_STALE" });
    expect(tx.datasetVersion.create).not.toHaveBeenCalled();
  });

  it("ada unggahan non-terminal → DATASET_BUSY tanpa tulisan", async () => {
    tx.datasetVersion.count.mockResolvedValueOnce(1);
    expect(await remove()).toMatchObject({ ok: false, code: "DATASET_BUSY" });
    expect(tx.datasetVersion.create).not.toHaveBeenCalled();
  });

  it("bukan pemilik / id atau isian salah → NOT_FOUND / INVALID tanpa transaksi", async () => {
    prisma.dataset.findFirst.mockResolvedValue(null);
    expect(await remove()).toMatchObject({ ok: false, code: "NOT_FOUND" });
    expect(await svc.removePeriod(OWNER, "x", {}, "ip")).toMatchObject({ code: "NOT_FOUND" });
    expect(await remove({ periodKey: "Feb", baseVersionId: ACTIVE })).toMatchObject({
      code: "INVALID",
    });
    expect(await remove({ periodKey: "2026-02", baseVersionId: ACTIVE, extra: 1 })).toMatchObject({
      code: "INVALID",
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("kunci periode lain tidak terbukti ada (HEAD sebelum lock) → coba lagi, tanpa tulisan", async () => {
    objectExists.mockImplementation(async (k: string) => !k.includes("g2026-03-01/typed"));
    expect(await remove()).toMatchObject({ ok: false, code: "DATASET_BUSY" });
    expect(tx.datasetVersion.create).not.toHaveBeenCalled();
  });
});

describe("restorePeriod", () => {
  it("versi PERIOD_RESTORE: file typed periode itu dari versi lama, periode lain tetap; AuditLog", async () => {
    const r = await restore();
    expect(r).toEqual({ ok: true, data: { label: "Februari 2026", versionId: NEW } });
    expect(tx.datasetVersion.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          mode: "PERIOD_RESTORE",
          plan: expect.objectContaining({
            kind: "RESTORE",
            sourceVersionId: OLD,
            beforeRows: 28,
            afterRows: 40,
          }),
        }),
      }),
    );
    expect(written()).toEqual(["t-g2026-01-01", "t-gfeb-old", "t-g2026-03-01"]);
    expect(recordAudit).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        action: "dataset.period.restore",
        meta: {
          from: ACTIVE,
          versionId: NEW,
          period: "2026-02",
          sourceVersionId: OLD,
          beforeRows: 28,
          afterRows: 40,
        },
      }),
    );
  });

  it("versi lama sudah dibuang retensi → tidak tersedia dengan penjelasan, tanpa tulisan", async () => {
    tx.datasetVersion.findFirst.mockResolvedValue(null);
    const r = await restore();
    expect(r).toMatchObject({ ok: false, code: "INVALID" });
    expect(!r.ok && r.message).toContain("sudah tidak tersimpan");
    expect(tx.datasetVersion.create).not.toHaveBeenCalled();
  });

  it("memulihkan periode yang melewati batas simpan → ditolak (tidak melepas periode lain)", async () => {
    activeSheets = [sheetRow([segRow("2026-02-01", 28, "gfeb-new"), segRow("2026-03-01", 31)])];
    lock = [{ activeVersionId: ACTIVE, keepPeriods: 2, onLimit: "EVICT_OLDEST" }];
    const r = await restore({ periodKey: "2026-01" });
    expect(r).toMatchObject({ ok: false, code: "INVALID" });
    expect(!r.ok && r.message).toContain("batas simpan 2 periode");
    expect(tx.datasetVersion.create).not.toHaveBeenCalled();
  });

  it("isi sama dengan data aktif / asal = aktif → INVALID", async () => {
    expect(await restore({ periodKey: "2026-01" })).toMatchObject({ ok: false, code: "INVALID" });
    expect(await restore({ sourceVersionId: ACTIVE })).toMatchObject({ code: "INVALID" });
    expect(tx.datasetVersion.create).not.toHaveBeenCalled();
  });
});
