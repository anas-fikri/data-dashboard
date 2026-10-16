import { beforeEach, describe, expect, it, vi } from "vitest";

/*
 * T-033 (review T1): prismaIngestRepo.finish meneruskan sheetMap ke activateVersionInTx saat verdict
 * cocok (baris yang menjadi bug R5-1), dan tidak mengaktifkan apa pun saat menunggu pemetaan.
 * Prisma ditiru di tingkat transaksi (pola tests/features/versions/service.test.ts).
 */
const tx = {
  datasetVersion: { findUnique: vi.fn(), updateMany: vi.fn() },
  sheet: { findMany: vi.fn() },
  $queryRaw: vi.fn(),
};
const prisma = { $transaction: vi.fn() };
const activateVersionInTx = vi.fn();
vi.mock("@/lib/db", () => ({ prisma }));
vi.mock("@/features/versions/activation", () => ({ activateVersionInTx }));
vi.mock("@/features/audit/service", () => ({ recordAudit: vi.fn() }));
vi.mock("@/lib/storage/objects", () => ({ deleteObject: vi.fn(), deletePrefix: vi.fn() }));
vi.mock("@/lib/storage/files", () => ({ downloadToFile: vi.fn(), uploadFile: vi.fn() }));

const { prismaIngestRepo } = await import("@/features/ingest/repo");

const DS = "cmv4klj5r0007oczvgiofocpg";
const VER = "cmv4kljx40009oczvdmpurrv2";
const ACTIVE = "cmv4kljx40009oczvdmpurrv1";
const OLD_SHEET = "cmv4kljx40009oczvdmpurrsa";
const NEW_SHEET = "cmv4kljx40009oczvdmpurrsb";
const snapshot = { activeVersionId: ACTIVE, sheets: [{ id: OLD_SHEET, schemaRevision: 2 }] };

beforeEach(() => {
  vi.clearAllMocks();
  prisma.$transaction.mockImplementation(async (fn: (t: typeof tx) => unknown) => fn(tx));
  tx.datasetVersion.findUnique.mockResolvedValue({ datasetId: DS });
  tx.$queryRaw.mockResolvedValue([{ activeVersionId: ACTIVE }]);
  tx.sheet.findMany.mockResolvedValue([{ id: OLD_SHEET, schemaRevision: 2 }]);
  tx.datasetVersion.updateMany.mockResolvedValue({ count: 1 });
  activateVersionInTx.mockResolvedValue({});
});

describe("prismaIngestRepo.finish (T-033)", () => {
  it("verdict cocok → activateVersionInTx menerima sheetMap pasangan planSheets", async () => {
    const sheetMap = { [OLD_SHEET]: NEW_SHEET };
    const r = await prismaIngestRepo.finish(VER, {
      sha256: "a".repeat(64),
      verdict: { ok: true },
      snapshot,
      sheetMap,
    });
    expect(r).toBe("activated");
    expect(activateVersionInTx).toHaveBeenCalledWith(tx, DS, VER, { sheetMap });
  });

  it("verdict tidak cocok → AWAITING_MAPPING tanpa aktivasi", async () => {
    const r = await prismaIngestRepo.finish(VER, {
      sha256: "a".repeat(64),
      verdict: { ok: false, reason: "kolom hilang" },
      snapshot,
      sheetMap: { [OLD_SHEET]: NEW_SHEET },
    });
    expect(r).toBe("awaiting");
    expect(activateVersionInTx).not.toHaveBeenCalled();
  });
});
